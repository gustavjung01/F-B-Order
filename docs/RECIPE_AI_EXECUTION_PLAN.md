# EXECUTION PLAN - Công thức F&B + Google AI Agent

> Tài liệu này là plan triển khai chi tiết, bổ sung cho `docs/RECIPE_AI_AGENT_PLAN.md`.
>
> Mục tiêu hiện tại: lưu thiết kế để làm sau, không trộn vào nhánh sửa Catalog V2 đang hoạt động.

---

## 1. Quyết định kiến trúc đã chốt

1. Nhánh Công thức phải chạy được độc lập khi AI tắt hoặc Google Cloud gặp lỗi.
2. Google Vertex AI Agent Builder / Agent Engine là lớp suy luận chuyên gia.
3. Backend Bếp Sỉ là cửa vào duy nhất từ frontend đến agent.
4. AI được suy luận rộng như chuyên gia ẩm thực, nhưng mọi hành động ghi dữ liệu bị giới hạn bằng API và quyền backend.
5. Giá, SKU, variant, lựa chọn vị/loại, giỏ hàng và đơn hàng luôn lấy từ hệ thống Bếp Sỉ.
6. AI không được tự ghi đè công thức đã xuất bản.
7. Công thức đã xuất bản luôn có version/snapshot để phục hồi.
8. Công thức liên kết Catalog V2, không xây một catalog nguyên liệu thứ hai.
9. Không sửa hoặc mở rộng backend khác đang chạy chung VPS.
10. Toàn bộ thay đổi phải đi theo PR nhỏ, có gate kiểm tra và rollback rõ ràng.

---

## 2. Hiện trạng repo liên quan trực tiếp

### Backend

Backend hiện đăng ký Catalog V2 theo các router tách riêng:

```text
apps/backend/src/modules/catalog-v2/catalog-v2-list.routes.ts
apps/backend/src/modules/catalog-v2/catalog-v2-detail.routes.ts
apps/backend/src/modules/catalog-v2/catalog-v2-choice-cart.routes.ts
apps/backend/src/modules/catalog-v2/catalog-v2-choices.ts
apps/backend/src/modules/catalog-v2/catalog-v2.pricing.ts
```

Đăng ký route tập trung tại:

```text
apps/backend/src/app.ts
```

Luồng chính hiện tại:

```text
GET  /catalog/products
GET  /catalog/products/:variantId
POST /catalog/cart/items
POST /api/cart-v2/items
POST /api/orders
```

Order Catalog V2 được xử lý tại:

```text
apps/backend/src/modules/orders/orders-entry.routes.ts
apps/backend/src/modules/orders/catalog-v2-orders.service.ts
```

### Frontend

Contract Catalog V2:

```text
apps/frontend/data/catalog-v2/product-model.ts
apps/frontend/lib/catalog-v2-client.ts
```

Proxy từ Next.js đến backend:

```text
apps/frontend/app/api/catalog-v2/products/route.ts
apps/frontend/app/api/catalog-v2/products/[id]/route.ts
apps/frontend/lib/backend-api.ts
```

Bộ chọn mua hàng hiện tại:

```text
apps/frontend/components/catalog/purchase-selector/
apps/frontend/components/mobile/ProductQuickViewCompact.tsx
```

Giỏ hàng local giữ identity:

```text
apps/frontend/lib/cartStorageV4.ts
```

### Database

Migration hiện được quản lý bằng danh sách cố định:

```text
apps/backend/scripts/migration-plan.mjs
```

Các file đã áp dụng có checksum và không được sửa lại. Migration Công thức phải thêm file mới sau migration mới nhất tại thời điểm triển khai.

---

## 3. Logic tổng bắt buộc phải giữ

### 3.1. Product, variant và lựa chọn không phải một khái niệm

Catalog V2 đang có ba lớp:

```text
Parent product
  -> Sellable variant/SKU
      -> Non-pricing choices như vị/loại/màu
```

Ví dụ một nguyên liệu trong công thức có thể cần:

```text
Parent: Siro Golden Farm
Variant: chai 700 ml
Choice: vị Đào
```

Vì vậy không được chỉ lưu `product_name` hoặc chỉ lưu parent product rồi tự đoán SKU lúc thêm giỏ.

### 3.2. Identity của một dòng giỏ hàng

Identity chuẩn hiện tại là:

```text
variant_id + selection_key
```

Cùng một SKU nhưng khác vị phải là hai dòng riêng.

Công thức khi thêm nguyên liệu vào giỏ phải giữ nguyên:

```text
variantId
selections
selectionKey
quantity
```

Không được gom chỉ theo `variantId`.

### 3.3. Công thức không tự quyết định giá

Cost phải lấy từ cùng nguồn giá đang dùng bởi catalog/cart/order.

Không được:

- Lưu giá sản phẩm cố định vào recipe ingredient rồi dùng mãi.
- Dùng giá do model tự suy đoán.
- Lấy giá từ frontend.
- Tạo một thuật toán giá riêng trong module AI.

Nếu phát hiện pricing hiện tại chưa đúng nghiệp vụ, mở PR pricing riêng. Không sửa pricing lẫn trong PR Công thức.

### 3.4. Quy đổi nguyên liệu là domain riêng

Catalog hiện có quy cách hiển thị dạng text như:

```text
700 ml
2,5 kg
Thùng 12 chai
ĐVT: chai
```

Không được cho AI hoặc regex tự suy ra toàn bộ phép quy đổi production từ các chuỗi này.

Recipe ingredient cần dữ liệu có cấu trúc riêng:

