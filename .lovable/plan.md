## Backend task: add scans DELETE RLS policy + verify AI Guide contract

### 1. Apply migration: scans DELETE policy

`public.scans` has SELECT/INSERT/UPDATE policies but no DELETE policy, so patient scan deletion is silently denied by RLS. Apply via `supabase--migration`:

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Scan delete' AND tablename = 'scans' AND schemaname = 'public'
  ) THEN
    CREATE POLICY "Scan delete" ON public.scans
      FOR DELETE TO authenticated
      USING (
        public.has_role(auth.uid(), 'admin')
        OR patient_id = public.get_patient_id_for_user(auth.uid())
      );
  END IF;
END $$;
```

Note: `supabase/migrations/20260518090000_scans_delete_policy.sql` is already in the repo, but the live DB still needs the policy applied via the migration tool.

### 2. Verify after apply

- `supabase--read_query`: `SELECT policyname, cmd FROM pg_policies WHERE tablename='scans' AND schemaname='public'` — confirm `Scan delete` is present alongside the existing three.
- Confirm `scan_reviews.scan_id` FK to `scans(id)` is `ON DELETE CASCADE` (so deleting a sent scan doesn't FK-error). If not cascading, flag it — do not silently change it.
- Confirm storage policies `Patients write own scan-reference-boards` and `Patients update own scan-reference-boards` exist on `storage.objects` for bucket `scan-reference-boards` with `(storage.foldername(name))[1] = patient_id::text` check.

### 3. Verify AI Guide edge function contract

The new client (`AiGuideResultViewer`) polls `scans.generation_status`, `generative_scene_url`, `generative_glb_url`, `generation_error`. Confirm `generate-visual-guide` + `visual-guide-poll` still write exactly these columns:

- `generate-visual-guide` on dispatch → `generation_status = 'generating_scene'`, `generation_engine = 'worldlabs_marble'`, `generation_job_id` set, `generation_started_at` set. On failure → `generation_status = 'failed'`, `generation_error` populated.
- `visual-guide-poll` on success → `generation_status = 'render_ready'`, `generative_scene_url` (path in `generated-scenes`), `generative_glb_url` (path in `generated-assets`), `generative_assets` jsonb. On failure → `failed` + `generation_error`. On timeout (>30min) → `failed`.

These match the current edge function code on disk — no code change needed. Verify by:
- `supabase--edge_function_logs` on `generate-visual-guide` and `visual-guide-poll` for recent invocations.
- Optionally `supabase--read_query` for a recent scan row with `generation_status IS NOT NULL` to confirm columns populate as expected.

### 4. Do NOT

- Do not recreate the `scan-reference-boards`, `generated-scenes`, `generated-assets` buckets — they already exist.
- Do not duplicate storage policies.
- Do not modify edge function code as part of this task.

### Deliverable

Report back the full policy list on `public.scans` after migration, plus confirmation that the storage policies and `scan_reviews` FK cascade are in place.

### Open question for the user

Fast-forward this branch onto `main` after verification, or leave on `claude/reorganize-dentalflow-ui-z62rd`?
