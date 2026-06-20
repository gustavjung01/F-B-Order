// Auto-normalized from docs/catalog/hung-phat-product-catalog-map.md.
// Quy tắc dữ liệu: chỉ dùng dữ liệu có trong file nguồn; không tự bịa quy cách, giá, tồn kho, barcode, HSD hoặc ảnh SKU.

export type HungPhatCatalogProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  categoryId: string;
  subcategoryId: string | null;
  industryGroup: "tra_sua_pha_che" | "mi_cay_han_quoc" | "thuc_pham_dong_lanh" | "combo_cong_thuc";
  productType: "physical" | "bundle" | "recipe_content" | "service";
  catalogKind: "sku_candidate" | "category_scaffold" | "content" | "bundle_candidate";
  shortDescription: string | null;
  description: string | null;
  origin: string | null;
  packageSize: string | null;
  unit: string | null;
  useCases: string[];
  tags: string[];
  sellingPoints: string[];
  storageInstruction: string | null;
  shelfLife: string | null;
  priceRetail: number | null;
  priceWholesale: number | null;
  currency: "VND";
  minOrderQty: number | null;
  imageUrls: string[];
  sourceUrls: string[];
  sourceConfidence: "confirmed" | "public-snippet" | "inferred-category" | "todo";
  sourceStatusRaw: string;
  status: "active" | "draft" | "needs_review";
  isOrderable: boolean;
  dataIssues: string[];
};

