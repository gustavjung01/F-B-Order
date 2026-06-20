import { getCatalogProductById } from "@/data/catalog/catalog-service";
import type { PublicProduct } from "@/data/catalog/product-model";

type RecipeOfferStatus = "active" | "draft";

export type RecipeOfferIngredient = {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  unit: string;
  note: string;
  optional?: boolean;
  sortOrder: number;
};

export type RecipeOfferStep = {
  id: string;
  stepNo: number;
  title: string;
  content: string;
  imageUrl?: string;
};

export type RecipeOffer = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  categoryName: string;
  categorySlug: string;
  relatedBrand: string;
  coverImageUrl: string;
  sourceConfidence: "content-plan" | "public-snippet";
  status: RecipeOfferStatus;
  sortOrder: number;
  targetCustomers: string[];
  menuItems: string[];
  ingredients: RecipeOfferIngredient[];
  steps: RecipeOfferStep[];
};

type ListRecipeOffersQuery = {
  category?: string | null;
  brand?: string | null;
  q?: string | null;
  limit?: number | null;
};

type IngredientProduct = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  brand: string;
  unit: string;
  imageUrl: string;
  minOrderQty: number;
  categoryName: string;
  categorySlug: string;
  price: number | null;
  publicPriceHint?: string | null;
};

const ASSET_BASE_URL = "https://cdn.bepsi.click/catalog/hung-phat/covers/recipes";
const LOCK_REASON = "Đăng nhập và được duyệt hồ sơ quán để xem định lượng, cách làm chi tiết và thêm nguyên liệu vào giỏ.";

