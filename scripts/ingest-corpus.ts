/**
 * The operator ingest script.
 *
 * Reads every document in `corpus/`, embeds it through Fireworks, and stores it
 * in Supabase through the transactional document replacement. Re-running is
 * therefore idempotent: each document's chunks are replaced, never appended.
 *
 *   npm run ingest                 # ingest the whole corpus
 *   npm run ingest -- --dry-run    # parse and chunk only; no network, no credentials
 *   npm run ingest -- --file corpus/eo-23-02.md
 *   npm run ingest -- --prune      # ALSO remove stored documents the corpus dropped
 *
 * Deliberately not an HTTP endpoint: writing to the store needs the service-role
 * key, and an endpoint would need an authentication story the specification does
 * not define. Decided at story 1a's consult, 2026-09-07.
 *
 * On errors: a document's failure is caught ONLY so the remaining documents are
 * still attempted and every outcome is reported together — the criterion asks
 * for a per-document report. Nothing is swallowed. Every failure is printed with
 * its cause, listed again in the summary, and drives a non-zero exit.
 */
import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import { createFireworksEmbedder } from "../src/lib/embeddings";
import {
  corpusDocumentPaths,
  documentsToRemove,
  CORPUS_DIR,
} from "../src/lib/ingest/corpus";
import { ingestDocument, prepareDocument } from "../src/lib/ingest/pipeline";
import { getNodeEnv } from "../src/lib/env";
import {
  createSupabaseChunkStore,
  createSupabaseClient,
} from "../src/lib/supabase";

/**
 * Next.js loads `.env.local` for the app; a standalone script does not, so it is
 * loaded here to keep one documented place for credentials.
 *
 * `process.loadEnvFile` **does not overwrite variables already in the
 * environment** — verified against Node 26 before the hand-rolled parser this
 * replaced was deleted. That precedence is a requirement, not a nicety: the
 * Fireworks key is declared estate-wide in the shell, and a stale copy in a file
 * must never silently override the one the operator actually configured.
 */
function loadLocalEnv(path = ".env.local"): void {
  if (existsSync(path)) process.loadEnvFile(path);
}

interface Options {
  dryRun: boolean;
  prune: boolean;
  file?: string;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { dryRun: false, prune: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--prune") {
      options.prune = true;
    } else if (arg === "--file") {
      const value = argv[++i];
      if (!value) throw new Error("--file needs a path");
      options.file = value;
    } else {
      throw new Error(
        `unknown argument "${arg}" — expected --dry-run, --prune or --file <path>`,
      );
    }
  }
  if (options.prune && options.dryRun) {
    throw new Error("--prune needs a real run; it cannot be combined with --dry-run");
  }
  if (options.prune && options.file) {
    throw new Error(
      "--prune reconciles the WHOLE corpus against the store; it cannot be combined with --file",
    );
  }
  return options;
}

interface Outcome {
  file: string;
  /** The document's own source URL, which is what the store is keyed by. */
  url?: string;
  chunks?: number;
  error?: unknown;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  const paths = options.file ? [options.file] : corpusDocumentPaths();

  if (paths.length === 0) {
    process.stderr.write(`No documents found in ${CORPUS_DIR}/\n`);
    return 1;
  }

  // Only built when it is actually needed: --dry-run must work with no
  // credentials at all, which is what makes the corpus checkable offline.
  const ingestInto = options.dryRun
    ? undefined
    : (() => {
        loadLocalEnv();
        const env = getNodeEnv();
        return {
          embed: createFireworksEmbedder({
            apiKey: env.FIREWORKS_API_KEY,
            task: "document",
          }),
          store: createSupabaseChunkStore(
            createSupabaseClient(
              env.NEXT_PUBLIC_SUPABASE_URL,
              env.SUPABASE_SERVICE_ROLE_KEY,
            ),
          ),
        };
      })();

  process.stdout.write(
    `${options.dryRun ? "Checking" : "Ingesting"} ${paths.length} document(s)\n\n`,
  );

  const outcomes: Outcome[] = [];
  for (const path of paths) {
    const name = relative(".", path);
    try {
      const markdown = readFileSync(path, "utf8");
      // In a real run the reported count is the one the STORE confirmed, never
      // the locally chunked length — a short write must not read as success.
      let chunks: number;
      let url: string;
      if (ingestInto) {
        const result = await ingestDocument(markdown, ingestInto);
        chunks = result.chunkCount;
        url = result.url;
      } else {
        const prepared = prepareDocument(markdown);
        chunks = prepared.length;
        url = prepared[0].source.url;
      }
      outcomes.push({ file: name, url, chunks });
      process.stdout.write(`  ok    ${name} — ${chunks} chunks\n`);
    } catch (error) {
      outcomes.push({ file: name, error });
      process.stdout.write(`  FAIL  ${name} — ${describe(error)}\n`);
    }
  }

  const failures = outcomes.filter((o) => o.error !== undefined);
  const total = outcomes.reduce((sum, o) => sum + (o.chunks ?? 0), 0);

  // Reconciliation. Only reached when the WHOLE corpus was processed and every
  // document succeeded: pruning against a partial or failed run would withdraw
  // documents that are still live, which is the one irreversible thing this
  // command can do. Removal is an empty-set replacement, the same transactional
  // path an ordinary ingest uses.
  const removed: string[] = [];
  if (options.prune && ingestInto && failures.length === 0) {
    const stored = await ingestInto.store.listDocumentUrls();
    const corpusUrls = outcomes.map((o) => o.url).filter((u): u is string => u !== undefined);
    const stale = documentsToRemove(stored, corpusUrls);
    if (stale.length === 0) {
      process.stdout.write("\nnothing to prune: the store already matches the corpus\n");
    } else {
      process.stdout.write(`\npruning ${stale.length} withdrawn document(s)\n`);
      for (const url of stale) {
        await ingestInto.store.replaceDocument(url, []);
        removed.push(url);
        process.stdout.write(`  removed  ${url}\n`);
      }
    }
  } else if (options.prune && failures.length > 0) {
    process.stderr.write(
      "\nNOT pruning: a document failed, so the corpus list is incomplete and " +
        "pruning against it could withdraw a live document.\n",
    );
  }

  process.stdout.write(
    `\n${outcomes.length - failures.length}/${outcomes.length} document(s), ${total} chunks` +
      `${removed.length > 0 ? `, ${removed.length} removed` : ""}\n`,
  );
  if (failures.length > 0) {
    process.stdout.write(`\nfailed:\n`);
    for (const failure of failures) {
      process.stdout.write(`  ${failure.file}: ${describe(failure.error)}\n`);
    }
    return 1;
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`${describe(error)}\n`);
    process.exit(1);
  },
);
