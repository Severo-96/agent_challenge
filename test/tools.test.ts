import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { getCountryInfo } from "../src/tools/countries.js";
import { getExchangeRate } from "../src/tools/exchange.js";
import { executeToolCall, getOpenAIResponsesTools } from "../src/tools/index.js";

describe("tools", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn() as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("getCountryInfo", () => {
    test("formats success response correctly", async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          {
            name: { common: "Brazil" },
            capital: ["Brasília"],
            population: 212559417,
            region: "Americas",
            currencies: { BRL: {} },
            languages: { por: "Portuguese" },
          },
        ],
      });

      const out = await getCountryInfo("Brazil");
      expect(out).toContain("Information about Brazil");
      expect(out).toContain("Brasília");
      expect(out).toContain("Americas");
      expect(out).toContain("Currency: BRL");
      expect(out).toContain("Languages: Portuguese");
    });

    test("handles API error response", async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
      });

      const out = await getCountryInfo("InvalidCountry");
      expect(out).toContain("Error fetching information");
      expect(out).toContain("API error: 404");
    });

    test("handles country not found in response", async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      });

      const out = await getCountryInfo("FakeCountry");
      expect(out).toContain("Error fetching information");
      expect(out).toContain("Country not found");
    });

    test("handles network/connection error", async () => {
      (globalThis.fetch as any).mockRejectedValue(new Error("Network error"));

      const out = await getCountryInfo("Brazil");
      expect(out).toContain("Error fetching information");
      expect(out).toContain("Connection error");
      expect(out).toContain("Network error");
    });

    test("handles missing optional fields gracefully", async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          {
            name: { common: "TestCountry" },
            // Missing: capital, population, region, currencies, languages
          },
        ],
      });

      const out = await getCountryInfo("TestCountry");
      expect(out).toContain("Information about TestCountry");
      expect(out).toContain("Capital: N/A");
      expect(out).toContain("Region: N/A");
      expect(out).toContain("Currency: N/A");
      expect(out).toContain("Languages: N/A");
    });
  });

  describe("getExchangeRate", () => {
    test("formats success response correctly", async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ rates: { BRL: 5.0 }, date: "2024-01-01" }),
      });

      const out = await getExchangeRate("usd", "brl");
      expect(out).toContain("USD → BRL");
      expect(out).toContain("5.0000");
      expect(out).toContain("2024-01-01");
    });

    test("handles API error response", async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: false,
        status: 400,
      });

      const out = await getExchangeRate("INVALID", "BRL");
      expect(out).toContain("Error fetching exchange rate");
      expect(out).toContain("API error: 400");
    });

    test("handles target currency not found", async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ rates: { EUR: 0.85 }, date: "2024-01-01" }),
      });

      const out = await getExchangeRate("USD", "XYZ");
      expect(out).toContain("Error fetching exchange rate");
      expect(out).toContain("Currency XYZ not found");
    });

    test("handles network/connection error", async () => {
      (globalThis.fetch as any).mockRejectedValue(new Error("Timeout"));

      const out = await getExchangeRate("USD", "BRL");
      expect(out).toContain("Error fetching exchange rate");
      expect(out).toContain("Connection error");
      expect(out).toContain("Timeout");
    });

    test("converts currency codes to uppercase", async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ rates: { EUR: 0.85 }, date: "2024-01-01" }),
      });

      const out = await getExchangeRate("usd", "eur");
      expect(out).toContain("USD → EUR");
    });
  });

  describe("getOpenAIResponsesTools", () => {
    test("returns array of function tools", () => {
      const tools = getOpenAIResponsesTools();

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(2);
    });

    test("includes get_country_info tool", () => {
      const tools = getOpenAIResponsesTools();
      const countryTool = tools.find((t) => t.name === "get_country_info");

      expect(countryTool).toBeDefined();
      expect(countryTool?.type).toBe("function");
      expect(countryTool?.description).toContain("country");
      expect(countryTool?.parameters).toBeDefined();
      expect(countryTool?.strict).toBe(true);
    });

    test("includes get_exchange_rate tool", () => {
      const tools = getOpenAIResponsesTools();
      const exchangeTool = tools.find((t) => t.name === "get_exchange_rate");

      expect(exchangeTool).toBeDefined();
      expect(exchangeTool?.type).toBe("function");
      expect(exchangeTool?.description).toContain("exchange rate");
      expect(exchangeTool?.parameters).toBeDefined();
      expect(exchangeTool?.strict).toBe(true);
    });

    test("tools have correct JSON schema structure", () => {
      const tools = getOpenAIResponsesTools();

      for (const tool of tools) {
        expect(tool.parameters).toHaveProperty("type", "object");
        expect(tool.parameters).toHaveProperty("properties");
        expect(tool.parameters).toHaveProperty("required");
        expect(tool.parameters).toHaveProperty("additionalProperties", false);
      }
    });
  });

  describe("executeToolCall", () => {
    test("executes get_country_info tool", async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          {
            name: { common: "France" },
            capital: ["Paris"],
            population: 67000000,
            region: "Europe",
            currencies: { EUR: {} },
            languages: { fra: "French" },
          },
        ],
      });

      const result = await executeToolCall({
        callId: "call_123",
        name: "get_country_info",
        argumentsJson: '{"country_name":"France"}',
      });

      expect(result.toolCallId).toBe("call_123");
      expect(result.name).toBe("get_country_info");
      expect(result.output).toContain("Information about France");
    });

    test("executes get_exchange_rate tool", async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ rates: { EUR: 0.92 }, date: "2024-06-01" }),
      });

      const result = await executeToolCall({
        callId: "call_456",
        name: "get_exchange_rate",
        argumentsJson: '{"base_currency":"USD","target_currency":"EUR"}',
      });

      expect(result.toolCallId).toBe("call_456");
      expect(result.name).toBe("get_exchange_rate");
      expect(result.output).toContain("USD → EUR");
    });

    test("handles invalid JSON arguments", async () => {
      const result = await executeToolCall({
        callId: "call_789",
        name: "get_country_info",
        argumentsJson: "invalid json",
      });

      expect(result.output).toContain("Error");
      expect(result.output).toContain("Invalid JSON");
    });

    test("handles invalid parameters", async () => {
      const result = await executeToolCall({
        callId: "call_abc",
        name: "get_country_info",
        argumentsJson: '{"wrong_field":"value"}',
      });

      expect(result.output).toContain("Error");
      expect(result.output).toContain("Invalid parameters");
    });

    test("handles unknown tool name", async () => {
      const result = await executeToolCall({
        callId: "call_xyz",
        name: "unknown_tool" as any,
        argumentsJson: "{}",
      });

      expect(result.output).toContain("Tool not implemented");
    });
  });
});
