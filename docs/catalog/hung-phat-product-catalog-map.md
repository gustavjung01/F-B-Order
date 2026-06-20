# Product Catalog Mapping — Công ty TNHH TM Nguyên Liệu Hưng Phát

> **Mục đích file:** dùng làm bản nháp chuẩn hóa dữ liệu sản phẩm để map vào app/e-commerce/catalog nội bộ.  
> **Phạm vi:** gom từ thông tin public có thể truy cập/index được từ Facebook, Shopee, Magisea và nguồn đăng ký doanh nghiệp.  
> **Lưu ý quan trọng:** Facebook/Shopee không trả đầy đủ toàn bộ SKU qua trang web public/JS, nên file này **không bịa giá, tồn kho, barcode, HSD, hình ảnh SKU**. Các trường chưa xác minh được để `TODO` hoặc `null`.

---

## 1. Company / Merchant Profile

| Field | Value |
|---|---|
| `merchant_id` | `hung-phat-nguyen-lieu` |
| `legal_name` | `CÔNG TY TNHH TM NGUYÊN LIỆU HƯNG PHÁT` |
| `brand_name` | `Nguyên Liệu Hưng Phát` |
| `facebook_name` | `Nguyên liệu trà sữa và mì cay Hưng Phát` |
| `tax_code` | `1201678728` |
| `business_status` | `Đang hoạt động` |
| `primary_business_line` | `Bán buôn thực phẩm` |
| `secondary_business_line` | `Bán buôn đồ uống` |
| `representative` | `TRẦN HOÀNG GIANG` |
| `store_address_old` | `152 Yersin, Phường 4, TP. Mỹ Tho, Tiền Giang` |
| `store_address_new_public` | `152 Yersin, Phường Đạo Thạnh, Tỉnh Đồng Tháp` |
| `phone_public_1` | `0396.980.168` |
| `phone_public_2` | `0388.380.168` |
| `phone_public_3` | `0902.660.979` |
| `zalo_public` | `0396.080.168 / 0396.980.168` |
| `service_area` | `Miền Tây + tuyến TP.HCM theo lịch giao hàng` |
| `positioning` | `Nhà cung cấp sỉ/lẻ nguyên liệu trà sữa, mì cay Hàn Quốc, thực phẩm đông lạnh, nguyên liệu pha chế cho quán F&B` |

---

## 2. Delivery / Service Routes

Dùng bảng này để map vào module `delivery_routes`, `shipping_zone`, hoặc `service_area`.

| Route ID | Day | Route Name | Areas |
|---|---|---|---|
| `route-mon-mytho-tanan-benluc-q6` | `T2` | `Mỹ Tho - Tân An - Bến Lức - Quận 6` | `Mỹ Tho, Tân An, Bến Lức, Quận 6` |
| `route-tue-caibe-sadec-caolanh-longxuyen` | `T3` | `Cái Bè - Sa Đéc - Cao Lãnh - Long Xuyên - Thoại Sơn - Vĩnh Long - Cần Thơ` | `Cái Bè, Sa Đéc, Cao Lãnh, Long Xuyên, Thoại Sơn, Vĩnh Long, Cần Thơ` |
| `route-wed-baclieu-soctrang-haugiang` | `T4` | `Bạc Liêu - Sóc Trăng - Hậu Giang` | `Bạc Liêu, Sóc Trăng, Hậu Giang` |
| `route-thu-bentre` | `T5` | `Bến Tre` | `Bến Tre` |
| `route-fri-longgiang-saigon` | `T6` | `Long Giang - Sài Gòn` | `Long Giang, Sài Gòn` |
| `route-sat-mytho-gocong-bentre` | `T7` | `Mỹ Tho - Gò Công - Bến Tre` | `Mỹ Tho, Gò Công, Bến Tre` |

---

## 3. Recommended Category Tree

Dùng cây này để map `categories`, `collections`, `filters`, `homepage sections`.