```text
usage_quantity
usage_unit
package_content_quantity
package_content_unit
waste_percent
usable_yield_percent
```

Dữ liệu này do admin nhập/duyệt. AI có thể đề xuất nhưng không tự xác nhận.

### 3.5. Công thức chính thức và AI draft là hai vùng khác nhau

```text
AI output -> draft -> admin review -> published recipe version
```

Không có đường:

```text
AI output -> published trực tiếp
```

---

## 4. Những phần có nguy cơ đụng chạm cao

| Khu vực | Mức rủi ro | Nguyên nhân | Quy tắc |
|---|---:|---|---|
| `apps/backend/src/app.ts` | Cao | Mọi module đều đăng ký route tại đây | Chỉ một PR tích hợp route tại một thời điểm |
| `apps/backend/scripts/migration-plan.mjs` | Cao | Danh sách migration tuần tự, dễ conflict | Không chạy song song hai PR có migration |
| Catalog V2 detail/choice/cart | Rất cao | Liên quan SKU, lựa chọn và cart identity | Công thức chỉ gọi/reuse contract, không sửa tùy tiện |
| `catalog-v2.pricing.ts` | Rất cao | Ảnh hưởng catalog, cart, order và cost | Không sửa trong PR recipe nếu không phải prerequisite riêng |
| `cartStorageV4.ts` | Cao | Frontend cart identity và checkout phụ thuộc | Recipe dùng đúng API hiện tại, không đổi storage schema |
| `catalog-v2-orders.service.ts` | Rất cao | Snapshot đơn hàng và validation selection | Không sửa ở giai đoạn recipe core |
| Frontend navigation/layout | Trung bình | Dễ conflict với nhánh UI đang làm | Thêm menu bằng PR riêng sau khi trang recipe ổn định |
| `package.json`/lockfile | Trung bình | AI SDK có thể thay nhiều dependency | Agent service tách riêng, tránh kéo SDK nặng vào frontend/backend chính |
| Service worker/PWA | Trung bình | Cache sai sẽ giữ nội dung/AI cũ | API recipe và AI phải no-store ở giai đoạn đầu |
| VPS deploy | Rất cao | Có hai backend khác nhau trên cùng VPS | Chỉ thao tác app/service/port của Bếp Sỉ |

---

## 5. Vùng không được đụng trong giai đoạn đầu

Các phase Recipe Core không được thay đổi:

```text
scripts/catalog/hung-phat-v2/
data/catalog/hung-phat/v2/
apps/backend/src/modules/catalog-v2/catalog-v2-list.routes.ts
apps/backend/src/modules/catalog-v2/catalog-v2-detail.routes.ts
apps/backend/src/modules/catalog-v2/catalog-v2-choice-cart.routes.ts
apps/backend/src/modules/catalog-v2/catalog-v2-choices.ts
apps/backend/src/modules/orders/catalog-v2-orders.service.ts
apps/frontend/components/catalog/purchase-selector/
apps/frontend/components/mobile/ProductQuickViewCompact.tsx
apps/frontend/lib/cartStorageV4.ts
```

Chỉ được chạm một file trong danh sách trên khi:

1. Có bug/thiếu contract được chứng minh bằng test.
2. Có PR prerequisite riêng.
3. PR đó không chứa schema/UI/AI khác.
4. Catalog/order regression test chạy xanh.

---

## 6. Điều kiện bắt đầu triển khai

Không bắt đầu code Công thức khi nhánh sản phẩm còn bất ổn.

Gate bắt đầu:

- Các PR Catalog V2 đang mở đã merge hoặc đóng.
- `main` build xanh.
- `pnpm typecheck` xanh.
- `pnpm run build:backend` xanh.
- `pnpm run build:frontend` xanh.
- `pnpm run test:catalog-api:v2` xanh.
- Test order/cart Catalog V2 xanh.
- Có snapshot database hoặc quy trình rollback migration.
- Xác nhận đúng backend Bếp Sỉ, đúng service và đúng port production.

Tại thời điểm viết plan, PR sản phẩm đang hoạt động là:

```text
#35 fix(catalog): restore compact multi-classification cart flow
```

Không tạo PR recipe nào chạm frontend catalog trước khi luồng này được chốt.

---

# PHẦN I - RECIPE CORE

## 7. Phase R0 - Chốt domain contract

### Mục tiêu

Chốt kiểu dữ liệu trước khi viết migration hoặc UI.

### Việc thực hiện

1. Định nghĩa trạng thái recipe:

```text
draft
in_review
published
archived
```

2. Định nghĩa nguồn ingredient:

```text
catalog
external
```

3. Định nghĩa unit nội bộ:

```text
g
kg
ml
l
piece
portion
pack
```

4. Chốt rule parent/variant:

- `catalog_product_id`: liên kết parent product để hiển thị.
- `default_variant_id`: SKU mặc định dùng để tính cost/thêm giỏ.
- `default_selections`: lựa chọn vị/loại mặc định nếu variant yêu cầu choice.
- Ingredient có thể chỉ liên kết parent để tham khảo.
- Ingredient chỉ được đánh dấu `cart_ready = true` khi có variant và selections hợp lệ.

5. Chốt versioning:

- Bảng recipe hiện hành giữ dữ liệu truy vấn nhanh.
- Mỗi lần publish tạo snapshot bất biến.
- Restore tạo version mới, không sửa snapshot cũ.

6. Chốt dữ liệu do AI tạo:

- Mỗi field có `source = human | ai | imported`.
- AI draft giữ prompt version/model/run id.
- Published content không phụ thuộc vào việc agent còn tồn tại.

### File dự kiến

