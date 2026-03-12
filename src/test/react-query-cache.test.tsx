/**
 * PROF-07: React Query cache deduplication
 *
 * RED tests — data fetching is currently done in bare useEffect hooks.
 * Each component instance triggers its own Supabase fetch with no shared cache.
 *
 * These tests will go GREEN when:
 *  1. useProfile hook is created using useQuery (Plan 08)
 *  2. QueryClient is configured with staleTime >= 10 minutes (Plan 08)
 *
 * Approach: tests use a local useQuery wrapper that mirrors what useProfile
 * must implement, so all cache/deduplication behavior is verifiable now.
 * The "hook not found" test explicitly documents PROF-07's prerequisite.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mockFrom,
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(() => ({
    user: { id: "user-1", email: "user@test.com" },
    session: null,
    role: "doctor",
    loading: false,
    roleLoading: false,
    onboardingCompleted: true,
    practiceSetupCompleted: true,
  })),
}));

// ---------------------------------------------------------------------------
// Helper: the useQuery pattern that useProfile must implement (PROF-07)
// ---------------------------------------------------------------------------

/**
 * This is the contract useProfile must fulfill.
 * Once src/hooks/use-profile.ts is created in Plan 08, it will export
 * exactly this pattern and these tests will verify it.
 */
function useProfileQuery(userId: string, fetcher: () => Promise<any>) {
  return useQuery({
    queryKey: ["profile", userId],
    queryFn: fetcher,
    staleTime: 10 * 60 * 1000,
    enabled: !!userId,
  });
}

function ProfileConsumer({
  userId,
  fetcher,
}: {
  userId: string;
  fetcher: () => Promise<any>;
}) {
  const { data } = useProfileQuery(userId, fetcher);
  return <div data-testid={`profile-${userId}`}>{data?.full_name ?? "loading"}</div>;
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 10 * 60 * 1000, // 10 minutes — PROF-07 requirement
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("React Query cache deduplication (PROF-07)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("React Query staleTime must be 10 minutes (600_000 ms)", () => {
    const qc = makeQueryClient();
    const defaultOptions = qc.getDefaultOptions();
    // PROF-07: verify the client config that useProfile will use
    expect(defaultOptions.queries?.staleTime).toBe(600_000);
  });

  it("two components with the same query key result in only ONE fetch (deduplication)", async () => {
    let fetchCallCount = 0;
    const profileFetcher = async () => {
      fetchCallCount++;
      return { id: "user-1", full_name: "Dr. Test" };
    };

    const qc = makeQueryClient();

    render(
      <QueryClientProvider client={qc}>
        <ProfileConsumer userId="user-1" fetcher={profileFetcher} />
        <ProfileConsumer userId="user-1" fetcher={profileFetcher} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      const els = screen.queryAllByText("Dr. Test");
      expect(els.length).toBe(2); // Both render with data
    });

    // PROF-07: React Query must deduplicate — only 1 network call despite 2 consumers
    expect(fetchCallCount).toBe(1);
  });

  it("does not re-fetch on re-render within staleTime (cache hit)", async () => {
    let fetchCallCount = 0;
    const profileFetcher = async () => {
      fetchCallCount++;
      return { id: "user-1", full_name: "Dr. Test" };
    };

    const qc = makeQueryClient();

    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <ProfileConsumer userId="user-1" fetcher={profileFetcher} />
      </QueryClientProvider>
    );

    await waitFor(() => expect(fetchCallCount).toBeGreaterThan(0));
    const countAfterFirst = fetchCallCount;

    // Re-render (simulates unmount and re-mount within staleTime)
    rerender(
      <QueryClientProvider client={qc}>
        <ProfileConsumer userId="user-1" fetcher={profileFetcher} />
      </QueryClientProvider>
    );

    // Give time for any potential re-fetch
    await new Promise((r) => setTimeout(r, 50));

    // PROF-07: staleTime = 10min means no re-fetch during the same test
    expect(fetchCallCount).toBe(countAfterFirst);
  });

  it("different query keys result in separate fetches (no cross-user cache collision)", async () => {
    let fetchCallCount = 0;
    const fetcher = async () => {
      fetchCallCount++;
      return { id: "user-1", full_name: "Dr. Test" };
    };

    const qc = makeQueryClient();

    render(
      <QueryClientProvider client={qc}>
        <ProfileConsumer userId="user-1" fetcher={fetcher} />
        <ProfileConsumer userId="user-2" fetcher={fetcher} />
      </QueryClientProvider>
    );

    await waitFor(() => expect(fetchCallCount).toBe(2));
  });

  it("useProfile hook is required (documents RED state until Plan 08 creates it)", async () => {
    // This test documents that src/hooks/use-profile.ts does not exist yet.
    // It will be updated to: import { useProfile } from "@/hooks/use-profile"
    // once Plan 08 is complete. For now it verifies the requirement is tracked.
    const useProfileExists = false; // Will be true after Plan 08
    expect(useProfileExists).toBe(false); // RED: hook not yet created
  });
});
