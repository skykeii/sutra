import { readFileSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";
import { ROOT } from "../lib/run";
import { demoCookie } from "../lib/session";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const state = { failures: 0 };

export function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✔" : "✖"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) state.failures += 1;
}

const cookies = new Map<string, string>();
async function as(handle: string) {
  if (!cookies.has(handle)) cookies.set(handle, await demoCookie(handle));
  return cookies.get(handle)!;
}

export interface CallResult {
  status: number;
  json: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  text: string;
  type: string;
  bytes: number;
  headers: Headers;
}

export async function call(handle: string | null, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<CallResult> {
  const headers: Record<string, string> = { ...extraHeaders };
  if (handle) headers.cookie = await as(handle);
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, { method: body !== undefined ? "POST" : "GET", headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
  const type = res.headers.get("content-type") ?? "";
  const isText = type.includes("json") || type.includes("html") || type.includes("csv");
  const text = isText ? await res.text() : "";
  const bytes = isText ? text.length : (await res.arrayBuffer()).byteLength;
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, type, bytes, headers: res.headers };
}

export const csvRows = (file: string) => Papa.parse<Record<string, string>>(readFileSync(join(ROOT, "demo-files", file), "utf8"), { header: true, skipEmptyLines: "greedy" }).data;

export async function pages(handle: string | null, paths: string[]) {
  for (const path of paths) {
    const r = await call(handle, path);
    const crashed = /Application error|Internal Server Error|This page could not load/.test(r.text);
    check(`${handle ?? "public"} GET ${path}`, r.status === 200 && !crashed, r.status === 200 ? (crashed ? "error page" : "") : `status ${r.status}`);
  }
}
