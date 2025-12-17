import type { Response, ResponseInputItem } from "openai/resources/responses/responses";
import { executeToolCall } from "../tools/index.js";
import type { ToolCall, ToolName, ToolResult } from "../types.js";

export async function executeToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  for (const call of toolCalls) {
    const result = await executeToolCall(call);
    results.push(result);
  }
  return results;
}

export function extractFunctionToolCalls(response: Response): ToolCall[] {
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

export function toolResultsToFunctionCallOutputs(results: ToolResult[]): ResponseInputItem[] {
  return results.map((r) => ({
    type: "function_call_output",
    call_id: r.toolCallId,
    output: r.output,
  }));
}

