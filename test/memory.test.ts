import { describe, expect, test, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteStore } from "../src/db.js";
import { buildContextMessages, maybeSummarizeSession } from "../src/memory/index.js";
import { systemMessage } from "../src/agent/index.js";

function makeTempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "ts-agent-"));
  return join(dir, "test.db");
}

describe("memory/context", () => {
  describe("buildContextMessages", () => {
    test("includes system message first", () => {
      const out = buildContextMessages({
        system: systemMessage(),
        messages: [],
      });

      expect(out.length).toBe(1);
      expect(out[0].role).toBe("system");
    });

    test("keeps messages in chronological order", () => {
      const messages = [
        { role: "user" as const, content: "first" },
        { role: "assistant" as const, content: "second" },
        { role: "user" as const, content: "third" },
      ];

      const out = buildContextMessages({
        system: systemMessage(),
        messages,
      });

      expect(out.length).toBe(4); // system + 3 messages
      expect(out[1].content).toBe("first");
      expect(out[2].content).toBe("second");
      expect(out[3].content).toBe("third");
    });

    test("keeps stored summary message in order", () => {
      const messages = [
        { role: "assistant" as const, content: "[Resume of previous conversation - 120 messages summarized]\nX" },
        { role: "user" as const, content: "hi" },
      ];

      const out = buildContextMessages({
        system: systemMessage(),
        messages,
      });

      const allText = out.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");
      expect(allText).toContain("120 messages summarized");
      expect(allText).toContain("hi");
    });

    test("filters out tool messages without toolCallId", () => {
      const messages = [
        { role: "user" as const, content: "hello" },
        { role: "tool" as const, content: "orphan tool output" }, // No toolCallId
        { role: "assistant" as const, content: "response" },
      ];

      const out = buildContextMessages({
        system: systemMessage(),
        messages,
      });

      expect(out.length).toBe(3); // system + user + assistant (tool filtered)
      expect(out.map((m) => m.role)).toEqual(["system", "user", "assistant"]);
    });

    test("includes tool messages with toolCallId", () => {
      const messages = [
        { role: "user" as const, content: "hello" },
        {
          role: "tool" as const,
          content: "tool output",
          toolName: "get_country_info",
          toolCallId: "call_123",
        },
        { role: "assistant" as const, content: "response" },
      ];

      const out = buildContextMessages({
        system: systemMessage(),
        messages,
      });

      expect(out.length).toBe(4); // system + user + tool + assistant
      const toolMsg = out.find((m) => m.role === "tool");
      expect(toolMsg).toBeDefined();
      expect((toolMsg as any).tool_call_id).toBe("call_123");
    });

    test("formats tool message content with tool name prefix", () => {
      const messages = [
        {
          role: "tool" as const,
          content: "Brazil info here",
          toolName: "get_country_info",
          toolCallId: "call_123",
        },
      ];

      const out = buildContextMessages({
        system: systemMessage(),
        messages,
      });

      const toolMsg = out.find((m) => m.role === "tool");
      expect(toolMsg?.content).toContain("[tool:get_country_info]");
      expect(toolMsg?.content).toContain("Brazil info here");
    });
  });
});

