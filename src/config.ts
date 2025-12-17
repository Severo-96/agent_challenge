import { config as loadDotEnv } from "dotenv";
import { resolve } from "node:path";
import type { AppConfig } from "./types.js";

loadDotEnv();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not found.`);
  return v;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid ${name} value: ${raw}`);
  return n;
}

function temperatureValidation(): number {
  const temperature = numberEnv("TEMPERATURE", 0.5);
  if (temperature < 0 || temperature > 2) {
    throw new Error(`TEMPERATURE must be between 0.0 and 2.0, got ${temperature}`);
  }
  return temperature;
}

export function getConfig(): AppConfig {
  const openaiApiKey = requireEnv("OPENAI_API_KEY");
  const openaiProjectId = process.env.OPENAI_PROJECT_ID ?? null;
  const modelName = process.env.MODEL_NAME ?? "gpt-4.1-mini";
  const dbPath = resolve(process.env.TS_DB_PATH ?? "./data/ts_sessions.db");
  const temperature = temperatureValidation();
  const summaryTokenTarget = numberEnv("SUMMARY_TOKEN_TARGET", 700);
  const summaryTriggerTokens = numberEnv("SUMMARY_TRIGGER_TOKENS", 70000);

  return {
    openaiApiKey,
    openaiProjectId,
    modelName,
    temperature,
    dbPath,
    summaryTokenTarget,
    summaryTriggerTokens,
  };
}


