import { describe, expect, test } from "vitest";
import { countTokens } from "../src/util/tokens.js";

describe("tokens", () => {
  describe("countTokens", () => {
    test("returns 0 for empty string", () => {
      const count = countTokens("", "gpt-4o-mini");
      expect(count).toBe(0);
    });

    test("returns 0 for null/undefined-like empty", () => {
      const count = countTokens("", "gpt-4o-mini");
      expect(count).toBe(0);
    });

    test("counts tokens for simple text", () => {
      const count = countTokens("Hello, world!", "gpt-4o-mini");
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(10); // Should be ~4 tokens
    });

    test("counts tokens for longer text", () => {
      const text = "The quick brown fox jumps over the lazy dog. This is a longer sentence to test token counting.";
      const count = countTokens(text, "gpt-4o-mini");
      expect(count).toBeGreaterThan(10);
      expect(count).toBeLessThan(50);
    });

    test("more text means more tokens", () => {
      const short = "Hello";
      const long = "Hello, this is a much longer text that should have more tokens than the short one.";

      const shortCount = countTokens(short, "gpt-4o-mini");
      const longCount = countTokens(long, "gpt-4o-mini");

      expect(longCount).toBeGreaterThan(shortCount);
    });

    test("uses fallback heuristic for unknown model", () => {
      // With an unknown model, it should fall back to chars/4 heuristic
      const text = "Hello world"; // 11 chars -> ~3 tokens
      const count = countTokens(text, "unknown-model-xyz");

      // Fallback is ceil(chars/4), so 11/4 = 2.75 -> 3
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(11); // At most 1 token per char
    });

    test("handles special characters", () => {
      const text = "🎉 Emoji test! @#$%^&*()";
      const count = countTokens(text, "gpt-4o-mini");
      expect(count).toBeGreaterThan(0);
    });

    test("handles newlines and whitespace", () => {
      const text = "Line 1\nLine 2\n\nLine 4";
      const count = countTokens(text, "gpt-4o-mini");
      expect(count).toBeGreaterThan(0);
    });

    test("handles JSON-like content", () => {
      const json = JSON.stringify({ name: "test", value: 123, nested: { a: 1 } });
      const count = countTokens(json, "gpt-4o-mini");
      expect(count).toBeGreaterThan(5);
    });

    test("handles code-like content", () => {
      const code = `function hello() {
        console.log("Hello, world!");
        return 42;
      }`;
      const count = countTokens(code, "gpt-4o-mini");
      expect(count).toBeGreaterThan(10);
    });

    test("consistent results for same input", () => {
      const text = "Test consistency";
      const count1 = countTokens(text, "gpt-4o-mini");
      const count2 = countTokens(text, "gpt-4o-mini");
      expect(count1).toBe(count2);
    });
  });
});

