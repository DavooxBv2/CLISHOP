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
// Backend selection: keytar → file
// ---------------------------------------------------------------------------

const SERVICE_NAME = "clishop";
const ACCOUNT_TOKEN = "auth-token";
const ACCOUNT_REFRESH = "refresh-token";
const ACCOUNT_USER = "user-info";

export type AuthBackend = "keytar" | "file";
let _activeBackend: AuthBackend | null = null;

export function resolveBackend(): AuthBackend {
  if (_activeBackend) return _activeBackend;

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
  if (backend === "keytar") {
    return getKeytar()!.setPassword(SERVICE_NAME, account, value);
  }
  fileSetPassword(SERVICE_NAME, account, value);
}

async function getPassword(account: string): Promise<string | null> {
  const backend = resolveBackend();
  if (backend === "keytar") {
    return getKeytar()!.getPassword(SERVICE_NAME, account);
  }
  return fileGetPassword(SERVICE_NAME, account);
}

async function deletePassword(account: string): Promise<void> {
  const backend = resolveBackend();
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

export async function storeAuthFromSetup(data: {
  token: string;
  refreshToken: string;
  user: UserInfo;
}): Promise<void> {
  await storeToken(data.token);
  await storeRefreshToken(data.refreshToken);
  await storeUserInfo(data.user);
}

// ---------------------------------------------------------------------------
// Passwordless setup flow
// ---------------------------------------------------------------------------

export interface SetupLinkResult {
  setupUrl: string;
  deviceCode: string;
  userCode: string;
  expiresIn: number;
  pollInterval: number;
}

export interface DevicePollResult {
  status: "pending" | "complete" | "expired";
  token?: string;
  refreshToken?: string;
  user?: UserInfo;
}

/** Call POST /auth/setup-link to create an account + Stripe setup link. */
export async function requestSetupLink(email: string): Promise<SetupLinkResult> {
  const baseUrl = getApiBaseUrl();
  const res = await axios.post(`${baseUrl}/auth/setup-link`, { email });
  return res.data as SetupLinkResult;
}

/** Poll POST /auth/device/poll until setup is complete, expired, or times out. */
export async function pollDeviceCode(
  deviceCode: string,
  { interval = 5000, timeout = 30 * 60 * 1000 } = {}
): Promise<DevicePollResult> {
  const baseUrl = getApiBaseUrl();
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const res = await axios.post(`${baseUrl}/auth/device/poll`, { deviceCode });
    const data = res.data as DevicePollResult;

    if (data.status === "complete" && data.token && data.user) {
      await storeToken(data.token);
      if (data.refreshToken) await storeRefreshToken(data.refreshToken);
      await storeUserInfo(data.user);
      return data;
    }

    if (data.status === "expired") {
      return data;
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  return { status: "expired" };
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
