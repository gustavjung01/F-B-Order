# Bếp Sỉ - Product Images on R2

## Decision

Product and recipe media must live on Cloudflare R2. The app database stores public image URLs only.

Static UI assets such as logo, app icon, and home banners can stay in `apps/frontend/public`. SKU images and recipe images must not be committed to the repository.

## R2 path convention

```txt
/products/{product-slug}/cover.webp
/products/{product-slug}/1.webp
/products/{product-slug}/2.webp

/recipes/{recipe-slug}/cover.webp
/recipes/{recipe-slug}/step-1.webp
/recipes/{recipe-slug}/step-2.webp
```

## Database fields

Use both fields below:

```txt
products.image_url
product_images
```

`products.image_url` is the primary cover image used by product listing cards.

`product_images` is the gallery used by the product detail page.

When mapping images, always set `products.image_url` to the same URL as the primary `product_images.is_primary = true` row.

## Admin API mapping

Admin-only endpoint:

```txt
PATCH /api/admin/product-images
```

Body example:

```json
{
  "slug": "bot-sua-sawasdee-1kg",
  "imageUrl": "https://r2-public-domain.example/products/bot-sua-sawasdee-1kg/cover.webp",
  "altText": "Bột sữa Sawasdee 1kg",
  "images": [
    "https://r2-public-domain.example/products/bot-sua-sawasdee-1kg/1.webp",
    "https://r2-public-domain.example/products/bot-sua-sawasdee-1kg/2.webp"
  ]
}
```

The endpoint updates `products.image_url`, replaces gallery rows in `product_images` by default, and returns the mapped product.

To append without deleting the old gallery, pass:

```json
{
  "slug": "bot-sua-sawasdee-1kg",
  "imageUrl": "https://r2-public-domain.example/products/bot-sua-sawasdee-1kg/cover.webp",
  "replaceImages": false
}
```

Admin-only list endpoint:

```txt
GET /api/admin/product-images?status=needs_review&missingOnly=true
```

This helps find products that still need R2 images.

## SQL mapping template

Use this file when mapping manually through SQL:

```txt
db/seeds/002_product_r2_image_map.template.sql
```

Copy it to a real local seed file, replace URLs with public R2 URLs, then run it against the target DB.

Do not commit real private/signed URLs.
