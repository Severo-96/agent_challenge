import { createInterface } from "node:readline";
import type OpenAI from "openai";
import type { SqliteStore } from "../db.js";
import { systemMessage, runAgentTurnStreaming } from "../agent/index.js";
import { buildContextMessages, maybeSummarizeSession } from "../memory/index.js";
import type { AppConfig } from "../types.js";
import { EXIT_COMMANDS, CLEAR_COMMANDS } from "./constants.js";
import { truncateFirstMessage, storeDeleteSession, logToolSearch } from "./ui.js";

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

      // Create session on first message
      if (opts.sessionId == null) {
        const firstMessageForSession = truncateFirstMessage(userInput);
        const createdSession = opts.store.createSession(opts.userId, firstMessageForSession);
        opts.sessionId = createdSession.sessionId;
      }

      // Persist user message
      opts.store.appendMessage({
        userId: opts.userId,
        sessionId: opts.sessionId,
        role: "user",
        content: userInput,
      });

      console.log("\n🤖 Assistente: Analisando...\n");

      const stored = opts.store.getMessages(opts.userId, opts.sessionId);
      const messages = buildContextMessages({
        system: systemMessage(),
        messages: stored,
      });

      let assistantText = "";
      const result = await runAgentTurnStreaming(
        {
          openai: opts.openai,
          model: opts.config.modelName,
          temperature: opts.config.temperature,
          metadata: {
            userId: String(opts.userId),
            userLogin: opts.userLogin,
            sessionId: String(opts.sessionId),
          },
        },
        messages,
        {
          onTextDelta: (t) => {
            assistantText += t;
            process.stdout.write(t);
          },
          onToolName: (name) => {
            logToolSearch(name);
          },
        }
      );

      // Persist tool outputs
      for (const tr of result.toolResults) {
        opts.store.appendMessage({
          userId: opts.userId,
          sessionId: opts.sessionId,
          role: "tool",
          content: tr.output,
          toolName: tr.name,
          toolCallId: tr.toolCallId,
        });
      }

      // Persist assistant response
      const finalText = (assistantText || result.assistantText || "").trim();
      opts.store.appendMessage({
        userId: opts.userId,
        sessionId: opts.sessionId,
        role: "assistant",
        content: finalText.length ? finalText : "(sem resposta)",
      });

      // Context control: summarize when needed
      const summarized = await maybeSummarizeSession({
        openai: opts.openai,
        store: opts.store,
        userId: opts.userId,
        sessionId: opts.sessionId,
        model: opts.config.modelName,
        summaryTokenTarget: opts.config.summaryTokenTarget,
        summaryTriggerTokens: opts.config.summaryTriggerTokens,
      });
      if (summarized) {
        console.log("\n\n📝 Mensagens antigas resumidas... ✅\n");
      }
    }
  } finally {
    process.off("SIGINT", onSigInt);
    rl.close();
  }
}

