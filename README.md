# GRWM — your wardrobe, remembered

Snap your outfit every morning. GRWM uses OpenAI vision to spot every piece you're wearing, saves each one to a digital wardrobe (recognising pieces it has seen before), and keeps an outfit diary — so you can plan what to wear without opening the cupboard.

**Stack:** Next.js 16 (App Router, installable PWA) · Supabase (auth, Postgres, storage) · OpenAI structured outputs.

## How it works

1. **Log outfit** (`/log`) — the photo is resized on the device (max 1600px) and uploaded straight to the private `outfits` bucket under `<user-id>/`.
2. `POST /api/outfits/[id]/analyze` sends the photo plus the user's existing wardrobe to the model, which returns each garment with category, colours, pattern, material, style, seasons, a bounding box, and `existing_item_id` when it recognises something already saved.
3. New garments become `wardrobe_items`; every garment is linked to the outfit in `outfit_items` with its box, which is used to crop thumbnails out of the original photo (no extra images stored).
4. **Wardrobe** (`/`) filters by category, searches, and sorts by recently worn / not worn lately / most worn. Wear counts come from the `wardrobe_items_with_stats` view.
5. Item pages let you edit details, see every day you wore it, and **merge duplicates** if the AI saved the same piece twice.

## Setup

1. **Supabase**: create a project, then run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor. It creates the tables, RLS policies, the stats view, and the private `outfits` storage bucket.
   - Auth → URL Configuration: set the Site URL to your production URL and add `http://localhost:3000/auth/callback` and `https://<your-domain>/auth/callback` to the redirect URLs.
   - Sign-in is passwordless: **Continue with Google**, or a 6-digit code sent by email (the same code creates the account).
   - **Email code:** in Auth → Email Templates, put `{{ .Token }}` in both the **Magic Link** and **Confirm signup** templates so the email shows the code (the link in it works too). Supabase's built-in sender allows only a few emails an hour; add custom SMTP (Auth → SMTP settings, e.g. Resend or Brevo) before real users sign up.
   - **Google:** create an OAuth client (type *Web application*) in Google Cloud Console → APIs & Services → Credentials, with authorised redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`. Paste its client ID and secret into Supabase → Auth → Providers → Google and enable it.
2. **OpenAI**: create an API key.
3. Copy `.env.example` to `.env.local` and fill in the values.
4. Run it:

```bash
npm install
npm run dev
```

Open http://localhost:3000. To test from a phone on the same Wi-Fi, use `npm run dev -- -H 0.0.0.0` and open your computer's LAN IP. The camera capture and "Add to Home Screen" need HTTPS in production.

## Garment cut-outs

After the vision model lists the pieces, a clothing segmentation model ([segformer_b2_clothes](https://huggingface.co/Xenova/segformer_b2_clothes), run locally with transformers.js) labels every pixel of the photo as shirt, pants, dress, shoes, bag, hat and so on. Each piece keeps only its own pixels on a transparent background and is saved as a small WebP in `outfits/<user-id>/cutouts/`. The wardrobe shows these like product shots; pieces it can't find (watches, jewellery, layers hidden under a jacket) keep showing the crop of the photo.

- **Existing database:** run [`supabase/migrations/002_cutouts.sql`](supabase/migrations/002_cutouts.sql) once in the SQL editor (new installs get it from `schema.sql`). Until then the app works as before, without cut-outs.
- **Existing pieces:** open a piece and tap **Cut out background**. Use **Redo cut-out** to try again.
- **First run** downloads the model (about 30 MB) and caches it; after that each photo takes a few seconds on the server, and it costs nothing.
- **Hosting:** it needs a Node server (not the edge runtime) with enough memory for the model; on serverless hosts, check the function size limit.

## Clean outfit looks (ChatGPT)

After a photo is analysed, the API responds straight away and then (via `after()`) asks the OpenAI image model (`OPENAI_IMAGE_MODEL`, default `gpt-image-2.5-flare`) for a background-free flat-lay of the whole outfit: no person, no background, every detected piece laid out true to the photo. It is stored as `outfits/<user-id>/looks/<outfit-id>-*.webp` and shown in the Diary and on the outfit page (with a switch back to the photo); the outfit page refreshes itself until it arrives. Re-scan redraws it.

- **Existing database:** run [`supabase/migrations/003_outfit_looks.sql`](supabase/migrations/003_outfit_looks.sql) once. Until then logging works as before, just without looks.
- **Cost:** one image edit per logged photo (a few cents at medium quality).
- **Time:** about 20–40 seconds; the analyze route's `maxDuration` is 300 to leave room.

Deleting an outfit also removes pieces that appeared only in it (with their cut-outs and the look); pieces worn elsewhere stay and take a cover photo from another outfit.

## Tests

```bash
npm test          # unit + component tests (Vitest, Supabase and OpenAI mocked, ~3s)
npm run test:e2e  # Playwright on a production build at :3100, against your real Supabase
npm run test:all  # both
```

- `tests/unit/` covers the AI request/schema, outfit processing (matching, dedupe, failures), the analyze API, server actions, auth, the proxy gate, helpers and components.
- `tests/e2e/public.spec.ts` checks signed-out behaviour and writes nothing.
- `tests/e2e/signed-in.spec.ts` needs a dedicated test account: set `E2E_EMAIL` and `E2E_PASSWORD`. Also set `E2E_PHOTO` to a full-length outfit photo to run the real upload + OpenAI flow (one vision call; it deletes the outfit afterwards).

## Notes

- The model is set by `OPENAI_MODEL` (default `gpt-5-mini`). Any vision model that supports structured outputs works.
- Each analysis is one vision call; the existing wardrobe is sent as compact JSON so matching stays cheap until wardrobes get large (hundreds of items).
- `maxDuration = 60` is set on the analyze route and the outfit page (for re-scan). Raise it if your host needs longer.
