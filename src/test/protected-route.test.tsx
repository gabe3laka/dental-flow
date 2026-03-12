import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";

// Mock useAuth so we can control every field
vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "@/hooks/use-auth";
const mockUseAuth = vi.mocked(useAuth);

function baseAuthState(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: "user-1" },
    session: {},
    role: "doctor",
    loading: false,
    roleLoading: false,
    onboardingCompleted: true,
    practiceSetupCompleted: true,
    suspended: false,
    signUp: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  };
}

function renderProtectedRoute() {
  return render(
    <MemoryRouter initialEntries={["/doctor"]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/doctor" element={<div>DOCTOR CONTENT</div>} />
        </Route>
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
        <Route path="/admin" element={<div>ADMIN PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("PROF-04: Suspension race condition fix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("suspended=true shows ACCOUNT SUSPENDED screen immediately", () => {
    mockUseAuth.mockReturnValue(baseAuthState({ suspended: true }) as ReturnType<typeof useAuth>);
    renderProtectedRoute();
    expect(screen.getByText("ACCOUNT SUSPENDED")).toBeInTheDocument();
    expect(screen.queryByText("DOCTOR CONTENT")).not.toBeInTheDocument();
  });

  it("suspended=null shows loading UI (not route content)", () => {
    mockUseAuth.mockReturnValue(baseAuthState({ suspended: null }) as ReturnType<typeof useAuth>);
    renderProtectedRoute();
    expect(screen.getByText("LOADING")).toBeInTheDocument();
    expect(screen.queryByText("DOCTOR CONTENT")).not.toBeInTheDocument();
    expect(screen.queryByText("ACCOUNT SUSPENDED")).not.toBeInTheDocument();
  });

  it("suspended=false renders protected route content", () => {
    mockUseAuth.mockReturnValue(baseAuthState({ suspended: false }) as ReturnType<typeof useAuth>);
    renderProtectedRoute();
    expect(screen.getByText("DOCTOR CONTENT")).toBeInTheDocument();
    expect(screen.queryByText("ACCOUNT SUSPENDED")).not.toBeInTheDocument();
    expect(screen.queryByText("LOADING")).not.toBeInTheDocument();
  });

  it("roleLoading=true shows loading UI regardless of suspended", () => {
    mockUseAuth.mockReturnValue(baseAuthState({ roleLoading: true, suspended: false }) as ReturnType<typeof useAuth>);
    renderProtectedRoute();
    expect(screen.getByText("LOADING")).toBeInTheDocument();
  });

  it("no user redirects to /login", () => {
    mockUseAuth.mockReturnValue(baseAuthState({ user: null, suspended: null }) as ReturnType<typeof useAuth>);
    renderProtectedRoute();
    expect(screen.getByText("LOGIN PAGE")).toBeInTheDocument();
  });
});