```text
packages/shared/types/recipe.ts hoặc apps/backend/src/modules/recipes/recipe.types.ts
docs/RECIPE_DOMAIN_CONTRACT.md
```

### Không đụng

- Database.
- Catalog code.
- Cart/order.
- Frontend production.

### Gate hoàn thành

- Có schema JSON mẫu cho một recipe đầy đủ.
- Có ví dụ ingredient catalog có choice.
- Có ví dụ ingredient ngoài kho.
- Có ví dụ scale 10 ly thành 80 ly.
- Có rule rõ cho đơn vị và làm tròn.

### Branch/PR

```text
feat/recipe-domain-contract
```

---

## 8. Phase R1 - Database Recipe Core

### Mục tiêu

Tạo schema nền, chưa có AI.

### Bảng tối thiểu

```text
recipe_categories
recipes
recipe_versions
recipe_ingredients
recipe_steps
recipe_mistakes
recipe_business_tips
recipe_seasonal_rules
recipe_tags
recipe_tag_links
recipe_product_links
```

### Schema trọng tâm

#### `recipes`

```text
id UUID PK
slug TEXT UNIQUE
title TEXT
short_description TEXT
category_id UUID
status TEXT
visibility TEXT
cover_image_url TEXT
difficulty TEXT
prep_minutes INTEGER
cook_minutes INTEGER
yield_quantity NUMERIC
yield_unit TEXT
current_version INTEGER
created_by_staff_id UUID
approved_by_staff_id UUID
published_at TIMESTAMPTZ
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

#### `recipe_ingredients`

```text
id UUID PK
recipe_id UUID FK
source_type TEXT
name TEXT
catalog_product_id UUID NULL FK catalog_products
catalog_variant_id UUID NULL FK catalog_variants
default_selections JSONB
usage_quantity NUMERIC
usage_unit TEXT
package_content_quantity NUMERIC NULL
package_content_unit TEXT NULL
waste_percent NUMERIC
usable_yield_percent NUMERIC
is_optional BOOLEAN
is_cart_ready BOOLEAN
sort_order INTEGER
note TEXT
```

Ràng buộc bắt buộc:

- `default_selections` là object JSON.
- `usage_quantity > 0`.
- `waste_percent` từ 0 đến giới hạn hợp lý.
- `source_type = catalog` thì phải có `catalog_product_id`.
- `is_cart_ready = true` thì phải có `catalog_variant_id`.
- Không cascade xóa recipe khi catalog product bị vô hiệu hóa.

#### `recipe_versions`

```text
id UUID PK
recipe_id UUID FK
version_number INTEGER
snapshot JSONB
change_note TEXT
source TEXT
created_by_staff_id UUID
created_at TIMESTAMPTZ
UNIQUE(recipe_id, version_number)
```

### Migration

Không sửa migration cũ.

Tên logic dự kiến:

```text
NNN_recipe_core.sql
```

Số `NNN` lấy theo migration mới nhất khi bắt đầu làm, không giữ cứng số 010 nếu repo đã có migration mới.

Cập nhật duy nhất:

```text
apps/backend/scripts/migration-plan.mjs
```

### Test bắt buộc

- Migration chạy trên database rỗng.
- Migration chạy tiếp trên schema production clone.
- Rollback thủ công được mô tả.
- FK sang Catalog V2 hợp lệ.
- Xóa/ẩn variant không làm mất recipe.
- Check constraint chặn dữ liệu sai.
- Checksum migration không thay đổi sau khi merge.

### Rủi ro đụng chạm

- Conflict với mọi PR có migration.
- FK liên kết Catalog V2.
- Không được thêm column trực tiếp vào catalog tables trong phase này.

### Branch/PR

```text
feat/recipe-core-schema
```

---

## 9. Phase R2 - Backend Recipe Read API

### Mục tiêu

Khách xem được danh sách và chi tiết công thức, chưa có admin edit và chưa có AI.

### Module mới

```text
apps/backend/src/modules/recipes/
  recipe.routes.ts
  recipe.service.ts
  recipe.repository.ts
  recipe.types.ts
  recipe.validation.ts
  recipe.presenter.ts
