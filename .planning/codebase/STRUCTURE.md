# Codebase Structure

**Analysis Date:** 2026-03-10

## Directory Layout

```
dental-flow-main/
├── public/                     # Static assets
├── src/
│   ├── components/             # Reusable React components
│   │   ├── ui/                 # shadcn/ui primitives (40+ components)
│   │   ├── doctor/             # Doctor-specific components
│   │   ├── patient/            # Patient-specific components
│   │   ├── landing/            # Landing page visualizations
│   │   ├── ProtectedRoute.tsx  # Auth guard wrapper
│   │   ├── ImpersonationBanner.tsx
│   │   ├── MobileTopBar.tsx    # Mobile navigation
│   │   └── NavLink.tsx
│   ├── hooks/                  # Custom React hooks
│   │   ├── use-auth.ts         # Authentication state
│   │   ├── use-patient-data.ts # Patient data aggregation
│   │   ├── use-feature-flag.ts # Feature toggles
│   │   ├── use-mobile.tsx      # Device detection
│   │   └── use-toast.ts        # Toast notifications
│   ├── integrations/           # External service clients
│   │   └── supabase/
│   │       ├── client.ts       # Supabase instance
│   │       └── types.ts        # Auto-generated DB types
│   ├── layouts/                # Layout wrappers for routes
│   │   ├── DoctorLayout.tsx    # Doctor sidebar + main
│   │   └── AdminLayout.tsx     # Admin sidebar + main
│   ├── lib/                    # Utility functions
│   │   └── utils.ts            # cn() class merge utility
│   ├── pages/                  # Page components (43 total)
│   │   ├── admin/              # Admin role pages (8 pages)
│   │   │   ├── Overview.tsx
│   │   │   ├── Practices.tsx
│   │   │   ├── PracticeDetail.tsx
│   │   │   ├── Patients.tsx
│   │   │   ├── Billing.tsx
│   │   │   ├── Support.tsx
│   │   │   ├── System.tsx
│   │   │   └── Settings.tsx
│   │   ├── doctor/             # Doctor role pages (9 pages)
│   │   │   ├── Overview.tsx    # Patient list + metrics
│   │   │   ├── Analytics.tsx   # Practice analytics
│   │   │   ├── Consults.tsx    # Video consult management
│   │   │   ├── Automations.tsx # Workflow automation
│   │   │   ├── Settings.tsx    # Doctor preferences (537 lines)
│   │   │   ├── ScanReview.tsx  # Scan detail view (494 lines)
│   │   │   ├── PatientDetail.tsx # Patient records
│   │   │   ├── PracticeSetup.tsx # Onboarding
│   │   │   ├── ScanCompare.tsx
│   │   │   └── RecordResponse.tsx
│   │   ├── patient/            # Patient role pages (8 pages)
│   │   │   ├── Home.tsx        # Patient dashboard
│   │   │   ├── Onboarding.tsx  # Setup flow
│   │   │   ├── ScanHistory.tsx # Past scans
│   │   │   ├── ScanSubmission.tsx # Scan capture
│   │   │   ├── Progress.tsx    # Treatment progress
│   │   │   ├── Chat.tsx        # Doctor messaging
│   │   │   ├── Profile.tsx     # Patient profile
│   │   │   ├── DoctorProfile.tsx # Assigned doctor info
│   │   │   └── VideoResponse.tsx # Doctor video messages
│   │   ├── public/             # Public pages (8 pages)
│   │   │   ├── Consult.tsx     # Public booking
│   │   │   ├── Privacy.tsx
│   │   │   ├── Terms.tsx
│   │   │   ├── Security.tsx
│   │   │   ├── Hipaa.tsx
│   │   │   ├── Blog.tsx
│   │   │   ├── Careers.tsx
│   │   │   ├── Contact.tsx
│   │   │   ├── Integrations.tsx
│   │   │   ├── Features.tsx
│   │   │   └── SharedProgress.tsx
│   │   ├── Login.tsx
│   │   ├── Signup.tsx
│   │   ├── Landing.tsx
│   │   ├── NotFound.tsx
│   │   └── Index.tsx
│   ├── test/                   # Test setup and examples
│   │   ├── example.test.ts     # Example Vitest suite
│   │   └── setup.ts            # Test configuration
│   ├── App.tsx                 # Main router and app shell
│   ├── main.tsx                # React root entry
│   ├── App.css                 # Global component styles
│   ├── index.css               # Global Tailwind + resets
│   └── vite-env.d.ts           # Vite type declarations
├── supabase/                   # Supabase backend config
│   ├── functions/              # Serverless edge functions
│   │   ├── accept-team-invite/
│   │   ├── analyze-scan-quality/
│   │   ├── analyze-scan-teeth/
│   │   ├── create-billing-portal/
│   │   ├── generate-copilot-note/
│   │   ├── generate-patient-summary/
│   │   ├── run-automations/
│   │   └── seed-users/
│   └── migrations/             # Database schema versions (6 migrations)
├── .planning/                  # GSD planning documents
│   └── codebase/               # Generated architecture docs
├── index.html                  # HTML entry point
├── package.json                # Dependencies & scripts
├── tsconfig.json               # TypeScript base config
├── tsconfig.app.json           # App TypeScript config
├── tsconfig.node.json          # Build tools TypeScript config
├── vite.config.ts              # Vite build config
├── vitest.config.ts            # Vitest test runner config
├── tailwind.config.ts          # Tailwind CSS config
├── postcss.config.js           # PostCSS plugins
├── eslint.config.js            # ESLint rules
└── components.json             # shadcn/ui config
```

