

# Fix 10 Known Gaps / Unimplemented Features

## Overview

This plan addresses every unimplemented feature identified in the audit. Each fix is scoped to be functional and production-appropriate.

---

## 1. Notification Toggles -- Persist to Database

**Problem:** Patient Profile toggles (`Switch`) use `defaultChecked` with no database storage. Changes are lost on refresh.

**Fix:**
- Create a new `user_preferences` table with columns: `id`, `user_id`, `pref_key` (text), `pref_value` (boolean), `updated_at`
- RLS: users can read/write their own rows, admins can read all
- On Profile mount, fetch preferences and set toggle state
- On toggle change, upsert into `user_preferences`

**Files:** Migration (new table), `src/pages/patient/Profile.tsx`

---

## 2. Automations Execution Engine

**Problem:** Automations are stored in the `automations` table but never run. No cron job or Edge Function exists.

**Fix:**
- Create Edge Function `run-automations/index.ts` that:
  1. Fetches all enabled automations
  2. For each `no_scan` type: finds patients of that doctor who haven't submitted a scan in `trigger_days` days
  3. For each `low_compliance` type: finds patients with compliance_streak below a threshold
  4. For each `recurring` type: checks if `trigger_days` have passed since last automated message
  5. Inserts messages into the `messages` table using the `message_template` (replacing `{patient_name}` and `{days}` placeholders)
- Register in `supabase/config.toml` with `verify_jwt = false`
- Set up a `pg_cron` job to call this function daily via SQL insert (not migration)

**Files:** `supabase/functions/run-automations/index.ts`, `supabase/config.toml`

---

## 3. Team Invite Acceptance Flow

**Problem:** Team invites stay PENDING forever. No mechanism for invited users to accept.

**Fix:**
- After signup, check if the new user's email matches any `team_invites` record
- Create Edge Function `accept-team-invite/index.ts` that:
  1. Takes the authenticated user's email
  2. Looks up pending invites matching that email
  3. Updates `accepted_at` to `now()`
  4. Optionally links the user to the practice
- Call this function from the Login page after successful sign-in
- Add a visual banner on doctor Settings when invites are accepted

**Files:** `supabase/functions/accept-team-invite/index.ts`, `supabase/config.toml`, `src/pages/Login.tsx`

---

## 4. Deactivate Practice Backend Logic

**Problem:** The "Deactivate Practice" button in doctor Settings has no `onClick` handler.

**Fix:**
- Add confirmation dialog (type "DEACTIVATE" to confirm)
- On confirm: update `profiles.suspended = true` and `profiles.suspension_reason = 'self_deactivated'` for the doctor
- Show a toast and sign the user out
- On login, if `suspended === true`, show a banner: "Your practice has been deactivated. Contact support to reactivate."

**Files:** `src/pages/doctor/Settings.tsx`, `src/components/ProtectedRoute.tsx`

---

## 5. Database-Driven Available Slots

**Problem:** Doctor Profile page uses hardcoded `SLOT_PILLS` array.

**Fix:**
- Create `doctor_availability` table: `id`, `doctor_id` (uuid), `day_of_week` (text), `start_time` (text), `is_active` (boolean), `created_at`
- RLS: doctors manage their own, patients can read their assigned doctor's slots
- Doctor Settings: add an "Availability" card where doctors can add/remove/toggle time slots
- Patient DoctorProfile: fetch from `doctor_availability` instead of hardcoded array

**Files:** Migration (new table), `src/pages/doctor/Settings.tsx`, `src/pages/patient/DoctorProfile.tsx`

---

## 6. Billing Tab -- Stripe Integration Placeholder with Real Data

**Problem:** Patient Detail billing tab shows only a static placeholder.

**Fix:**
- Show the patient's assigned doctor's subscription tier and status
- Display a treatment cost estimate section (editable by doctor) using a new `estimated_cost` column on `patients` table
- Show payment status: "Managed by your practice" with practice name
- Still note that full Stripe checkout is coming soon, but make the tab informative

**Files:** Migration (add `estimated_cost` to `patients`), `src/pages/doctor/PatientDetail.tsx`

---

## 7. Manage Billing -- Stripe Portal Link

**Problem:** "Manage Billing" button just shows a "coming soon" toast.

**Fix:**
- Create Edge Function `create-billing-portal/index.ts` that:
  1. Takes the doctor's `stripe_customer_id` from `subscriptions`
  2. If it exists, creates a Stripe Billing Portal session and returns the URL
  3. If no Stripe customer, returns an error prompting setup