export const hungPhatCatalog = {
  "meta": {
    "catalogId": "hung-phat-nguyen-lieu",
    "sourceFile": "hung-phat-product-catalog-map.md",
    "normalizedFor": "F-B-Order apps/frontend data catalog v1",
    "generatedAt": "2026-06-20",
    "rules": [
      "Không tự bịa giá, tồn kho, barcode, hạn sử dụng, hình ảnh SKU.",
      "Quy cách chỉ lấy từ trường Package/package_size trong file nguồn.",
      "Package TODO/null được lưu là null và đưa vào dataIssues.",
      "Sản phẩm thiếu giá/đơn vị/quy cách không cho order trực tiếp."
    ],
    "summary": {
      "totalProducts": 29,
      "physicalProducts": 23,
      "contentProducts": 5,
      "bundleCandidates": 1,
      "missingPackageSize": 21,
      "hasPackageSize": 2,
      "missingUnit": 23,
      "missingRetailPrice": 24,
      "missingWholesalePrice": 29,
      "missingImage": 29,
      "categoryScaffoldProducts": 7,
      "skuCandidates": 16
    }
  },
  "merchant": {
    "id": "hung-phat-nguyen-lieu",
    "legalName": "CÔNG TY TNHH TM NGUYÊN LIỆU HƯNG PHÁT",
    "brandName": "Nguyên Liệu Hưng Phát",
    "facebookName": "Nguyên liệu trà sữa và mì cay Hưng Phát",
    "taxCode": "1201678728",
    "businessStatus": "active",
    "primaryBusinessLine": "Bán buôn thực phẩm",
    "secondaryBusinessLine": "Bán buôn đồ uống",
    "representative": "TRẦN HOÀNG GIANG",
    "address": "152 Yersin, Phường 4, TP. Mỹ Tho, Tiền Giang",
    "addressPublicNew": "152 Yersin, Phường Đạo Thạnh, Tỉnh Đồng Tháp",
    "phones": [
      "0396.980.168",
      "0388.380.168",
      "0902.660.979"
    ],
    "zalo": "0396.080.168 / 0396.980.168",
    "serviceArea": "Miền Tây + tuyến TP.HCM theo lịch giao hàng",
    "positioning": "Nhà cung cấp sỉ/lẻ nguyên liệu trà sữa, mì cay Hàn Quốc, thực phẩm đông lạnh, nguyên liệu pha chế cho quán F&B"
  },
  "categories": [
    {
      "id": "tra-sua-pha-che",
      "name": "Nguyên liệu trà sữa & pha chế",
      "parentId": null,
      "sortOrder": 1
    },
    {
      "id": "tra-nen-tra-tui-loc",
      "name": "Trà nền / Trà túi lọc / Trà pha máy",
      "parentId": "tra-sua-pha-che",
      "sortOrder": 10
    },
    {
      "id": "bot-sua-bot-beo",
      "name": "Bột sữa / Bột béo / Creamer",
      "parentId": "tra-sua-pha-che",
      "sortOrder": 20
    },
    {
      "id": "topping",
      "name": "Topping",
      "parentId": "tra-sua-pha-che",
      "sortOrder": 30
    },
    {
      "id": "syrup-sot-mut",
      "name": "Syrup / Sốt / Mứt / Trái cây ngâm",
      "parentId": "tra-sua-pha-che",
      "sortOrder": 40
    },
    {
      "id": "bot-pudding-jelly",
      "name": "Bột pudding / Jelly / Thạch",
      "parentId": "tra-sua-pha-che",
      "sortOrder": 50
    },
    {
      "id": "nguyen-lieu-da-xay",
      "name": "Nguyên liệu đá xay",
      "parentId": "tra-sua-pha-che",
      "sortOrder": 60
    },
    {
      "id": "cot-dua",
      "name": "Nước cốt dừa / Coconut base",
      "parentId": "tra-sua-pha-che",
      "sortOrder": 70
    },
    {
      "id": "mi-cay-han-quoc",
      "name": "Nguyên liệu mì cay Hàn Quốc",
      "parentId": null,
      "sortOrder": 2
    },
    {
      "id": "mi-cay-base",
      "name": "Mì / sốt / gia vị mì cay",
      "parentId": "mi-cay-han-quoc",
      "sortOrder": 10
    },
    {
      "id": "topping-mi-cay",
      "name": "Topping mì cay",
      "parentId": "mi-cay-han-quoc",
      "sortOrder": 20
    },
    {
      "id": "thuc-pham-dong-lanh",
      "name": "Thực phẩm đông lạnh",
      "parentId": null,
      "sortOrder": 3
    },
    {
      "id": "xien-que-an-vat",
      "name": "Xiên que / Ăn vặt",
      "parentId": "thuc-pham-dong-lanh",
      "sortOrder": 10
    },
    {
      "id": "vien-tha-lau",
      "name": "Viên thả lẩu / topping đông lạnh",
      "parentId": "thuc-pham-dong-lanh",
      "sortOrder": 20
    },
    {
      "id": "do-chien-dong-lanh",
      "name": "Đồ chiên đông lạnh",
      "parentId": "thuc-pham-dong-lanh",
      "sortOrder": 30
    },
    {
      "id": "combo-cong-thuc",
      "name": "Combo & công thức kinh doanh",
      "parentId": null,
      "sortOrder": 4
    },
    {
      "id": "combo-mo-quan",
      "name": "Combo mở quán",
      "parentId": "combo-cong-thuc",
      "sortOrder": 10
    },
    {
      "id": "cong-thuc-tra-sua",
      "name": "Công thức trà sữa",
      "parentId": "combo-cong-thuc",
      "sortOrder": 20
    },
    {
      "id": "cong-thuc-tra-trai-cay",
      "name": "Công thức trà trái cây",
      "parentId": "combo-cong-thuc",
      "sortOrder": 30
    },
    {
      "id": "cong-thuc-do-uong-nong",
      "name": "Công thức đồ uống nóng",
      "parentId": "combo-cong-thuc",
      "sortOrder": 40
    }
  ],
  "deliveryRoutes": [
    {
      "id": "route-mon-mytho-tanan-benluc-q6",
      "dayLabel": "T2",
      "dayOfWeek": "monday",
      "name": "Mỹ Tho - Tân An - Bến Lức - Quận 6",
      "areas": [
        "Mỹ Tho",
        "Tân An",
        "Bến Lức",
        "Quận 6"
      ]
    },
    {
      "id": "route-tue-caibe-sadec-caolanh-longxuyen",
      "dayLabel": "T3",
      "dayOfWeek": "tuesday",
      "name": "Cái Bè - Sa Đéc - Cao Lãnh - Long Xuyên - Thoại Sơn - Vĩnh Long - Cần Thơ",
      "areas": [
        "Cái Bè",
        "Sa Đéc",
        "Cao Lãnh",
        "Long Xuyên",
        "Thoại Sơn",
        "Vĩnh Long",
        "Cần Thơ"
      ]
    },
    {
      "id": "route-wed-baclieu-soctrang-haugiang",
      "dayLabel": "T4",
      "dayOfWeek": "wednesday",
      "name": "Bạc Liêu - Sóc Trăng - Hậu Giang",
      "areas": [
        "Bạc Liêu",
        "Sóc Trăng",
        "Hậu Giang"
      ]
    },
    {
      "id": "route-thu-bentre",
      "dayLabel": "T5",
      "dayOfWeek": "thursday",
      "name": "Bến Tre",
      "areas": [
        "Bến Tre"
      ]
    },
    {
      "id": "route-fri-longgiang-saigon",
      "dayLabel": "T6",
      "dayOfWeek": "friday",
      "name": "Long Giang - Sài Gòn",
      "areas": [
        "Long Giang",
        "Sài Gòn"
      ]
    },
    {
      "id": "route-sat-mytho-gocong-bentre",
      "dayLabel": "T7",
      "dayOfWeek": "saturday",
      "name": "Mỹ Tho - Gò Công - Bến Tre",
      "areas": [
        "Mỹ Tho",
        "Gò Công",
        "Bến Tre"
      ]
    }
  ],
  "products": [
    {
      "id": "tra-ona",
      "slug": "tra-ona",
      "name": "Trà ONA",
      "brand": "ONA",
      "categoryId": "tra-sua-pha-che",
      "subcategoryId": "tra-nen-tra-tui-loc",
      "industryGroup": "tra_sua_pha_che",
      "productType": "physical",
      "catalogKind": "sku_candidate",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Trà trái cây",
        "trà sữa",
        "trà pha máy"
      ],
      "tags": [],
      "sellingPoints": [
        "Cảm nhận sự khác biệt từ trà ONA",
        "dùng làm dòng trà nền"
      ],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": null,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "public-snippet",
      "sourceStatusRaw": "public-snippet",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_package_size",
        "missing_unit",
        "missing_price_retail",
        "missing_price_wholesale",
        "missing_image",
        "missing_origin"
      ]
    },
    {
      "id": "tra-loc-phat",
      "slug": "tra-loc-phat",
      "name": "Trà Lộc Phát",
      "brand": "Lộc Phát",
      "categoryId": "tra-sua-pha-che",
      "subcategoryId": "tra-nen-tra-tui-loc",
      "industryGroup": "tra_sua_pha_che",
      "productType": "physical",
      "catalogKind": "sku_candidate",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Trà trái cây",
        "trà sữa",
        "công thức kinh doanh"
      ],
      "tags": [],
      "sellingPoints": [
        "Gắn với bộ công thức trà trái cây / công thức dễ pha dễ bán"
      ],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": null,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "public-snippet",
      "sourceStatusRaw": "public-snippet",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_package_size",
        "missing_unit",
        "missing_price_retail",
        "missing_price_wholesale",
        "missing_image",
        "missing_origin"
      ]
    },
    {
      "id": "tra-pha-may-2025",
      "slug": "tra-pha-may-2025",
      "name": "Trà pha máy 2025",
      "brand": null,
      "categoryId": "tra-sua-pha-che",
      "subcategoryId": "tra-nen-tra-tui-loc",
      "industryGroup": "tra_sua_pha_che",
      "productType": "physical",
      "catalogKind": "sku_candidate",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Menu trend",
        "quán trà sữa/cafe"
      ],
      "tags": [],
      "sellingPoints": [
        "Định vị theo trend trà pha máy 2025"
      ],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": null,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "public-snippet",
      "sourceStatusRaw": "public-snippet",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_package_size",
        "missing_unit",
        "missing_price_retail",
        "missing_price_wholesale",
        "missing_image",
        "missing_origin"
      ]
    },
    {
      "id": "tra-oolong-sen",
      "slug": "tra-oolong-sen",
      "name": "Trà Ôlong Sen",
      "brand": null,
      "categoryId": "tra-sua-pha-che",
      "subcategoryId": "tra-nen-tra-tui-loc",
      "industryGroup": "tra_sua_pha_che",
      "productType": "physical",
      "catalogKind": "sku_candidate",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Đồ uống mùa Trung Thu",
        "trà sữa",
        "trà trái cây"
      ],
      "tags": [],
      "sellingPoints": [
        "Concept trà ôlong sen / menu mùa vụ"
      ],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": null,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "public-snippet",
      "sourceStatusRaw": "public-snippet",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_package_size",
        "missing_unit",
        "missing_price_retail",
        "missing_price_wholesale",
        "missing_image",
        "missing_origin"
      ]
    },
    {
      "id": "bot-sua-sawasdee-1kg",
      "slug": "bot-sua-sawasdee-1kg",
      "name": "Bột sữa Sawasdee 1kg",
      "brand": "SAWASDEE",
      "categoryId": "tra-sua-pha-che",
      "subcategoryId": "bot-sua-bot-beo",
      "industryGroup": "tra_sua_pha_che",
      "productType": "physical",
      "catalogKind": "sku_candidate",
      "shortDescription": null,
      "description": null,
      "origin": "Thái Lan",
      "packageSize": "1kg",
      "unit": null,
      "useCases": [
        "Trà sữa",
        "đồ uống béo sữa"
      ],
      "tags": [],
      "sellingPoints": [
        "Độ hòa tan tốt",
        "không vón cục",
        "sánh mịn",
        "thơm béo"
      ],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": null,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "confirmed",
      "sourceStatusRaw": "confirmed-public-post-snippet",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_unit",
        "missing_price_retail",
        "missing_price_wholesale",
        "missing_image"
      ]
    },
    {
      "id": "bot-sua-sumi",
      "slug": "bot-sua-sumi",
      "name": "Bột sữa SUMI",
      "brand": "SUMI",
      "categoryId": "tra-sua-pha-che",
      "subcategoryId": "bot-sua-bot-beo",
      "industryGroup": "tra_sua_pha_che",
      "productType": "physical",
      "catalogKind": "sku_candidate",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Trà sữa",
        "đồ uống pha chế"
      ],
      "tags": [],
      "sellingPoints": [
        "Nhóm sản phẩm SUMI được liệt kê trong hệ thống phân phối Magisea"
      ],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": null,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "inferred-category",
      "sourceStatusRaw": "inferred-category",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_package_size",
        "missing_unit",
        "missing_price_retail",
        "missing_price_wholesale",
        "missing_image",
        "missing_origin"
      ]
    },
    {
      "id": "bot-magisea-25kg",
      "slug": "bot-magisea-25kg",
      "name": "Bột Magisea 25kg",
      "brand": "MAGISEA",
      "categoryId": "tra-sua-pha-che",
      "subcategoryId": "bot-sua-bot-beo",
      "industryGroup": "tra_sua_pha_che",
      "productType": "physical",
      "catalogKind": "sku_candidate",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": "25kg",
      "unit": null,
      "useCases": [
        "Pha chế",
        "sản xuất/kinh doanh quy mô lớn"
      ],
      "tags": [],
      "sellingPoints": [
        "Quy cách lớn 25kg"
      ],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": null,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "inferred-category",
      "sourceStatusRaw": "inferred-category",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_unit",
        "missing_price_retail",
        "missing_price_wholesale",
        "missing_image",
        "missing_origin"
      ]
    },
    {
      "id": "tran-chau-5s-dai-loan",
      "slug": "tran-chau-5s-dai-loan",
      "name": "Trân châu 5s chuẩn vị Đài Loan",
      "brand": null,
      "categoryId": "tra-sua-pha-che",
      "subcategoryId": "topping",
      "industryGroup": "tra_sua_pha_che",
      "productType": "physical",
      "catalogKind": "sku_candidate",
      "shortDescription": null,
      "description": null,
      "origin": "Đài Loan / TODO xác minh",
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Trà sữa",
        "topping đồ uống"
      ],
      "tags": [],
      "sellingPoints": [
        "Thơm ngon",
        "chuẩn vị Đài Loan"
      ],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": null,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "public-snippet",
      "sourceStatusRaw": "public-snippet",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_package_size",
        "missing_unit",
        "missing_price_retail",
        "missing_price_wholesale",
        "missing_image"
      ]
    },
    {
      "id": "tran-chau-olong",
      "slug": "tran-chau-olong",
      "name": "Trân châu Olong",
      "brand": null,
      "categoryId": "tra-sua-pha-che",
      "subcategoryId": "topping",
      "industryGroup": "tra_sua_pha_che",
      "productType": "physical",
      "catalogKind": "sku_candidate",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Trà sữa",
        "trà ôlong",
        "đồ uống topping"
      ],
      "tags": [],
      "sellingPoints": [
        "Topping concept ôlong"
      ],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": null,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "public-snippet",
      "sourceStatusRaw": "public-snippet",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_package_size",
        "missing_unit",
        "missing_price_retail",
        "missing_price_wholesale",
        "missing_image",
        "missing_origin"
      ]
    },
    {
      "id": "tran-chau-3q-sumi",
      "slug": "tran-chau-3q-sumi",
      "name": "Trân châu 3Q SUMI",
      "brand": "SUMI",
      "categoryId": "tra-sua-pha-che",
      "subcategoryId": "topping",
      "industryGroup": "tra_sua_pha_che",
      "productType": "physical",
      "catalogKind": "sku_candidate",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Trà sữa",
        "trà trái cây"
      ],
      "tags": [],
      "sellingPoints": [
        "Nhóm sản phẩm SUMI"
      ],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": null,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "inferred-category",
      "sourceStatusRaw": "inferred-category",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_package_size",
        "missing_unit",
        "missing_price_retail",
        "missing_price_wholesale",
        "missing_image",
        "missing_origin"
      ]
    },
    {
      "id": "bot-pudding-sumi",
      "slug": "bot-pudding-sumi",
      "name": "Bột pudding SUMI",
      "brand": "SUMI",
      "categoryId": "tra-sua-pha-che",
      "subcategoryId": "bot-pudding-jelly",
      "industryGroup": "tra_sua_pha_che",
      "productType": "physical",
      "catalogKind": "sku_candidate",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Pudding topping",
        "món tráng miệng",
        "trà sữa"
      ],
      "tags": [],
      "sellingPoints": [
        "Nhóm sản phẩm SUMI"
      ],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": null,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "inferred-category",
      "sourceStatusRaw": "inferred-category",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_package_size",
        "missing_unit",
        "missing_price_retail",
        "missing_price_wholesale",
        "missing_image",
        "missing_origin"
      ]
    },
    {
      "id": "syrup-prince",
      "slug": "syrup-prince",
      "name": "Syrup PRINCE",
      "brand": "PRINCE",
      "categoryId": "tra-sua-pha-che",
      "subcategoryId": "syrup-sot-mut",
      "industryGroup": "tra_sua_pha_che",
      "productType": "physical",
      "catalogKind": "sku_candidate",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Trà trái cây",
        "soda",
        "đá xay",
        "topping flavor"
      ],
      "tags": [],
      "sellingPoints": [
        "Nhóm sản phẩm PRINCE được liệt kê trong hệ thống phân phối Magisea"
      ],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": null,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "inferred-category",
      "sourceStatusRaw": "inferred-category",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_package_size",
        "missing_unit",
        "missing_price_retail",
        "missing_price_wholesale",
        "missing_image",
        "missing_origin"
      ]
    },
    {
      "id": "dao-ngam-duong-prince",
      "slug": "dao-ngam-duong-prince",
      "name": "Đào ngâm đường PRINCE",
      "brand": "PRINCE",
      "categoryId": "tra-sua-pha-che",
      "subcategoryId": "syrup-sot-mut",
      "industryGroup": "tra_sua_pha_che",
      "productType": "physical",
      "catalogKind": "sku_candidate",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Trà đào",
        "trà trái cây",
        "topping trái cây"
      ],
      "tags": [],
      "sellingPoints": [
        "Nhóm sản phẩm PRINCE"
      ],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": null,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "inferred-category",
      "sourceStatusRaw": "inferred-category",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_package_size",
        "missing_unit",
        "missing_price_retail",
        "missing_price_wholesale",
        "missing_image",
        "missing_origin"
      ]
    },
    {
      "id": "nuoc-cot-dua-sumi",
      "slug": "nuoc-cot-dua-sumi",
      "name": "Nước cốt dừa SUMI",
      "brand": "SUMI",
      "categoryId": "tra-sua-pha-che",
      "subcategoryId": "cot-dua",
      "industryGroup": "tra_sua_pha_che",
      "productType": "physical",
      "catalogKind": "sku_candidate",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Trà sữa",
        "cà phê",
        "chè",
        "đồ uống coconut"
      ],
      "tags": [],
      "sellingPoints": [
        "Nhóm sản phẩm SUMI"
      ],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": null,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "inferred-category",
      "sourceStatusRaw": "inferred-category",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_package_size",
        "missing_unit",
        "missing_price_retail",
        "missing_price_wholesale",
        "missing_image",
        "missing_origin"
      ]
    },
    {
      "id": "barismate-nguyen-lieu-da-xay",
      "slug": "barismate-nguyen-lieu-da-xay",
      "name": "Nguyên liệu đá xay BARISMATE",
      "brand": "BARISMATE",
      "categoryId": "tra-sua-pha-che",
      "subcategoryId": "nguyen-lieu-da-xay",
      "industryGroup": "tra_sua_pha_che",
      "productType": "physical",
      "catalogKind": "sku_candidate",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Đồ uống đá xay",
        "frappe",
        "smoothie"
      ],
      "tags": [],
      "sellingPoints": [
        "Nhóm sản phẩm BARISMATE"
      ],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": null,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "inferred-category",
      "sourceStatusRaw": "inferred-category",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_package_size",
        "missing_unit",
        "missing_price_retail",
        "missing_price_wholesale",
        "missing_image",
        "missing_origin"
      ]
    },
    {
      "id": "barismate-nguyen-lieu-tra-sua",
      "slug": "barismate-nguyen-lieu-tra-sua",
      "name": "Nguyên liệu trà sữa BARISMATE",
      "brand": "BARISMATE",
      "categoryId": "tra-sua-pha-che",
      "subcategoryId": "tra-nen-tra-tui-loc",
      "industryGroup": "tra_sua_pha_che",
      "productType": "physical",
      "catalogKind": "sku_candidate",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Trà sữa",
        "đồ uống pha chế"
      ],
      "tags": [],
      "sellingPoints": [
        "Nhóm sản phẩm BARISMATE"
      ],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": null,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "inferred-category",
      "sourceStatusRaw": "inferred-category",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_package_size",
        "missing_unit",
        "missing_price_retail",
        "missing_price_wholesale",
        "missing_image",
        "missing_origin"
      ]
    },
    {
      "id": "mi-cay-han-quoc-base",
      "slug": "mi-cay-han-quoc-base",
      "name": "Nguyên liệu mì cay Hàn Quốc",
      "brand": null,
      "categoryId": "mi-cay-han-quoc",
      "subcategoryId": "mi-cay-base",
      "industryGroup": "mi_cay_han_quoc",
      "productType": "physical",
      "catalogKind": "category_scaffold",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Quán mì cay",
        "quán ăn vặt"
      ],
      "tags": [],
      "sellingPoints": [
        "Ngành hàng chính theo mô tả fanpage"
      ],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": null,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "inferred-category",
      "sourceStatusRaw": "inferred-category",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_package_size",
        "missing_unit",
        "missing_price_retail",
        "missing_price_wholesale",
        "missing_image",
        "missing_origin",
        "needs_official_sku"
      ]
    },
    {
      "id": "sot-gia-vi-mi-cay",
      "slug": "sot-gia-vi-mi-cay",
      "name": "Sốt / gia vị mì cay",
      "brand": null,
      "categoryId": "mi-cay-han-quoc",
      "subcategoryId": "mi-cay-base",
      "industryGroup": "mi_cay_han_quoc",
      "productType": "physical",
      "catalogKind": "category_scaffold",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Nấu nước dùng mì cay",
        "set mì cay"
      ],
      "tags": [],
      "sellingPoints": [
        "TODO xác minh sản phẩm cụ thể"
      ],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": null,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "todo",
      "sourceStatusRaw": "todo",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_package_size",
        "missing_unit",
        "missing_price_retail",
        "missing_price_wholesale",
        "missing_image",
        "missing_origin",
        "needs_official_sku"
      ]
    },
    {
      "id": "topping-mi-cay",
      "slug": "topping-mi-cay",
      "name": "Topping mì cay",
      "brand": null,
      "categoryId": "mi-cay-han-quoc",
      "subcategoryId": "topping-mi-cay",
      "industryGroup": "mi_cay_han_quoc",
      "productType": "physical",
      "catalogKind": "category_scaffold",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Topping cho mì cay",
        "lẩu",
        "ăn vặt"
      ],
      "tags": [],
      "sellingPoints": [
        "TODO xác minh sản phẩm cụ thể"
      ],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": null,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "todo",
      "sourceStatusRaw": "todo",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_package_size",
        "missing_unit",
        "missing_price_retail",
        "missing_price_wholesale",
        "missing_image",
        "missing_origin",
        "needs_official_sku"
      ]
    },
    {
      "id": "thuc-pham-dong-lanh-general",
      "slug": "thuc-pham-dong-lanh-general",
      "name": "Thực phẩm đông lạnh",
      "brand": null,
      "categoryId": "thuc-pham-dong-lanh",
      "subcategoryId": null,
      "industryGroup": "thuc_pham_dong_lanh",
      "productType": "physical",
      "catalogKind": "category_scaffold",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Quán ăn vặt",
        "quán trà sữa",
        "quán mì cay"
      ],
      "tags": [],
      "sellingPoints": [
        "Ngành hàng chính theo mô tả fanpage"
      ],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": null,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "inferred-category",
      "sourceStatusRaw": "inferred-category",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_package_size",
        "missing_unit",
        "missing_price_retail",
        "missing_price_wholesale",
        "missing_image",
        "missing_origin",
        "needs_official_sku"
      ]
    },
    {
      "id": "xien-que-an-vat",
      "slug": "xien-que-an-vat",
      "name": "Xiên que / ăn vặt đông lạnh",
      "brand": null,
      "categoryId": "thuc-pham-dong-lanh",
      "subcategoryId": "xien-que-an-vat",
      "industryGroup": "thuc_pham_dong_lanh",
      "productType": "physical",
      "catalogKind": "category_scaffold",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Menu ăn vặt",
        "bán kèm trà sữa/mì cay"
      ],
      "tags": [],
      "sellingPoints": [
        "TODO xác minh sản phẩm cụ thể"
      ],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": null,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "todo",
      "sourceStatusRaw": "todo",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_package_size",
        "missing_unit",
        "missing_price_retail",
        "missing_price_wholesale",
        "missing_image",
        "missing_origin",
        "needs_official_sku"
      ]
    },
    {
      "id": "vien-tha-lau-dong-lanh",
      "slug": "vien-tha-lau-dong-lanh",
      "name": "Viên thả lẩu / topping đông lạnh",
      "brand": null,
      "categoryId": "thuc-pham-dong-lanh",
      "subcategoryId": "vien-tha-lau",
      "industryGroup": "thuc_pham_dong_lanh",
      "productType": "physical",
      "catalogKind": "category_scaffold",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Mì cay",
        "lẩu",
        "ăn vặt"
      ],
      "tags": [],
      "sellingPoints": [
        "TODO xác minh sản phẩm cụ thể"
      ],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": null,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "todo",
      "sourceStatusRaw": "todo",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_package_size",
        "missing_unit",
        "missing_price_retail",
        "missing_price_wholesale",
        "missing_image",
        "missing_origin",
        "needs_official_sku"
      ]
    },
    {
      "id": "do-chien-dong-lanh",
      "slug": "do-chien-dong-lanh",
      "name": "Đồ chiên đông lạnh",
      "brand": null,
      "categoryId": "thuc-pham-dong-lanh",
      "subcategoryId": "do-chien-dong-lanh",
      "industryGroup": "thuc_pham_dong_lanh",
      "productType": "physical",
      "catalogKind": "category_scaffold",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Ăn vặt",
        "combo quán"
      ],
      "tags": [],
      "sellingPoints": [
        "TODO xác minh sản phẩm cụ thể"
      ],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": null,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "todo",
      "sourceStatusRaw": "todo",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_package_size",
        "missing_unit",
        "missing_price_retail",
        "missing_price_wholesale",
        "missing_image",
        "missing_origin",
        "needs_official_sku"
      ]
    },
    {
      "id": "combo-12-cong-thuc-tra-trai-cay-loc-phat",
      "slug": "bo-12-cong-thuc-tra-trai-cay-loc-phat",
      "name": "Bộ 12 công thức trà trái cây",
      "brand": "Trà Lộc Phát",
      "categoryId": "combo-cong-thuc",
      "subcategoryId": "cong-thuc-tra-trai-cay",
      "industryGroup": "combo_cong_thuc",
      "productType": "recipe_content",
      "catalogKind": "content",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Lead magnet",
        "tư vấn chủ quán",
        "upsell trà nền"
      ],
      "tags": [],
      "sellingPoints": [],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": 0,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "public-snippet",
      "sourceStatusRaw": "public-snippet",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_price_wholesale",
        "missing_image"
      ]
    },
    {
      "id": "combo-15-cong-thuc-tra-trai-cay",
      "slug": "combo-15-cong-thuc-tra-trai-cay",
      "name": "Combo 15 công thức trà trái cây",
      "brand": null,
      "categoryId": "combo-cong-thuc",
      "subcategoryId": "cong-thuc-tra-trai-cay",
      "industryGroup": "combo_cong_thuc",
      "productType": "recipe_content",
      "catalogKind": "content",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Menu mùa hè",
        "trà trái cây tươi"
      ],
      "tags": [],
      "sellingPoints": [],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": 0,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "public-snippet",
      "sourceStatusRaw": "public-snippet",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_price_wholesale",
        "missing_image",
        "missing_related_product_or_brand"
      ]
    },
    {
      "id": "combo-10-cong-thuc-tra-sua-chuan-gu",
      "slug": "combo-10-cong-thuc-tra-sua-chuan-gu",
      "name": "Bộ 10 công thức trà sữa chuẩn gu",
      "brand": null,
      "categoryId": "combo-cong-thuc",
      "subcategoryId": "cong-thuc-tra-sua",
      "industryGroup": "combo_cong_thuc",
      "productType": "recipe_content",
      "catalogKind": "content",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Hướng dẫn pha chế",
        "chuyển đổi khách mới"
      ],
      "tags": [],
      "sellingPoints": [],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": 0,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "public-snippet",
      "sourceStatusRaw": "public-snippet",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_price_wholesale",
        "missing_image",
        "missing_related_product_or_brand"
      ]
    },
    {
      "id": "combo-10-cong-thuc-de-pha-de-ban-loc-phat",
      "slug": "combo-10-cong-thuc-de-pha-de-ban-loc-phat",
      "name": "10 công thức dễ pha dễ bán",
      "brand": "Trà Lộc Phát",
      "categoryId": "combo-cong-thuc",
      "subcategoryId": "combo-mo-quan",
      "industryGroup": "combo_cong_thuc",
      "productType": "recipe_content",
      "catalogKind": "content",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Tăng doanh thu quán",
        "upsell nguyên liệu"
      ],
      "tags": [],
      "sellingPoints": [],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": 0,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "public-snippet",
      "sourceStatusRaw": "public-snippet",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_price_wholesale",
        "missing_image"
      ]
    },
    {
      "id": "combo-5-cong-thuc-uong-nong-noel",
      "slug": "combo-5-cong-thuc-uong-nong-noel",
      "name": "5 công thức uống nóng Noel",
      "brand": null,
      "categoryId": "combo-cong-thuc",
      "subcategoryId": "cong-thuc-do-uong-nong",
      "industryGroup": "combo_cong_thuc",
      "productType": "recipe_content",
      "catalogKind": "content",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Menu mùa Noel",
        "đồ uống nóng"
      ],
      "tags": [],
      "sellingPoints": [],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": 0,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "public-snippet",
      "sourceStatusRaw": "public-snippet",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_price_wholesale",
        "missing_image",
        "missing_related_product_or_brand"
      ]
    },
    {
      "id": "solution-tra-pha-may-2025",
      "slug": "solution-tra-pha-may-2025",
      "name": "Giải pháp trà pha máy 2025",
      "brand": null,
      "categoryId": "combo-cong-thuc",
      "subcategoryId": "combo-mo-quan",
      "industryGroup": "combo_cong_thuc",
      "productType": "bundle",
      "catalogKind": "bundle_candidate",
      "shortDescription": null,
      "description": null,
      "origin": null,
      "packageSize": null,
      "unit": null,
      "useCases": [
        "Trend menu",
        "quán cafe/trà sữa"
      ],
      "tags": [],
      "sellingPoints": [],
      "storageInstruction": null,
      "shelfLife": null,
      "priceRetail": null,
      "priceWholesale": null,
      "currency": "VND",
      "minOrderQty": null,
      "imageUrls": [],
      "sourceUrls": [],
      "sourceConfidence": "public-snippet",
      "sourceStatusRaw": "public-snippet",
      "status": "needs_review",
      "isOrderable": false,
      "dataIssues": [
        "missing_price_wholesale",
        "missing_image",
        "missing_related_product_or_brand",
        "missing_price_retail"
      ]
    }
  ]
} as const;
