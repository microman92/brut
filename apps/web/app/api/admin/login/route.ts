import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const api = process.env.API_URL ?? "http://127.0.0.1:4000";

export async function POST(request: Request) {
  const response = await fetch(`${api}/api/v1/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await request.text(),
  });
  const payload = await response.json().catch(() => ({})) as { token?: string; error?: { message?: string } };
  if (!response.ok || !payload.token) {
    return NextResponse.json({ error: payload.error ?? { message: "Неверный логин или пароль" } }, { status: response.status });
  }
  const jar = await cookies();
  jar.set("brut_admin", payload.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
    secure: process.env.NODE_ENV === "production",
  });
  return NextResponse.json({ ok: true });
}