## Directory Purposes

**src/components/ui/:**
- Purpose: Low-level Radix UI primitives wrapped by shadcn/ui template
- Contains: 40+ files including button, dialog, input, select, calendar, carousel, tabs, etc.
- Key files: `button.tsx`, `card.tsx`, `input.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `select.tsx`, `toast.tsx`

**src/components/doctor/:**
- Purpose: Doctor-role-specific components
- Contains: `DoctorChat.tsx` and other doctor UI elements
- Key usage: Embedded in doctor pages for patient management UIs

**src/components/patient/:**
- Purpose: Patient-role-specific components
- Contains: `PatientBottomNav.tsx`, `ToothArch.tsx` (dental visualization)
- Key usage: Patient-facing dashboards and interactions

**src/components/landing/:**
- Purpose: Hero and marketing section visualizations
- Contains: `TeethScene.tsx` (Three.js 3D scene), `HeroPhoneMockup.tsx`, `ScrollReveal.tsx`, carousel and animation components
- Key usage: Landing.tsx page animations and 3D visuals

**src/pages/:**
- Purpose: Route-specific page implementations organized by role/access level
- Contains: 43 page components; largest files are doctor domain (Settings 537 lines, ScanReview 494 lines)
- Pattern: Each page fetches its own data on mount, manages local UI state

**src/hooks/:**
- Purpose: Custom React hooks encapsulating auth and data logic
- Pattern: useEffect + useState for async data, cancellation cleanup
- Key: use-auth.ts is imported by nearly every page

**src/integrations/supabase/:**
- Purpose: Centralized database client initialization and types
- client.ts: Single export of supabase instance (created via createClient<Database>)
- types.ts: Auto-generated TypeScript types from Supabase schema (28KB file)

**src/layouts/:**
- Purpose: Route layout wrappers providing persistent navigation
- Contains: DoctorLayout (dark sidebar, responsive), AdminLayout
- Usage: Nested in <Route element={<ProtectedRoute>}><Route element={<DoctorLayout>}> patterns

**supabase/functions/:**
- Purpose: Serverless backend logic for AI analysis, automation, and system operations
- Functions: analyze-scan-quality, analyze-scan-teeth (ML analysis), generate-copilot-note (AI-powered), run-automations (workflow), seed-users
- Invoked from: Frontend via supabase.functions.invoke() in pages/hooks

**supabase/migrations/:**
- Purpose: Version-controlled database schema changes
- Contains: 6 timestamped SQL files representing incremental schema evolution
- Pattern: Apply in order during deployment

## Key File Locations

**Entry Points:**
- `src/main.tsx`: React root initialization
- `src/App.tsx`: Central route configuration (all 43 routes defined here)
- `index.html`: HTML document with root div and main.tsx script tag

**Configuration:**
- `vite.config.ts`: Build config with @ alias pointing to src/, component tagger plugin
- `tsconfig.app.json`: TypeScript config with @ path alias
- `tailwind.config.ts`: Tailwind customization (fonts, animations, dark mode)
- `vitest.config.ts`: Test runner config
- `.env`: Environment variables (Supabase URL and public key hardcoded in client.ts)

**Core Logic:**
- `src/hooks/use-auth.ts`: Auth state + sign up/in/out (118 lines)
- `src/components/ProtectedRoute.tsx`: Route guard with role/onboarding checks (82 lines)
- `src/layouts/DoctorLayout.tsx`: Sidebar navigation + theme application (124 lines)
- `src/integrations/supabase/client.ts`: Database client initialization (17 lines)

**Testing:**
- `src/test/example.test.ts`: Example Vitest spec
- `src/test/setup.ts`: Test environment setup

## Naming Conventions

**Files:**
- React components: PascalCase (e.g., `DoctorLayout.tsx`, `PatientHome.tsx`)
- Hooks: camelCase with `use` prefix (e.g., `use-auth.ts`, `use-patient-data.ts`)
- Pages: PascalCase matching route names (e.g., `ScanReview.tsx` for `/doctor/scans/:scanId`)
- UI primitives: kebab-case (e.g., `alert-dialog.tsx`, `dropdown-menu.tsx`)

**Directories:**
- Feature/role domains: lowercase plural (e.g., `components/doctor/`, `pages/admin/`)
- Utility directories: lowercase functional name (e.g., `hooks/`, `lib/`, `integrations/`)
- Nested patterns: group by feature, then by role if applicable

**Import Paths:**
- All imports use `@` alias pointing to `src/`: `import { useAuth } from "@/hooks/use-auth"`
- No relative paths (../../) used in codebase

## Where to Add New Code

**New Feature:**
- Primary code: Create page file in `src/pages/{role}/{FeatureName}.tsx` matching route structure
- Tests: Create adjacent `{FeatureName}.test.tsx` or in `src/test/{feature}.test.ts`
- Routes: Add route to `src/App.tsx` in appropriate role section
- Hooks: Extract reusable logic to `src/hooks/use-{feature}.ts` if fetching data
- Components: Extract UI to `src/components/{role}/{ComponentName}.tsx`

**New Component/Module:**
- Role-specific: `src/components/{doctor|patient|admin}/{ComponentName}.tsx`
- Shared/generic: `src/components/ui/{component-name}.tsx` (if shadcn primitive) or `src/components/{ComponentName}.tsx`
- Export pattern: Use default export for pages, named exports for reusable components

**Utilities:**
- Helper functions: `src/lib/{utility}.ts`
- Hooks: `src/hooks/use-{feature}.ts`
- Constants: Define inline in files or create `src/lib/constants.ts` if widely used

**Database/Integration:**
- New Supabase function: `supabase/functions/{function-name}/index.ts` following existing pattern
- Migration: `supabase/migrations/{timestamp}_{description}.sql`
- Type updates: Auto-generated via `supabase gen types` → `src/integrations/supabase/types.ts`

## Special Directories

**node_modules/:**
- Purpose: Installed npm packages
- Generated: Yes (via npm install)
- Committed: No (.gitignore excludes)

**.git/:**
- Purpose: Version control
- Generated: Yes (git init)
- Committed: N/A (internal)

**public/:**
- Purpose: Static assets served at root (favicon, images, etc.)
- Generated: No (user-created)
- Committed: Yes

**supabase/migrations/:**
- Purpose: Database schema versioning
- Generated: Partially (Supabase CLI generates, developers write SQL)
- Committed: Yes (critical for deployment)

---

*Structure analysis: 2026-03-10*
