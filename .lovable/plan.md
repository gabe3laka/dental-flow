# Fix: Marble generating teeth from non-dental images

## Root cause

In `supabase/functions/generate-visual-guide/index.ts` we send a hardcoded `text_prompt` on every dispatch:

> "Photoreal intra-oral dental cavity reference board — six standardized clinical views, soft diffuse lighting, neutral white balance."

Marble weights `text_prompt` very heavily — when the image content (e.g. cafe / desk photos) doesn't match, the text wins and you get a teeth-flavoured world. The reference repo `image-blaster` does **not** force a domain prompt; per Marble docs, omitting `text_prompt` lets the model auto-caption the actual image.

So the bias is entirely server-side. The board composer (`referenceBoard.ts`) faithfully tiles whatever images the user gave — no teeth are baked in there.

## Fix

In `generate-visual-guide/index.ts`:

1. **Remove the dental `text_prompt`.** Send `world_prompt` with only `type` + `image_prompt`:
   ```ts
   world_prompt: {
     type: "image",
     image_prompt: { source: "uri", uri: signed.signedUrl },
   }
   ```
   Marble will auto-caption from the board image itself.

2. Keep `display_name` as `Dental Visual Guide ${scan_id}` (display-only, not sent to the model).

3. No changes needed to `visual-guide-poll`, `referenceBoard.ts`, or the client.

## Why not "fix" the prompt instead

A neutral prompt ("photoreal scene from the reference image") still competes with the image and can drift. The cleanest match to image-blaster's working behaviour — and to the docs' guidance ("omit `text_prompt` so Marble auto-captions from your image") — is to drop it entirely. We can reintroduce a per-mode prompt later if a real dental board needs reinforcement.

## Verification

After deploy, run the same flow with the cafe images: the generated world should reflect the desk/cafe scene, not teeth.