```yaml
categories:
  - id: tra-sua-pha-che
    name: Nguyên liệu trà sữa & pha chế
    children:
      - id: tra-nen-tra-tui-loc
        name: Trà nền / Trà túi lọc / Trà pha máy
      - id: bot-sua-bot-beo
        name: Bột sữa / Bột béo / Creamer
      - id: topping
        name: Topping
      - id: syrup-sot-mut
        name: Syrup / Sốt / Mứt / Trái cây ngâm
      - id: bot-pudding-jelly
        name: Bột pudding / Jelly / Thạch
      - id: nguyen-lieu-da-xay
        name: Nguyên liệu đá xay
      - id: cot-dua
        name: Nước cốt dừa / Coconut base
  - id: mi-cay-han-quoc
    name: Nguyên liệu mì cay Hàn Quốc
    children:
      - id: mi-cay-base
        name: Mì / sốt / gia vị mì cay
      - id: topping-mi-cay
        name: Topping mì cay
  - id: thuc-pham-dong-lanh
    name: Thực phẩm đông lạnh
    children:
      - id: xien-que-an-vat
        name: Xiên que / Ăn vặt
      - id: vien-tha-lau
        name: Viên thả lẩu / topping đông lạnh
      - id: do-chien-dong-lanh
        name: Đồ chiên đông lạnh
  - id: combo-cong-thuc
    name: Combo & công thức kinh doanh
    children:
      - id: combo-mo-quan
        name: Combo mở quán
      - id: cong-thuc-tra-sua
        name: Công thức trà sữa
      - id: cong-thuc-tra-trai-cay
        name: Công thức trà trái cây
      - id: cong-thuc-do-uong-nong
        name: Công thức đồ uống nóng
  - id: brand-distribution
    name: Thương hiệu / Hãng phân phối
    children:
      - id: brand-sumi
        name: SUMI
      - id: brand-prince
        name: PRINCE
      - id: brand-barismate
        name: BARISMATE
      - id: brand-magisea
        name: MAGISEA
      - id: brand-sawasdee
        name: SAWASDEE
      - id: brand-ona
        name: ONA
      - id: brand-loc-phat
        name: Lộc Phát
```

---

## 4. Product Data Schema Gợi Ý

Dùng schema này cho collection/table `products`.

```ts
type Product = {
  id: string;
  slug: string;
  name: string;
  brand?: string | null;
  category_id: string;
  subcategory_id?: string | null;
  industry_group: 'tra_sua_pha_che' | 'mi_cay_han_quoc' | 'thuc_pham_dong_lanh' | 'combo_cong_thuc';
  product_type: 'physical' | 'bundle' | 'recipe_content' | 'service';
  short_description?: string | null;
  description?: string | null;
  origin?: string | null;
  package_size?: string | null;
  unit?: string | null;
  use_cases?: string[];
  tags?: string[];
  selling_points?: string[];
  storage_instruction?: string | null;
  shelf_life?: string | null;
  price_retail?: number | null;
  price_wholesale?: number | null;
  currency?: 'VND';
  min_order_qty?: number | null;
  image_urls?: string[];
  source_urls?: string[];
  source_confidence: 'confirmed' | 'public-snippet' | 'inferred-category' | 'todo';
  status: 'active' | 'draft' | 'needs_review';
};
```

---

## 5. Product Catalog — Nguyên liệu trà sữa & pha chế

### 5.1 Trà nền / Trà pha máy

| Product ID | Name | Brand | Category | Package | Origin | Use cases | Selling points | Data status |
|---|---|---|---|---|---|---|---|---|
| `tra-ona` | `Trà ONA` | `ONA` | `tra-nen-tra-tui-loc` | `TODO` | `TODO` | `Trà trái cây, trà sữa, trà pha máy` | `Cảm nhận sự khác biệt từ trà ONA; dùng làm dòng trà nền` | `public-snippet` |
| `tra-loc-phat` | `Trà Lộc Phát` | `Lộc Phát` | `tra-nen-tra-tui-loc` | `TODO` | `TODO` | `Trà trái cây, trà sữa, công thức kinh doanh` | `Gắn với bộ công thức trà trái cây / công thức dễ pha dễ bán` | `public-snippet` |
| `tra-pha-may-2025` | `Trà pha máy 2025` | `TODO` | `tra-nen-tra-tui-loc` | `TODO` | `TODO` | `Menu trend, quán trà sữa/cafe` | `Định vị theo trend trà pha máy 2025` | `public-snippet` |
| `tra-oolong-sen` | `Trà Ôlong Sen` | `TODO` | `tra-nen-tra-tui-loc` | `TODO` | `TODO` | `Đồ uống mùa Trung Thu, trà sữa, trà trái cây` | `Concept trà ôlong sen / menu mùa vụ` | `public-snippet` |

