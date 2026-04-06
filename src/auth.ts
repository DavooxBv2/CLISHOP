import { createRequire } from "node:module";
import axios from "axios";
import { getApiBaseUrl } from "./config.js";
import {
  fileSetPassword,
  fileGetPassword,
  fileDeletePassword,
} from "./auth-file-store.js";

const require = createRequire(
  typeof __filename !== "undefined" ? __filename : import.meta.url,
);

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
  ok?: boolean;
  setupUrl?: string;
  setupId?: string;
  deviceCode?: string;
  userCode?: string;
  expiresIn?: number;
  expiresAt?: string;
  pollInterval?: number;
  completed?: boolean;
  accountId?: string;
  humanMessage?: string;
  token?: string;
  refreshToken?: string;
  user?: UserInfo;
}

export interface DevicePollResult {
  status: "pending" | "complete" | "expired";
  token?: string;
  refreshToken?: string;
  user?: UserInfo;
}

export type SetupLifecycleStatus =
  | "pending_user_action"
  | "processing"
  | "completed"
  | "failed"
  | "expired"
  | "cancelled";

export interface SetupErrorPayload {
  code: string;
  message: string;
  setup_id?: string;
  setup_url?: string;
}

export interface SetupStartResult {
  ok: boolean;
  setup_id: string;
  status: "pending_user_action" | "completed";
  next_action: "open_setup_url" | "search_products";
  setup_url?: string;
  expires_at?: string;
  poll_after_seconds?: number;
  account_id?: string;
  human_message: string;
}

export interface SetupStatusResult {
  ok: boolean;
  setup_id?: string;
  status?: SetupLifecycleStatus;
  account_id?: string;
  expires_at?: string;
  poll_after_seconds?: number;
  error?: SetupErrorPayload;
}

export interface SetupClaimResult extends SetupStatusResult {
  token?: string;
  refreshToken?: string;
  user?: UserInfo;
}

async function postSetupRequest<T>(path: string, body: unknown): Promise<T> {
  const baseUrl = getApiBaseUrl();

  try {
    const res = await axios.post(`${baseUrl}${path}`, body);
    return res.data as T;
  } catch (error: any) {
    if (error?.response?.data) {
      return error.response.data as T;
    }
    throw error;
  }
}

export async function startSetupSession(email: string): Promise<SetupStartResult> {
  const data = await postSetupRequest<SetupLinkResult>("/auth/setup-link", { email });

  const setupId = data.setupId || data.deviceCode || data.user?.id;

  if (data.token && data.refreshToken && data.user && setupId) {
    await storeAuthFromSetup({
      token: data.token,
      refreshToken: data.refreshToken,
      user: data.user,
    });

    return {
      ok: true,
      setup_id: setupId,
      status: "completed",
      next_action: "search_products",
      expires_at: data.expiresAt,
      poll_after_seconds: 0,
      account_id: data.accountId || data.user.id,
      human_message:
        data.humanMessage ||
        "Account ready. Search now, then add address and payment when you are ready to buy.",
    };
  }

  if (!data.setupUrl || !setupId || !data.expiresIn || !data.pollInterval) {
    throw new Error((data as any)?.message || "Failed to create setup session.");
  }

  const expiresAt = data.expiresAt || new Date(Date.now() + data.expiresIn * 1000).toISOString();

  return {
    ok: true,
    setup_id: setupId,
    status: "pending_user_action",
    next_action: "open_setup_url",
    setup_url: data.setupUrl,
    expires_at: expiresAt,
    poll_after_seconds: data.pollInterval,
    human_message: "Open this link to securely connect your payment method.",
  };
}

export async function getSetupStatus(setupId: string): Promise<SetupStatusResult> {
  return postSetupRequest<SetupStatusResult>("/auth/setup/status", { setupId });
}

export async function cancelSetupSession(setupId: string): Promise<SetupStatusResult> {
  return postSetupRequest<SetupStatusResult>("/auth/setup/cancel", { setupId });
}

export async function claimSetupSession(
  setupId: string,
  { storeAuth = true } = {},
): Promise<SetupClaimResult> {
  const data = await postSetupRequest<SetupClaimResult>("/auth/setup/claim", { setupId });

  if (storeAuth && data.ok && data.token && data.refreshToken && data.user) {
    await storeAuthFromSetup({
      token: data.token,
      refreshToken: data.refreshToken,
      user: data.user,
    });
  }

  return data;
}

export async function waitForSetupSession(
  setupId: string,
  { timeout = 300_000 } = {},
): Promise<SetupStatusResult | SetupClaimResult> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const status = await getSetupStatus(setupId);

    if (status.status === "completed") {
      return claimSetupSession(setupId);
    }

    if (
      status.status === "expired" ||
      status.status === "cancelled" ||
      status.status === "failed"
    ) {
      return status;
    }

    const waitMs = Math.max(1, status.poll_after_seconds || 5) * 1000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  return {
    ok: false,
    setup_id: setupId,
    status: "pending_user_action",
    error: {
      code: "human_action_required",
      message: "Timed out waiting for payment setup to complete.",
    },
  };
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