```

### API

```text
GET /api/recipes
GET /api/recipes/:slug
GET /api/recipes/:id/related
```

Có thể mount public alias:

```text
GET /recipes
GET /recipes/:slug
```

### Logic

- Anonymous chỉ xem `published` và `public`.
- Staff/admin có endpoint riêng để xem draft.
- API không trả prompt, token, internal note hoặc AI logs.
- Ingredient catalog chỉ trả product/variant cần cho hiển thị.
- Product đã inactive vẫn hiển thị tên snapshot nhưng đánh dấu không mua được.
- Không gọi AI trong read API.

### Thay đổi route

Chỉ thêm import và mount mới trong:

```text
apps/backend/src/app.ts
```

Không sửa logic route Catalog V2 đang có.

### Test

- List chỉ trả published.
- Slug không hợp lệ trả 404.
- Draft không lộ cho anonymous/customer.
- Recipe vẫn đọc được khi variant bị inactive.
- Query pagination có giới hạn.
- Không N+1 query lớn.

### Rủi ro đụng chạm

- `app.ts` là hotspot.
- Query join catalog phải giữ `catalog_version = hung-phat-v2` khi cần.
- Không dùng legacy `products` để đại diện nguyên liệu Catalog V2.

### Branch/PR

```text
feat/recipe-read-api
```

---

## 10. Phase R3 - Admin Recipe CRUD và publish workflow

### Mục tiêu

Admin tạo, sửa, review, publish và restore recipe.

### Backend mới

```text
apps/backend/src/modules/recipes/admin-recipe.routes.ts
apps/backend/src/modules/recipes/admin-recipe.service.ts
apps/backend/src/modules/recipes/recipe-version.service.ts
```

### Quyền

- `admin`: tạo/sửa/publish/archive/restore.
- `staff`: có thể tạo/sửa draft nếu business chấp nhận.
- Customer/anonymous: cấm.
- Staff inactive: cấm.

Không tạo hệ auth mới. Dùng `RequestIdentity` hiện tại.

### API

```text
GET    /api/admin/recipes
POST   /api/admin/recipes
GET    /api/admin/recipes/:id
PATCH  /api/admin/recipes/:id
POST   /api/admin/recipes/:id/submit-review
POST   /api/admin/recipes/:id/publish
POST   /api/admin/recipes/:id/archive
GET    /api/admin/recipes/:id/versions
POST   /api/admin/recipes/:id/restore/:version
```

### Publish transaction

Một lần publish phải chạy trong transaction:

1. Lock recipe.
2. Validate tất cả section.
3. Validate ingredient/cart readiness.
4. Tăng version number.
5. Ghi snapshot.
6. Cập nhật current recipe.
7. Ghi approved_by/published_at.
8. Commit.

Nếu bước nào lỗi, không publish nửa vời.

### Test

- Customer không truy cập admin API.
- Staff/admin permission đúng.
- Concurrent publish không tạo trùng version.
- Restore không sửa snapshot cũ.
- Recipe thiếu title/yield/step không publish được.
- Ingredient catalog không tồn tại bị cảnh báo/chặn tùy mức.

### Rủi ro đụng chạm

- Auth identity dùng chung.
- Staff schema dùng chung.
- Không sửa auth module trừ khi thiếu helper; helper mới phải additive.

### Branch/PR

```text
feat/admin-recipe-workflow
```

---

## 11. Phase R4 - Frontend Recipe Public

### Mục tiêu

Khách xem được Công thức trên PWA.

### Route mới

```text
apps/frontend/app/cong-thuc/page.tsx
apps/frontend/app/cong-thuc/[slug]/page.tsx
apps/frontend/app/api/recipes/route.ts
apps/frontend/app/api/recipes/[slug]/route.ts
```

### Component mới

```text
apps/frontend/components/recipes/
  RecipeCard.tsx
  RecipeHeader.tsx
  RecipeIngredientList.tsx
  RecipeStepList.tsx
  RecipeMistakeGuide.tsx
  RecipeBusinessTips.tsx
  RecipeSeasonalTips.tsx