#### Example object

```json
{
  "id": "tra-ona",
  "slug": "tra-ona",
  "name": "Trà ONA",
  "brand": "ONA",
  "category_id": "tra-sua-pha-che",
  "subcategory_id": "tra-nen-tra-tui-loc",
  "industry_group": "tra_sua_pha_che",
  "product_type": "physical",
  "short_description": "Trà nền dùng cho trà trái cây, trà sữa và các dòng trà pha máy.",
  "package_size": null,
  "unit": null,
  "use_cases": ["trà trái cây", "trà sữa", "trà pha máy"],
  "tags": ["tra-nen", "tra-pha-may", "menu-quan"],
  "price_retail": null,
  "price_wholesale": null,
  "currency": "VND",
  "source_confidence": "public-snippet",
  "status": "needs_review"
}
```

---

### 5.2 Bột sữa / Bột béo / Creamer

| Product ID | Name | Brand | Category | Package | Origin | Use cases | Selling points | Data status |
|---|---|---|---|---|---|---|---|---|
| `bot-sua-sawasdee-1kg` | `Bột sữa Sawasdee 1kg` | `SAWASDEE` | `bot-sua-bot-beo` | `1kg` | `Thái Lan` | `Trà sữa, đồ uống béo sữa` | `Độ hòa tan tốt, không vón cục, sánh mịn, thơm béo` | `confirmed-public-post-snippet` |
| `bot-sua-sumi` | `Bột sữa SUMI` | `SUMI` | `bot-sua-bot-beo` | `TODO` | `TODO` | `Trà sữa, đồ uống pha chế` | `Nhóm sản phẩm SUMI được liệt kê trong hệ thống phân phối Magisea` | `inferred-category` |
| `bot-magisea-25kg` | `Bột Magisea 25kg` | `MAGISEA` | `bot-sua-bot-beo` | `25kg` | `TODO` | `Pha chế, sản xuất/kinh doanh quy mô lớn` | `Quy cách lớn 25kg` | `inferred-category` |

#### Example object

```json
{
  "id": "bot-sua-sawasdee-1kg",
  "slug": "bot-sua-sawasdee-1kg",
  "name": "Bột sữa Sawasdee 1kg",
  "brand": "SAWASDEE",
  "category_id": "tra-sua-pha-che",
  "subcategory_id": "bot-sua-bot-beo",
  "industry_group": "tra_sua_pha_che",
  "product_type": "physical",
  "short_description": "Bột sữa pha chế 1kg, xuất xứ Thái Lan, dùng cho trà sữa và đồ uống béo sữa.",
  "origin": "Thái Lan",
  "package_size": "1kg",
  "unit": "gói",
  "use_cases": ["trà sữa", "đồ uống béo sữa", "menu quán"],
  "tags": ["bot-sua", "creamer", "sawasdee", "thai-lan"],
  "selling_points": ["hòa tan tốt", "không vón cục", "sánh mịn", "thơm béo"],
  "storage_instruction": null,
  "shelf_life": null,
  "price_retail": null,
  "price_wholesale": null,
  "currency": "VND",
  "source_confidence": "confirmed-public-post-snippet",
  "status": "needs_review"
}
```

---

### 5.3 Topping

