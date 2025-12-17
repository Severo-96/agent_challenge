import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

// Mock dotenv to prevent loading .env file
vi.mock("dotenv", () => ({
  config: vi.fn(),
}));

describe("config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    // Clear all env vars that config uses
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_PROJECT_ID;
    delete process.env.MODEL_NAME;
    delete process.env.TEMPERATURE;
    delete process.env.DB_PATH;
    delete process.env.SUMMARY_TOKEN_TARGET;
    delete process.env.SUMMARY_TRIGGER_TOKENS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("getConfig returns all required fields with defaults", async () => {
    process.env.OPENAI_API_KEY = "test-api-key";

    const { getConfig } = await import("../src/config.js");
    const config = getConfig();

    expect(config.openaiApiKey).toBe("test-api-key");
    expect(config.openaiProjectId).toBeNull();
    expect(config.modelName).toBe("gpt-4.1-mini");
    expect(config.temperature).toBe(0.5);
    expect(config.dbPath).toContain("sessions.db");
    expect(config.summaryTokenTarget).toBe(700);
    expect(config.summaryTriggerTokens).toBe(70000);
  });

  test("getConfig throws when OPENAI_API_KEY is missing", async () => {
    // OPENAI_API_KEY is deleted in beforeEach

    const { getConfig } = await import("../src/config.js");
    expect(() => getConfig()).toThrow("OPENAI_API_KEY not found");
  });

  test("getConfig uses OPENAI_PROJECT_ID when provided", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_PROJECT_ID = "proj_123";

    const { getConfig } = await import("../src/config.js");
    const config = getConfig();

    expect(config.openaiProjectId).toBe("proj_123");
  });

  test("getConfig uses MODEL_NAME when provided", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.MODEL_NAME = "gpt-4o";

    const { getConfig } = await import("../src/config.js");
    const config = getConfig();

    expect(config.modelName).toBe("gpt-4o");
  });

  test("getConfig uses TEMPERATURE when provided", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.TEMPERATURE = "0.7";

    const { getConfig } = await import("../src/config.js");
    const config = getConfig();

    expect(config.temperature).toBe(0.7);
  });

  test("getConfig throws when TEMPERATURE is below 0", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.TEMPERATURE = "-0.5";

    const { getConfig } = await import("../src/config.js");
    expect(() => getConfig()).toThrow("TEMPERATURE must be between 0.0 and 2.0");
  });

  test("getConfig throws when TEMPERATURE is above 2", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.TEMPERATURE = "2.5";

    const { getConfig } = await import("../src/config.js");
    expect(() => getConfig()).toThrow("TEMPERATURE must be between 0.0 and 2.0");
  });

  test("getConfig throws when TEMPERATURE is not a valid number", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.TEMPERATURE = "invalid";

    const { getConfig } = await import("../src/config.js");
    expect(() => getConfig()).toThrow("Invalid TEMPERATURE value");
  });

    test("getConfig uses DB_PATH when provided", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.DB_PATH = "/custom/path/db.sqlite";

    const { getConfig } = await import("../src/config.js");
    const config = getConfig();

    expect(config.dbPath).toBe("/custom/path/db.sqlite");
  });

  test("getConfig uses SUMMARY_TOKEN_TARGET when provided", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.SUMMARY_TOKEN_TARGET = "500";

    const { getConfig } = await import("../src/config.js");
    const config = getConfig();

    expect(config.summaryTokenTarget).toBe(500);
  });

  test("getConfig uses SUMMARY_TRIGGER_TOKENS when provided", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.SUMMARY_TRIGGER_TOKENS = "50000";

    const { getConfig } = await import("../src/config.js");
    const config = getConfig();

    expect(config.summaryTriggerTokens).toBe(50000);
  });

  test("getConfig throws when numeric env var is invalid", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.SUMMARY_TOKEN_TARGET = "not-a-number";

    const { getConfig } = await import("../src/config.js");
    expect(() => getConfig()).toThrow("Invalid SUMMARY_TOKEN_TARGET value");
  });
});