export const recipeOffers: RecipeOffer[] = [
  {
    id: "combo-10-cong-thuc-de-pha-de-ban-loc-phat",
    slug: "combo-10-cong-thuc-de-pha-de-ban-loc-phat",
    title: "10 công thức dễ pha dễ bán",
    shortDescription: "Bộ món dễ triển khai cho quán mới, thao tác nhanh, nguyên liệu phổ biến và dễ tư vấn cho khách.",
    description: "Công thức tham khảo để quán test menu, có thể tinh chỉnh theo khẩu vị khách khu vực. Bộ này ưu tiên món dễ bán trước, sau đó upsell trà nền, syrup, topping và bột sữa.",
    categoryName: "Combo mở quán",
    categorySlug: "combo-mo-quan",
    relatedBrand: "Trà Lộc Phát",
    coverImageUrl: `${ASSET_BASE_URL}/cover-combo-10-cong-thuc-de-pha-de-ban-loc-phat.jpg`,
    sourceConfidence: "content-plan",
    status: "active",
    sortOrder: 10,
    targetCustomers: ["Quán mới mở", "Quán trà sữa nhỏ", "Quán cafe muốn thêm đồ uống"],
    menuItems: [
      "Trà đào cam sả",
      "Trà tắc mật ong",
      "Trà chanh dây",
      "Trà vải",
      "Trà dâu",
      "Trà xoài nhiệt đới",
      "Trà ổi hồng",
      "Trà sữa truyền thống",
      "Trà sữa ô long",
      "Trà sữa pudding",
    ],
    ingredients: [
      { id: "lp-tea-base", productId: "tra-loc-phat", productName: "Trà nền Lộc Phát", quantity: 150, unit: "ml", note: "Dùng làm nền cho nhóm trà trái cây.", sortOrder: 10 },
      { id: "lp-syrup", productId: "syrup-prince", productName: "Syrup trái cây", quantity: 25, unit: "ml", note: "Tùy vị món: đào, vải, dâu, xoài, chanh dây.", sortOrder: 20 },
      { id: "lp-peach", productId: "dao-ngam-duong-prince", productName: "Đào ngâm", quantity: 30, unit: "g", note: "Dùng cho trà đào và topping trái cây.", optional: true, sortOrder: 30 },
      { id: "lp-milk-powder", productId: "bot-sua-sawasdee-1kg", productName: "Bột sữa", quantity: 35, unit: "g", note: "Dùng cho nhóm trà sữa dễ bán.", sortOrder: 40 },
      { id: "lp-pearl", productId: "tran-chau-5s-dai-loan", productName: "Trân châu", quantity: 50, unit: "g", note: "Topping đại trà dễ chốt thêm.", optional: true, sortOrder: 50 },
      { id: "lp-pudding", productId: "bot-pudding-sumi", productName: "Pudding", quantity: 40, unit: "g", note: "Topping cho món trà sữa pudding.", optional: true, sortOrder: 60 },
    ],
    steps: [
      { id: "lp-step-1", stepNo: 1, title: "Chọn nhóm món chủ lực", content: "Chọn 4-6 món dễ bán nhất trước: trà đào, trà tắc, trà chanh dây, trà sữa truyền thống, trà sữa ô long và trà sữa pudding." },
      { id: "lp-step-2", stepNo: 2, title: "Chuẩn bị nền", content: "Ủ trà nền theo mẻ ổn định, để nguội và bảo quản lạnh trong ca bán." },
      { id: "lp-step-3", stepNo: 3, title: "Pha từng ly", content: "Cho nền trà, syrup hoặc bột sữa theo định lượng, thêm đá và lắc đều trước khi ra ly." },
      { id: "lp-step-4", stepNo: 4, title: "Chốt menu bán", content: "Test vị với khách khu vực, giữ lại món chạy nhất rồi mới mở rộng thêm topping hoặc size ly." },
    ],
  },
  {
    id: "combo-12-cong-thuc-tra-trai-cay-loc-phat",
    slug: "bo-12-cong-thuc-tra-trai-cay-loc-phat",
    title: "Bộ 12 công thức trà trái cây",
    shortDescription: "Bộ trà trái cây dùng trà nền Lộc Phát, hợp menu giải khát, quán trà sữa, cafe và xe bán mang đi.",
    description: "Tập trung nhóm món trà trái cây dễ bán, dễ xoay vị theo syrup và trái cây ngâm. Công thức chi tiết mở sau khi hồ sơ quán được duyệt.",
    categoryName: "Công thức trà trái cây",
    categorySlug: "cong-thuc-tra-trai-cay",
    relatedBrand: "Trà Lộc Phát",
    coverImageUrl: `${ASSET_BASE_URL}/cover-combo-12-cong-thuc-tra-trai-cay-loc-phat.jpg`,
    sourceConfidence: "content-plan",
    status: "active",
    sortOrder: 20,
    targetCustomers: ["Quán trà trái cây", "Quán cafe", "Quán bán mang đi"],
    menuItems: [
      "Trà đào cam sả",
      "Trà vải hoa hồng",
      "Trà chanh dây",
      "Trà tắc xí muội",
      "Trà dâu tây",
      "Trà xoài",
      "Trà ổi hồng",
      "Trà lựu đỏ",
      "Trà cam quế",
      "Trà táo xanh",
      "Trà kiwi",
      "Trà nhiệt đới mix",
    ],
    ingredients: [
      { id: "fruit-lp-tea", productId: "tra-loc-phat", productName: "Trà nền Lộc Phát", quantity: 150, unit: "ml", note: "Nền chính cho các món trà trái cây.", sortOrder: 10 },
      { id: "fruit-ona-tea", productId: "tra-ona", productName: "Trà ONA", quantity: 150, unit: "ml", note: "Có thể test làm nền thay thế theo gu quán.", optional: true, sortOrder: 20 },
      { id: "fruit-syrup", productId: "syrup-prince", productName: "Syrup trái cây", quantity: 25, unit: "ml", note: "Xoay vị theo món bán: vải, dâu, xoài, kiwi, lựu.", sortOrder: 30 },
      { id: "fruit-peach", productId: "dao-ngam-duong-prince", productName: "Trái cây ngâm", quantity: 30, unit: "g", note: "Topping và điểm nhấn cảm quan.", optional: true, sortOrder: 40 },
      { id: "fruit-3q", productId: "tran-chau-3q-sumi", productName: "Trân châu 3Q", quantity: 40, unit: "g", note: "Topping dai giòn cho nhóm trà trái cây.", optional: true, sortOrder: 50 },
    ],
    steps: [
      { id: "fruit-step-1", stepNo: 1, title: "Ủ trà nền", content: "Ủ trà nền theo mẻ, lọc xác trà và làm nguội trước khi pha." },
      { id: "fruit-step-2", stepNo: 2, title: "Chọn vị trái cây", content: "Chọn syrup/trái cây theo từng món, ưu tiên vị dễ bán trước như đào, vải, chanh dây, dâu." },
      { id: "fruit-step-3", stepNo: 3, title: "Lắc lạnh", content: "Cho trà, syrup, đá vào bình lắc. Lắc nhanh để vị hòa đều và giữ độ tươi." },
      { id: "fruit-step-4", stepNo: 4, title: "Ra ly", content: "Thêm topping/trái cây, hoàn thiện bằng lát cam, sả, trái cây hoặc topping theo concept quán." },
    ],
  },
  {
    id: "combo-10-cong-thuc-tra-sua-chuan-gu",
    slug: "combo-10-cong-thuc-tra-sua-chuan-gu",
    title: "Bộ 10 công thức trà sữa chuẩn gu",
    shortDescription: "Bộ trà sữa tham khảo cho quán cần menu nền, dễ mix topping và dễ tối ưu vị béo.",
    description: "Tập trung nhóm trà sữa nền và topping phổ biến. Công thức dùng để test menu, không xem là công thức tuyệt đối cho mọi khu vực.",
    categoryName: "Công thức trà sữa",
    categorySlug: "cong-thuc-tra-sua",
    relatedBrand: "",
    coverImageUrl: `${ASSET_BASE_URL}/cover-combo-10-cong-thuc-tra-sua-chuan-gu.jpg`,
    sourceConfidence: "content-plan",
    status: "active",
    sortOrder: 30,
    targetCustomers: ["Quán trà sữa", "Quán ăn vặt", "Quán cafe thêm menu béo sữa"],
    menuItems: [
      "Trà sữa truyền thống",
      "Trà sữa ô long",
      "Trà sữa thái xanh",
      "Trà sữa socola",
      "Trà sữa matcha",
      "Trà sữa caramel",
      "Trà sữa pudding",
      "Trà sữa trân châu đường đen",
      "Trà sữa dừa",
      "Trà sữa kem cheese",
    ],
    ingredients: [
      { id: "milk-tea-base", productId: "barismate-nguyen-lieu-tra-sua", productName: "Nguyên liệu trà sữa", quantity: 150, unit: "ml", note: "Dùng làm nền cho nhóm trà sữa.", sortOrder: 10 },
      { id: "milk-oolong", productId: "tra-oolong-sen", productName: "Trà Ôlong Sen", quantity: 150, unit: "ml", note: "Dùng cho món ô long hoặc menu mùa vụ.", optional: true, sortOrder: 20 },
      { id: "milk-powder", productId: "bot-sua-sawasdee-1kg", productName: "Bột sữa", quantity: 35, unit: "g", note: "Tạo độ béo và thân vị cho trà sữa.", sortOrder: 30 },
      { id: "milk-sumi", productId: "bot-sua-sumi", productName: "Bột sữa SUMI", quantity: 35, unit: "g", note: "Phương án test vị thay thế.", optional: true, sortOrder: 40 },
      { id: "milk-pearl", productId: "tran-chau-5s-dai-loan", productName: "Trân châu", quantity: 50, unit: "g", note: "Topping chủ lực.", optional: true, sortOrder: 50 },
      { id: "milk-pudding", productId: "bot-pudding-sumi", productName: "Pudding", quantity: 40, unit: "g", note: "Topping nâng bill.", optional: true, sortOrder: 60 },
      { id: "milk-coconut", productId: "nuoc-cot-dua-sumi", productName: "Nước cốt dừa", quantity: 20, unit: "ml", note: "Dùng cho nhóm trà sữa dừa.", optional: true, sortOrder: 70 },
    ],
    steps: [
      { id: "milk-step-1", stepNo: 1, title: "Nấu/ủ nền trà", content: "Chuẩn bị nền trà sữa theo mẻ để vị ổn định trong ca bán." },
      { id: "milk-step-2", stepNo: 2, title: "Phối bột sữa", content: "Hòa bột sữa khi nền còn đủ ấm hoặc theo quy trình quán để tránh vón." },
      { id: "milk-step-3", stepNo: 3, title: "Làm lạnh và ra ly", content: "Lắc với đá hoặc build trực tiếp theo menu quán." },
      { id: "milk-step-4", stepNo: 4, title: "Gắn topping", content: "Chọn topping chủ lực như trân châu, pudding, 3Q để tăng giá trị ly." },
    ],
  },
  {
    id: "combo-15-cong-thuc-tra-trai-cay",
    slug: "combo-15-cong-thuc-tra-trai-cay",
    title: "Combo 15 công thức trà trái cây",
    shortDescription: "Bộ mở rộng cho quán muốn tăng số lựa chọn trà trái cây theo mùa và theo nhóm vị dễ bán.",
    description: "Dành cho quán đã có menu cơ bản và muốn mở rộng dòng trà trái cây. Nên test từng nhóm vị trước khi nhập sâu.",
    categoryName: "Công thức trà trái cây",
    categorySlug: "cong-thuc-tra-trai-cay",
    relatedBrand: "",
    coverImageUrl: `${ASSET_BASE_URL}/cover-combo-15-cong-thuc-tra-trai-cay.jpg`,
    sourceConfidence: "content-plan",
    status: "active",
    sortOrder: 40,
    targetCustomers: ["Quán cần menu mùa hè", "Quán cafe", "Quán trà sữa muốn thêm dòng trái cây"],
    menuItems: [
      "Trà đào",
      "Trà vải",
      "Trà tắc",
      "Trà chanh",
      "Trà cam",
      "Trà chanh dây",
      "Trà dâu",
      "Trà xoài",
      "Trà kiwi",
      "Trà ổi",
      "Trà táo",
      "Trà lựu",
      "Trà nho",
      "Trà thơm",
      "Trà trái cây nhiệt đới",
    ],
    ingredients: [
      { id: "combo15-tea-ona", productId: "tra-ona", productName: "Trà ONA", quantity: 150, unit: "ml", note: "Nền trà tham khảo cho nhóm vị trái cây.", sortOrder: 10 },
      { id: "combo15-tea-lp", productId: "tra-loc-phat", productName: "Trà Lộc Phát", quantity: 150, unit: "ml", note: "Có thể dùng làm nền chính hoặc test song song.", optional: true, sortOrder: 20 },
      { id: "combo15-syrup", productId: "syrup-prince", productName: "Syrup PRINCE", quantity: 25, unit: "ml", note: "Xoay nhiều vị để mở rộng menu.", sortOrder: 30 },
      { id: "combo15-peach", productId: "dao-ngam-duong-prince", productName: "Trái cây ngâm", quantity: 30, unit: "g", note: "Dùng cho các món có topping trái cây.", optional: true, sortOrder: 40 },
      { id: "combo15-3q", productId: "tran-chau-3q-sumi", productName: "Trân châu 3Q", quantity: 40, unit: "g", note: "Topping dễ phối với trà trái cây.", optional: true, sortOrder: 50 },
    ],
    steps: [
      { id: "combo15-step-1", stepNo: 1, title: "Chia nhóm vị", content: "Chia menu thành nhóm chua thanh, ngọt thơm, nhiệt đới và signature để khách dễ chọn." },
      { id: "combo15-step-2", stepNo: 2, title: "Test nền trà", content: "Test cùng một vị syrup trên 2 nền trà để chọn gu hợp khu vực." },
      { id: "combo15-step-3", stepNo: 3, title: "Chạy menu thử", content: "Đưa 5-7 món bán thử trước, không mở toàn bộ nếu quán chưa có dữ liệu bán." },
      { id: "combo15-step-4", stepNo: 4, title: "Tối ưu nhập hàng", content: "Giữ lại nhóm vị bán chạy để tối ưu tồn kho syrup và topping." },
    ],
  },
  {
    id: "solution-tra-pha-may-2025",
    slug: "solution-tra-pha-may-2025",
    title: "Giải pháp trà pha máy 2025",
    shortDescription: "Ý tưởng menu trà pha máy cho quán muốn đi theo trend nhanh, thao tác gọn và dễ chuẩn hóa ca bán.",
    description: "Dòng giải pháp dùng để tư vấn quán cafe/trà sữa muốn có menu trà pha máy. Chi tiết kỹ thuật cần test theo máy và quy trình từng quán.",
    categoryName: "Combo mở quán",
    categorySlug: "combo-mo-quan",
    relatedBrand: "",
    coverImageUrl: `${ASSET_BASE_URL}/cover-solution-tra-pha-may-2025.jpg`,
    sourceConfidence: "content-plan",
    status: "active",
    sortOrder: 50,
    targetCustomers: ["Quán cafe", "Quán trà sữa có máy", "Quán muốn chuẩn hóa ca bán"],
    menuItems: [
      "Trà đào pha máy",
      "Trà vải pha máy",
      "Trà chanh dây pha máy",
      "Trà ô long sữa pha máy",
      "Trà sữa nền pha máy",
      "Trà trái cây sparkling",
      "Trà cold brew trái cây",
      "Trà cam quế",
      "Trà dâu kem cheese",
      "Trà nhiệt đới signature",
    ],
    ingredients: [
      { id: "machine-tea", productId: "tra-pha-may-2025", productName: "Trà pha máy 2025", quantity: 150, unit: "ml", note: "Nền chính cho concept trà pha máy.", sortOrder: 10 },
      { id: "machine-oolong", productId: "tra-oolong-sen", productName: "Trà Ôlong Sen", quantity: 150, unit: "ml", note: "Dùng cho nhóm ô long sữa và menu mùa vụ.", optional: true, sortOrder: 20 },
      { id: "machine-syrup", productId: "syrup-prince", productName: "Syrup trái cây", quantity: 25, unit: "ml", note: "Tạo vị nhanh cho ly pha máy.", sortOrder: 30 },
      { id: "machine-milk", productId: "barismate-nguyen-lieu-tra-sua", productName: "Nguyên liệu trà sữa", quantity: 35, unit: "g", note: "Dùng cho nhóm trà pha máy có sữa.", optional: true, sortOrder: 40 },
      { id: "machine-frappe", productId: "barismate-nguyen-lieu-da-xay", productName: "Nguyên liệu đá xay", quantity: 35, unit: "g", note: "Mở rộng sang nhóm đá xay/signature.", optional: true, sortOrder: 50 },
    ],
    steps: [
      { id: "machine-step-1", stepNo: 1, title: "Chốt quy trình máy", content: "Test tỷ lệ chiết xuất/nền trà theo thiết bị thực tế của quán." },
      { id: "machine-step-2", stepNo: 2, title: "Chuẩn hóa syrup", content: "Dùng cùng một nền trà, thay vị syrup để mở nhanh nhiều món." },
      { id: "machine-step-3", stepNo: 3, title: "Chuẩn hóa thao tác", content: "Thiết kế công thức theo số pump/ml dễ làm cho nhân viên ca bán." },
      { id: "machine-step-4", stepNo: 4, title: "Chọn món signature", content: "Giữ 2-3 món nổi bật để làm bảng đề xuất và upsell topping." },
    ],
  },
  {
    id: "combo-5-cong-thuc-uong-nong-noel",
    slug: "combo-5-cong-thuc-uong-nong-noel",
    title: "5 công thức uống nóng Noel",
    shortDescription: "Bộ món nóng mùa vụ cho quán muốn làm menu Noel, mùa lạnh hoặc chương trình bán theo dịp.",
    description: "Nội dung mùa vụ, ưu tiên làm sau các bộ công thức doanh thu chính. Có thể dùng làm campaign cuối năm.",
    categoryName: "Công thức đồ uống nóng",
    categorySlug: "cong-thuc-do-uong-nong",
    relatedBrand: "",
    coverImageUrl: `${ASSET_BASE_URL}/cover-combo-5-cong-thuc-uong-nong-noel.jpg`,
    sourceConfidence: "content-plan",
    status: "active",
    sortOrder: 60,
    targetCustomers: ["Quán cafe", "Quán trà sữa mùa vụ", "Quán bán dịp Noel"],
    menuItems: [
      "Cacao nóng marshmallow",
      "Trà sữa nóng caramel",
      "Matcha latte nóng",
      "Sữa dừa nóng",
      "Trà cam quế nóng",
    ],
    ingredients: [
      { id: "noel-milk", productId: "bot-sua-sawasdee-1kg", productName: "Bột sữa", quantity: 35, unit: "g", note: "Nền béo cho nhóm uống nóng.", sortOrder: 10 },
      { id: "noel-coconut", productId: "nuoc-cot-dua-sumi", productName: "Nước cốt dừa", quantity: 25, unit: "ml", note: "Dùng cho sữa dừa nóng hoặc món béo thơm.", optional: true, sortOrder: 20 },
      { id: "noel-oolong", productId: "tra-oolong-sen", productName: "Trà Ôlong Sen", quantity: 150, unit: "ml", note: "Nền trà cho nhóm trà nóng.", optional: true, sortOrder: 30 },
      { id: "noel-syrup", productId: "syrup-prince", productName: "Syrup", quantity: 20, unit: "ml", note: "Tạo vị caramel/trái cây/quế tùy menu.", optional: true, sortOrder: 40 },
    ],
    steps: [
      { id: "noel-step-1", stepNo: 1, title: "Chọn món mùa vụ", content: "Chọn tối đa 3 món nóng để chạy campaign, tránh mở menu quá rộng." },
      { id: "noel-step-2", stepNo: 2, title: "Chuẩn bị nền nóng", content: "Chuẩn bị nền sữa/trà nóng ổn định, kiểm soát nhiệt để không tách vị." },
      { id: "noel-step-3", stepNo: 3, title: "Trang trí", content: "Dùng topping, bột rắc hoặc decor theo mùa để tăng cảm quan." },
      { id: "noel-step-4", stepNo: 4, title: "Chạy theo dịp", content: "Chỉ nhập sâu nguyên liệu sau khi có phản hồi bán thử." },
    ],
  },
];

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLimit(limit: number | null | undefined): number | null {
  if (!limit || Number.isNaN(limit)) return null;
  return Math.min(Math.max(Math.floor(limit), 1), 120);
}

