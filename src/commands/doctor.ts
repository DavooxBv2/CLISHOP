import { Command } from "commander";
import chalk from "chalk";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync } from "fs";
import axios from "axios";
import { isKeytarAvailable, resolveBackend, getToken } from "../auth.js";
import { getApiBaseUrl } from "../config.js";

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Check system compatibility and auth status")
    .action(async () => {
      const checks: { name: string; ok: boolean; detail: string }[] = [];

      // 1. keytar / libsecret
      const keytarOk = isKeytarAvailable();
      checks.push({
        name: "Secure keychain (keytar)",
        ok: keytarOk,
        detail: keytarOk
          ? "keytar loaded successfully"
          : "keytar unavailable — install libsecret:\n" +
            "           sudo apt install libsecret-1-0",
      });

      // 2. active auth backend
      const backend = resolveBackend();
      checks.push({
        name: "Auth backend",
        ok: true,
        detail: backend === "keytar"
          ? "Using OS keychain"
          : "Using file store (~/.config/clishop/auth.json)",
      });

      // 3. file store writable
      try {
        const dir = join(homedir(), ".config", "clishop");
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        checks.push({ name: "File store writable", ok: true, detail: dir });
      } catch (e: unknown) {
        checks.push({
          name: "File store writable",
          ok: false,
          detail: e instanceof Error ? e.message : String(e),
        });
      }

      // 4. auth status
      const token = await getToken();
      checks.push({
        name: "Authenticated",
        ok: !!token,
        detail: token ? "Token present" : "Not set up — run: clishop setup",
      });

      // 5. API reachable
      const apiUrl = getApiBaseUrl();
      try {
        await axios.get(`${apiUrl}/health`, { timeout: 5000 });
        checks.push({ name: "API reachable", ok: true, detail: apiUrl });
      } catch {
        checks.push({
          name: "API reachable",
          ok: false,
          detail: `Cannot reach ${apiUrl}`,
        });
      }

      console.log(chalk.bold("\n  CLISHOP Doctor\n"));
      for (const c of checks) {
        const icon = c.ok ? chalk.green("✓") : chalk.red("✗");
        console.log(`  ${icon}  ${chalk.bold(c.name)}: ${c.detail}`);
      }
      console.log();
    });
}
