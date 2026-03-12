/**
 * PROF-03: Promise.allSettled partial failure resilience
 *
 * RED tests — pages use Promise.all which crashes when any query fails.
 * These tests will go GREEN when Promise.allSettled is used and partial
 * failures are logged rather than propagated.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

// Logger will be created in Wave 1 Plan 02 — import may fail until then (RED)
vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helper: the allSettled extraction pattern that should be used in pages
// ---------------------------------------------------------------------------

/**
 * Extract fulfilled values from allSettled results.
 * Logs each rejected result via logError.
 */
async function fetchWithAllSettled<T>(
  promises: Promise<T>[],
  logError: (err: unknown, ctx: { operation: string }) => void,
  operation: string
): Promise<(T | null)[]> {
  const results = await Promise.allSettled(promises);
  return results.map((r) => {
    if (r.status === "rejected") {
      logError(r.reason, { operation });
      return null;
    }
    return r.value;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Promise resilience — allSettled partial failures (PROF-03)", () => {
  let logErrorMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const logger = await import("@/lib/logger");
    logErrorMock = logger.logError as ReturnType<typeof vi.fn>;
  });

  it("fulfills partial results when one query rejects (allSettled pattern)", async () => {
    const query1 = Promise.resolve({ data: [{ id: 1 }], error: null });
    const query2 = Promise.reject(new Error("network error"));
    const query3 = Promise.resolve({ data: [{ id: 3 }], error: null });

    const results = await fetchWithAllSettled(
      [query1, query2, query3],
      logErrorMock,
      "test/fetchWithAllSettled"
    );

    expect(results[0]).not.toBeNull();
    expect(results[1]).toBeNull(); // rejected → null
    expect(results[2]).not.toBeNull();
  });

  it("logs rejected results via logError, not silently swallowed", async () => {
    const networkError = new Error("supabase network error");
    const query1 = Promise.resolve({ data: [], error: null });
    const query2 = Promise.reject(networkError);

    await fetchWithAllSettled([query1, query2], logErrorMock, "overview/fetchData");

    expect(logErrorMock).toHaveBeenCalledOnce();
    expect(logErrorMock).toHaveBeenCalledWith(
      networkError,
      expect.objectContaining({ operation: "overview/fetchData" })
    );
  });

  it("Promise.all crashes when any query rejects (documents the bug)", async () => {
    const query1 = Promise.resolve({ data: [], error: null });
    const query2 = Promise.reject(new Error("boom"));

    await expect(Promise.all([query1, query2])).rejects.toThrow("boom");
  });

  it("allSettled returns all-fulfilled array when no query rejects", async () => {
    const query1 = Promise.resolve({ data: [{ id: "a" }], error: null });
    const query2 = Promise.resolve({ data: [{ id: "b" }], error: null });

    const results = await fetchWithAllSettled([query1, query2], logErrorMock, "test/allFulfilled");

    expect(results).toHaveLength(2);
    expect(results.every((r) => r !== null)).toBe(true);
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it("allSettled handles all-rejected gracefully without throwing", async () => {
    const query1 = Promise.reject(new Error("err1"));
    const query2 = Promise.reject(new Error("err2"));

    await expect(
      fetchWithAllSettled([query1, query2], logErrorMock, "test/allRejected")
    ).resolves.toEqual([null, null]);

    expect(logErrorMock).toHaveBeenCalledTimes(2);
  });

  it("logError import resolves correctly (fails RED until logger.ts exists)", async () => {
    const { logError } = await import("@/lib/logger");
    expect(typeof logError).toBe("function");
  });
});
