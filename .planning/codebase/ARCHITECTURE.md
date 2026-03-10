# Architecture

**Analysis Date:** 2026-03-10

## Pattern Overview

**Overall:** Multi-role SPA with React Router-based role-based access control (RBAC) and Supabase backend integration

**Key Characteristics:**
- Client-side routing with protected routes guarding three distinct user roles (admin, doctor, patient)
- Real-time Supabase integration for auth, database, and serverless functions
- Query-driven data fetching using React hooks with parallel batch operations
- Layout-based UI with sidebar navigation for authenticated users
- Toast notifications via Sonner and Radix UI components throughout

## Layers

**Presentation Layer:**
- Purpose: React components implementing role-specific UIs with Tailwind CSS styling
- Location: `src/components/` and `src/pages/`
- Contains: Page components, layout components, reusable UI components from shadcn/ui
- Depends on: Hooks for auth/data, integrations for database access, Radix UI and Lucide icons
- Used by: Router entry points

**Routing & Protection Layer:**
- Purpose: Client-side routing with authentication guards and role-based redirects
- Location: `src/App.tsx` (central route config), `src/components/ProtectedRoute.tsx`
- Contains: BrowserRouter setup, Route definitions for 3 role groups, redirection logic
- Depends on: React Router DOM, useAuth hook for role checking
- Used by: Main application entry point

**State & Hook Layer:**
- Purpose: Custom hooks for authentication state, patient data, feature flags, and device detection
- Location: `src/hooks/`
- Contains: `use-auth.ts` (auth state + sign up/in/out), `use-patient-data.ts` (patient data fetching), `use-feature-flag.ts`, `use-mobile.tsx`, `use-toast.ts`
- Depends on: Supabase client, React hooks, Sonner toast library
- Used by: Page and component implementations

**Data Access Layer:**
- Purpose: Supabase client initialization with typed database schema
- Location: `src/integrations/supabase/`
- Contains: `client.ts` (Supabase instance creation), `types.ts` (auto-generated Database types)
- Depends on: @supabase/supabase-js SDK, localStorage for session persistence
- Used by: Hooks, pages, and components making database queries

**Layout Layer:**
- Purpose: Provides shared UI frames and navigation for authenticated routes
- Location: `src/layouts/`
- Contains: `DoctorLayout.tsx` (dark sidebar + main content), `AdminLayout.tsx` (admin sidebar setup)
- Depends on: React Router, useAuth, navigation state management
- Used by: Protected doctor and admin routes

**Utility Layer:**
- Purpose: Helper functions and CSS utilities
- Location: `src/lib/`
- Contains: `utils.ts` (cn() function combining clsx and tailwindMerge for class composition)
- Depends on: clsx, tailwind-merge
- Used by: Components for dynamic className generation

## Data Flow

**Authentication Flow:**

1. User visits `/login` or `/signup` page
2. Form submission calls `signUp()` or `signIn()` from `useAuth()` hook
3. Supabase Auth handles credential verification
4. On success, `user` and `session` stored in auth state and localStorage
5. `useAuth()` subscribes to `onAuthStateChange()` event, triggers role fetch from `user_roles` table
6. Routes re-evaluate via `ProtectedRoute` component, redirect based on role

**Patient Data Flow:**

1. Patient lands on `/patient` or any `/patient/*` route
2. `useAuth()` confirms authenticated + has role "patient"
3. `use-patient-data()` hook fetches patient record via Supabase
4. Parallel queries gather scans, unread message count, latest message, assigned doctor
5. Data aggregated into `PatientData` state object with computed fields (progress %, streak)
6. Component re-renders with data or skeleton loaders if still fetching

**Doctor Overview Flow:**

1. Doctor accesses `/doctor` (main page with sidebar)
2. `DoctorLayout` renders with navigation sidebar + main outlet
3. `DoctorOverview` page fetches: patients assigned to doctor, their scans, practice analytics
4. Parallel Promise.all() queries reduce multiple roundtrips
5. Scans grouped by patient, profiles mapped by user ID for display
6. Tab filtering ("all", "pending", "attention", "on_track") applied client-side
7. Search updates patient list in real-time

**State Management:**
- Local component state via `useState()` for UI interactions (search, tabs, form inputs)
- Supabase real-time subscriptions handled at query time, not actively polled
- No global state manager; auth state persisted via localStorage and Supabase session
- Data fetching follows cancellation pattern in hooks (cancelled flag) to prevent state updates on unmounted components

