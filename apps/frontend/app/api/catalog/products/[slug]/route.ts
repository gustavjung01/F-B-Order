import { NextRequest, NextResponse } from "next/server";
import { getCatalogProductBySlug } from "@/data/catalog/catalog-service";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: {
    slug: string;
  };
};

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const product = getCatalogProductBySlug(params.slug);

  if (!product) {
    return NextResponse.json(
      {
        error: "PRODUCT_NOT_FOUND",
        message: "Không tìm thấy sản phẩm.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ product });
}