| Product ID | Name | Brand | Category | Package | Origin | Use cases | Selling points | Data status |
|---|---|---|---|---|---|---|---|---|
| `tran-chau-5s-dai-loan` | `Trân châu 5s chuẩn vị Đài Loan` | `TODO` | `topping` | `TODO` | `Đài Loan / TODO xác minh` | `Trà sữa, topping đồ uống` | `Thơm ngon, chuẩn vị Đài Loan` | `public-snippet` |
| `tran-chau-olong` | `Trân châu Olong` | `TODO` | `topping` | `TODO` | `TODO` | `Trà sữa, trà ôlong, đồ uống topping` | `Topping concept ôlong` | `public-snippet` |
| `tran-chau-3q-sumi` | `Trân châu 3Q SUMI` | `SUMI` | `topping` | `TODO` | `TODO` | `Trà sữa, trà trái cây` | `Nhóm sản phẩm SUMI` | `inferred-category` |
| `bot-pudding-sumi` | `Bột pudding SUMI` | `SUMI` | `bot-pudding-jelly` | `TODO` | `TODO` | `Pudding topping, món tráng miệng, trà sữa` | `Nhóm sản phẩm SUMI` | `inferred-category` |

#### Example object

```json
{
  "id": "tran-chau-5s-dai-loan",
  "slug": "tran-chau-5s-dai-loan",
  "name": "Trân châu 5s chuẩn vị Đài Loan",
  "brand": null,
  "category_id": "tra-sua-pha-che",
  "subcategory_id": "topping",
  "industry_group": "tra_sua_pha_che",
  "product_type": "physical",
  "short_description": "Topping trân châu dùng cho trà sữa và đồ uống pha chế.",
  "origin": "TODO xác minh",
  "package_size": null,
  "unit": null,
  "use_cases": ["trà sữa", "topping đồ uống"],
  "tags": ["tran-chau", "topping", "dai-loan"],
  "selling_points": ["thơm ngon", "chuẩn vị Đài Loan"],
  "price_retail": null,
  "price_wholesale": null,
  "currency": "VND",
  "source_confidence": "public-snippet",
  "status": "needs_review"
}
```

---

### 5.4 Syrup / Sốt / Mứt / Trái cây ngâm

| Product ID | Name | Brand | Category | Package | Origin | Use cases | Selling points | Data status |
|---|---|---|---|---|---|---|---|---|
| `syrup-prince` | `Syrup PRINCE` | `PRINCE` | `syrup-sot-mut` | `TODO` | `TODO` | `Trà trái cây, soda, đá xay, topping flavor` | `Nhóm sản phẩm PRINCE được liệt kê trong hệ thống phân phối Magisea` | `inferred-category` |
| `dao-ngam-duong-prince` | `Đào ngâm đường PRINCE` | `PRINCE` | `syrup-sot-mut` | `TODO` | `TODO` | `Trà đào, trà trái cây, topping trái cây` | `Nhóm sản phẩm PRINCE` | `inferred-category` |

#### Example object

```json
{
  "id": "dao-ngam-duong-prince",
  "slug": "dao-ngam-duong-prince",
  "name": "Đào ngâm đường PRINCE",
  "brand": "PRINCE",
  "category_id": "tra-sua-pha-che",
  "subcategory_id": "syrup-sot-mut",
  "industry_group": "tra_sua_pha_che",
  "product_type": "physical",
  "short_description": "Đào ngâm đường dùng cho trà đào và các món trà trái cây.",
  "use_cases": ["trà đào", "trà trái cây", "topping trái cây"],
  "tags": ["dao-ngam", "prince", "tra-trai-cay"],
  "price_retail": null,
  "price_wholesale": null,
  "currency": "VND",
  "source_confidence": "inferred-category",
  "status": "needs_review"
}
```

---

### 5.5 Nước cốt dừa / Coconut base

| Product ID | Name | Brand | Category | Package | Origin | Use cases | Selling points | Data status |
|---|---|---|---|---|---|---|---|---|
| `nuoc-cot-dua-sumi` | `Nước cốt dừa SUMI` | `SUMI` | `cot-dua` | `TODO` | `TODO` | `Trà sữa, cà phê, chè, đồ uống coconut` | `Nhóm sản phẩm SUMI` | `inferred-category` |

---

### 5.6 Nguyên liệu đá xay