- On click: call the function and redirect to the Stripe portal URL
- Fallback: if no Stripe secret is configured, keep the "coming soon" toast but with a clearer message

**Files:** `supabase/functions/create-billing-portal/index.ts`, `supabase/config.toml`, `src/pages/doctor/Settings.tsx`

*Note: This requires a `STRIPE_SECRET_KEY` secret. The plan will prompt you to add it if you want full Stripe integration, otherwise the button will show a more informative "Connect Stripe to manage billing" message.*

---

## 8. Device Pairing -- Generate Unique Code

**Problem:** Pairing modal always shows hardcoded `ARC-7F2K-9M`.

**Fix:**
- Generate a random pairing code on modal open: `ARC-XXXX-XX` format using `crypto.getRandomValues()`
- Store the code in `patients` table (add `pairing_code` column, nullable text)
- On "Done" click: save the code to the patient record and set `device_linked = true`
- Display the stored code if device is already linked; allow "Unlink" to clear it

**Files:** Migration (add `pairing_code` to `patients`), `src/pages/patient/Profile.tsx`

---

## 9. Share Progress -- Generate Real Shareable Link

**Problem:** Share Progress button only shows a toast, does not create an actual link.

**Fix:**
- Create a `progress_shares` table: `id`, `patient_id`, `share_token` (text, unique), `created_at`, `expires_at` (default 7 days)
- RLS: patients can insert their own, anyone can read by token
- On "Share Progress" click: insert a row, generate a URL like `/shared/progress/{token}`, copy to clipboard
- Create a new public page `/shared/progress/:token` that shows read-only progress data (ToothArch, quality, milestones)

**Files:** Migration (new table), `src/pages/patient/Progress.tsx`, new file `src/pages/public/SharedProgress.tsx`, `src/App.tsx` (add route)

---

## 10. Scan Compare URL Fix

**Problem:** PatientDetail navigates to `/doctor/scans/compare?ids=id1,id2` but ScanCompare reads `?a=` and `?b=`.

**Fix:**
- Update `ScanCompare` to also parse the `ids` parameter: split by comma, assign first to `scanA` and second to `scanB`
- Keep backward compatibility with `?a=` and `?b=` format
- This is a one-line logic fix

**Files:** `src/pages/doctor/ScanCompare.tsx`

---

## Implementation Order

| Priority | Item | Complexity |
|----------|------|------------|
| 1 | #10 Scan Compare URL fix | Trivial |
| 2 | #1 Notification preferences | Low |
| 3 | #8 Device pairing code | Low |
| 4 | #9 Share Progress link | Medium |
| 5 | #4 Deactivate Practice | Low |
| 6 | #5 Available Slots | Medium |
| 7 | #6 Billing tab | Low |
| 8 | #3 Team invite acceptance | Medium |
| 9 | #2 Automation engine | High |
| 10 | #7 Stripe billing portal | Medium (requires secret) |

## Database Changes Summary

| Change | Type |
|--------|------|
| `user_preferences` table | New table |
| `doctor_availability` table | New table |
| `progress_shares` table | New table |
| `patients.pairing_code` column | Add column |
| `patients.estimated_cost` column | Add column |

## New Files

| File | Purpose |
|------|---------|
| `supabase/functions/run-automations/index.ts` | Cron-driven automation execution |
| `supabase/functions/accept-team-invite/index.ts` | Team invite acceptance |
| `supabase/functions/create-billing-portal/index.ts` | Stripe portal session |
| `src/pages/public/SharedProgress.tsx` | Public progress sharing page |

## Modified Files

| File | Changes |
|------|---------|
| `src/pages/doctor/ScanCompare.tsx` | Parse `ids` param |
| `src/pages/patient/Profile.tsx` | Persist toggles, dynamic pairing code |
| `src/pages/patient/Progress.tsx` | Real share link generation |
| `src/pages/patient/DoctorProfile.tsx` | Fetch slots from DB |
| `src/pages/doctor/Settings.tsx` | Deactivate logic, availability editor, Stripe portal |
| `src/pages/doctor/PatientDetail.tsx` | Billing tab with real data |
| `src/pages/Login.tsx` | Call accept-team-invite after login |
| `src/components/ProtectedRoute.tsx` | Suspended account check |
| `src/App.tsx` | Add shared progress route |
| `supabase/config.toml` | Register 3 new edge functions |

