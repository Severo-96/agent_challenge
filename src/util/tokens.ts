import { encoding_for_model, type TiktokenModel } from "@dqbd/tiktoken";
import { getConfig } from "../config.js";
const encoderCache = new Map<string, ReturnType<typeof encoding_for_model>>();

export function clearEncoderCache(): void {
  encoderCache.clear();
}

/**
 * Returns a cached tiktoken encoder for the given model.
 * Encoders are expensive to create (loads vocabulary tables), so we cache them
 * for performance. Without caching, each token count would take ~10ms instead of <1ms.
 */
function getEncoder(model: string) {
  const key = model || getConfig().modelName;
  if (encoderCache.has(key)) return encoderCache.get(key)!;
  try {
    const enc = encoding_for_model(key as TiktokenModel);
    encoderCache.set(key, enc);
    return enc;
  } catch {
    return null;
  }
}

/**
 * Count tokens using tiktoken. Falls back to a rough heuristic (~chars/4)
 * if the tokenizer is unavailable or errors.
 */
export function countTokens(text: string, model: string): number {
  if (!text) return 0;
  const enc = getEncoder(model);
  if (!enc) return Math.max(1, Math.ceil(text.length / 4));
  try {
    return enc.encode(text).length;
  } catch {
    return Math.max(1, Math.ceil(text.length / 4));
  }
}

// Clear cache on module load (project start)
clearEncoderCache();
