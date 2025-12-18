import type { FunctionTool } from "openai/resources/responses/responses";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { CountryInfoInput, getCountryInfo } from "./countries.js";
import { ExchangeRateInput, getExchangeRate } from "./exchange.js";
import type { ToolCall, ToolName, ToolResult } from "../types.js";

function safeJsonParse(json: string): { success: true; data: unknown } | { success: false } {
  try {
    return { success: true, data: JSON.parse(json || "{}") };
  } catch {
    return { success: false };
  }
}

function createToolResult(call: ToolCall, output: string): ToolResult {
  return { toolCallId: call.callId, name: call.name, output };
}

async function parseAndRun<T>(
  call: ToolCall,
  schema: z.ZodType<T>,
  runner: (data: T) => Promise<string>
): Promise<ToolResult> {
  const jsonResult = safeJsonParse(call.argumentsJson);
  if (!jsonResult.success) {
    return createToolResult(call, `Error: Invalid JSON arguments for ${call.name}`);
  }

  const parsed = schema.safeParse(jsonResult.data);
  if (!parsed.success) {
    return createToolResult(call, `Error: Invalid parameters for ${call.name}`);
  }

  const output = await runner(parsed.data);
  return createToolResult(call, output);
}

type ToolHandler<T> = {
  name: ToolName;
  description: string;
  schema: z.ZodType<T>;
  runner: (data: T) => Promise<string>;
};

const TOOL_REGISTRY: ToolHandler<any>[] = [
  {
    name: "get_country_info",
    description:
      "Search for country information (capital, population, region, currency, languages). "
      + "Use when the user asks about countries. Country name must be in English.",
    schema: CountryInfoInput,
    runner: (data: z.infer<typeof CountryInfoInput>) => getCountryInfo(data.country_name),
  },
  {
    name: "get_exchange_rate",
    description:
      "Search for the current exchange rate between two currencies. "
      + "Use when the user asks about currency conversion or exchange rate.",
    schema: ExchangeRateInput,
    runner: (data: z.infer<typeof ExchangeRateInput>) =>
      getExchangeRate(data.base_currency, data.target_currency),
  },
];

export function getOpenAIResponsesTools(): FunctionTool[] {
  return TOOL_REGISTRY.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: zodToJsonSchema(tool.schema, { $refStrategy: "none" }) as Record<string, unknown>,
    strict: true,
  }));
}

export async function executeToolCall(call: ToolCall): Promise<ToolResult> {
  const tool = TOOL_REGISTRY.find((t) => t.name === call.name);
  if (!tool) return createToolResult(call, "Tool not implemented.");
  return parseAndRun(call, tool.schema, tool.runner);
}
