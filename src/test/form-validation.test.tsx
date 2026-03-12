/**
 * PROF-05: Zod schema validation on Login and Signup forms
 *
 * RED tests — Login and Signup use uncontrolled HTML validation (required/minLength).
 * These tests will go GREEN when zodResolver is added via react-hook-form.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSignInWithPassword = vi.fn();
const mockSignUp = vi.fn();
const mockGetSession = vi.fn().mockResolvedValue({ data: { session: null } });
const mockOnAuthStateChange = vi.fn(() => ({
  data: { subscription: { unsubscribe: vi.fn() } },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signUp: mockSignUp,
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(() => ({
    user: null,
    session: null,
    role: null,
    loading: false,
    roleLoading: false,
    onboardingCompleted: null,
    practiceSetupCompleted: null,
    signIn: vi.fn().mockResolvedValue({ data: null, error: null }),
    signUp: vi.fn().mockResolvedValue({ data: null, error: null }),
    signOut: vi.fn(),
  })),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Login form — Zod validation (PROF-05)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows email error and blocks submit when email is empty", async () => {
    const { default: Login } = await import("@/pages/Login");
    const Wrapper = makeWrapper();

    render(<Wrapper><Login /></Wrapper>);

    // Submit without filling in any fields
    const submitBtn = screen.getByRole("button", { name: /sign in/i });
    fireEvent.click(submitBtn);

    // PROF-05: Zod validation must show field-level error messages
    await waitFor(() => {
      // Look for an email validation error message
      const emailError = screen.queryByText(/enter a valid email/i) ||
                         screen.queryByText(/email.*required/i) ||
                         screen.queryByText(/valid email/i) ||
                         screen.queryByText(/invalid email/i);
      expect(emailError).toBeInTheDocument();
    });

    // signInWithPassword must NOT have been called
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("shows password error and blocks submit when password is too short", async () => {
    const { default: Login } = await import("@/pages/Login");
    const Wrapper = makeWrapper();

    render(<Wrapper><Login /></Wrapper>);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "abc" }, // 3 chars, less than 6
    });

    const submitBtn = screen.getByRole("button", { name: /sign in/i });
    fireEvent.click(submitBtn);

    // PROF-05: Zod must catch short password
    await waitFor(() => {
      const pwError = screen.queryByText(/at least 6/i) ||
                      screen.queryByText(/password.*6/i) ||
                      screen.queryByText(/minimum.*6/i) ||
                      screen.queryByText(/too short/i);
      expect(pwError).toBeInTheDocument();
    });

    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });
});

describe("Signup form — Zod validation (PROF-05)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows fullName error and blocks submit when fullName is empty", async () => {
    const { default: Signup } = await import("@/pages/Signup");
    const Wrapper = makeWrapper();

    render(<Wrapper><Signup /></Wrapper>);

    // Fill in everything except fullName
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "secret123" },
    });

    const submitBtn = screen.getByRole("button", { name: /create account/i });
    fireEvent.click(submitBtn);

    // PROF-05: Zod must require full name
    await waitFor(() => {
      const nameError = screen.queryByText(/full name.*required/i) ||
                        screen.queryByText(/name is required/i) ||
                        screen.queryByText(/required/i);
      expect(nameError).toBeInTheDocument();
    });

    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("shows email validation error when email is malformed", async () => {
    const { default: Signup } = await import("@/pages/Signup");
    const Wrapper = makeWrapper();

    render(<Wrapper><Signup /></Wrapper>);

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: "Jane Smith" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "not-an-email" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "secret123" },
    });

    const submitBtn = screen.getByRole("button", { name: /create account/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const emailError = screen.queryByText(/valid email/i) ||
                         screen.queryByText(/invalid email/i) ||
                         screen.queryByText(/enter a valid email/i);
      expect(emailError).toBeInTheDocument();
    });

    expect(mockSignUp).not.toHaveBeenCalled();
  });
});
