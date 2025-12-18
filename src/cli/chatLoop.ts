import { createInterface } from "node:readline";
import type OpenAI from "openai";
import type { SqliteStore } from "../db.js";
import type { AppConfig } from "../types.js";
import { storeDeleteSession, logToolSearch } from "./ui.js";
import { ConversationService } from "../services/conversation.js";

export const EXIT_COMMANDS = new Set(["sair", "quit", "exit", "q"]);
export const CLEAR_COMMANDS = new Set(["limpar", "clear", "reset"]);

export async function chatLoop(opts: {
  config: AppConfig;
  openai: OpenAI;
  store: SqliteStore;
  userId: number;
  userLogin: string;
  sessionId: number | null;
}): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const askLine = (prompt: string) =>
    new Promise<string>((resolve) => rl.question(prompt, resolve));

  const conversationService = new ConversationService({
    store: opts.store,
    openai: opts.openai,
    config: opts.config,
    userId: opts.userId,
    userLogin: opts.userLogin,
  });

  let interrupted = false;
  const onSigInt = () => {
    interrupted = true;
    try {
      rl.close();
    } catch (err) {
      console.warn(`Erro ao fechar a interface: ${err}`);
    }
  };
  process.on("SIGINT", onSigInt);

  try {
    while (true) {
      if (interrupted) {
        console.log("\n\n👋 Interrompido pelo usuário. Até logo!");
        break;
      }

      const userInput = (await askLine("\n\n👤 Você: ")).trim();
      const lower = userInput.toLowerCase();

      if (EXIT_COMMANDS.has(lower)) {
        console.log("\n👋 Até logo!");
        break;
      }

      if (CLEAR_COMMANDS.has(lower)) {
        if (opts.sessionId != null) {
          storeDeleteSession(opts.store, opts.userId, opts.sessionId);
        }
        opts.sessionId = null;
        console.log("\n🧹 Histórico da conversa limpo!");
        continue;
      }

      if (!userInput) continue;

      console.log("\n🤖 Assistente: Analisando...\n");

      let assistantText = "";
      const result = await conversationService.processUserMessage(userInput, opts.sessionId, {
        onTextDelta: (t) => {
          assistantText += t;
          process.stdout.write(t);
        },
        onToolName: (name) => {
          logToolSearch(name);
        },
      });

      // Ensure newline after streaming to prevent readline from overwriting
      process.stdout.write("\n");

      opts.sessionId = result.sessionId;

      if (result.assistantText.trim().length === 0) {
        process.stdout.write("(sem resposta)\n");
      }

      if (result.summarized) {
        console.log("\n\n📝 Mensagens antigas resumidas... ✅\n");
      }
    }
  } finally {
    process.off("SIGINT", onSigInt);
    rl.close();
  }
}

