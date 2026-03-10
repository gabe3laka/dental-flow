# Technology Stack

**Analysis Date:** 2026-03-10

## Languages

**Primary:**
- TypeScript 5.8.3 - Full codebase (src/, supabase/functions/)
- HTML5 - Entry point and metadata
- CSS3 - Styling with Tailwind CSS

**Secondary:**
- SQL - Supabase database migrations
- TOML - Supabase configuration

## Runtime

**Environment:**
- Node.js (implied by build/dev setup)

**Package Manager:**
- npm with package-lock.json
- bun.lockb (alternative lockfile present)

## Frameworks

**Core:**
- React 18.3.1 - UI framework and component library
- React Router v6.30.1 - Client-side routing
- Vite 5.4.19 - Build tool and dev server

**UI Components:**
- Radix UI (20+ component libraries) - Unstyled, accessible UI primitives
  - Includes: accordion, alert-dialog, avatar, checkbox, dialog, dropdown-menu, popover, select, tabs, toast, tooltip, etc.
- shadcn/ui components - Built on Radix UI
- TailwindCSS 3.4.17 - Utility-first CSS framework
- Lucide React 0.462.0 - Icon library

**State & Data:**
- TanStack React Query 5.83.0 - Server state management
- React Hook Form 7.61.1 - Form state management
- Zod 3.25.76 - Schema validation

**3D Graphics:**
- Three.js 0.160.1 - 3D library
- @react-three/fiber 8.18.0 - React renderer for Three.js
- @react-three/drei 9.122.0 - Three.js utilities

**Utilities:**
- date-fns 3.6.0 - Date manipulation
- recharts 2.15.4 - Data visualization and charts
- embla-carousel-react 8.6.0 - Carousel component
- react-resizable-panels 2.1.9 - Draggable panel layouts
- Sonner 1.7.4 - Toast notifications
- class-variance-authority 0.7.1 - CSS variant utilities
- clsx 2.1.1 - Conditional className utility
- cmdk 1.1.1 - Command palette component
- input-otp 1.4.2 - OTP input component
- next-themes 0.3.0 - Dark mode management
- tailwind-merge 2.6.0 - Merge Tailwind CSS classes
- vaul 0.9.9 - Drawer component

## Testing

**Test Framework:**
- Vitest 3.2.4 - Unit/integration test runner
- Config: `vitest.config.ts`

**Test Utilities:**
- @testing-library/react 16.0.0 - React component testing
- @testing-library/jest-dom 6.6.0 - DOM matchers
- jsdom 20.0.3 - DOM implementation for Node.js

**Test Commands:**
```bash
npm run test              # Run all tests once
npm run test:watch       # Watch mode
```

## Development Tools

**Build/Dev:**
- @vitejs/plugin-react-swc 3.11.0 - SWC compiler plugin for React
- Vite build command outputs to dist/

**Linting:**
- ESLint 9.32.0 - Code quality
- typescript-eslint 8.38.0 - TypeScript linting
- eslint-plugin-react-hooks 5.2.0 - React Hooks rules
- eslint-plugin-react-refresh 0.4.20 - Fast Refresh rules
- Config: `eslint.config.js` (flat config format)

**Styling:**
- PostCSS 8.5.6 - CSS processing
- @tailwindcss/typography 0.5.16 - Typography plugin
- tailwindcss-animate 1.0.7 - Animation utilities
- Autoprefixer 10.4.21 - Vendor prefixes

**Other:**
- lovable-tagger 1.1.13 - Development-only component tagging

## Database

**Provider:**
- Supabase (PostgreSQL-based)
  - Project ID: qalegwgqtyleuaowvuje
  - Region: Inferred from URL (qalegwgqtyleuaowvuje.supabase.co)

**Client Library:**
- @supabase/supabase-js 2.97.0 - JavaScript client

**Configuration:**
- Supabase config: `supabase/config.toml`
- Database migrations: `supabase/migrations/*.sql`
- Types: `src/integrations/supabase/types.ts` (991 lines, auto-generated)

**Storage:**
- Supabase Storage buckets:
  - `profile-photos` - User/practice logos and avatars
  - `scan-videos` - Dental scan video/image uploads

## Backend Functions

**Supabase Edge Functions (Deno):**
- Runtime: Deno (TypeScript)
- Located: `supabase/functions/*/index.ts`
- Functions deployed:
  - `seed-users` - User seeding/initialization
  - `analyze-scan-quality` - AI scan quality analysis
  - `analyze-scan-teeth` - Per-tooth AI analysis
  - `generate-patient-summary` - Patient summary generation
  - `generate-copilot-note` - Copilot note generation
  - `run-automations` - Automation execution
  - `accept-team-invite` - Team invite acceptance
  - `create-billing-portal` - Stripe billing portal creation

**Function Configuration:**
- CORS headers configured for all functions
- Most functions disable JWT verification (`verify_jwt = false`)
- Environment variables used: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY`, `STRIPE_SECRET_KEY`

## Configuration Files

**Build Configuration:**
- `vite.config.ts` - Vite build config with React plugin and path aliases
- `tsconfig.json` - Base TypeScript config with base URL and path aliases
- `tsconfig.app.json` - App-specific TypeScript config (ES2020 target, JSX support)
- `tsconfig.node.json` - Node-specific TypeScript config
- `tailwind.config.ts` - TailwindCSS customization (custom colors, fonts, spacing)
- `postcss.config.js` - PostCSS config for Tailwind
- `components.json` - shadcn/ui component config
- `eslint.config.js` - ESLint flat config

**Environment:**
- `.env` file present (contains configuration, never read)
- Environment variables used:
  - Database: Supabase URL and publishable key (embedded in client code)
  - Functions: `LOVABLE_API_KEY`, `STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

## Fonts & Assets

**Fonts:**
- Fraunces (serif) - Display font
- DM Sans (sans-serif) - Body font
- IBM Plex Mono (monospace) - Code/data display
- Loaded from Google Fonts

**Assets:**
- Public assets in `public/` directory
- Favicon: `/favicon.ico`
- External CDN: Cloudflare R2 (`pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev`)

## Platform Requirements

**Development:**
- Node.js with npm or bun
- TypeScript knowledge
- Vite dev server: runs on port 8080 with HMR disabled overlay

**Production:**
- Node.js-compatible hosting (Vite builds static files)
- Supabase project credentials
- Stripe and Lovable API keys for billing and AI features

---

*Stack analysis: 2026-03-10*
