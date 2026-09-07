-- policy_chunks: the retrieval store for V-Tina (User Story 1, story 1a).
--
-- One row per chunk of a source document. Every row carries the complete source
-- metadata the verification UI needs to render a citation, plus a 768-dimensional
-- embedding from Fireworks' nomic-embed-text model. The dimension here must equal
-- EMBEDDING_DIMENSIONS in src/lib/embeddings.ts; a unit test holds the two equal.

create extension if not exists vector with schema extensions;

create table public.policy_chunks (
  id             uuid primary key default gen_random_uuid(),
  content        text not null check (length(content) > 0),
  chunk_index    integer not null check (chunk_index >= 0),
  document_title text not null check (length(document_title) > 0),
  -- The as-of date: the date the content is current as of (an order's signing
  -- date; a revised page's last revision). Ties on similarity prefer the newest.
  document_date  date not null,
  url            text not null check (length(url) > 0),
  pillar         text not null check (length(pillar) > 0),
  -- Ties on similarity prefer executive documents over legislative history.
  -- The set must equal DOCUMENT_KINDS in src/lib/ingest/metadata.ts.
  document_kind  text not null check (document_kind in ('executive', 'legislative')),
  embedding      extensions.vector(768) not null,
  created_at     timestamptz not null default now(),
  -- A document's chunks are identified by its URL and ordinal, so re-ingesting a
  -- document replaces its rows rather than duplicating them.
  unique (url, chunk_index)
);

comment on table public.policy_chunks is
  'Chunks of official Oregon source documents with embeddings for semantic retrieval.';

-- HNSW rather than IVFFlat: no training step, and better recall at this scale.
create index policy_chunks_embedding_idx
  on public.policy_chunks using hnsw (embedding extensions.vector_cosine_ops);
create index policy_chunks_url_idx on public.policy_chunks (url);
create index policy_chunks_pillar_idx on public.policy_chunks (pillar);

-- Public read, no public write. The service role bypasses row-level security and
-- is the only writer; there is deliberately no insert/update/delete policy.
alter table public.policy_chunks enable row level security;

create policy "policy_chunks are publicly readable"
  on public.policy_chunks
  for select
  to anon, authenticated
  using (true);

-- Semantic retrieval. Callable with the public key, so the argument guards live
-- HERE, where a direct caller cannot bypass them: the maximum result count must
-- equal MAX_MATCH_COUNT in src/lib/supabase.ts (a unit test holds the two equal).
create or replace function public.match_policy_chunks(
  query_embedding  extensions.vector(768),
  match_threshold  double precision,
  match_count      integer,
  filter_pillar    text default null
)
returns table (
  id             uuid,
  content        text,
  chunk_index    integer,
  document_title text,
  document_date  date,
  url            text,
  pillar         text,
  document_kind  text,
  similarity     double precision
)
language plpgsql
stable
as $$
begin
  if match_count is null or match_count < 1 or match_count > 50 then
    raise exception 'match_count must be between 1 and 50, got %', match_count
      using errcode = '22023';
  end if;
  -- NaN and the infinities sort outside [-1, 1] in PostgreSQL, so this one range
  -- check also rejects them.
  if match_threshold is null or match_threshold < -1 or match_threshold > 1 then
    raise exception 'match_threshold must be within [-1, 1], got %', match_threshold
      using errcode = '22023';
  end if;

  return query
    select
      p.id,
      p.content,
      p.chunk_index,
      p.document_title,
      p.document_date,
      p.url,
      p.pillar,
      p.document_kind,
      1 - (p.embedding <=> query_embedding) as similarity
    from public.policy_chunks as p
    where (filter_pillar is null or p.pillar = filter_pillar)
      and 1 - (p.embedding <=> query_embedding) > match_threshold
    order by
      similarity desc,
      (p.document_kind = 'executive') desc,
      p.document_date desc,
      p.chunk_index asc
    limit match_count;
end;
$$;

-- Document-scoped, transactional replacement: the database holds exactly the
-- current chunks of each ingested document, never a stale tail from an earlier,
-- longer version. A function body runs in one transaction, so a failure part-way
-- leaves the previous rows untouched. Runs as the caller (no security definer):
-- row-level security refuses the public roles, and execute is revoked from them
-- below, so only the service role can replace a document.
create or replace function public.replace_document_chunks(
  p_url  text,
  p_rows jsonb
)
returns integer
language plpgsql
as $$
declare
  inserted integer;
begin
  if p_url is null or length(p_url) = 0 then
    raise exception 'p_url must not be empty' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) as r where r->>'url' is distinct from p_url
  ) then
    raise exception 'every row must carry url %', p_url using errcode = '22023';
  end if;

  delete from public.policy_chunks where url = p_url;

  insert into public.policy_chunks
    (content, chunk_index, document_title, document_date, url, pillar, document_kind, embedding)
  select
    r.content,
    r.chunk_index,
    r.document_title,
    r.document_date,
    r.url,
    r.pillar,
    r.document_kind,
    r.embedding::extensions.vector(768)
  from jsonb_to_recordset(p_rows) as r(
    content        text,
    chunk_index    integer,
    document_title text,
    document_date  date,
    url            text,
    pillar         text,
    document_kind  text,
    -- Serialised as a "[x,y,...]" string by the caller and cast here.
    embedding      text
  );

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke execute on function public.replace_document_chunks(text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_document_chunks(text, jsonb) to service_role;