describe("memory/summarize", () => {
  describe("maybeSummarizeSession", () => {
    test("does NOT summarize when below token threshold", async () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const userId = store.ensureUser("u1");
        const { sessionId } = store.createSession(userId, "test");

        // Add a few short messages (well below threshold)
        store.appendMessage({ userId, sessionId, role: "user", content: "hi" });
        store.appendMessage({ userId, sessionId, role: "assistant", content: "hello" });

        const openaiMock: any = {
          responses: {
            create: vi.fn().mockResolvedValue({ output_text: "Should not be called" }),
          },
        };

        const did = await maybeSummarizeSession({
          openai: openaiMock,
          store,
          userId,
          sessionId,
          model: "gpt-4.1-mini",
          summaryTokenTarget: 50,
          summaryTriggerTokens: 10000, // High threshold
        });

        expect(did).toBe(false);
        expect(openaiMock.responses.create).not.toHaveBeenCalled();

        const msgs = store.getMessages(userId, sessionId);
        expect(msgs.length).toBe(2); // Messages unchanged
      } finally {
        store.close();
      }
    });

    test("summarizes when above token threshold", async () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const userId = store.ensureUser("u1");
        const { sessionId } = store.createSession(userId, "first");

        // Create many messages to exceed threshold
        for (let i = 0; i < 50; i++) {
          store.appendMessage({
            userId,
            sessionId,
            role: i % 2 === 0 ? "user" : "assistant",
            content: `message ${i} with some content`,
          });
        }

        const openaiMock: any = {
          responses: {
            create: vi.fn().mockResolvedValue({ output_text: "Summary of the conversation" }),
          },
        };

        const did = await maybeSummarizeSession({
          openai: openaiMock,
          store,
          userId,
          sessionId,
          model: "gpt-4.1-mini",
          summaryTokenTarget: 50,
          summaryTriggerTokens: 10, // Very low threshold to trigger
        });

        expect(did).toBe(true);
        expect(openaiMock.responses.create).toHaveBeenCalled();

        const msgs = store.getMessages(userId, sessionId);
        expect(msgs.length).toBe(1);
        expect(msgs[0].role).toBe("assistant");
        expect(msgs[0].content).toContain("Resume of previous conversation");
        expect(msgs[0].content).toContain("Summary of the conversation");
      } finally {
        store.close();
      }
    });

    test("includes message count in summary marker", async () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const userId = store.ensureUser("u1");
        const { sessionId } = store.createSession(userId, "test");

        // Add exactly 25 messages
        for (let i = 0; i < 25; i++) {
          store.appendMessage({
            userId,
            sessionId,
            role: i % 2 === 0 ? "user" : "assistant",
            content: `msg${i}`,
          });
        }

        const openaiMock: any = {
          responses: {
            create: vi.fn().mockResolvedValue({ output_text: "Summary" }),
          },
        };

        await maybeSummarizeSession({
          openai: openaiMock,
          store,
          userId,
          sessionId,
          model: "gpt-4.1-mini",
          summaryTokenTarget: 50,
          summaryTriggerTokens: 1, // Force trigger
        });

        const msgs = store.getMessages(userId, sessionId);
        expect(msgs[0].content).toContain("25 messages summarized");
      } finally {
        store.close();
      }
    });

    test("returns false when OpenAI returns empty summary", async () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const userId = store.ensureUser("u1");
        const { sessionId } = store.createSession(userId, "test");

        for (let i = 0; i < 10; i++) {
          store.appendMessage({
            userId,
            sessionId,
            role: "user",
            content: `msg${i}`,
          });
        }

        const openaiMock: any = {
          responses: {
            create: vi.fn().mockResolvedValue({ output_text: "" }), // Empty summary
          },
        };

        const did = await maybeSummarizeSession({
          openai: openaiMock,
          store,
          userId,
          sessionId,
          model: "gpt-4.1-mini",
          summaryTokenTarget: 50,
          summaryTriggerTokens: 1,
        });

        expect(did).toBe(false);

        // Messages should be unchanged
        const msgs = store.getMessages(userId, sessionId);
        expect(msgs.length).toBe(10);
      } finally {
        store.close();
      }
    });

    test("returns false when OpenAI call fails", async () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const userId = store.ensureUser("u1");
        const { sessionId } = store.createSession(userId, "test");

        for (let i = 0; i < 10; i++) {
          store.appendMessage({
            userId,
            sessionId,
            role: "user",
            content: `msg${i}`,
          });
        }

        const openaiMock: any = {
          responses: {
            create: vi.fn().mockRejectedValue(new Error("API Error")),
          },
        };

        const did = await maybeSummarizeSession({
          openai: openaiMock,
          store,
          userId,
          sessionId,
          model: "gpt-4.1-mini",
          summaryTokenTarget: 50,
          summaryTriggerTokens: 1,
        });

        expect(did).toBe(false);

        // Messages should be unchanged
        const msgs = store.getMessages(userId, sessionId);
        expect(msgs.length).toBe(10);
      } finally {
        store.close();
      }
    });

    test("sends correct metadata to OpenAI", async () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const userId = store.ensureUser("u1");
        const { sessionId } = store.createSession(userId, "test");

        store.appendMessage({ userId, sessionId, role: "user", content: "test" });

        const openaiMock: any = {
          responses: {
            create: vi.fn().mockResolvedValue({ output_text: "Summary" }),
          },
        };

        await maybeSummarizeSession({
          openai: openaiMock,
          store,
          userId,
          sessionId,
          model: "gpt-4.1-mini",
          summaryTokenTarget: 100,
          summaryTriggerTokens: 1,
        });

        expect(openaiMock.responses.create).toHaveBeenCalledWith(
          expect.objectContaining({
            model: "gpt-4.1-mini",
            max_output_tokens: 100,
            metadata: expect.objectContaining({
              purpose: "summarize_session",
              userId: String(userId),
              sessionId: String(sessionId),
            }),
          })
        );
      } finally {
        store.close();
      }
    });
  });
});
