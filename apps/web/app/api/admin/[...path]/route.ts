import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const api = process.env.API_URL ?? "http://127.0.0.1:4000";

async function proxy(request: Request, path: string[]) {
  const token = (await cookies()).get("brut_admin")?.value;
  const url = new URL(request.url);
  const target = `${api}/api/v1/admin/${path.join("/")}${url.search}`;
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (request.headers.get("content-type")) headers.set("content-type", request.headers.get("content-type")!);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const response = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.text() : undefined,
    cache: "no-store",
  });
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
  });
}

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: Context) {
  return proxy(request, (await context.params).path);
}

export async function POST(request: Request, context: Context) {
  return proxy(request, (await context.params).path);
}

export async function PATCH(request: Request, context: Context) {
  return proxy(request, (await context.params).path);
}

export async function PUT(request: Request, context: Context) {
  return proxy(request, (await context.params).path);
}

export async function DELETE(request: Request, context: Context) {
  return proxy(request, (await context.params).path);
}