```

### Data layer

```text
apps/frontend/data/recipes/recipe-model.ts
apps/frontend/lib/recipe-client.ts
```

Không nhét recipe types vào `product-model.ts`.

### UI giai đoạn đầu

- Danh sách.
- Bộ lọc đơn giản.
- Chi tiết.
- Nguyên liệu.
- Các bước.
- Điểm sai.
- Bí quyết kinh doanh.
- Theo mùa.
- Chưa có AI chat.
- Chưa có add-all-to-cart.

### Navigation

Thêm link menu bằng PR nhỏ cuối phase, sau khi route đã chạy ổn định.

Không chỉnh `ProductQuickViewCompact` hoặc purchase selector.

### Cache/PWA

- API recipe dùng `no-store` trong giai đoạn đầu.
- Không cache AI response.
- Ảnh có thể cache theo asset policy riêng.

### Test

- Mobile-first.
- Không hydration error.
- Recipe 404 đúng.
- Không lộ draft.
- Build frontend xanh.
- Accessibility cơ bản cho step/list/button.

### Branch/PR

```text
feat/recipe-public-frontend
```

---

# PHẦN II - LIÊN KẾT CATALOG VÀ DOANH THU

## 12. Phase R5 - Admin chọn nguyên liệu từ Catalog V2

### Mục tiêu

Admin liên kết recipe ingredient với sản phẩm thật mà không sửa catalog.

### Luồng

1. Admin tìm parent product bằng API Catalog V2 list/search.
2. Admin mở detail để xem variants và choice groups.
3. Admin chọn variant mặc định.
4. Nếu variant có choice bắt buộc, admin chọn default selections.
5. Backend validate selections bằng cùng rule Catalog V2.
6. Admin nhập dữ liệu quy đổi sử dụng/bao bì.
7. Lưu snapshot tên/SKU/quy cách để audit.

### Logic bắt buộc

Backend recipe không được copy một bản validation choice khác.

Nên reuse:

```text
parseCatalogChoiceGroups
catalogChoiceGroupsForSku
validateCatalogSelections
catalogSelectionKey
```

Nếu cần export thêm helper, tạo PR prerequisite nhỏ trong module Catalog V2, không thay đổi behavior.

### Dữ liệu snapshot

Recipe ingredient nên giữ snapshot phục vụ lịch sử:

```text
catalog_product_name_snapshot
catalog_variant_name_snapshot
sku_snapshot
specification_snapshot
selection_key_snapshot
```

Snapshot không thay thế FK; nó giúp recipe cũ vẫn đọc được sau khi tên catalog đổi.

### Không làm

- Không đổi parent mapping.
- Không sửa metadata catalog.
- Không nhập lại catalog.
- Không tạo SKU mới từ màn recipe.
- Không để AI tự chọn ngầm variant production.

### Test

- Variant đúng product.
- Selection hợp lệ theo SKU.
- Selection sai SKU bị từ chối.
- Required choice bị thiếu thì `cart_ready = false` hoặc save bị chặn.
- Product inactive không được chọn mới.

### Branch/PR

```text
feat/recipe-catalog-linking
```

---

## 13. Phase R6 - Scale engine

### Mục tiêu

Scale công thức bằng code xác định, không giao phép tính cho model.

### Module

```text
apps/backend/src/modules/recipes/recipe-scale.service.ts
apps/backend/src/modules/recipes/recipe-units.ts
```

### Input

```text
recipe_id
target_yield_quantity
target_yield_unit
rounding_policy
```

### Output

```text
scale_factor
scaled_ingredients
raw_required_quantity
waste_adjusted_quantity
purchase_package_count
leftover_quantity
warnings
```

### Rule

- Dùng decimal/numeric, không dùng phép tính float tùy tiện cho tiền và khối lượng.
- Chỉ convert giữa unit tương thích.
- Không tự đổi `g` sang `ml` nếu không có density được duyệt.
- Làm tròn số bao bì luôn lên khi mục tiêu là mua đủ.
- Tách số dùng trong recipe và số cần mua.
- Optional ingredient không tự cộng vào cart nếu user chưa chọn.

### AI được làm gì

- Giải thích kết quả.
- Đề xuất rounding thực tế.
- Cảnh báo chất lượng khi scale lớn.

AI không được làm phép tính gốc thay engine.

### Test

- 10 -> 80 phần.
- Hao hụt.
- Làm tròn chai/gói.
- Unit không tương thích.
- Ingredient ngoài catalog.
- Dữ liệu quy đổi thiếu.

### Branch/PR

```text
feat/recipe-scale-engine
```

---

## 14. Phase R7 - Cost engine

### Mục tiêu

Tính cost từ giá thật và dữ liệu quy đổi đã duyệt.

### Module

```text
apps/backend/src/modules/recipes/recipe-cost.service.ts
```

### Luồng

1. Resolve identity.
2. Scale recipe.
3. Load từng default variant.
4. Dùng cùng pricing contract Catalog V2.
5. Tính cost sử dụng.
6. Tính cost bao bì mua vào.
7. Cộng hao hụt và cost ngoài kho nếu admin khai báo.
8. Trả cost per recipe và per serving.

### Quy tắc

- Anonymous có thể chỉ xem cost tham khảo đã publish hoặc không xem giá.
- Customer approved được tính theo contract giá hiện hành.
- Market price/chưa có giá phải trả warning, không tự điền số.
- Không ghi cost runtime vào recipe chính thức như một con số vĩnh viễn.
- Có `calculated_at` và `price_source`.

### Điểm cần đặc biệt kiểm tra

`catalog-v2.pricing.ts` đang là nguồn logic giá chung. Nếu cần hỗ trợ thêm price-group price, xử lý ở PR pricing riêng trước phase cost. Không tự sửa riêng trong recipe cost.

### Test

- Giá fixed.
- Giá market.
- Chưa có giá.
- Customer chưa approved.
- Package rounding.
- Optional ingredient.
- Cost per serving.

### Branch/PR

```text
feat/recipe-cost-engine
```

---

## 15. Phase R8 - Thêm nguyên liệu vào giỏ

### Mục tiêu

Từ recipe tạo nhiều cart lines đúng identity.

### API recipe

```text
POST /api/recipes/:id/cart-preview
POST /api/recipes/:id/add-to-cart
```

Khuyến nghị:

- `cart-preview`: xác định variants, selections, quantity, blocked items.
- Frontend hiển thị cho khách xác nhận.
- Sau xác nhận mới gọi add.

### Không ghi cart trực tiếp bằng SQL trong recipe module

Recipe module phải reuse domain/service của cart hoặc gọi cùng logic chuẩn.

Nếu cart service chưa đủ reusable, tách service bằng PR prerequisite:

```text
catalog-v2-cart.service.ts
```

Không copy nguyên khối SQL cart vào recipe module.

### Frontend

Recipe page cần cập nhật cả:

1. Backend cart qua `/api/cart-v2/items` hoặc endpoint batch mới.
2. `cartStorageV4` để UI hiện đúng ngay.

Identity local vẫn là:

```text
variantId::selectionKey
```

Không thay storage version chỉ để phục vụ recipe.

### Batch endpoint

Nếu thêm batch endpoint:

```text
POST /api/cart-v2/items/batch
```

Phải:

- Validate tất cả line trước.
- Transaction toàn bộ hoặc trả partial result rõ ràng.
- Không tạo cart nửa vời mà frontend tưởng thành công toàn bộ.
- Giữ selection validation theo SKU.

### Test

- Hai vị cùng SKU tạo hai dòng.
- Ingredient thiếu choice bị chặn.
- Variant inactive bị chặn.
- Market price không add.
- Existing line cộng quantity đúng contract.
- Preview và add không lệch identity.
- Cart -> order giữ selection snapshot.

### Rủi ro đụng chạm

Đây là phase đầu tiên có nguy cơ chạm cart/order cao. Chỉ làm sau khi toàn bộ Catalog V2 regression test ổn định.

### Branch/PR

Nên tách hai PR:

```text
refactor/catalog-cart-domain-service
feat/recipe-add-to-cart
```

---

# PHẦN III - GOOGLE AI AGENT

## 16. Phase A0 - Google Cloud foundation

### Mục tiêu

Dựng môi trường agent tách biệt, chưa nối customer production.

### Tài nguyên

- Google Cloud project hoặc resource boundary riêng cho Bếp Sỉ.
- Service account riêng.
- Secret/config riêng theo environment.
- Agent/Agent Engine environment dev trước.
- Logging và quota.

### Phân tách

```text
Frontend
  -> Bếp Sỉ backend
      -> Recipe AI Gateway
          -> Google Agent service
