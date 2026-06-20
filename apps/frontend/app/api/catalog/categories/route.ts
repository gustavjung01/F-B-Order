import { NextResponse } from "next/server";
import { listCatalogCategories } from "@/data/catalog/catalog-service";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json({
    categories: listCatalogCategories(),
  });
}
