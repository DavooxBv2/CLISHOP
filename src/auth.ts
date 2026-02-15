import keytar from "keytar";
import axios from "axios";
import { getConfig } from "./config.js";

const SERVICE_NAME = "clishop";
const ACCOUNT_TOKEN = "auth-token";
const ACCOUNT_REFRESH = "refresh-token";
const ACCOUNT_USER = "user-info";

export interface UserInfo {
  id: string;
  email: string;
  name: string;
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
  const config = getConfig();
  const baseUrl = config.get("apiBaseUrl");

  const res = await axios.post(`${baseUrl}/auth/login`, { email, password });

  const { token, refreshToken, user } = res.data;

  await storeToken(token);
  if (refreshToken) await storeRefreshToken(refreshToken);
  await storeUserInfo(user);

  return user;
}

/**
 * Register a new account.
 */
export async function register(email: string, password: string, name: string): Promise<UserInfo> {
  const config = getConfig();
  const baseUrl = config.get("apiBaseUrl");

  const res = await axios.post(`${baseUrl}/auth/register`, { email, password, name });

  const { token, refreshToken, user } = res.data;

  await storeToken(token);
  if (refreshToken) await storeRefreshToken(refreshToken);
  await storeUserInfo(user);

  return user;
}

/**
 * Logout — clear local tokens.
 */
export async function logout(): Promise<void> {
  const config = getConfig();
  const baseUrl = config.get("apiBaseUrl");
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