| Product ID | Name | Brand | Category | Package | Origin | Use cases | Selling points | Data status |
|---|---|---|---|---|---|---|---|---|
| `barismate-nguyen-lieu-da-xay` | `Nguyên liệu đá xay BARISMATE` | `BARISMATE` | `nguyen-lieu-da-xay` | `TODO` | `TODO` | `Đồ uống đá xay, frappe, smoothie` | `Nhóm sản phẩm BARISMATE` | `inferred-category` |
| `barismate-nguyen-lieu-tra-sua` | `Nguyên liệu trà sữa BARISMATE` | `BARISMATE` | `tra-nen-tra-tui-loc` | `TODO` | `TODO` | `Trà sữa, đồ uống pha chế` | `Nhóm sản phẩm BARISMATE` | `inferred-category` |

---

## 6. Product Catalog — Mì cay Hàn Quốc

> Nguồn public xác nhận Hưng Phát có ngành hàng `mì cay Hàn Quốc`, nhưng chưa lấy được danh sách SKU chi tiết qua web public. Nên phần này để dạng category scaffold để team nhập SKU thật từ kho/bảng giá.

| Product ID | Name | Brand | Category | Package | Origin | Use cases | Selling points | Data status |
|---|---|---|---|---|---|---|---|---|
| `mi-cay-han-quoc-base` | `Nguyên liệu mì cay Hàn Quốc` | `TODO` | `mi-cay-base` | `TODO` | `TODO` | `Quán mì cay, quán ăn vặt` | `Ngành hàng chính theo mô tả fanpage` | `inferred-category` |
| `sot-gia-vi-mi-cay` | `Sốt / gia vị mì cay` | `TODO` | `mi-cay-base` | `TODO` | `TODO` | `Nấu nước dùng mì cay, set mì cay` | `TODO xác minh sản phẩm cụ thể` | `todo` |
| `topping-mi-cay` | `Topping mì cay` | `TODO` | `topping-mi-cay` | `TODO` | `TODO` | `Topping cho mì cay, lẩu, ăn vặt` | `TODO xác minh sản phẩm cụ thể` | `todo` |

---

## 7. Product Catalog — Thực phẩm đông lạnh

> Nguồn public xác nhận Hưng Phát có ngành hàng `thực phẩm đông lạnh`, nhưng chưa lấy được danh sách SKU chi tiết qua web public. Nên phần này để dạng category scaffold.

| Product ID | Name | Brand | Category | Package | Origin | Use cases | Selling points | Data status |
|---|---|---|---|---|---|---|---|---|
| `thuc-pham-dong-lanh-general` | `Thực phẩm đông lạnh` | `TODO` | `thuc-pham-dong-lanh` | `TODO` | `TODO` | `Quán ăn vặt, quán trà sữa, quán mì cay` | `Ngành hàng chính theo mô tả fanpage` | `inferred-category` |
| `xien-que-an-vat` | `Xiên que / ăn vặt đông lạnh` | `TODO` | `xien-que-an-vat` | `TODO` | `TODO` | `Menu ăn vặt, bán kèm trà sữa/mì cay` | `TODO xác minh sản phẩm cụ thể` | `todo` |
| `vien-tha-lau-dong-lanh` | `Viên thả lẩu / topping đông lạnh` | `TODO` | `vien-tha-lau` | `TODO` | `TODO` | `Mì cay, lẩu, ăn vặt` | `TODO xác minh sản phẩm cụ thể` | `todo` |
| `do-chien-dong-lanh` | `Đồ chiên đông lạnh` | `TODO` | `do-chien-dong-lanh` | `TODO` | `TODO` | `Ăn vặt, combo quán` | `TODO xác minh sản phẩm cụ thể` | `todo` |

---

## 8. Combo / Recipe / Content Products

Dùng nhóm này nếu app có module `recipes`, `bundles`, `menu_solutions`, hoặc `lead magnet`.

