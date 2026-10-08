import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const jar = await cookies();
  jar.delete("brut_admin");
  return NextResponse.redirect(new URL("/admin/login", request.url), 303);
}
