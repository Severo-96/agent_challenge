import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { Response, ResponseInputItem } from "openai/resources/responses/responses";
import { getOpenAIResponsesTools } from "../tools/index.js";
import type {
  AgentOptions,
  AgentTurnResult,
  StreamCallbacks,
  ToolCall,
  ToolName,
  StreamFunctionCallItem,
} from "../types.js";
import { executeToolCalls, extractFunctionToolCalls, toolResultsToFunctionCallOutputs } from "./functionCalling.js";

export async function runAgentTurnStreaming(
  opts: AgentOptions,
  messages: ChatCompletionMessageParam[],
  callbacks: StreamCallbacks
): Promise<AgentTurnResult> {
  const toolNamesThisTurn = new Set<ToolName>();
  const toolResults: import("../types.js").ToolResult[] = [];

  let assistantTextFinal = "";
  let previousResponseId: string | null = null;
  let pendingInput: ResponseInputItem[] = toEasyInput(messages);

  // Tool-calling loop. Responses API supports tracing/metadata.
  while (true) {
    const response = await runOneResponse(
      opts,
      pendingInput,
      callbacks,
      toolNamesThisTurn,
      previousResponseId
    );

    if (response.assistantTextDelta) assistantTextFinal += response.assistantTextDelta;

    if (response.toolCalls.length === 0) break;

    // Execute requested tools and send outputs as function_call_output items.
    const results = await executeToolCalls(response.toolCalls);
    toolResults.push(...results);

    // Continue the same turn by chaining from this response using tool outputs.
    previousResponseId = response.responseId;
    pendingInput = toolResultsToFunctionCallOutputs(results);
  }

  return { assistantText: assistantTextFinal, toolResults };
}

function toEasyInput(messages: ChatCompletionMessageParam[]): ResponseInputItem[] {
  const out: ResponseInputItem[] = [];
  for (const m of messages) {
    if (m.role === "function") continue;
    const role = m.role === "tool" ? "assistant" : m.role;

    const content = typeof m.content === "string" ? m.content : "";
    if (!content) continue;

    out.push({ role, content });
  }
  return out;
}

async function runOneResponse(
  opts: AgentOptions,
  input: ResponseInputItem[],
  callbacks: StreamCallbacks,
  toolNamesThisTurn: Set<ToolName>,
  previousResponseId: string | null
): Promise<{
  assistantTextDelta: string;
  toolCalls: ToolCall[];
  responseId: string;
}> {
  const tools = getOpenAIResponsesTools();

  let assistantTextDelta = "";
  const stream = opts.openai.responses.stream({
    model: opts.model,
    input,
    tools,
    metadata: opts.metadata ?? undefined,
    temperature: opts.temperature,
    parallel_tool_calls: false, //Only one tool call at a time
    ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
  });

  stream.on("response.output_text.delta", (e) => {
    assistantTextDelta += e.delta;
    callbacks.onTextDelta(e.delta);
  });

  stream.on("response.output_item.added", (e) => {
    const item = e.item as StreamFunctionCallItem;
    if (item?.type !== "function_call") return;
    const name = item.name;
    if (!name) return;
    if (!toolNamesThisTurn.has(name)) {
      toolNamesThisTurn.add(name);
      callbacks.onToolName(name);
    }
  });

  try {
    const final = (await stream.finalResponse()) as unknown as Response;
    const toolCalls = extractFunctionToolCalls(final);
    return { assistantTextDelta, toolCalls, responseId: final.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Stream failed: ${message}`);
  }
}

