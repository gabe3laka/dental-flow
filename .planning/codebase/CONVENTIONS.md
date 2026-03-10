# Coding Conventions

**Analysis Date:** 2026-03-10

## Naming Patterns

**Files:**
- React components: PascalCase (e.g., `App.tsx`, `ImpersonationBanner.tsx`, `ProtectedRoute.tsx`)
- Custom hooks: kebab-case with `use-` prefix (e.g., `use-auth.ts`, `use-patient-data.ts`, `use-feature-flag.ts`, `use-mobile.tsx`)
- Utility/lib files: kebab-case or descriptive (e.g., `utils.ts`, `client.ts`, `types.ts`)
- UI component variants: camelCase within component (e.g., `buttonVariants`, `alertVariants`)

**Functions:**
- Component functions: PascalCase (e.g., `function App()`, `function CountUpNumber()`)
- Custom hook functions: camelCase with `use` prefix (e.g., `export function useAuth()`, `export function usePatientData()`)
- Utility functions: camelCase (e.g., `cn()`, `createToothGeometry()`, `fetch()`)
- Event handlers: camelCase with action prefix (e.g., `handleExit`, `sendMessage`, `tick`)
- Async functions: explicit `async` keyword notation in declarations
- Internal callback functions: camelCase (e.g., `handler`, `fetchRoleAndProfile`)

**Variables:**
- State variables: camelCase with descriptive names (e.g., `email`, `loading`, `messages`, `sending`, `started`)
- Type variables: PascalCase (e.g., `Message`, `AuthState`, `PatientData`, `AppRole`)
- UI component refs: camelCase (e.g., `ref`, `scrollRef`, `el`)
- Constants: UPPER_SNAKE_CASE (e.g., `TIER_PRICES`)

**Types:**
- Interfaces: PascalCase (e.g., `AuthState`, `ButtonProps`, `CountUpNumberProps`, `DoctorChatProps`)
- Interface properties: camelCase with optional/required indicated by type (e.g., `onboardingCompleted: boolean | null`)
- Type aliases: PascalCase (e.g., `AppRole`, `Message`)
- Component prop types: `[ComponentName]Props` pattern (e.g., `ButtonProps`, `NavLinkCompatProps`)

## Code Style

**Formatting:**
- ESLint configured with TypeScript support
- No explicit Prettier config found — ESLint handles formatting rules
- Line width: Enforced via default ESLint rules
- Indentation: 2 spaces (implied by codebase style)
- Semicolons: Required (enforced by ESLint config)
- Quotes: Double quotes for strings (observed pattern in codebase)

**Linting:**
- Tool: ESLint 9.32.0 with TypeScript ESLint 8.38.0
- Config: `eslint.config.js` (flat config format)
- Extends: `@eslint/js` recommended, `typescript-eslint` recommended
- Key rules enabled:
  - `react-hooks/recommended` - React Hooks linting
  - `react-refresh/only-export-components` (warn level) - Vite React refresh compatibility
- Key rules disabled:
  - `@typescript-eslint/no-unused-vars` - Off (unused vars allowed)
- Environment: ECMAScript 2020, browser globals

## Import Organization

**Order:**
1. React and third-party libraries (e.g., `import React`, `import { useState }`, `import { useNavigate }`)
2. Internal path aliases (e.g., `import { supabase } from "@/integrations/supabase/client"`)
3. Relative imports within component (rare, generally avoided)

**Path Aliases:**
- `@/*` maps to `./src/*` (configured in `tsconfig.json` and `vitest.config.ts`)
- Used throughout codebase: `@/components`, `@/hooks`, `@/integrations`, `@/lib`, `@/pages`, `@/layouts`

**Example:**
```typescript
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
```

## Error Handling

**Patterns:**
- Try-catch blocks wrapping async operations (e.g., in data fetches)
- Generic catch blocks that log to console: `catch (e) { console.error(e); }`
- No custom error types or error boundary pattern observed
- Errors logged via `console.error()` with minimal context
- Common pattern: `console.error("Failed to [action]:", e)` for additional context
- No error recovery or user-facing error states beyond loading states

