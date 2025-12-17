import { getConfig } from "../config.js";
import { SqliteStore } from "../db.js";
import { createOpenAI } from "../openaiClient.js";
import { promptUserLogin, promptSessionMenu } from "./prompts.js";
import { printBanner } from "./ui.js";
import { chatLoop } from "./chatLoop.js";

export async function runCli(): Promise<void> {
  const config = getConfig();
  const openai = createOpenAI(config);
  const store = new SqliteStore(config.dbPath);

  try {
    const userLogin = await promptUserLogin();
    const userId = store.ensureUser(userLogin);

    printBanner();

    let sessionId: number | null = null;

    ({ sessionId } = await promptSessionMenu(store, userId));

    if (sessionId == null) {
      console.log("\n💬 Nova conversa iniciada!");
    } else {
      console.log(`\n✅ Conversa carregada! (ID: ${sessionId})`);
    }

    console.log("\nDigite 'sair' ou 'quit' para encerrar.");
    console.log("Digite 'limpar' para limpar o histórico da conversa.");
    console.log("=".repeat(60));

    await chatLoop({ config, openai, store, userId, userLogin, sessionId });
  } finally {
    store.close();
  }
}

