export const weekdays = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

export async function adminSend(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`/api/admin/${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
  if (response.status === 401) {
    location.href = "/admin/login";
    throw new Error("Нужен вход");
  }
  if (!response.ok) throw new Error(body.error?.message ?? "Не удалось сохранить");
  return body;
}

export async function uploadImage(file: File) {
  const data = new FormData();
  data.set("file", file);
  const response = await fetch("/api/admin/upload", { method: "POST", body: data });
  const body = await response.json().catch(() => ({})) as { url?: string; error?: { message?: string } };
  if (!response.ok || !body.url) throw new Error(body.error?.message ?? "Фото не загрузилось");
  return body.url;
}
