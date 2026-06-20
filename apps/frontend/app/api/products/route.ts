import { NextRequest, NextResponse } from "next/server";
import { listCatalogProducts } from "@/data/catalog/catalog-service";
import type { PublicProduct } from "@/data/catalog/product-model";

export const dynamic = "force-dynamic";

function getOptionalParam(request: NextRequest, key: string) {
  const value = request.nextUrl.searchParams.get(key);
  return value && value.trim() ? value.trim() : null;
}

function getLimit(request: NextRequest) {
  const value = getOptionalParam(request, "limit");
  if (!value) return null;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
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
  const category = getOptionalParam(request, "category");
  const subcategory = getOptionalParam(request, "subcategory");
  const productType = getOptionalParam(request, "productType");
  const search = getOptionalParam(request, "q") || getOptionalParam(request, "search");
  const limit = getLimit(request);

  const result = listCatalogProducts({
    categoryId: category && category !== "all" ? category : null,
    subcategoryId: subcategory && subcategory !== "all" ? subcategory : null,
    productType,
    q: search,
    limit,
  });

  return NextResponse.json({
    approved: false,
    filters: {
      category: category || null,
      subcategory: subcategory || null,
      brand: getOptionalParam(request, "brand"),
      productType: productType || null,
      search: search || null,
      limit,
    },
    products: result.products.map(toLegacyProduct),
  });
}
