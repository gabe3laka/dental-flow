# External Integrations

**Analysis Date:** 2026-03-10

## APIs & External Services

**AI & Analysis:**
- **Lovable AI Gateway** - Dental scan analysis
  - SDK/Client: Direct HTTPS calls to `https://ai.gateway.lovable.dev/v1/chat/completions`
  - Model: `google/gemini-3-flash-preview`
  - Auth: `LOVABLE_API_KEY` environment variable (Bearer token)
  - Used by Supabase functions:
    - `analyze-scan-quality`: Quality scoring (0-100) with feedback
    - `analyze-scan-teeth`: Per-tooth analysis with deviation detection, confidence scores
  - Functions: `src/integrations/supabase/client.ts`

## Data Storage

**Primary Database:**
- **Supabase (PostgreSQL)**
  - URL: `https://qalegwgqtyleuaowvuje.supabase.co`
  - Publishable Key: Embedded in `src/integrations/supabase/client.ts`
  - Client: `@supabase/supabase-js` v2.97.0
  - Auth: Supabase Auth (session-based with localStorage)
  - Tables (core):
    - `users` - Authentication via Supabase Auth
    - `profiles` - User metadata (full_name, specialty, onboarding_completed, practice_setup_completed)
    - `patients` - Patient records (assigned_doctor_id, treatment_type, compliance_streak, current_stage, total_stages)
    - `scans` - Dental scan submissions (zones_captured, quality_score, status, submitted_at)
    - `messages` - Doctor-patient messaging (receiver_id, sender_id, content, read_at)
    - `user_roles` - Role assignments (admin, doctor, patient)
    - `subscriptions` - Plan subscriptions (plan_tier, stripe_customer_id, stripe_subscription_id)
    - `automations` - Automated messages (trigger_type, trigger_days, message_template)
    - `consult_requests` - Public consults (patient_email, reply_video_url, scan_video_url)
    - `team_invites` - Team member invitations
    - `doctor_availability` - Doctor availability slots
    - `practice_analytics` - Practice metrics (visits_avoided)
    - `admin_notes` - Admin annotations
    - `feature_flags` - Feature flag management
    - Additional tables: See `src/integrations/supabase/types.ts` (complete schema, 991 lines)

**File Storage:**
- **Supabase Storage** (S3-compatible)
  - Bucket: `profile-photos` - Doctor logos, avatars, practice photos
  - Bucket: `scan-videos` - Dental scan images and videos
  - Upload paths use user ID and timestamp: `logos/{user_id}/{timestamp}.{ext}`
  - Used in:
    - `src/pages/doctor/Settings.tsx` - Logo upload
    - `src/pages/doctor/PracticeSetup.tsx` - Profile photo upload
    - `src/pages/doctor/PatientDetail.tsx` - Scan video uploads

**Caching:**
- None detected (No Redis, Memcached, or similar)

## Authentication & Identity

**Auth Provider:**
- **Supabase Auth**
  - Session storage: `localStorage`
  - Auto-refresh: Enabled
  - Persist session: Enabled
  - Custom user data: role, full_name, specialty stored in auth.user.user_metadata
  - Signup/signin: Email + password flow
  - Email redirect: Configured to window.location.origin

**Implementation:**
- Custom hook: `src/hooks/use-auth.ts`
- Auth state lifecycle:
  - onAuthStateChange listener for session changes
  - Fetches user role from `user_roles` table
  - Fetches profile data from `profiles` table
  - Stores: user object, session, role, loading states
  - Methods: `signUp()`, `signIn()`, `signOut()`

**Protected Routes:**
- `src/components/ProtectedRoute.tsx` - Guards all authenticated pages
- Role-based access: Admin, Doctor, Patient

## Monitoring & Observability

**Error Tracking:**
- None detected (No Sentry, Rollbar, or similar)

**Logging:**
- **Console-based** - `console.error()` in error handlers
- Example: `src/hooks/use-patient-data.ts` logs to console on fetch failure
- Supabase functions also use console.error for debugging