function matchesSearch(recipe: RecipeOffer, q: string): boolean {
  const needle = normalizeSearchText(q);
  if (!needle) return true;

  const haystack = normalizeSearchText([
    recipe.title,
    recipe.shortDescription,
    recipe.description,
    recipe.categoryName,
    recipe.categorySlug,
    recipe.relatedBrand,
    ...recipe.targetCustomers,
    ...recipe.menuItems,
    ...recipe.ingredients.map((ingredient) => ingredient.productName),
  ].join(" "));

  return haystack.includes(needle);
}

function countMappedProducts(recipe: RecipeOffer): number {
  return recipe.ingredients.filter((ingredient) => ingredient.productId && getCatalogProductById(ingredient.productId)).length;
}

function toIngredientProduct(product: PublicProduct, approved: boolean): IngredientProduct {
  return {
    id: product.id,
    sku: "",
    slug: product.slug,
    name: product.name,
    brand: product.brand === "Đang cập nhật" ? "" : product.brand,
    unit: product.unitLabel === "Đang cập nhật" ? "sản phẩm" : product.unitLabel,
    imageUrl: product.imageUrl || "",
    minOrderQty: 1,
    categoryName: product.categoryName,
    categorySlug: product.categoryId,
    price: null,
    publicPriceHint: approved ? null : "Giá sỉ sau duyệt",
  };
}

