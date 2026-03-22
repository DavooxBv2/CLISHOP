import { createRequire } from "node:module";
import axios from "axios";
import { getApiBaseUrl } from "./config.js";
import {
  fileSetPassword,
  fileGetPassword,
  fileDeletePassword,
} from "./auth-file-store.js";

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Lazy keytar loader — avoids crashing the entire CLI when libsecret is
// missing on Linux/WSL.
// ---------------------------------------------------------------------------

let _keytar: typeof import("keytar") | null = null;
let _keytarChecked = false;

function getKeytar(): typeof import("keytar") | null {
  if (_keytarChecked) return _keytar;
  _keytarChecked = true;
  try {
    _keytar = require("keytar");
  } catch {
    _keytar = null;
  }
  return _keytar;
}

// ---------------------------------------------------------------------------
// Backend selection: env → keytar → file
// ---------------------------------------------------------------------------

const SERVICE_NAME = "clishop";
const ACCOUNT_TOKEN = "auth-token";
const ACCOUNT_REFRESH = "refresh-token";
const ACCOUNT_USER = "user-info";

export type AuthBackend = "keytar" | "file" | "env";
let _activeBackend: AuthBackend | null = null;

export function resolveBackend(): AuthBackend {
  if (_activeBackend) return _activeBackend;

  if (process.env.CLISHOP_TOKEN) {
    _activeBackend = "env";
    return _activeBackend;
  }

  const kt = getKeytar();
  if (kt) {
    _activeBackend = "keytar";
    return _activeBackend;
  }

  if (!process.env.CLISHOP_QUIET) {
    console.warn(
      "[clishop] Secure keychain unavailable — using file-based token storage " +
        "(~/.config/clishop/auth.json).\n" +
        "          To enable keychain on Ubuntu/WSL: sudo apt install libsecret-1-0\n"
    );
  }
  _activeBackend = "file";
  return _activeBackend;
}

/** Exposed for the `doctor` command. */
export function isKeytarAvailable(): boolean {
  return getKeytar() !== null;
}

// ---------------------------------------------------------------------------
// Low-level credential operations
// ---------------------------------------------------------------------------

async function setPassword(account: string, value: string): Promise<void> {
  const backend = resolveBackend();
  if (backend === "env") return; // env mode is read-only
  if (backend === "keytar") {
    return getKeytar()!.setPassword(SERVICE_NAME, account, value);
  }
  fileSetPassword(SERVICE_NAME, account, value);
}

async function getPassword(account: string): Promise<string | null> {
  const backend = resolveBackend();
  if (backend === "env" && account === ACCOUNT_TOKEN) {
    return process.env.CLISHOP_TOKEN!;
  }
  if (backend === "keytar") {
    return getKeytar()!.getPassword(SERVICE_NAME, account);
  }
  return fileGetPassword(SERVICE_NAME, account);
}

async function deletePassword(account: string): Promise<void> {
  const backend = resolveBackend();
  if (backend === "env") return;
  if (backend === "keytar") {
    await getKeytar()!.deletePassword(SERVICE_NAME, account);
    return;
  }
  fileDeletePassword(SERVICE_NAME, account);
}

// ---------------------------------------------------------------------------
// Public credential API (signatures unchanged)
// ---------------------------------------------------------------------------

export interface UserInfo {
  id: string;
  email: string;
  name: string;
}

interface AuthResponse {
  token: string;
  refreshToken?: string;
  user: UserInfo;
}

function assertAuthResponse(data: unknown): AuthResponse {
  const payload = data as Partial<AuthResponse>;
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid auth response from server.");
  }
  if (!payload.token || typeof payload.token !== "string") {
    throw new Error("Auth response missing access token.");
  }
  if (payload.refreshToken !== undefined && typeof payload.refreshToken !== "string") {
    throw new Error("Auth response has an invalid refresh token.");
  }
  if (!payload.user || typeof payload.user !== "object") {
    throw new Error("Auth response missing user profile.");
  }
  if (!payload.user.id || !payload.user.email || !payload.user.name) {
    throw new Error("Auth response user profile is incomplete.");
  }
  return payload as AuthResponse;
}

export async function storeToken(token: string): Promise<void> {
  await setPassword(ACCOUNT_TOKEN, token);
}

export async function storeRefreshToken(token: string): Promise<void> {
  await setPassword(ACCOUNT_REFRESH, token);
}

export async function storeUserInfo(user: UserInfo): Promise<void> {
  await setPassword(ACCOUNT_USER, JSON.stringify(user));
}

export async function getToken(): Promise<string | null> {
  return getPassword(ACCOUNT_TOKEN);
}

export async function getRefreshToken(): Promise<string | null> {
  return getPassword(ACCOUNT_REFRESH);
}

export async function getUserInfo(): Promise<UserInfo | null> {
  const raw = await getPassword(ACCOUNT_USER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserInfo;
  } catch {
    return null;
  }
}

export async function clearAuth(): Promise<void> {
  await deletePassword(ACCOUNT_TOKEN);
  await deletePassword(ACCOUNT_REFRESH);
  await deletePassword(ACCOUNT_USER);
}

export async function isLoggedIn(): Promise<boolean> {
  return !!(await getToken());
}

// ---------------------------------------------------------------------------
// Auth actions
// ---------------------------------------------------------------------------

export async function login(email: string, password: string): Promise<UserInfo> {
  const baseUrl = getApiBaseUrl();

  const res = await axios.post(`${baseUrl}/auth/login`, { email, password });
  const { token, refreshToken, user } = assertAuthResponse(res.data);

  await storeToken(token);
  if (refreshToken) await storeRefreshToken(refreshToken);
  await storeUserInfo(user);

  return user;
}

export async function register(
  email: string,
  password: string,
  name: string,
  monthlySpendingLimitInCents?: number
): Promise<UserInfo> {
  const baseUrl = getApiBaseUrl();

  const body: Record<string, unknown> = { email, password, name };
  if (monthlySpendingLimitInCents !== undefined) {
    body.monthlySpendingLimitInCents = monthlySpendingLimitInCents;
  }

  const res = await axios.post(`${baseUrl}/auth/register`, body);
  const { token, refreshToken, user } = assertAuthResponse(res.data);

  await storeToken(token);
  if (refreshToken) await storeRefreshToken(refreshToken);
  await storeUserInfo(user);

  return user;
}

export async function logout(): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const token = await getToken();

  if (token) {
    try {
      await axios.post(`${baseUrl}/auth/logout`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Server might be unreachable — that's fine, we clear locally anyway
    }
  }

  await clearAuth();
}
