import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ContextBuildOptions } from "../types.js";

/**
 * Builds the LLM context from stored messages.
 * Filters out tool messages without call_id and converts to ChatCompletionMessageParam format.
 */
export function buildContextMessages(opts: ContextBuildOptions): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [];

  // System prompt always first
  out.push(opts.system);

  // Add messages in chronological order (oldest → newest)
  const picked: ChatCompletionMessageParam[] = [];
  for (let i = 0; i < opts.messages.length; i++) {
    const m = opts.messages[i];

    if (m.role === "tool" && !m.toolCallId) continue;

    const candidate: ChatCompletionMessageParam =
      m.role === "tool"
        ? { role: "tool", tool_call_id: m.toolCallId!, content: `[tool:${m.toolName}] ${m.content}` }
        : { role: m.role, content: m.content };

    picked.push(candidate);
  }

  out.push(...picked);
  return out;
}

