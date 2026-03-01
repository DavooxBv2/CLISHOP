import axios, { AxiosInstance, AxiosError } from "axios";
import chalk from "chalk";
import { getToken, getRefreshToken, storeToken } from "./auth.js";
import { getApiBaseUrl } from "./config.js";

let client: AxiosInstance | null = null;

function assertRefreshResponse(data: unknown): { token: string } {
  const payload = data as { token?: unknown };
  if (!payload || typeof payload !== "object" || typeof payload.token !== "string") {
    throw new Error("Invalid refresh response from server.");
  }
  return { token: payload.token };
}

/**
 * Get an authenticated Axios client that talks to the backend.
 * Automatically attaches the Bearer token and handles 401 refresh.
 */
export function getApiClient(): AxiosInstance {
  if (client) return client;

  const baseUrl = getApiBaseUrl();

  if (!baseUrl.startsWith("https://")) {
    console.warn(chalk.yellow(`\n⚠ Using a non-HTTPS API URL: ${baseUrl}\n`));
  }

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
            const { token } = assertRefreshResponse(res.data);
            await storeToken(token);
            // Retry original request
            if (error.config) {
              error.config.headers.Authorization = `Bearer ${token}`;
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
 * Ensure the given agent exists on the backend.
 * If it doesn't exist, create it. This keeps CLI-local agents in sync.
 */
export async function ensureAgentOnBackend(agentName: string, maxOrderAmountInCents?: number, requireConfirmation = true): Promise<void> {
  const api = getApiClient();
  try {
    // Check if agent exists by listing all agents and matching by name
    const res = await api.get("/agents");
    const agents: Array<{ name: string }> = res.data.agents || [];
    const exists = agents.some((a) => a.name === agentName);
    if (!exists) {
      // Create the agent on the backend
      await api.post("/agents", {
        name: agentName,
        maxOrderAmountInCents: maxOrderAmountInCents || undefined,
        requireConfirmation,
      });
    }
  } catch {
    // Best-effort — if it fails, the downstream call will report the real error
  }
}

/**
 * Handle API errors consistently.
 */
export function handleApiError(error: unknown): never {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as {
      message?: string;
      error?: string;
      errors?: Record<string, string[]>;
    };
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
