# Testing Patterns

**Analysis Date:** 2026-03-10

## Test Framework

**Runner:**
- Vitest 3.2.4
- Config: `vitest.config.ts`

**Assertion Library:**
- Vitest built-in (uses Node's assert module under the hood)
- Testing Library for React components: `@testing-library/react` 16.0.0
- Testing Library DOM matchers: `@testing-library/jest-dom` 6.6.0

**Run Commands:**
```bash
npm test              # Run all tests once
npm run test:watch   # Watch mode (continuous testing)
```

## Test Framework Configuration

**Vitest Config (`vitest.config.ts`):**
```typescript
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

**Key settings:**
- Environment: `jsdom` (browser-like environment for React testing)
- Globals: `true` (describe, it, expect available without imports)
- Setup file: `src/test/setup.ts` runs before test suite
- Test file pattern: `**/*.test.ts`, `**/*.test.tsx`, `**/*.spec.ts`, `**/*.spec.tsx`
- Path alias `@` available in tests

## Test File Organization

**Location:**
- Co-located with source code (test files in `src/test/` directory for shared setup)
- Example test: `src/test/example.test.ts`

**Naming:**
- Pattern: `[name].test.ts` or `[name].spec.ts`
- Current project uses `.test.ts` convention

**Structure:**
```
src/
├── test/
│   ├── setup.ts          # Global test setup
│   └── example.test.ts   # Example test file
├── components/
├── hooks/
└── pages/
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect } from "vitest";

describe("example", () => {
  it("should pass", () => {
    expect(true).toBe(true);
  });
});
```

**Patterns:**
- Top-level `describe()` block for test suite
- Nested `it()` blocks for individual test cases
- Test names use "should [expected behavior]" pattern
- Single assertion or tightly related assertions per test

**Test File Template:**
```typescript
// Imports at top
import { describe, it, expect } from "vitest";
import { [function/component] } from "@/[path]";

// Single describe per module
describe("[module name]", () => {
  // Individual test cases
  it("should [expected behavior]", () => {
    // Arrange
    // Act
    // Assert
    expect(...).toBe(...);
  });
});
```

## Setup and Fixtures

**Global Setup (`src/test/setup.ts`):**
```typescript
import "@testing-library/jest-dom";

// Mock window.matchMedia for components using media queries
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
```

**What's configured:**
- Testing Library matchers and utilities
- `window.matchMedia` mock for responsive components
- jsdom environment polyfills

**Test Data:**
- No factories or fixture files observed in codebase
- Data typically created inline in tests
- No shared test utilities beyond setup.ts

## Mocking

**Framework:** Vitest built-in mocking (`vi.mock()`, `vi.spyOn()`)

**Not heavily used:**
- Only one example test file found (`src/test/example.test.ts`)
- Setup focuses on DOM/browser API mocks rather than module mocks
- `window.matchMedia` mocked at setup level for all tests

**Patterns for recommended mocking:**
```typescript
// Mock Supabase client (recommended for component tests)
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    auth: { onAuthStateChange: vi.fn(), getSession: vi.fn() },
  },
}));

// Mock React Router
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: vi.fn() };
});
```

**What to Mock:**
- External services (Supabase, API calls)
- React Router hooks (useNavigate, useLocation)
- Custom hooks that depend on external services

**What NOT to Mock:**
- React hooks themselves (useState, useEffect)
- Built-in browser APIs after setup.ts (matchMedia already mocked)
- UI component libraries (Radix UI, shadcn components)

## Coverage

**Requirements:** None enforced

**Current state:**
- Only one example test exists
- No coverage tooling configuration observed
- No coverage thresholds in vitest.config.ts

**To enable coverage:**
```bash
npm run test -- --coverage
```

## Test Types

**Unit Tests:**
- Scope: Individual functions and hooks
- Approach: Import function/hook, call with test data, assert output
- Example pattern (for utils):
  ```typescript
  import { describe, it, expect } from "vitest";
  import { cn } from "@/lib/utils";

  describe("cn", () => {
    it("should merge Tailwind classes correctly", () => {
      const result = cn("px-2", "px-4");
      expect(result).toBe("px-4"); // px-4 wins
    });
  });
  ```

**React Component Tests:**
- Approach: Render with Testing Library, interact, assert DOM state
- Setup: Use `render()` from @testing-library/react
- Example pattern (recommended):
  ```typescript
  import { describe, it, expect } from "vitest";
  import { render, screen } from "@testing-library/react";
  import { Button } from "@/components/ui/button";

  describe("Button", () => {
    it("should render with correct variant", () => {
      render(<Button variant="destructive">Delete</Button>);
      expect(screen.getByRole("button")).toHaveClass("destructive");
    });
  });
  ```

**Integration Tests:**
- Not structured separately
- Would test multiple components working together
- Not widely observed in current codebase

**E2E Tests:**
- Framework: Not used
- Codebase relies on unit/component tests only
- No Cypress, Playwright, or similar E2E tool configured

## Async Testing

**Recommended pattern for async operations:**
```typescript
it("should load data when component mounts", async () => {
  vi.mocked(supabase.from).mockReturnValue({
    select: vi.fn().mockResolvedValue({ data: [...] }),
  });

  render(<MyComponent />);

  // Wait for async state updates
  await waitFor(() => {
    expect(screen.getByText("Loaded")).toBeInTheDocument();
  });
});
```

**For hooks with async operations:**
```typescript
import { renderHook, waitFor } from "@testing-library/react";

it("should fetch auth state", async () => {
  const { result } = renderHook(() => useAuth());

  await waitFor(() => {
    expect(result.current.user).toBeDefined();
  });
});
```

## Error Testing

**Recommended pattern:**
```typescript
it("should handle errors gracefully", async () => {
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation();

  vi.mocked(supabase.from).mockRejectedValue(new Error("Network error"));

  render(<ComponentWithErrorHandling />);

  await waitFor(() => {
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  consoleErrorSpy.mockRestore();
});
```

## Dependency Testing

**Testing Library packages:**
- `@testing-library/react` - Component rendering and interaction
- `@testing-library/jest-dom` - DOM matchers
- jsdom - DOM implementation for Node.js environment

**Related setup:**
- React: 18.3.1 (latest stable)
- TypeScript: 5.8.3
- Vitest automatically handles React component testing with jsdom

## Current Test Coverage

**State of testing:**
- Minimal: Only one example test file in entire codebase (`src/test/example.test.ts`)
- Example test is placeholder: Tests `true === true`
- No component tests found
- No hook tests found
- No utility tests found

**Untested areas:**
- All custom hooks (`useAuth`, `usePatientData`, `useFeatureFlag`, `useMobile`, `useToast`)
- All page components
- All custom components
- All utility functions (`cn`, etc.)
- Supabase integration points
- Error handling paths

**Why minimal coverage likely:**
- Early-stage project or feature-focused development
- Focus on manual testing or QA
- Testing patterns established but not yet applied

## Testing Best Practices to Follow

**For new tests:**
1. Place test files in `src/test/` directory
2. Name files with `.test.ts` or `.test.tsx` extension
3. Use `describe` + `it` structure
4. Mock external dependencies (Supabase, React Router)
5. Use Testing Library for component tests (not snapshot testing)
6. Test behavior, not implementation
7. Keep tests focused: one concept per test
8. Use `waitFor` for async operations

**Coverage targets (recommended):**
- Critical paths: 80%+ coverage
- Hooks: 80%+ coverage
- Pages: 60%+ coverage
- UI components: Can be lower (shadcn components already tested)

---

*Testing analysis: 2026-03-10*