**Debugging:**
- Lovable component tagger in development mode: `lovable-tagger` plugin

## Billing & Payments

**Payment Provider:**
- **Stripe** - Subscription and billing management
  - Stripe Secret Key: `STRIPE_SECRET_KEY` environment variable
  - Integration points:
    - Customer ID stored in `subscriptions.stripe_customer_id`
    - Subscription ID stored in `subscriptions.stripe_subscription_id`
    - Billing portal created via Supabase function: `create-billing-portal`
  - Portal endpoint: `https://api.stripe.com/v1/billing_portal/sessions`
  - Return URL after portal: `/doctor/settings`

**Pricing Tiers:**
- `starter` - ArclineCare (50 patient limit)
- `growth` - ArclineCare + ArclineGrowth (200 patient limit)
- `enterprise` - Full suite with automations (999 patient limit)

**Billing UI:**
- `src/pages/admin/Billing.tsx` - Admin billing overview (placeholder for webhook logs)
- `src/pages/doctor/Settings.tsx` - Doctor access to billing portal
- `src/pages/doctor/PracticeSetup.tsx` - Billing info during onboarding

## CI/CD & Deployment

**Hosting:**
- Deployment target: Lovable platform (inferred from URLs in comments)
- Demo URL: `https://dental-charm-link.lovable.app` (used as Stripe portal return URL)

**CI Pipeline:**
- None detected (No GitHub Actions, GitLab CI, or similar)

**Build Process:**
- Vite build: `npm run build` outputs to dist/
- Development mode build: `npm run build:dev`

## Environment Configuration

**Required Environment Variables:**
- `SUPABASE_URL` - Supabase project URL (hardcoded in client: `https://qalegwgqtyleuaowvuje.supabase.co`)
- `SUPABASE_PUBLISHABLE_KEY` - Supabase anonymous key (hardcoded in client)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (for backend functions)
- `LOVABLE_API_KEY` - Lovable AI Gateway API key
- `STRIPE_SECRET_KEY` - Stripe secret key for billing portal

**Configuration Location:**
- `.env` file present (contents not disclosed per security policy)
- Supabase config: `supabase/config.toml`
- Build config: `vite.config.ts`

**Secrets Management:**
- Environment variables stored in `.env` (development)
- Supabase project stores function secrets

## Webhooks & Callbacks

**Incoming:**
- **Stripe Webhooks** - Billing event notifications (placeholder UI in `src/pages/admin/Billing.tsx`)
  - Not yet implemented: "Webhook events will appear here once Stripe is connected"

**Outgoing:**
- **Supabase Functions** - Edge functions triggered by:
  - Direct HTTP calls from frontend
  - Database triggers (implied by automation functions)
  - Webhook handlers (not yet configured)

**Callback URLs:**
- Stripe return URL: Configured in `create-billing-portal` function with origin header
- Supabase auth redirects: Uses `window.location.origin` for signup confirmation

## Data Flow & Real-time Features

**Real-time Subscriptions:**
- None detected (No Supabase realtime subscriptions or similar)

**Data Fetching Pattern:**
- React Query for server state management
- Supabase client queries in hooks and components
- No polling or websockets detected
- Example: `src/hooks/use-patient-data.ts` uses Promise.all for parallel queries

## Third-party Content

**Image CDN:**
- **Cloudflare R2** - Static assets
  - URL: `https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev`
  - Used for: Landing page preview images, OG images

**Font Delivery:**
- **Google Fonts** - Web fonts
  - Fonts: Fraunces, DM Sans, IBM Plex Mono

## Feature Flags

**Implementation:**
- Database table: `feature_flags`
- Hook: `src/hooks/use-feature-flag.ts`
- Enables/disables features via database

## Toasts & Notifications

**Toast Library:**
- **Sonner** - Toast notifications
- Custom hook wrapper: `src/hooks/use-toast.ts`
- Displays in `src/App.tsx` with both Toaster and Sonner components

---

*Integration audit: 2026-03-10*