**Examples from codebase:**
```typescript
// Generic error logging (DoctorChat.tsx)
try {
  await supabase.from("messages").insert({...});
  setInput("");
} catch (e) {
  console.error(e);
} finally {
  setSending(false);
}

// Error with context (use-patient-data.ts)
try {
  // ... async operations
} catch (e) {
  console.error("Failed to load patient data:", e);
}

// Inline error logging (AdminOverview.tsx)
} catch (e) { console.error(e); }
```

**Validation:**
- Runtime validation: `zod` library is available (v3.25.76)
- Validation applied in form handling via `react-hook-form` with `@hookform/resolvers`
- No observed validation in data-fetching or API response handling

## Logging

**Framework:** `console` object (no logging framework)

**Patterns:**
- `console.error()` for exceptions and error states
- Minimal logging — mostly error-focused
- No info/debug/warn levels observed
- No structured logging or formatters

**When to log:**
- Error cases in try-catch blocks
- Context: Include action description (e.g., "Failed to load patient data")
- One-liners acceptable: `console.error(e)`

## Comments

**When to Comment:**
- Explaining non-obvious logic (rare in codebase)
- Clarifying complex calculations (e.g., "ease-out cubic" for animation easing)
- TODO/FIXME patterns: Not heavily used; single examples observed

**JSDoc/TSDoc:**
- Not extensively used
- Interface properties use TypeScript type annotations instead of JSDoc
- Function parameters rely on TypeScript types for documentation

**Observed patterns:**
```typescript
// Non-obvious algorithm explanation (CountUpNumber.tsx)
// ease-out cubic
const eased = 1 - Math.pow(1 - progress, 3);

// Sectional comments for logical grouping (App.tsx)
/* Public routes */
/* Protected patient routes */
/* Protected doctor routes — main pages with sidebar */
```

## Function Design

**Size:** Functions are generally 20-50 lines for complex logic (e.g., `fetchRoleAndProfile` in use-auth.ts is 25 lines)

**Parameters:**
- Props passed via destructuring in parameters (React components)
- Optional props indicated via `?:` notation
- Multiple related parameters grouped or passed as object (e.g., component props)

**Return Values:**
- Components return JSX directly
- Custom hooks return object with values and functions: `return { ...state, signUp, signIn, signOut }`
- Data-fetching functions return `{ data, error }` tuple pattern
- Async functions used for side effects; return value often discarded

**Async/Await:**
- Extensively used for Supabase queries
- Promise.all() for parallel queries
- No Promise chaining observed
- Cancellation tokens used in hooks to prevent state updates: `let cancelled = false`

## Module Design

**Exports:**
- Named exports for utilities and types: `export function cn()`, `export interface AuthState`
- Default exports for page/layout components: `export default function Landing()`
- Named exports for UI components: `export { Button, buttonVariants }`
- Component composition via sub-exports (e.g., Alert, AlertTitle, AlertDescription exported separately)

**Barrel Files:**
- Not used — each component file exports directly
- No index.ts rollups observed in component directories

**Component Structure:**
- Props interface defined above component: `export interface ButtonProps extends React.ButtonHTMLAttributes...`
- forwardRef for components accepting refs: `React.forwardRef<HTMLButtonElement, ButtonProps>(...)`
- displayName set for DevTools: `Button.displayName = "Button"`

## React-Specific Conventions

**Hooks:**
- Hooks placed at component top level
- Dependency arrays explicitly managed
- Cancellation cleanup in effect returns: `return () => { cancelled = true; }`
- Rules of Hooks enforced via ESLint

**Props:**
- Typed via TypeScript interfaces
- Destructured in function parameters
- Rest props handled with `...props` for HTML elements
- Optional props use `?:` notation

**State Management:**
- React hooks (useState, useEffect) for local component state
- TanStack React Query (v5.83.0) for server state
- No Redux or Zustand observed

---

*Convention analysis: 2026-03-10*
