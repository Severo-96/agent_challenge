import OpenAI from "openai";
import type { AppConfig } from "./types.js";

export function createOpenAI(config: AppConfig): OpenAI {
  return new OpenAI({
    apiKey: config.openaiApiKey,
    project: config.openaiProjectId ?? undefined,
  });
}


