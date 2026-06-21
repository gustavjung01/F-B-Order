import { NextRequest, NextResponse } from "next/server";
import type { PublicProduct } from "@/data/catalog/product-model";
import { getBackendApiUrl } from "@/lib/backend-api";

export const dynamic = "force-dynamic";

type ProductsResponse = {
  products: PublicProduct[];
  total: number;
};

function getOptionalParam(request: NextRequest, key: string) {
  const value = request.nextUrl.searchParams.get(key);
  return value && value.trim() ? value.trim() : null;
}

function toLegacyProduct(product: PublicProduct) {
  const unit = product.unitLabel === "Đang cập nhật" ? "" : product.unitLabel;
  const packageSize = product.packageSizeLabel === "Đang cập nhật" ? "" : product.packageSizeLabel;
  const brand = product.brand === "Đang cập nhật" ? "" : product.brand;

  return {
    id: product.id,
    sku: "",
    slug: product.slug,
    name: product.name,
    brand,
    description: product.shortDescription || "",
    shortDescription: product.shortDescription || "",
    unit,
    packageSpec: packageSize,
    packageSize,
    imageUrl: product.imageUrl || "",
    minOrderQty: 1,
    categoryName: product.categoryName,
    categorySlug: product.categoryId,
    subcategoryName: product.subcategoryName || "",
    subcategorySlug: product.subcategoryId || "",
    price: null,
    publicPriceHint: product.priceLabel,
  };
}

export async function GET(request: NextRequest) {
  try {
    const params = new URLSearchParams();
    const category = getOptionalParam(request, "category");
    const subcategory = getOptionalParam(request, "subcategory");
    const search = getOptionalParam(request, "q") || getOptionalParam(request, "search");
    const limit = getOptionalParam(request, "limit");

    if (category && category !== "all") params.set("categoryId", category);
    if (subcategory && subcategory !== "all") params.set("subcategoryId", subcategory);
    if (search) params.set("q", search);
    if (limit) params.set("limit", limit);

    const query = params.toString();
    const response = await fetch(
      getBackendApiUrl(query ? `/api/catalog/products?${query}` : "/api/catalog/products"),
      { cache: "no-store", headers: { accept: "application/json" } },
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "BACKEND_CATALOG_UNAVAILABLE" },
        { status: response.status },
      );
    }

    const result = (await response.json()) as ProductsResponse;
    return NextResponse.json({
      approved: false,
      products: Array.isArray(result.products) ? result.products.map(toLegacyProduct) : [],
    });
  } catch (error) {
    console.error("legacy products proxy failed", error);
    return NextResponse.json(
      { error: "BACKEND_CATALOG_UNAVAILABLE" },
      { status: 503 },
    );
  }
}
