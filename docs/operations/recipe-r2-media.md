# Recipe media on Cloudflare R2

Recipe cover images and step images are uploaded directly from the admin browser to the existing Cloudflare R2 bucket. PostgreSQL stores only the resulting public URL.

## Backend environment

Configure these values in the backend runtime environment on the VPS. Never expose the access keys through `NEXT_PUBLIC_*` variables or Vercel frontend variables.

```env
R2_ACCOUNT_ID=<cloudflare-account-id>
R2_BUCKET_NAME=<existing-catalog-bucket>
R2_ACCESS_KEY_ID=<r2-api-token-access-key-id>
R2_SECRET_ACCESS_KEY=<r2-api-token-secret-access-key>
R2_PUBLIC_BASE_URL=https://cdn.bepsi.click
```

The access token should have object write permission only for the intended bucket. The backend uses it solely to create a five-minute presigned PUT URL.

## Object paths

Saved recipes use:

```text
recipes/{recipeId}/cover/{uuid}.{jpg|png|webp}
recipes/{recipeId}/steps/{uuid}.{jpg|png|webp}
```

Images uploaded before the first draft is saved use:

```text
recipes/drafts/cover/{uuid}.{jpg|png|webp}
recipes/drafts/steps/{uuid}.{jpg|png|webp}
```

Draft-prefix objects remain valid after the Recipe is created because the database stores their final public URL.

## Bucket CORS

Apply `infra/cloudflare/r2-recipe-media-cors.json` to the same bucket that serves `cdn.bepsi.click`.

Dashboard path:

1. Cloudflare Dashboard
2. R2 Object Storage
3. Select the existing catalog bucket
4. Settings
5. CORS Policy
6. Paste the JSON policy and save

CLI equivalent:

```bash
npx wrangler r2 bucket cors set "$R2_BUCKET_NAME" --file infra/cloudflare/r2-recipe-media-cors.json
npx wrangler r2 bucket cors list "$R2_BUCKET_NAME"
```

The browser upload request must be allowed from `https://bepsi.click` with method `PUT` and header `Content-Type`.

## Upload contract

- Admin authentication is required before the backend signs an upload.
- Accepted types: JPEG, PNG, WebP.
- Maximum size: 8 MB.
- Presigned URL lifetime: 5 minutes.
- The signed request binds the exact `Content-Type`.
- The browser uploads directly to the R2 S3 endpoint.
- The Recipe payload stores only `https://cdn.bepsi.click/...`.

## Production verification

1. Open `/admin/recipes`.
2. Open a draft Recipe.
3. Upload a cover image from the device.
4. Confirm the preview appears.
5. Upload an image for a step.
6. Save the Recipe as a new draft version.
7. Close and reopen the editor.
8. Confirm both URLs still render.
9. Link a Catalog SKU and confirm its card keeps the `Dùng làm ảnh bìa` action after reopening.

A `403` from the R2 PUT request usually means the bucket CORS policy, signed `Content-Type`, credentials, or bucket name does not match the request.
