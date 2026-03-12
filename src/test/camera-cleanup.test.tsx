/**
 * PROF-01: Camera track cleanup on unmount
 *
 * RED tests — RecordResponse currently has no unmount cleanup for the recording
 * interval (intervalRef) or the recorder instance (recorderRef) when recording
 * is in progress at unmount time.
 *
 * Tests will go GREEN when a useEffect cleanup is added that:
 *   1. Calls clearInterval on intervalRef.current
 *   2. Calls recorder.stop() on recorderRef.current
 *   (stream track cleanup is already present via the camera effect)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RecordResponse from "@/pages/doctor/RecordResponse";

// ---------------------------------------------------------------------------
// Mocks — declared at module level to avoid repeated dynamic imports
// ---------------------------------------------------------------------------

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
    storage: {
      from: vi.fn(() => ({ upload: vi.fn().mockResolvedValue({ error: null }) })),
    },
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "doctor-1", email: "doctor@test.com" },
    session: null,
    role: "doctor",
    loading: false,
    roleLoading: false,
    onboardingCompleted: true,
    practiceSetupCompleted: true,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

// ---------------------------------------------------------------------------
// MediaStream / MediaRecorder stubs
// ---------------------------------------------------------------------------

const mockRecorderStop = vi.fn();
const mockTrackStop = vi.fn();

class MockMediaStream {
  getTracks = vi.fn(() => [{ stop: mockTrackStop }, { stop: mockTrackStop }]);
}

class MockMediaRecorder {
  start = vi.fn();
  stop = mockRecorderStop;
  ondataavailable: ((e: any) => void) | null = null;
  static isTypeSupported = vi.fn(() => true);
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/doctor/record/scan-123"]}>
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RecordResponse — camera cleanup on unmount (PROF-01)", () => {
  let clearIntervalSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Stub global media APIs
    (global as any).MediaStream = MockMediaStream;
    (global as any).MediaRecorder = MockMediaRecorder;

    // getUserMedia returns a mock stream
    Object.defineProperty(global.navigator, "mediaDevices", {
      configurable: true,
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(new MockMediaStream()),
      },
    });

    clearIntervalSpy = vi.spyOn(window, "clearInterval");
  });

  afterEach(() => {
    clearIntervalSpy.mockRestore();
  });

  it("clearInterval is called when component unmounts while recording", async () => {
    const Wrapper = makeWrapper();
    let unmount!: () => void;

    await act(async () => {
      const result = render(<Wrapper><RecordResponse /></Wrapper>);
      unmount = result.unmount;
      // Let camera effect fire
      await new Promise((r) => setTimeout(r, 30));
    });

    // Click Start Recording to set intervalRef
    await act(async () => {
      const btn = document.querySelector<HTMLButtonElement>("button");
      if (btn) btn.click();
      await new Promise((r) => setTimeout(r, 10));
    });

    act(() => { unmount(); });

    // PROF-01 — fails RED: no cleanup effect clears the recording interval on unmount
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it("recorder.stop() is called when component unmounts while recording", async () => {
    const Wrapper = makeWrapper();
    let unmount!: () => void;

    await act(async () => {
      const result = render(<Wrapper><RecordResponse /></Wrapper>);
      unmount = result.unmount;
      await new Promise((r) => setTimeout(r, 30));
    });

    await act(async () => {
      const btn = document.querySelector<HTMLButtonElement>("button");
      if (btn) btn.click();
      await new Promise((r) => setTimeout(r, 10));
    });

    act(() => { unmount(); });

    // PROF-01 — fails RED: recorder.stop() not called on unmount
    expect(mockRecorderStop).toHaveBeenCalled();
  });

  it("stream tracks are stopped when component unmounts", async () => {
    const Wrapper = makeWrapper();
    let unmount!: () => void;

    await act(async () => {
      const result = render(<Wrapper><RecordResponse /></Wrapper>);
      unmount = result.unmount;
      await new Promise((r) => setTimeout(r, 30));
    });

    act(() => { unmount(); });

    // This one should pass even now — camera effect already has a cleanup:
    // "streamRef.current?.getTracks().forEach((t) => t.stop())"
    expect(mockTrackStop).toHaveBeenCalled();
  });
});
