import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      error: "CATALOG_API_MOVED",
      message: "Use /api/catalog/products so the frontend receives the backend pricing contract.",
    },
    { status: 410 },
  );
}
