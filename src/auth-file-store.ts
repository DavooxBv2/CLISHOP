import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CONFIG_DIR = join(homedir(), ".config", "clishop");
const AUTH_FILE = join(CONFIG_DIR, "auth.json");

interface AuthData {
  [key: string]: string;
}

function ensureDir(): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

function readStore(): AuthData {
  try {
    return JSON.parse(readFileSync(AUTH_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeStore(data: AuthData): void {
  ensureDir();
  writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
  try {
    chmodSync(AUTH_FILE, 0o600);
  } catch {
    // chmod may not work on Windows — that's okay
  }
}

export function fileSetPassword(
  service: string,
  account: string,
  password: string
): void {
  const store = readStore();
  store[`${service}:${account}`] = password;
  writeStore(store);
}

export function fileGetPassword(
  service: string,
  account: string
): string | null {
  const store = readStore();
  return store[`${service}:${account}`] ?? null;
}

export function fileDeletePassword(
  service: string,
  account: string
): void {
  const store = readStore();
  delete store[`${service}:${account}`];
  writeStore(store);
}
