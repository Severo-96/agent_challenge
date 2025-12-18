import type OpenAI from "openai";
import type { SqliteStore } from "../db.js";
import { systemMessage, runAgentTurnStreaming } from "../agent/index.js";
import { buildContextMessages, summarizeSessionIfNeeded } from "../memory/index.js";
import type { AppConfig, ToolResult, StreamCallbacks } from "../types.js";
import { truncateFirstMessage } from "../util/text.js";

export class ConversationService {
  constructor(
    private readonly deps: {
      store: SqliteStore;
      openai: OpenAI;
      config: AppConfig;
      userId: number;
      userLogin: string;
    }
  ) {}

  async processUserMessage(
    userInput: string,
    sessionId: number | null,
    callbacks: StreamCallbacks
  ): Promise<{
    sessionId: number;
    assistantText: string;
    toolResults: ToolResult[];
    summarized: boolean;
  }> {
    const { store, userId } = this.deps;
    let activeSessionId = sessionId;
    // Create session on first turn, storing truncated preview
    if (activeSessionId == null) {
      const preview = truncateFirstMessage(userInput);
      const created = store.createSession(userId, preview);
      activeSessionId = created.sessionId;
    }

    // Persist user message
    store.appendMessage({
      userId,
      sessionId: activeSessionId,
      role: "user",
      content: userInput,
    });

    // Build context (system + stored messages)
    const stored = store.getMessages(userId, activeSessionId);
    const messages = buildContextMessages({
      system: systemMessage(),
      messages: stored,
    });

    // Run agent turn with streaming callbacks
    const result = await runAgentTurnStreaming(
      {
        openai: this.deps.openai,
        model: this.deps.config.modelName,
        temperature: this.deps.config.temperature,
        metadata: {
          userId: String(userId),
          userLogin: this.deps.userLogin,
          sessionId: String(activeSessionId),
        },
      },
      messages,
      callbacks
    );

    // Persist tool outputs
    for (const tr of result.toolResults) {
      store.appendMessage({
        userId,
        sessionId: activeSessionId,
        role: "tool",
        content: tr.output,
        toolName: tr.name,
        toolCallId: tr.toolCallId,
      });
    }

    // Persist assistant response
    const finalText = (result.assistantText || "").trim();
    store.appendMessage({
      userId,
      sessionId: activeSessionId,
      role: "assistant",
      content: finalText.length ? finalText : "(sem resposta)",
    });

    // Summarize if token budget exceeded
    const summarized = await summarizeSessionIfNeeded({
      openai: this.deps.openai,
      store: this.deps.store,
      userId: this.deps.userId,
      sessionId: activeSessionId,
      model: this.deps.config.modelName,
      summaryTokenTarget: this.deps.config.summaryTokenTarget,
      summaryTriggerTokens: this.deps.config.summaryTriggerTokens,
    });

    return {
      sessionId: activeSessionId,
      assistantText: finalText,
      toolResults: result.toolResults,
      summarized,
    };
  }
}