## Key Abstractions

**ProtectedRoute Component:**
- Purpose: Wraps routes requiring authentication; enforces role-based redirects
- Examples: `src/components/ProtectedRoute.tsx`
- Pattern: React Router Outlet wrapper that checks loading states, auth status, role, suspension, onboarding completion, and practice setup completion before rendering nested routes

**useAuth Hook:**
- Purpose: Central authentication state manager with sign up/in/out functions
- Examples: Used in every protected page and layout
- Pattern: useState for auth state, useEffect to subscribe to Supabase auth changes, separate useEffect to fetch role + onboarding status after user confirmed

**use-patient-data Hook:**
- Purpose: Aggregates multi-table patient information with progress calculations
- Examples: `src/hooks/use-patient-data.ts`
- Pattern: Fetches base patient record, then parallel queries for related data, combines into single typed object

**Layout Components:**
- Purpose: Provide shared navigation and styling for authenticated role groups
- Examples: `src/layouts/DoctorLayout.tsx`, `src/layouts/AdminLayout.tsx`
- Pattern: React Router Outlet with fixed sidebar; sets dark mode via document class; responsive (desktop sidebar hidden on mobile)

**Page Components:**
- Purpose: Role-specific screens implementing feature logic
- Examples: `src/pages/doctor/Overview.tsx`, `src/pages/patient/Home.tsx`, `src/pages/admin/Overview.tsx`
- Pattern: Fetch data on mount, manage local UI state, handle async operations with try/catch logging

## Entry Points

**Application Root:**
- Location: `src/main.tsx`
- Triggers: Browser loads index.html which executes main.tsx
- Responsibilities: Creates React root and renders App component

**App Component:**
- Location: `src/App.tsx`
- Triggers: main.tsx calls createRoot().render(<App />)
- Responsibilities: Wraps entire app with QueryClientProvider (React Query), TooltipProvider (Radix), toast providers, BrowserRouter; defines all routes and nesting

**Protected Route Guard:**
- Location: `src/components/ProtectedRoute.tsx`
- Triggers: Router encounters a <Route element={<ProtectedRoute />}> wrapper
- Responsibilities: Checks auth/role loading, redirects unauthenticated users to login, enforces role-based path routing, checks onboarding/setup completion

**Layout Routes:**
- Location: `src/layouts/DoctorLayout.tsx`, `src/layouts/AdminLayout.tsx`
- Triggers: ProtectedRoute allows access + user has matching role
- Responsibilities: Renders persistent navigation sidebar, applies role-specific styling, outlets page content

## Error Handling

**Strategy:** Try-catch-finally with logging and user notifications via toast

**Patterns:**
- **Data Fetching:** Wrap Supabase queries in try-catch; log errors to console; show toast for user-facing operations
- **Validation:** Form validation pre-submission; Zod used for type safety where schemas defined
- **Auth Errors:** `signIn()`/`signUp()` return error objects; error.message displayed via toast
- **Async Abort:** Custom `cancelled` flag in hooks prevents state updates after unmount
- **Silent Failures:** Non-critical operations (e.g., accept-team-invite after login) wrapped in `try/catch { }` to not block user flow

## Cross-Cutting Concerns

**Logging:**
- Method: console.error() and console.log() used sparingly for debugging
- Location: useAuth hook logs role fetch, use-patient-data logs errors, pages log fetch failures
- No centralized logger; errors meant for dev console inspection

**Validation:**
- Method: Zod schemas for forms (imported from zod)
- Location: Form components use @hookform/resolvers with Zod schemas
- Client-side only; server-side validation on Supabase via RLS policies

**Authentication:**
- Method: Supabase Auth with JWT tokens
- Flow: Credentials sent to Supabase, JWT stored in localStorage, auto-refreshed on expiration
- RLS (Row Level Security): Database tables enforce user/role-based access control at row level

**Role-Based Access Control (RBAC):**
- Implementation: user_roles table tracks role per user (admin/doctor/patient)
- Enforcement: ProtectedRoute redirects based on role; page-level checks redirect to role home
- Suspension: profiles table has suspended flag checked on route entry

---

*Architecture analysis: 2026-03-10*
