import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { Response, ResponseInputItem } from "openai/resources/responses/responses";
import { executeToolCall, getOpenAIResponsesTools } from "./tools/index.js";
import type {
  AgentOptions,
  AgentTurnResult,
  StreamCallbacks,
  ToolCall,
  ToolName,
  ToolResult,
  StreamFunctionCallItem,
} from "./types.js";

const SYSTEM_PROMPT = `
You are a useful and friendly assistant that can search for information about:
- Countries (capital, population, region, currency, languages)
- Exchange rate between currencies

Use the available tools when necessary to answer the user's questions.
Be clear, objective and friendly in your responses, whenever possible show a summary of the information shown.
If you are not sure about something, be honest and say you don't know.

If the user wants to exit, say that to exit he needs to type 'sair', 'quit', 'exit' or 'q'.
If the user wants to clear the history, say that to clear the history he needs to type 'limpar', 'clear' or 'reset'.
`.trim();

export function systemMessage(): ChatCompletionMessageParam {
  return { role: "system", content: SYSTEM_PROMPT };
}

export async function runAgentTurnStreaming(
  opts: AgentOptions,
  messages: ChatCompletionMessageParam[],
  callbacks: StreamCallbacks
): Promise<AgentTurnResult> {
  const toolNamesThisTurn = new Set<ToolName>();
  const toolResults: ToolResult[] = [];

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

async function executeToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  for (const call of toolCalls) {
    const result = await executeToolCall(call);
    results.push(result);
  }
  return results;
}

function extractFunctionToolCalls(response: Response): ToolCall[] {
  const out: ToolCall[] = [];
  for (const item of response.output as any[]) {
    if (!item || item.type !== "function_call") continue;
    out.push({
      callId: item.call_id as string,
      name: item.name as ToolName,
      argumentsJson: item.arguments as string,
    });
  }
  return out;
}

function toolResultsToFunctionCallOutputs(results: ToolResult[]): ResponseInputItem[] {
  return results.map((r) => ({
    type: "function_call_output",
    call_id: r.toolCallId,
    output: r.output,
  }));
}
