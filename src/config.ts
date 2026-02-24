import Conf from "conf";
import path from "path";

/**
 * Local configuration store.
 * All config is scoped per-agent. The "default" agent always exists.
 */

export interface AgentConfig {
  name: string;
  /** Max price per order (safety threshold) */
  maxOrderAmount?: number;
  /** Allowed product categories (empty = all) */
  allowedCategories?: string[];
  /** Blocked product categories */
  blockedCategories?: string[];
  /** Whether the agent requires confirmation before ordering */
  requireConfirmation: boolean;
  /** Default address ID for this agent */
  defaultAddressId?: string;
  /** Default payment method ID for this agent */
  defaultPaymentMethodId?: string;
}

export interface AppConfig {
  /** Currently active agent name */
  activeAgent: string;
  /** All configured agents */
  agents: Record<string, AgentConfig>;
  /** API base URL */
  apiBaseUrl: string;
  /** Output format */
  outputFormat: "human" | "json";
  /** Whether the first-run setup wizard has been completed */
  setupCompleted: boolean;
}

const DEFAULT_AGENT: AgentConfig = {
  name: "default",
  requireConfirmation: true,
  maxOrderAmount: 500,
  allowedCategories: [],
  blockedCategories: [],
};

export const DEFAULT_API_BASE_URL = "https://clishop-backend.vercel.app/api";

const config = new Conf<AppConfig>({
  projectName: "clishop",
  defaults: {
    activeAgent: "default",
    agents: {
      default: DEFAULT_AGENT,
    },
    apiBaseUrl: DEFAULT_API_BASE_URL,
    outputFormat: "human",
    setupCompleted: false,
  },
});

export function getConfig(): Conf<AppConfig> {
  return config;
}

export function getApiBaseUrl(): string {
  const envOverride = process.env.CLISHOP_API_URL?.trim();
  if (envOverride) return envOverride;
  return config.get("apiBaseUrl") || DEFAULT_API_BASE_URL;
}

export function getActiveAgent(): AgentConfig {
  const cfg = config.store;
  // Respect per-command --agent override
  const override = process.env.__CLISHOP_AGENT_OVERRIDE;
  if (override && cfg.agents[override]) {
    return cfg.agents[override];
  }
  return cfg.agents[cfg.activeAgent] || cfg.agents["default"];
}

export function getAgent(name: string): AgentConfig | undefined {
  return config.store.agents[name];
}

export function setActiveAgent(name: string): void {
  if (!config.store.agents[name]) {
    throw new Error(`Agent "${name}" does not exist. Create it first with: clishop agent create ${name}`);
  }
  config.set("activeAgent", name);
}

export function createAgent(name: string, opts: Partial<AgentConfig> = {}): AgentConfig {
  if (config.store.agents[name]) {
    throw new Error(`Agent "${name}" already exists.`);
  }
  const agent: AgentConfig = {
    name,
    requireConfirmation: true,
    maxOrderAmount: 500,
    allowedCategories: [],
    blockedCategories: [],
    ...opts,
  };
  config.set(`agents.${name}`, agent);
  return agent;
}

export function updateAgent(name: string, opts: Partial<AgentConfig>): AgentConfig {
  const existing = config.store.agents[name];
  if (!existing) {
    throw new Error(`Agent "${name}" does not exist.`);
  }
  const updated = { ...existing, ...opts, name }; // name is immutable
  config.set(`agents.${name}`, updated);
  return updated;
}

export function deleteAgent(name: string): void {
  if (name === "default") {
    throw new Error('Cannot delete the "default" agent.');
  }
  if (!config.store.agents[name]) {
    throw new Error(`Agent "${name}" does not exist.`);
  }
  const agents = { ...config.store.agents };
  delete agents[name];
  config.set("agents", agents);
  if (config.store.activeAgent === name) {
    config.set("activeAgent", "default");
  }
}

export function listAgents(): AgentConfig[] {
  return Object.values(config.store.agents);
}
