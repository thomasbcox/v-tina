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
  -- document replaces its rows rather than duplicating them. The constraint's
  -- index leads with url, so it also serves the delete-by-url in
  -- replace_document_chunks; there is deliberately no separate url index.
  unique (url, chunk_index)
);

comment on table public.policy_chunks is
  'Chunks of official Oregon source documents with embeddings for semantic retrieval.';

-- HNSW rather than IVFFlat: no training step, and better recall at this scale.
create index policy_chunks_embedding_idx
  on public.policy_chunks using hnsw (embedding extensions.vector_cosine_ops);
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
--
-- Written in two steps so the HNSW index actually serves the query. pgvector
-- only routes through the index when the ORDER BY is the raw distance operator
-- (`embedding <=> query`) with a LIMIT; wrapping it as `1 - (...)` or adding
-- tie-break keys to that ORDER BY forces a full scan and sort. So the first step
-- takes a candidate pool through the index on the raw distance, and the second
-- step applies the threshold, the exact similarity order and the tie-breaks
-- (executive before legislative, then newest as-of date) to that pool.
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
declare
  -- Over-fetch so the exact re-sort has enough candidates for the threshold and
  -- the tie-breaks to act on. Bounded by the match_count guard: at most 200.
  candidate_limit integer;
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

  candidate_limit := match_count * 4;
  -- An HNSW scan returns at most hnsw.ef_search rows (default 40); raise it to
  -- the candidate pool for this call only (transaction-local). relaxed_order
  -- lets a pillar filter keep scanning rather than starve the pool (pgvector
  -- 0.8+); the exact ORDER BY below restores strict order regardless.
  perform set_config('hnsw.ef_search', candidate_limit::text, true);
  perform set_config('hnsw.iterative_scan', 'relaxed_order', true);

  return query
    with candidates as (
      select
        p.id,
        p.content,
        p.chunk_index,
        p.document_title,
        p.document_date,
        p.url,
        p.pillar,
        p.document_kind,
        (p.embedding <=> query_embedding) as distance
      from public.policy_chunks as p
      where (filter_pillar is null or p.pillar = filter_pillar)
      order by p.embedding <=> query_embedding
      limit candidate_limit
    )
    select
      c.id,
      c.content,
      c.chunk_index,
      c.document_title,
      c.document_date,
      c.url,
      c.pillar,
      c.document_kind,
      1 - c.distance as similarity
    from candidates as c
    where 1 - c.distance > match_threshold
    order by
      c.distance asc,
      (c.document_kind = 'executive') desc,
      c.document_date desc,
      c.chunk_index asc
    limit match_count;
end;
$$;

-- Document-scoped, transactional replacement: the database holds exactly the
-- current chunks of each ingested document, never a stale tail from an earlier,
-- longer version. A function body runs in one transaction, so a failure part-way
-- leaves the previous rows untouched. An EMPTY p_rows is the intended way to
-- remove a document (a withdrawn source): it deletes the URL's rows and returns
-- 0. Only the service role can call this, and the ingestion pipeline never
-- passes an empty set — an empty document is refused before anything is embedded. Runs as the caller (no security definer):
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