```

Frontend không nhận Google credential.

Agent không kết nối database trực tiếp.

Agent chỉ gọi tools backend được cấp.

### Env backend dự kiến

```text
GOOGLE_CLOUD_PROJECT=
GOOGLE_CLOUD_LOCATION=
RECIPE_AI_AGENT_ID=
RECIPE_AI_ENABLED=false
RECIPE_AI_TIMEOUT_MS=
RECIPE_AI_DAILY_QUOTA=
```

Tên model cấu hình bằng env/config, không hardcode vào business logic.

### Deployment

Agent runtime ưu tiên Google Cloud. Không đặt chung process với `bepsi-api.service` trên VPS production.

### Test

- Dev credential hoạt động.
- Prod credential chưa cấp quyền ghi nguy hiểm.
- Timeout/fallback.
- Agent unavailable không làm hỏng recipe page.

### Branch/PR

```text
feat/recipe-ai-cloud-foundation
```

Không merge secret vào repo.

---

## 17. Phase A1 - Recipe AI Gateway

### Mục tiêu

Tạo lớp backend điều phối agent, tool, quota và log.

### Module

```text
apps/backend/src/modules/recipe-ai/
  recipe-ai.routes.ts
  recipe-ai.controller.ts
  recipe-ai.service.ts
  recipe-ai.gateway.ts
  recipe-ai.context.ts
  recipe-ai.permissions.ts
  recipe-ai.schemas.ts
  recipe-ai.telemetry.ts
```

### API nội bộ/customer ban đầu

```text
POST /api/recipe-ai/chat
POST /api/recipe-ai/diagnose
POST /api/recipe-ai/business-advice
```

Ban đầu feature flag tắt.

### Gateway chịu trách nhiệm

- Resolve user/customer/staff.
- Kiểm tra quota.
- Chọn recipe context.
- Chọn tool được phép.
- Gọi agent.
- Validate response schema.
- Redact log.
- Timeout/cancel.
- Ghi run metadata.

### Không làm

- Không gửi toàn bộ catalog.
- Không gửi toàn bộ database.
- Không gửi secret hoặc Clerk token vào prompt.
- Không cho model gọi URL tùy ý.
- Không cho model tự tạo SQL.

### Database AI tối thiểu

Tạo migration riêng sau Recipe Core:

```text
recipe_ai_sessions
recipe_ai_messages
recipe_ai_runs
recipe_ai_tool_calls
recipe_ai_feedback
recipe_ai_prompt_versions
```

Không trộn migration AI vào migration Recipe Core.

### Branch/PR

Nên tách:

```text
feat/recipe-ai-schema
feat/recipe-ai-gateway
```

---

## 18. Phase A2 - Tool layer

### Mục tiêu

Cho agent suy luận rộng nhưng chỉ hành động qua tools xác định.

### Tool đọc

```text
get_recipe
search_recipes
get_recipe_version
search_catalog_products
get_catalog_product_detail
get_catalog_variant
get_customer_variant_price
calculate_recipe_scale
calculate_recipe_cost
get_seasonal_rules
```

### Tool draft

```text
create_recipe_ai_draft
save_recipe_ai_review
save_business_advice_draft
```

### Tool hành động cần xác nhận

```text
prepare_recipe_cart
confirm_recipe_cart
```

Agent không nhận tool `publish_recipe` ở phase customer/admin AI đầu tiên.

### Permission matrix

| Tool | Anonymous | Customer | Staff | Admin |
|---|---:|---:|---:|---:|
| Read published recipe | Có | Có | Có | Có |
| Read customer price | Không | Chính mình | Theo policy | Theo policy |
| Create AI draft | Không | Không | Có | Có |
| Save review | Không | Không | Có | Có |
| Prepare cart | Không | Approved | Không | Không |
| Confirm cart | Không | Approved + confirm | Không | Không |
| Publish recipe | Không cấp cho agent | Không cấp | Không cấp | Không cấp |

### Test

- Tool không vượt customer scope.
- Agent không thể gọi tool không được cấp.
- Tool argument schema chặn dữ liệu bẩn.
- Tool output không lộ internal field.
- Tool timeout không treo request.

### Branch/PR

```text
feat/recipe-ai-tools
```

---

## 19. Phase A3 - Nhân cách chuyên gia và prompt versioning

### Mục tiêu

Đưa AI thành chuyên gia thực chiến, không biến thành RAG bot máy móc.

### System instruction tập trung vào

- Vai trò chuyên gia ẩm thực F&B Việt Nam.
- Kỹ thuật phát triển món.
- Chuẩn hóa vận hành.
- Phản biện công thức.
- Cost/menu/kinh doanh.
- Nêu giả định và mức chắc chắn.
- Gọi tool khi cần dữ liệu Bếp Sỉ.

### Không nhồi prompt bằng hàng trăm lệnh cấm

Giới hạn hành động đặt tại:

- Tool permission.
- Backend authorization.
- Database transaction.
- Feature flag.
- Approval workflow.

### Prompt version

Mỗi run lưu:

```text
agent_name
prompt_version
model_name
toolset_version
recipe_version
```

### Evaluation set

Tối thiểu:

```text
30 ca tạo/chỉnh công thức
25 ca chẩn đoán lỗi
20 ca scale/cost
15 ca kinh doanh
10 ca cố tình gây nhầm SKU/giá/choice
```

### Branch/PR

```text
feat/recipe-ai-expert-persona
```

---

## 20. Phase A4 - AI cho admin

### Mục tiêu

Dùng AI để tạo nội dung và kiểm tra công thức trước.

### Chức năng

```text
Generate draft
Review recipe
Rewrite section
Suggest catalog products
Suggest common mistakes
Suggest business tips
Suggest seasonal strategy
```

### Luồng generate draft

1. Admin nhập brief.
2. Backend tìm nhóm sản phẩm liên quan.
3. Agent tạo structured draft.
4. Scale/cost engine chạy bằng code.
5. Agent tự review draft.
6. Backend validate schema.
7. Lưu `recipe_ai_draft`.
8. Admin chỉnh.
9. Admin publish qua workflow bình thường.

### Structured output

Agent trả JSON có schema, không trả một đoạn markdown tự do duy nhất.

### AI review severity

```text
error
warning
suggestion
```

### Không làm

- Không publish tự động.
- Không ghi đè ingredient link đã được admin xác nhận.
- Không đổi giá/catalog.
- Không tạo SKU.

### Branch/PR

```text
feat/admin-recipe-ai
```

---

## 21. Phase A5 - AI cho khách

### Mục tiêu

Khách hỏi theo recipe, scale, sửa lỗi và nhận tư vấn.

### Tính năng theo thứ tự

1. Chat theo recipe.
2. Scale có giải thích.
3. Gợi ý thay thế nguyên liệu.
4. Chẩn đoán món lỗi bằng text.
5. Chẩn đoán có ảnh.
6. Cost/giá bán.
7. Tư vấn mô hình kinh doanh.

### Context

Backend chỉ gửi:

- Recipe/version đang xem.
- Ingredient và step liên quan.
- Một nhóm nhỏ sản phẩm phù hợp.
- Kết quả cost/scale đã tính.
- Thông tin mô hình do khách cung cấp.
- Tóm tắt hội thoại cần thiết.

### Ảnh

Không gửi ảnh base64 qua `express.json({ limit: "1mb" })`.

Luồng ảnh:

1. Frontend xin signed upload.
2. Upload object storage.
3. Backend kiểm tra loại/kích thước.
4. Agent nhận URI có hạn dùng hoặc asset reference.

### Quota

- Anonymous: không hoặc rất thấp.
- Customer đăng nhập: quota/ngày.
- Customer có trạng thái approved: quota cao hơn nếu business muốn.
- Admin: quota riêng.

### Fallback

Agent lỗi vẫn phải hiển thị recipe bình thường.

### Branch/PR

Nên tách:

```text
feat/recipe-ai-customer-chat
feat/recipe-ai-diagnosis
feat/recipe-ai-business-advisor
```

---

# PHẦN IV - FRONTEND ADMIN VÀ AI

## 22. Phase F1 - Admin Recipe UI

### Route

```text
apps/frontend/app/admin/cong-thuc/page.tsx
apps/frontend/app/admin/cong-thuc/moi/page.tsx
apps/frontend/app/admin/cong-thuc/[id]/page.tsx
```

### Component

```text
apps/frontend/components/admin/recipes/
  RecipeForm.tsx
  IngredientEditor.tsx
  CatalogIngredientPicker.tsx
  StepEditor.tsx
  MistakeEditor.tsx
  BusinessTipEditor.tsx
  SeasonalRuleEditor.tsx
  RecipeVersionPanel.tsx
  RecipePublishPanel.tsx
