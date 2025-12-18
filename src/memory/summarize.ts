import type OpenAI from "openai";
import { SqliteStore } from "../db.js";
import { countTokens } from "../util/tokens.js";
import type { Role, StoredMessage } from "../types.js";

const ROLE_LABEL: Record<Role, string> = {
  system: "System",
  user: "User",
  assistant: "Assistant",
  tool: "Tool",
};

const SUMMARY_TEMPERATURE = 0.3;

export async function summarizeSessionIfNeeded(opts: {
  openai: OpenAI;
  store: SqliteStore;
  userId: number;
  sessionId: number;
  model: string;
  summaryTokenTarget: number;
  summaryTriggerTokens: number;
}): Promise<boolean> {
  const messages = opts.store.getMessages(opts.userId, opts.sessionId);
  // Trigger summarization by token budget (model-accurate via tiktoken) AFTER the turn completes.
  const tokenCount = messages.reduce((acc, m) => acc + countTokens(m.content, opts.model), 0);

  if (tokenCount < opts.summaryTriggerTokens) return false;

  try {
    const summary = await summarizeWithAgent({ ...opts, messages });
    if (!summary) return false;

    // Persist summary by replacing the history with a single summary message
    opts.store.replaceAllMessagesWithSummary({
      userId: opts.userId,
      sessionId: opts.sessionId,
      summaryMessage: `[Resume of previous conversation - ${messages.length} messages summarized]\n\n${summary}`.trim(),
    });
    return true;
  } catch {
    return false;
  }
}

function formatConversation(messages: StoredMessage[]): string {
  return messages.map((m) => `${ROLE_LABEL[m.role]}: ${m.content}`).join("\n");
}

async function summarizeWithAgent(opts: {
  openai: OpenAI;
  store: SqliteStore;
  userId: number;
  sessionId: number;
  model: string;
  summaryTokenTarget: number;
  summaryTriggerTokens: number;
  messages: StoredMessage[];
}): Promise<string | null> {
  const conversationText = formatConversation(opts.messages);
  const prompt = `
You are a system that summarizes conversations for long-term memory.

Summarize the conversation below in the primary language used by the user
(ignore system or tool language).
The summary will be used to maintain context across future interactions.
This is a summary, not a transcript.

IMPORTANT: Keep the summary within approximately ${opts.summaryTokenTarget} tokens.
Be concise and prioritize the most important information.

Guidelines:
- Be concise and objective
- Preserve key decisions, facts, numbers, and constraints
- Keep only information useful for future context
- Do NOT include greetings, filler text, or redundant details
- Do NOT invent information

Output format (follow strictly):
- Main topics:
- Important facts:
- Decisions or conclusions:
- Open questions or pending actions (if any):

Conversation:
${conversationText}
`.trim();

  const resp = await opts.openai.responses.create({
    model: opts.model,
    input: prompt,
    temperature: SUMMARY_TEMPERATURE,
    max_output_tokens: opts.summaryTokenTarget,
    metadata: {
      purpose: "summarize_session",
      userId: String(opts.userId),
      sessionId: String(opts.sessionId),
    },
  });

  const summary = (resp.output_text ?? "").trim();
  return summary || null;
}

