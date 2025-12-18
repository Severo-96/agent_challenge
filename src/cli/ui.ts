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

export function logToolSearch(name: ToolName): void {
  if (name === "get_country_info") {
    process.stdout.write("- Buscando informação sobre países\n\n");
  } else if (name === "get_exchange_rate") {
    process.stdout.write("- Buscando taxas de câmbio\n\n");
  } else {
    process.stdout.write(`- Buscando: ${name}\n\n`);
  }
}