```

### Rule

- Autosave draft có debounce và optimistic state thận trọng.
- Publish luôn yêu cầu thao tác rõ ràng.
- Hiển thị validation error theo section.
- Không để AI tự thay field đã lock bởi admin mà không preview diff.

### AI UI

- Generate tạo draft mới hoặc section preview.
- Rewrite hiển thị before/after.
- Apply từng section.
- Review hiển thị error/warning/suggestion.

### Branch/PR

```text
feat/admin-recipe-ui
feat/admin-recipe-ai-ui
```

---

## 23. Phase F2 - Customer Recipe AI UI

### Component

```text
apps/frontend/components/recipes/RecipeScaleCalculator.tsx
apps/frontend/components/recipes/RecipeCartPreview.tsx
apps/frontend/components/recipes/RecipeAiChat.tsx
apps/frontend/components/recipes/RecipeDiagnosisForm.tsx
apps/frontend/components/recipes/RecipeBusinessAdvisor.tsx
```

### Rule UX

- AI answer không che nội dung recipe chuẩn.
- Dữ liệu giá/cost có timestamp.
- Phân biệt rõ “giá thật từ Bếp Sỉ” và “gợi ý chuyên môn”.
- Thao tác thêm giỏ có preview và confirm.
- Khi AI không chắc, hiển thị giả định quan trọng.

### Branch/PR

```text
feat/recipe-customer-ai-ui
```

---

# PHẦN V - TEST, OBSERVABILITY VÀ ROLLOUT

## 24. Test pyramid

### Unit

- Unit conversion.
- Scale factor.
- Package rounding.
- Waste calculation.
- Selection identity.
- Recipe publish validation.
- AI output schema.

### Integration

- Migration.
- Recipe CRUD transaction.
- Catalog product/variant link.
- Choice validation by SKU.
- Cost with pricing resolver.
- Recipe -> cart.
- Cart -> order selection snapshot.
- AI tool authorization.

### Contract

- Recipe API response type.
- Agent structured output.
- Tool input/output schema.
- Frontend proxy.

### End-to-end

1. Admin tạo recipe.
2. Gắn variant có choice.
3. Publish.
4. Customer xem.
5. Scale.
6. Preview cart.
7. Add cart.
8. Checkout.
9. Order giữ đúng SKU/choice.

### Regression bắt buộc

Mỗi PR recipe có đụng Catalog/cart/order phải chạy:

```text
pnpm typecheck
pnpm run build:backend
pnpm run build:frontend
pnpm run test:catalog-api:v2
pnpm --filter @fb-order/backend test:order-engine
```

Cộng test recipe riêng khi được thêm.

---

## 25. Telemetry

### Recipe product metrics

- Recipe views.
- Ingredient click.
- Cart preview.
- Add-to-cart success.
- Order attribution từ recipe.
- Recipe nào tạo doanh thu.

### AI metrics

- Runs.
- Latency.
- Tool calls.
- Tool errors.
- Token/cost.
- User feedback.
- Draft acceptance rate.
- Diagnosis helpful rate.
- AI-to-cart conversion.

### Privacy

Không log:

- Clerk token.
- Service account credential.
- SSH key.
- Full secret.
- Toàn bộ request nhạy cảm nếu không cần.

Dùng request id/run id để trace.

---

## 26. Feature flags

Tối thiểu:

```text
RECIPE_MODULE_ENABLED
RECIPE_ADMIN_ENABLED
RECIPE_CART_ENABLED
RECIPE_AI_ENABLED
RECIPE_AI_ADMIN_ENABLED
RECIPE_AI_CUSTOMER_ENABLED
RECIPE_AI_IMAGE_ENABLED
```

Rollout:

1. Internal admin.
2. Một nhóm staff.
3. Một nhóm customer test.
4. Customer approved theo tỷ lệ.
5. Toàn bộ.

Có kill switch AI độc lập với Recipe Core.

---

## 27. Deployment boundary

### Bếp Sỉ VPS

Chỉ deploy vào app/service của Bếp Sỉ đã xác nhận.

Không được:

- Restart service của website khác.
- Dùng chung env file với backend khác.
- Dùng chung Google credential với backend khác.
- Mở route AI trên backend khác.

### Google Cloud

- Agent service có service account riêng.
- Backend Bếp Sỉ là caller được phép.
- Tool callback chỉ chấp nhận identity nội bộ hợp lệ.
- Không expose agent tool endpoint public không bảo vệ.

### Database

- Migration chạy riêng.
- Backup/restore plan trước deploy.
- Không sửa migration đã applied.

---

## 28. Trình tự PR chốt

Thứ tự không được đảo:

```text
R0  recipe-domain-contract
R1  recipe-core-schema
R2  recipe-read-api
R3  admin-recipe-workflow
R4  recipe-public-frontend
R5  recipe-catalog-linking
R6  recipe-scale-engine
R7  recipe-cost-engine
R8a catalog-cart-domain-service (nếu cần)
R8b recipe-add-to-cart
A0  recipe-ai-cloud-foundation
A1a recipe-ai-schema
A1b recipe-ai-gateway
A2  recipe-ai-tools
A3  recipe-ai-expert-persona
A4  admin-recipe-ai
F1  admin-recipe-ui / AI UI
A5  customer AI features
F2  customer AI UI
H1  evaluation/telemetry/hardening
```

Không làm AI chat trước Recipe Core, versioning, scale và cost.

---

## 29. Các phần có thể làm song song

Chỉ làm song song khi không chạm cùng hotspot.

Có thể:

- UI recipe public song song với admin API sau khi read contract chốt.
- Google Cloud dev foundation song song Recipe Core nếu không đổi repo production.
- Evaluation dataset song song backend implementation.
- Nội dung recipe mẫu song song schema, nhưng import chỉ sau migration.

Không thể:

- Hai migration PR song song.
- Hai PR cùng sửa `app.ts` mà chưa rebase.
- Recipe cart song song thay đổi Catalog V2 cart identity.
- Recipe cost song song thay đổi pricing contract.
- Recipe navigation song song redesign navigation chung.

---

## 30. Checklist trước mỗi PR

### Trước code

- Xác định đúng module.
- Liệt kê file dự kiến chạm.
- Kiểm tra PR Catalog/cart/order đang mở.
- Xác nhận có migration không.
- Xác nhận API contract.

### Trong code

- Không refactor ngoài phạm vi.
- Không sửa migration cũ.
- Không copy pricing/cart validation thành phiên bản khác.
- Không hardcode model/domain/secret.
- Không gọi Google trực tiếp từ frontend.

### Trước merge

- Typecheck.
- Backend build.
- Frontend build nếu có UI.
- Test module.
- Regression catalog/cart/order nếu có liên kết.
- Review migration checksum.
- Review feature flag.
- Review rollback.
- Kiểm tra không có secret.

---

## 31. Kết luận logic tổng

Module Công thức có thể triển khai mà không phá nhánh sản phẩm nếu giữ đúng ranh giới:

```text
Recipe sở hữu nội dung, định lượng, quy đổi, version và AI draft.
Catalog V2 sở hữu product, variant, SKU, choices và trạng thái bán.
Pricing sở hữu giá.
Cart sở hữu cart line identity.
Order sở hữu snapshot giao dịch.
Auth sở hữu identity và quyền.
Agent sở hữu suy luận, không sở hữu sự thật giao dịch.
```

Điểm đụng chạm không tránh được nhưng có thể kiểm soát:

1. FK từ recipe sang Catalog V2.
2. Route registration tại `app.ts`.
3. Migration plan.
4. Pricing resolver khi tính cost.
5. Cart service khi add toàn bộ nguyên liệu.
6. Frontend navigation.
7. Env/deployment cho agent.

Cách kiểm soát là tách prerequisite PR, không sửa chéo trong một commit lớn và giữ Recipe Core hoạt động khi AI bị tắt.
