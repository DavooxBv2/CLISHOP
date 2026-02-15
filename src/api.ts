import axios, { AxiosInstance, AxiosError } from "axios";
import chalk from "chalk";
import { getToken, getRefreshToken, storeToken } from "./auth.js";

let client: AxiosInstance | null = null;

/**
 * Get an authenticated Axios client that talks to the backend.
 * Automatically attaches the Bearer token and handles 401 refresh.
 */
const API_BASE_URL = "https://clishop-backend.vercel.app/api";

export function getApiClient(): AxiosInstance {
  if (client) return client;

  const baseUrl = API_BASE_URL;

  client = axios.create({
    baseURL: baseUrl,
    timeout: 30_000,
    headers: {
      "Content-Type": "application/json",
    },
  });

  // Attach token to every request
  client.interceptors.request.use(async (reqConfig) => {
    const token = await getToken();
    if (token) {
      reqConfig.headers.Authorization = `Bearer ${token}`;
    }
    return reqConfig;
  });

  // Handle 401 — try refresh
  client.interceptors.response.use(
    (res) => res,
    async (error: AxiosError) => {
      if (error.response?.status === 401) {
        const refreshToken = await getRefreshToken();
        if (refreshToken) {
          try {
            const res = await axios.post(`${baseUrl}/auth/refresh`, { refreshToken });
            await storeToken(res.data.token);
            // Retry original request
            if (error.config) {
              error.config.headers.Authorization = `Bearer ${res.data.token}`;
              return axios(error.config);
            }
          } catch {
            // Refresh failed — user needs to login again
          }
        }
        console.error(chalk.red("\n✗ Session expired. Please login again: clishop login\n"));
        process.exit(1);
      }
      throw error;
    }
  );

  return client;
}

/**
 * Handle API errors consistently.
 */
export function handleApiError(error: unknown): never {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    const message = data?.message || data?.error || error.message;
    const status = error.response?.status;

    if (status === 422 && data?.errors) {
      console.error(chalk.red("\n✗ Validation errors:"));
      for (const [field, msgs] of Object.entries(data.errors)) {
        console.error(chalk.red(`  ${field}: ${(msgs as string[]).join(", ")}`));
      }
    } else if (status === 404) {
      console.error(chalk.red(`\n✗ Not found: ${message}`));
    } else {
      console.error(chalk.red(`\n✗ API error (${status || "network"}): ${message}`));
    }
  } else if (error instanceof Error) {
    console.error(chalk.red(`\n✗ ${error.message}`));
  } else {
    console.error(chalk.red("\n✗ An unexpected error occurred."));
  }
  process.exit(1);
}
