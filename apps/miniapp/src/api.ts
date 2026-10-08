import { initData } from "./telegram";

const api = import.meta.env.VITE_API_URL ?? "";

export function apiFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type") && init?.body) headers.set("content-type", "application/json");
  if (initData) headers.set("authorization", `tma ${initData}`);
  return fetch(`${api}${path}`, { ...init, headers });
}

export async function readError(response: Response) {
  const body = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string } };
  if (body.error?.code === "SLOT_TAKEN") return "Это время уже занято.";
  return body.error?.message ?? "Не удалось выполнить запрос.";
}
