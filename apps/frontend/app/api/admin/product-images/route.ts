import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function movedResponse() {
  return NextResponse.json(
    {
      error: "ADMIN_PRODUCT_IMAGES_API_MOVED",
      message: "Product image updates must use the authenticated backend admin API.",
    },
    { status: 410 },
  );
}

export function GET() {
  return movedResponse();
}

export function POST() {
  return movedResponse();
}
