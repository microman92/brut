import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const api = process.env.API_URL ?? "http://127.0.0.1:4000";
const bucket = "barber-images";

function extension(bytes: Buffer) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return ".jpg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return ".png";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return ".webp";
  return "";
}

export async function POST(request: Request) {
  const token = (await cookies()).get("brut_admin")?.value;
  const me = await fetch(`${api}/api/v1/admin/me`, { headers: token ? { authorization: `Bearer ${token}` } : {}, cache: "no-store" });
  if (!me.ok) return NextResponse.json({ error: { message: "Нужен вход" } }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: { message: "Файл не выбран" } }, { status: 400 });
  if (file.size > 4_000_000) return NextResponse.json({ error: { message: "Фото больше 4 МБ" } }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = extension(bytes);
  if (!ext) return NextResponse.json({ error: { message: "Нужен JPG, PNG или WebP" } }, { status: 400 });
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: { message: "Хранилище фотографий не настроено" } }, { status: 503 });
  }

  const name = `${randomBytes(8).toString("hex")}${ext}`;
  const contentType = ext === ".jpg" ? "image/jpeg" : ext === ".png" ? "image/png" : "image/webp";
  const objectPath = `barbers/${name}`;
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  const uploaded = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "content-type": contentType,
    },
    body,
    cache: "no-store",
  });
  if (!uploaded.ok) {
    console.error("Photo upload failed:", uploaded.status);
    return NextResponse.json({ error: { message: "Не удалось сохранить фотографию" } }, { status: 502 });
  }

  return NextResponse.json({ url: `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}` });
}