| Product ID | Name | Type | Related Product/Brand | Use cases | Data status |
|---|---|---|---|---|---|
| `combo-12-cong-thuc-tra-trai-cay-loc-phat` | `Bộ 12 công thức trà trái cây` | `recipe_content` | `Trà Lộc Phát` | `Lead magnet, tư vấn chủ quán, upsell trà nền` | `public-snippet` |
| `combo-15-cong-thuc-tra-trai-cay` | `Combo 15 công thức trà trái cây` | `recipe_content` | `Trà ONA / TODO xác minh` | `Menu mùa hè, trà trái cây tươi` | `public-snippet` |
| `combo-10-cong-thuc-tra-sua-chuan-gu` | `Bộ 10 công thức trà sữa chuẩn gu` | `recipe_content` | `TODO` | `Hướng dẫn pha chế, chuyển đổi khách mới` | `public-snippet` |
| `combo-10-cong-thuc-de-pha-de-ban-loc-phat` | `10 công thức dễ pha dễ bán` | `recipe_content` | `Trà Lộc Phát` | `Tăng doanh thu quán, upsell nguyên liệu` | `public-snippet` |
| `combo-5-cong-thuc-uong-nong-noel` | `5 công thức uống nóng Noel` | `recipe_content` | `TODO` | `Menu mùa Noel, đồ uống nóng` | `public-snippet` |
| `solution-tra-pha-may-2025` | `Giải pháp trà pha máy 2025` | `bundle` | `Trà ONA / TODO xác minh` | `Trend menu, quán cafe/trà sữa` | `public-snippet` |

### Example object

```json
{
  "id": "combo-12-cong-thuc-tra-trai-cay-loc-phat",
  "slug": "bo-12-cong-thuc-tra-trai-cay-loc-phat",
  "name": "Bộ 12 công thức trà trái cây",
  "brand": "Lộc Phát",
  "category_id": "combo-cong-thuc",
  "subcategory_id": "cong-thuc-tra-trai-cay",
  "industry_group": "combo_cong_thuc",
  "product_type": "recipe_content",
  "short_description": "Bộ công thức trà trái cây dùng làm lead magnet và hỗ trợ chủ quán triển khai menu.",
  "use_cases": ["lead magnet", "menu trà trái cây", "upsell trà nền"],
  "tags": ["cong-thuc", "tra-trai-cay", "loc-phat", "menu-quan"],
  "price_retail": 0,
  "price_wholesale": null,
  "currency": "VND",
  "source_confidence": "public-snippet",
  "status": "needs_review"
}
```

---

## 9. Collections Gợi Ý Cho App

Dùng để tạo home page hoặc filter nhanh.

| Collection ID | Title | Description | Product IDs |
|---|---|---|---|
| `home-tra-sua-ban-chay` | `Nguyên liệu trà sữa bán chạy` | `Nhóm trà nền, bột sữa, topping cho quán trà sữa` | `tra-ona, tra-loc-phat, bot-sua-sawasdee-1kg, tran-chau-5s-dai-loan` |
| `home-tra-trai-cay` | `Trà trái cây & công thức mùa hè` | `Trà nền + syrup + đào ngâm + công thức trà trái cây` | `tra-ona, tra-loc-phat, syrup-prince, dao-ngam-duong-prince, combo-12-cong-thuc-tra-trai-cay-loc-phat` |
| `home-topping` | `Topping trà sữa` | `Trân châu, pudding, topping 3Q` | `tran-chau-5s-dai-loan, tran-chau-olong, tran-chau-3q-sumi, bot-pudding-sumi` |
| `home-mi-cay-an-vat` | `Mì cay & ăn vặt` | `Nguyên liệu cho quán mì cay và menu ăn vặt` | `mi-cay-han-quoc-base, topping-mi-cay, xien-que-an-vat, thuc-pham-dong-lanh-general` |
| `home-combo-cong-thuc` | `Combo công thức kinh doanh` | `Bộ công thức giúp chủ quán triển khai menu và mua combo nguyên liệu` | `combo-12-cong-thuc-tra-trai-cay-loc-phat, combo-15-cong-thuc-tra-trai-cay, combo-10-cong-thuc-tra-sua-chuan-gu` |
| `home-giao-hang-mien-tay` | `Giao hàng tuyến miền Tây` | `Ưu tiên khách sỉ theo tuyến giao hàng cố định` | `route-mon-mytho-tanan-benluc-q6, route-tue-caibe-sadec-caolanh-longxuyen, route-wed-baclieu-soctrang-haugiang` |

---

## 10. Tags / Facets Chuẩn Hóa

