import type { FunctionTool } from "openai/resources/responses/responses";
import { z } from "zod";
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

function zodToJsonSchemaObject(zod: z.ZodObject<any>) {
  const shape = zod.shape as Record<string, z.ZodTypeAny>;
  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const [fieldName, fieldSchema] of Object.entries(shape)) {
    const description = (fieldSchema as any)?._def?.description;
    properties[fieldName] = { type: "string", ...(description ? { description } : {}) };
    required.push(fieldName);
  }

  return { type: "object", properties, required, additionalProperties: false };
}

export function getOpenAIResponsesTools(): FunctionTool[] {
  return [
    {
      type: "function",
      name: "get_country_info",
      description:
        "Search for country information (capital, population, region, currency, languages). "
        + "Use when the user asks about countries. Country name must be in English.",
      parameters: zodToJsonSchemaObject(CountryInfoInput),
      strict: true,
    },
    {
      type: "function",
      name: "get_exchange_rate",
      description:
        "Search for the current exchange rate between two currencies. "
        + "Use when the user asks about currency conversion or exchange rate.",
      parameters: zodToJsonSchemaObject(ExchangeRateInput),
      strict: true,
    },
  ];
}

export async function executeToolCall(call: ToolCall): Promise<ToolResult> {
  if (call.name === "get_country_info") {
    return parseAndRun(call, CountryInfoInput, (data) => getCountryInfo(data.country_name));
  }

  if (call.name === "get_exchange_rate") {
    return parseAndRun(call, ExchangeRateInput, (data) =>
      getExchangeRate(data.base_currency, data.target_currency)
    );
  }

  return createToolResult(call, "Tool not implemented.");
}
