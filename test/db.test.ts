import { describe, expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteStore } from "../src/db.js";

function makeTempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "ts-agent-"));
  return join(dir, "test.db");
}

describe("SqliteStore", () => {
  describe("ensureUser", () => {
    test("creates new user and returns id", () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const id = store.ensureUser("testuser");
        expect(id).toBeGreaterThan(0);
      } finally {
        store.close();
      }
    });

    test("returns same id for existing user", () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const id1 = store.ensureUser("testuser");
        const id2 = store.ensureUser("testuser");
        expect(id1).toBe(id2);
      } finally {
        store.close();
      }
    });

    test("creates different ids for different users", () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const id1 = store.ensureUser("user1");
        const id2 = store.ensureUser("user2");
        expect(id1).not.toBe(id2);
      } finally {
        store.close();
      }
    });
  });

  describe("sessions", () => {
    test("creates session and returns sessionId", () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const userId = store.ensureUser("u1");
        const { sessionId } = store.createSession(userId, "hello");
        expect(sessionId).toBeGreaterThan(0);
      } finally {
        store.close();
      }
    });

    test("isolates sessions by user", () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const u1 = store.ensureUser("u1");
        const u2 = store.ensureUser("u2");

        store.createSession(u1, "user1 session");
        store.createSession(u2, "user2 session");

        const u1Sessions = store.listSessions(u1);
        const u2Sessions = store.listSessions(u2);

        expect(u1Sessions.length).toBe(1);
        expect(u2Sessions.length).toBe(1);
        expect(u1Sessions[0].firstMessage).toBe("user1 session");
        expect(u2Sessions[0].firstMessage).toBe("user2 session");
      } finally {
        store.close();
      }
    });

    test("listSessions returns dd-mm-YYYY format", () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const userId = store.ensureUser("u1");
        store.createSession(userId, "First message");
        const sessions = store.listSessions(userId);
        expect(sessions.length).toBe(1);
        expect(sessions[0].updatedAt).toMatch(/^\d{2}-\d{2}-\d{4}$/);
      } finally {
        store.close();
      }
    });

    test("listSessions orders by updated_at DESC", () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const userId = store.ensureUser("u1");
        const s1 = store.createSession(userId, "first");
        store.createSession(userId, "second");

        // Add message to first session to update its timestamp
        store.appendMessage({ userId, sessionId: s1.sessionId, role: "user", content: "new" });

        const sessions = store.listSessions(userId);
        expect(sessions[0].firstMessage).toBe("first"); // Most recently updated
      } finally {
        store.close();
      }
    });

    test("deleteSession removes session", () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const userId = store.ensureUser("u1");
        const { sessionId } = store.createSession(userId, "to delete");

        const deleted = store.deleteSession(userId, sessionId);
        expect(deleted).toBe(true);

        const sessions = store.listSessions(userId);
        expect(sessions.length).toBe(0);
      } finally {
        store.close();
      }
    });

    test("deleteSession returns false for non-existent session", () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const userId = store.ensureUser("u1");
        const deleted = store.deleteSession(userId, 9999);
        expect(deleted).toBe(false);
      } finally {
        store.close();
      }
    });

    test("deleteSession does not delete other user's session", () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const u1 = store.ensureUser("u1");
        const u2 = store.ensureUser("u2");
        const { sessionId } = store.createSession(u1, "u1 session");

        const deleted = store.deleteSession(u2, sessionId);
        expect(deleted).toBe(false);

        const sessions = store.listSessions(u1);
        expect(sessions.length).toBe(1);
      } finally {
        store.close();
      }
    });
  });

  describe("messages", () => {
    test("appendMessage stores message", () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const userId = store.ensureUser("u1");
        const { sessionId } = store.createSession(userId, "test");

        store.appendMessage({ userId, sessionId, role: "user", content: "hello" });
        store.appendMessage({ userId, sessionId, role: "assistant", content: "hi there" });

        const messages = store.getMessages(userId, sessionId);
        expect(messages.length).toBe(2);
        expect(messages[0].role).toBe("user");
        expect(messages[0].content).toBe("hello");
        expect(messages[1].role).toBe("assistant");
      } finally {
        store.close();
      }
    });

    test("appendMessage stores tool message with metadata", () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const userId = store.ensureUser("u1");
        const { sessionId } = store.createSession(userId, "test");

        store.appendMessage({
          userId,
          sessionId,
          role: "tool",
          content: "tool output",
          toolName: "get_country_info",
          toolCallId: "call_123",
        });

        const messages = store.getMessages(userId, sessionId);
        expect(messages.length).toBe(1);
        expect(messages[0].role).toBe("tool");
        expect(messages[0].toolName).toBe("get_country_info");
        expect(messages[0].toolCallId).toBe("call_123");
      } finally {
        store.close();
      }
    });

    test("appendMessage rejects session not owned by user", () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const u1 = store.ensureUser("u1");
        const u2 = store.ensureUser("u2");
        const { sessionId } = store.createSession(u1, "hello");

        expect(() =>
          store.appendMessage({ userId: u2, sessionId, role: "user", content: "nope" })
        ).toThrow("Session not found for user");
      } finally {
        store.close();
      }
    });

    test("getMessages returns empty array for non-existent session", () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const userId = store.ensureUser("u1");
        const messages = store.getMessages(userId, 9999);
        expect(messages).toEqual([]);
      } finally {
        store.close();
      }
    });

    test("getMessages returns messages in chronological order", () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const userId = store.ensureUser("u1");
        const { sessionId } = store.createSession(userId, "test");

        store.appendMessage({ userId, sessionId, role: "user", content: "first" });
        store.appendMessage({ userId, sessionId, role: "assistant", content: "second" });
        store.appendMessage({ userId, sessionId, role: "user", content: "third" });

        const messages = store.getMessages(userId, sessionId);
        expect(messages.map((m) => m.content)).toEqual(["first", "second", "third"]);
      } finally {
        store.close();
      }
    });

    test("clearMessages removes all messages from session", () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const userId = store.ensureUser("u1");
        const { sessionId } = store.createSession(userId, "test");

        store.appendMessage({ userId, sessionId, role: "user", content: "msg1" });
        store.appendMessage({ userId, sessionId, role: "assistant", content: "msg2" });

        store.clearMessages(userId, sessionId);

        const messages = store.getMessages(userId, sessionId);
        expect(messages.length).toBe(0);
      } finally {
        store.close();
      }
    });

    test("clearMessages throws for non-existent session", () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const userId = store.ensureUser("u1");
        expect(() => store.clearMessages(userId, 9999)).toThrow("Session not found for user");
      } finally {
        store.close();
      }
    });
  });

  describe("replaceAllMessagesWithSummary", () => {
    test("replaces all messages with summary", () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const userId = store.ensureUser("u1");
        const { sessionId } = store.createSession(userId, "test");

        store.appendMessage({ userId, sessionId, role: "user", content: "msg1" });
        store.appendMessage({ userId, sessionId, role: "assistant", content: "msg2" });
        store.appendMessage({ userId, sessionId, role: "user", content: "msg3" });

        store.replaceAllMessagesWithSummary({
          userId,
          sessionId,
          summaryMessage: "Summary of conversation",
        });

        const messages = store.getMessages(userId, sessionId);
        expect(messages.length).toBe(1);
        expect(messages[0].role).toBe("assistant");
        expect(messages[0].content).toBe("Summary of conversation");
      } finally {
        store.close();
      }
    });

    test("replaceAllMessagesWithSummary throws for non-existent session", () => {
      const store = new SqliteStore(makeTempDbPath());
      try {
        const userId = store.ensureUser("u1");
        expect(() =>
          store.replaceAllMessagesWithSummary({
            userId,
            sessionId: 9999,
            summaryMessage: "test",
          })
        ).toThrow("Session not found for user");
      } finally {
        store.close();
      }
    });
  });
});