```yaml
tags:
  product_function:
    - tra-nen
    - bot-sua
    - topping
    - syrup
    - trai-cay-ngam
    - pudding
    - da-xay
    - cot-dua
    - mi-cay
    - dong-lanh
    - cong-thuc
    - combo
  customer_type:
    - chu-quan-tra-sua
    - quan-mi-cay
    - quan-an-vat
    - dai-ly-si
    - khach-le
  selling_angle:
    - ban-si
    - ban-le
    - menu-trend
    - cong-thuc-mien-phi
    - giao-hang-mien-tay
    - mo-quan
    - gia-von-binh-dan
  seasonality:
    - mua-he
    - trung-thu
    - noel
    - le-hoi-cuoi-nam
```

---

## 11. Database Mapping Gợi Ý

### `merchants`

| Field | Example |
|---|---|
| `id` | `hung-phat-nguyen-lieu` |
| `name` | `Nguyên Liệu Hưng Phát` |
| `legal_name` | `CÔNG TY TNHH TM NGUYÊN LIỆU HƯNG PHÁT` |
| `tax_code` | `1201678728` |
| `phone` | `0396980168` |
| `address` | `152 Yersin, Phường 4, TP. Mỹ Tho, Tiền Giang` |
| `status` | `active` |

### `categories`

| Field | Example |
|---|---|
| `id` | `tra-sua-pha-che` |
| `name` | `Nguyên liệu trà sữa & pha chế` |
| `parent_id` | `null` |
| `sort_order` | `1` |

### `products`

| Field | Example |
|---|---|
| `id` | `bot-sua-sawasdee-1kg` |
| `name` | `Bột sữa Sawasdee 1kg` |
| `category_id` | `tra-sua-pha-che` |
| `subcategory_id` | `bot-sua-bot-beo` |
| `brand` | `SAWASDEE` |
| `package_size` | `1kg` |
| `origin` | `Thái Lan` |
| `status` | `needs_review` |

### `delivery_routes`

| Field | Example |
|---|---|
| `id` | `route-mon-mytho-tanan-benluc-q6` |
| `day_of_week` | `monday` |
| `route_label` | `T2: Mỹ Tho - Tân An - Bến Lức - Quận 6` |
| `areas` | `["Mỹ Tho", "Tân An", "Bến Lức", "Quận 6"]` |

---

## 12. CSV Header Gợi Ý Nếu Cần Import

```csv
id,slug,name,brand,category_id,subcategory_id,industry_group,product_type,short_description,origin,package_size,unit,use_cases,tags,selling_points,storage_instruction,shelf_life,price_retail,price_wholesale,currency,min_order_qty,image_urls,source_urls,source_confidence,status
```

---

## 13. TODO Data Cần Xin Từ Công Ty Để Hoàn Thiện 100%

Checklist này nên xin từ Hưng Phát để app lên dữ liệu sạch, tránh sai giá/sai quy cách:

- [ ] Bảng SKU chính thức: mã hàng, tên hàng, thương hiệu, quy cách, đơn vị bán.
- [ ] Giá lẻ, giá sỉ theo mốc số lượng, giá đại lý nếu có.
- [ ] Tồn kho/tình trạng còn hàng/ngưng bán.
- [ ] Hình ảnh sản phẩm gốc: mặt trước, mặt sau, tem nhãn, quy cách.
- [ ] HSD, ngày sản xuất, điều kiện bảo quản.
- [ ] Xuất xứ, nhà sản xuất/nhà nhập khẩu.
- [ ] Giấy tờ VSATTP/COA/nguồn gốc nếu có.
- [ ] Danh sách combo mở quán, combo trà sữa, combo mì cay.
- [ ] Công thức ứng dụng theo từng sản phẩm.
- [ ] Chính sách giao hàng, phí giao hàng, điều kiện freeship.
- [ ] Chính sách đổi trả với hàng lỗi/cận date/hư hỏng vận chuyển.

---

## 14. Source Notes

Nguồn public đã dùng để dựng catalog scaffold:

