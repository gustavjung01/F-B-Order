import { NextResponse } from "next/server";

function retired() {
  return NextResponse.json(
    { error: "ADMIN_API_MOVED", message: "Use the authenticated backend admin API." },
    { status: 410 },
  );
}

export const GET = retired;
export const POST = retired;
export const PATCH = retired;
export const DELETE = retired;
