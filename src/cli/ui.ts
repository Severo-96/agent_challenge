import type { ToolName } from "../types.js";
import type { SqliteStore } from "../db.js";

export function printBanner(): void {
  console.log("=".repeat(60));
  console.log("🤖 Assistente IA com Function Calling");
  console.log("=".repeat(60));
  console.log("\nEste assistente pode ajudar você com:");
  console.log("  • Informações sobre países");
  console.log("  • Taxas de câmbio");
  console.log("=".repeat(60));
  console.log();
}

export function storeDeleteSession(store: SqliteStore, userId: number, sessionId: number): void {
  try {
    store.deleteSession(userId, sessionId);
  } catch (err) {
    console.warn(`\nErro ao limpar sessão: ${err}`);
  }
}

const TOOL_LOG_MESSAGES: Record<string, string> = {
  get_country_info: "- Buscando informação sobre países",
  get_exchange_rate: "- Buscando taxas de câmbio",
};

export function logToolSearch(name: ToolName): void {
  const msg = TOOL_LOG_MESSAGES[name] ?? `- Buscando: ${name}`;
  process.stdout.write(`${msg}\n\n`);
}

