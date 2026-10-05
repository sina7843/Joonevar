# تصویر — Imagery

Product images are uploaded by **admins and users**, not by designers, so every rule must work for an ordinary phone photo.

## One image, many frames

Each record has **one image** (`imageFileId` + mandatory `imageAltFa`), except listings and products which have a gallery. The same image is cropped into every frame:

| Frame | Ratio | Where | Radius |
|---|---|---|---|
| Hero | 16:9 | Home hero, article header, breed header | `radius-xl` |
| Card | 4:3 (or 3:2) | Article card, breed card, animal card, listing card | `radius-xl` (top corners inside a card) |
| Product | 1:1 | Shop product | `radius-lg` |
| Thumbnail | 1:1, 56px | Lists, tables, notifications | `radius-sm` |
| Avatar | circle | Vets, users, sellers, communities | `radius-full` |

**Safe area:** the subject must sit inside the **central 60%** of the image, because any frame may crop the rest. Upload UIs show a crop preview in all frames.

## Rules

- **Persian alt text is mandatory** (`imageAltFa`), describing the subject: «سگ نژاد ژرمن شپرد».
- **No text on photos** except a category tag on its own solid ground (`bg-brand-subtle` pill) — contrast on a user photo cannot be guaranteed.
- **Missing image** = a designed placeholder, never a broken grey box: `bg-media-empty` (#F0EAE2) with the brand symbol at 40% opacity in the centre and, where space allows, the alt text in `caption` / `text-secondary` (5.23:1).
- **Private documents** (national ID, licences) are never shown in public previews — only inside the decision desk, never downloadable, and in mockups only as schematic placeholders.
- Species are data (today dog and cat); never assume a species in layout or copy.

## Photographic style (for samples and editorial)

Natural, warm light · people and animals together · shallow depth of field · no heavy filters · realistic dogs and cats with correct breeds · no text, watermark or malformed hands/eyes.

**Sources for previews:** AI-generated first (approved sample: woman with a Persian cat and a German Shepherd, warm living room — used in the checkpoint-1 hero), or free-licence photos (Unsplash, Pexels, Wikimedia Commons) with the source recorded. The remaining sample images are generated as one batch from `sample-content/images.json` once the page designs need them.
