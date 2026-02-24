import keytar from "keytar";
import axios from "axios";
import { getApiBaseUrl } from "./config.js";

const SERVICE_NAME = "clishop";
const ACCOUNT_TOKEN = "auth-token";
const ACCOUNT_REFRESH = "refresh-token";
const ACCOUNT_USER = "user-info";

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

/**
 * Store auth token securely in the OS keychain.
 */
export async function storeToken(token: string): Promise<void> {
  await keytar.setPassword(SERVICE_NAME, ACCOUNT_TOKEN, token);
}

export async function storeRefreshToken(token: string): Promise<void> {
  await keytar.setPassword(SERVICE_NAME, ACCOUNT_REFRESH, token);
}

export async function storeUserInfo(user: UserInfo): Promise<void> {
  await keytar.setPassword(SERVICE_NAME, ACCOUNT_USER, JSON.stringify(user));
}

export async function getToken(): Promise<string | null> {
  return keytar.getPassword(SERVICE_NAME, ACCOUNT_TOKEN);
}

export async function getRefreshToken(): Promise<string | null> {
  return keytar.getPassword(SERVICE_NAME, ACCOUNT_REFRESH);
}

export async function getUserInfo(): Promise<UserInfo | null> {
  const raw = await keytar.getPassword(SERVICE_NAME, ACCOUNT_USER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserInfo;
  } catch {
    return null;
  }
}

export async function clearAuth(): Promise<void> {
  await keytar.deletePassword(SERVICE_NAME, ACCOUNT_TOKEN);
  await keytar.deletePassword(SERVICE_NAME, ACCOUNT_REFRESH);
  await keytar.deletePassword(SERVICE_NAME, ACCOUNT_USER);
}

export async function isLoggedIn(): Promise<boolean> {
  const token = await getToken();
  return !!token;
}

/**
 * Login with email + password.
 * Returns the user info on success.
 */
export async function login(email: string, password: string): Promise<UserInfo> {
  const baseUrl = getApiBaseUrl();

  const res = await axios.post(`${baseUrl}/auth/login`, { email, password });
  const { token, refreshToken, user } = assertAuthResponse(res.data);

  await storeToken(token);
  if (refreshToken) await storeRefreshToken(refreshToken);
  await storeUserInfo(user);

  return user;
}

/**
 * Register a new account.
 */
export async function register(email: string, password: string, name: string): Promise<UserInfo> {
  const baseUrl = getApiBaseUrl();

  const res = await axios.post(`${baseUrl}/auth/register`, { email, password, name });
  const { token, refreshToken, user } = assertAuthResponse(res.data);

  await storeToken(token);
  if (refreshToken) await storeRefreshToken(refreshToken);
  await storeUserInfo(user);

  return user;
}

/**
 * Logout — clear local tokens.
 */
export async function logout(): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const token = await getToken();

  // Best-effort server-side logout
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