1. Shopee shop public của `Nguyên Liệu Hưng Phát Mỹ Tho`: thông tin địa chỉ, hotline, tuyến giao hàng miền Tây, shop đang tạm nghỉ.
2. Facebook public/index snippets của `Nguyên liệu trà sữa và mì cay Hưng Phát`: mô tả ngành hàng, các post/snippet về Trà ONA, Trà Lộc Phát, Bột sữa Sawasdee, Trân châu 5s, các bộ công thức.
3. Magisea distributor page `Nguyên liệu pha chế Hưng Phát`: nhóm thương hiệu/sản phẩm BARISMATE, SUMI, PRINCE, Bột Magisea, địa chỉ và điện thoại.
4. Nguồn mã số thuế: Masothue / Thư Viện Pháp Luật / Dauthau để xác nhận legal profile, ngành nghề và trạng thái hoạt động.

---

## 15. Import Seed JSON

```json
{
  "merchant": {
    "id": "hung-phat-nguyen-lieu",
    "legal_name": "CÔNG TY TNHH TM NGUYÊN LIỆU HƯNG PHÁT",
    "brand_name": "Nguyên Liệu Hưng Phát",
    "tax_code": "1201678728",
    "address": "152 Yersin, Phường 4, TP. Mỹ Tho, Tiền Giang",
    "phone": "0396980168",
    "business_status": "active"
  },
  "products": [
    {
      "id": "tra-ona",
      "name": "Trà ONA",
      "brand": "ONA",
      "category_id": "tra-sua-pha-che",
      "subcategory_id": "tra-nen-tra-tui-loc",
      "industry_group": "tra_sua_pha_che",
      "product_type": "physical",
      "status": "needs_review"
    },
    {
      "id": "tra-loc-phat",
      "name": "Trà Lộc Phát",
      "brand": "Lộc Phát",
      "category_id": "tra-sua-pha-che",
      "subcategory_id": "tra-nen-tra-tui-loc",
      "industry_group": "tra_sua_pha_che",
      "product_type": "physical",
      "status": "needs_review"
    },
    {
      "id": "bot-sua-sawasdee-1kg",
      "name": "Bột sữa Sawasdee 1kg",
      "brand": "SAWASDEE",
      "category_id": "tra-sua-pha-che",
      "subcategory_id": "bot-sua-bot-beo",
      "industry_group": "tra_sua_pha_che",
      "product_type": "physical",
      "origin": "Thái Lan",
      "package_size": "1kg",
      "selling_points": ["hòa tan tốt", "không vón cục", "sánh mịn", "thơm béo"],
      "status": "needs_review"
    },
    {
      "id": "tran-chau-5s-dai-loan",
      "name": "Trân châu 5s chuẩn vị Đài Loan",
      "brand": null,
      "category_id": "tra-sua-pha-che",
      "subcategory_id": "topping",
      "industry_group": "tra_sua_pha_che",
      "product_type": "physical",
      "status": "needs_review"
    },
    {
      "id": "syrup-prince",
      "name": "Syrup PRINCE",
      "brand": "PRINCE",
      "category_id": "tra-sua-pha-che",
      "subcategory_id": "syrup-sot-mut",
      "industry_group": "tra_sua_pha_che",
      "product_type": "physical",
      "status": "needs_review"
    },
    {
      "id": "dao-ngam-duong-prince",
      "name": "Đào ngâm đường PRINCE",
      "brand": "PRINCE",
      "category_id": "tra-sua-pha-che",
      "subcategory_id": "syrup-sot-mut",
      "industry_group": "tra_sua_pha_che",
      "product_type": "physical",
      "status": "needs_review"
    },
    {
      "id": "mi-cay-han-quoc-base",
      "name": "Nguyên liệu mì cay Hàn Quốc",
      "brand": null,
      "category_id": "mi-cay-han-quoc",
      "subcategory_id": "mi-cay-base",
      "industry_group": "mi_cay_han_quoc",
      "product_type": "physical",
      "status": "needs_review"
    },
    {
      "id": "thuc-pham-dong-lanh-general",
      "name": "Thực phẩm đông lạnh",
      "brand": null,
      "category_id": "thuc-pham-dong-lanh",
      "subcategory_id": null,
      "industry_group": "thuc_pham_dong_lanh",
      "product_type": "physical",
      "status": "needs_review"
    }
  ]
}
```
