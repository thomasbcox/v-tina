import { describe, expect, it } from "vitest";
import {
  RETRY_BASE_MS,
  RETRY_MAX_ATTEMPTS,
  TransportError,
  fetchWithRetry,
  isTransient,
} from "../src/lib/retry";

/** A fetch that answers from a script and records what it was given. */
function scripted(replies: Array<{ status: number } | Error>) {
  const calls: RequestInit[] = [];
  const doFetch = (async (_url: string, init: RequestInit) => {
    calls.push(init);
    const next = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (next instanceof Error) throw next;
    return new Response("{}", { status: next.status });
  }) as unknown as typeof globalThis.fetch;
  return { doFetch, calls };
}

const waits: number[] = [];
const noWait = async (ms: number) => {
  waits.push(ms);
};

describe("the one transient-failure policy shared by every Fireworks call", () => {
  it("retries only what is worth retrying", () => {
    for (const s of [500, 502, 503, 408, 429]) expect(isTransient(s)).toBe(true);
    for (const s of [400, 401, 403, 404, 422]) expect(isTransient(s)).toBe(false);
  });

  it("gives up after the declared budget, naming the count", async () => {
    const { doFetch, calls } = scripted([{ status: 503 }]);
    await expect(
      fetchWithRetry("Test", doFetch, "https://x", {}, { sleep: noWait }),
    ).rejects.toThrow(new RegExp(`after ${RETRY_MAX_ATTEMPTS} attempt`));
    expect(calls).toHaveLength(RETRY_MAX_ATTEMPTS);
  });

  it("does not retry a deterministic failure", async () => {
    const { doFetch, calls } = scripted([{ status: 401 }]);
    await expect(
      fetchWithRetry("Test", doFetch, "https://x", {}, { sleep: noWait }),
    ).rejects.toBeInstanceOf(TransportError);
    expect(calls).toHaveLength(1);
  });

  it("doubles the backoff between attempts", async () => {
    waits.length = 0;
    const { doFetch } = scripted([{ status: 503 }]);
    await expect(
      fetchWithRetry("Test", doFetch, "https://x", {}, { sleep: noWait }),
    ).rejects.toThrow();
    expect(waits).toEqual([RETRY_BASE_MS, RETRY_BASE_MS * 2]);
  });
});

describe("AC4 (the clock) — one deadline covers retries and backoff, not each attempt", () => {
  it("stops the loop once the shared deadline has passed", async () => {
    // Without one clock, three attempts each inside their own timeout total far
    // more than the budget the caller declared. The abort lands between
    // attempts, which is the case a per-attempt timeout cannot see.
    const controller = new AbortController();
    const { doFetch, calls } = scripted([{ status: 503 }]);
    const sleepThenExpire = async () => {
      controller.abort();
    };

    await expect(
      fetchWithRetry(
        "Test",
        doFetch,
        "https://x",
        {},
        { sleep: sleepThenExpire, signal: controller.signal },
      ),
    ).rejects.toThrow(/deadline reached/);
    expect(calls, "no attempt may start after the budget is spent").toHaveLength(2);
  });

  it("hands the deadline to fetch itself, so a slow attempt is cut short too", async () => {
    const controller = new AbortController();
    const { doFetch, calls } = scripted([{ status: 200 }]);
    await fetchWithRetry("Test", doFetch, "https://x", { method: "POST" }, {
      signal: controller.signal,
      sleep: noWait,
    });
    expect(calls[0].signal, "the signal must reach fetch").toBe(controller.signal);
    expect(calls[0].method, "the caller's own init must survive").toBe("POST");
  });

  it("cuts a backoff sleep short when the deadline lands during it", async () => {
    const controller = new AbortController();
    const { doFetch } = scripted([{ status: 503 }]);
    // A sleep that never resolves: only the abort can end the wait. If the
    // backoff ignored the signal, this test would hang rather than fail.
    const foreverSleep = () =>
      new Promise<void>(() => {
        setTimeout(() => controller.abort(), 1);
      });
    await expect(
      fetchWithRetry(
        "Test",
        doFetch,
        "https://x",
        {},
        { sleep: foreverSleep, signal: controller.signal },
      ),
    ).rejects.toThrow(/deadline reached/);
  });

  it("honours Retry-After when the service supplies one", async () => {
    waits.length = 0;
    let n = 0;
    const doFetch = (async () => {
      n += 1;
      if (n === 1) {
        return new Response("{}", { status: 429, headers: { "retry-after": "2" } });
      }
      return new Response("{}", { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    await fetchWithRetry("Test", doFetch, "https://x", {}, { sleep: noWait });
    expect(waits).toEqual([2000]);
  });
});
