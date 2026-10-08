import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

if (process.env.VERCEL !== "1") {
  const envFile = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env");
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.length >= 2 && (value.startsWith('"') || value.startsWith("'")) && value.at(-1) === value[0]) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export const prisma = new PrismaClient();