export function isRecipeApprovedForFrontendCatalogPhase(): boolean {
  return false;
}

export function listRecipeOffers(query: ListRecipeOffersQuery = {}) {
  const limit = normalizeLimit(query.limit);
  const brandFilter = query.brand?.trim();

  let recipes = recipeOffers
    .filter((recipe) => recipe.status === "active")
    .filter((recipe) => {
      if (query.category && query.category !== "all" && recipe.categorySlug !== query.category) return false;
      if (brandFilter && brandFilter !== "all" && recipe.relatedBrand !== brandFilter) return false;
      if (query.q && !matchesSearch(recipe, query.q)) return false;
      return true;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const total = recipes.length;
  if (limit !== null) recipes = recipes.slice(0, limit);

  return {
    total,
    recipes: recipes.map((recipe) => ({
      id: recipe.id,
      slug: recipe.slug,
      title: recipe.title,
      shortDescription: recipe.shortDescription,
      description: recipe.description,
      relatedBrand: recipe.relatedBrand,
      coverImageUrl: recipe.coverImageUrl,
      sourceConfidence: recipe.sourceConfidence,
      status: recipe.status,
      categoryName: recipe.categoryName,
      categorySlug: recipe.categorySlug,
      ingredientCount: recipe.ingredients.length,
      mappedProductCount: countMappedProducts(recipe),
      isLocked: true,
      lockReason: LOCK_REASON,
    })),
  };
}

export function getRecipeOfferBySlug(slug: string) {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) return null;
  return recipeOffers.find((recipe) => recipe.slug === normalizedSlug && recipe.status === "active") ?? null;
}

export function getRecipeOfferDetailBySlug(slug: string, approved: boolean) {
  const recipe = getRecipeOfferBySlug(slug);
  if (!recipe) return null;

  return {
    id: recipe.id,
    slug: recipe.slug,
    title: recipe.title,
    shortDescription: recipe.shortDescription,
    description: `${recipe.description}\n\nMón trong bộ: ${recipe.menuItems.join(", ")}.`,
    relatedBrand: recipe.relatedBrand,
    coverImageUrl: recipe.coverImageUrl,
    sourceConfidence: recipe.sourceConfidence,
    status: recipe.status,
    categoryName: recipe.categoryName,
    categorySlug: recipe.categorySlug,
    isLocked: !approved,
    lockReason: approved ? null : LOCK_REASON,
    ingredients: recipe.ingredients.map((ingredient) => {
      const product = ingredient.productId ? getCatalogProductById(ingredient.productId) : null;

      return {
        id: ingredient.id,
        productId: product ? product.id : null,
        productName: product?.name || ingredient.productName,
        quantity: approved ? ingredient.quantity : null,
        unit: approved ? ingredient.unit : "",
        note: approved ? ingredient.note : "Định lượng mở sau khi hồ sơ quán được duyệt.",
        optional: Boolean(ingredient.optional),
        sortOrder: ingredient.sortOrder,
        product: product ? toIngredientProduct(product, approved) : null,
      };
    }),
    steps: approved ? recipe.steps.map((step) => ({
      id: step.id,
      stepNo: step.stepNo,
      title: step.title,
      content: step.content,
      imageUrl: step.imageUrl || "",
    })) : [],
  };
}
