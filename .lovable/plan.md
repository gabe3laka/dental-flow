## Goal
Add multi-select + bulk delete to `src/pages/patient/ScanHistory.tsx`. Same delete logic as today (storage cleanup + scan row + decrement `total_scans`), just batched.

## UX
- Add a "SELECT" toggle button in the header row (next to the H1 / above the PillNav). Tapping it enters selection mode.
- In selection mode:
  - Each scan card shows a checkbox on the left (replacing the chevron interaction — tapping the row toggles selection instead of expanding).
  - Header shows `N SELECTED` plus `SELECT ALL` / `CLEAR` actions and a `DELETE (N)` destructive button.
  - Confirm step inline (mono-label "DELETE N SCANS?" → YES, DELETE / CANCEL), matching the existing single-delete confirm pattern.
- Exiting selection mode clears selection and restores normal expand-on-tap behavior.
- Only scans that are not `sent_to_doctor` are selectable (matches current single-delete rule which only shows for unsent scans). Sent scans render disabled checkboxes with a subtle "sent" hint.

## Implementation
- New state: `selectMode: boolean`, `selectedIds: Set<string>`, `bulkConfirm: boolean`, `bulkDeleting: boolean`.
- New handler `handleBulkDelete()`: iterates selected scans and reuses the same storage-cleanup + row-delete + `total_scans` decrement sequence as `handleDelete`. Run sequentially per scan to keep the per-patient counter math correct; show a single toast at the end (`Deleted N scans` or partial-failure message).
- Refactor: extract the per-scan deletion body into a small `deleteScanRecord(scan)` helper inside the component so both `handleDelete` and `handleBulkDelete` call it.
- Keep counts (`counts.all`, etc.) in sync by filtering `scans` and `allScans` by removed IDs after bulk delete.
- Tab counts and PillNav untouched.
- No schema, RLS, or Edge Function changes.

## Files
- `src/pages/patient/ScanHistory.tsx` — only file touched.

## Out of scope
- No changes to ScanResults, ScanSubmission, Edge Functions, or storage policies.
- No new "delete sent scans" capability — sent scans remain non-deletable, same as today.
