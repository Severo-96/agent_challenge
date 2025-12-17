import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Role, SessionListItem, SessionRef, StoredMessage } from "./types.js";

export class SqliteStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.initSchema();
  }

  close(): void {
    this.db.close();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        login TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        first_message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_name TEXT,
        tool_call_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user_updated ON sessions(user_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, id ASC);

      CREATE TRIGGER IF NOT EXISTS bump_session_updated_at
      AFTER INSERT ON messages
      BEGIN
        UPDATE sessions
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.session_id;
      END;
    `);
  }

  ensureUser(login: string): number {
    const existing = this.db
      .prepare(`SELECT id FROM users WHERE login = ?`)
      .get(login) as { id: number } | undefined;
    if (existing) return existing.id;

    const info = this.db.prepare(`INSERT INTO users (login) VALUES (?)`).run(login);
    return Number(info.lastInsertRowid);
  }

  listSessions(userId: number): SessionListItem[] {
    const rows = this.db
      .prepare(
        `SELECT id, first_message, updated_at
         FROM sessions
         WHERE user_id = ?
         ORDER BY updated_at DESC`
      )
      .all(userId) as Array<{ id: number; first_message: string; updated_at: string }>;

    return rows.map((r) => ({
      id: r.id,
      firstMessage: r.first_message,
      updatedAt: formatDdMmYyyy(r.updated_at),
    }));
  }

  createSession(userId: number, firstMessage: string): SessionRef {
    const info = this.db
      .prepare(`INSERT INTO sessions (user_id, first_message) VALUES (?, ?)`)
      .run(userId, firstMessage);
    const sessionId = Number(info.lastInsertRowid);
    return { sessionId };
  }

  deleteSession(userId: number, sessionId: number): boolean {
    const info = this.db
      .prepare(`DELETE FROM sessions WHERE user_id = ? AND id = ?`)
      .run(userId, sessionId);
    return info.changes > 0;
  }

  appendMessage(opts: {
    userId: number;
    sessionId: number;
    role: Role;
    content: string;
    toolName?: string;
    toolCallId?: string;
  }): void {
    const ok = this.db
      .prepare(`SELECT 1 FROM sessions WHERE user_id = ? AND id = ?`)
      .get(opts.userId, opts.sessionId);
    if (!ok) throw new Error("Session not found for user.");

    this.db
      .prepare(
        `INSERT INTO messages (session_id, role, content, tool_name, tool_call_id)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(opts.sessionId, opts.role, opts.content, opts.toolName ?? null, opts.toolCallId ?? null);
  }

  getMessages(userId: number, sessionId: number): StoredMessage[] {
    const ok = this.db
      .prepare(`SELECT 1 FROM sessions WHERE user_id = ? AND id = ?`)
      .get(userId, sessionId);
    if (!ok) return [];

    const rows = this.db
      .prepare(
        `SELECT role, content, tool_name, tool_call_id
         FROM messages
         WHERE session_id = ?
         ORDER BY id ASC`
      )
      .all(sessionId) as Array<{
      role: string;
      content: string;
      tool_name: string | null;
      tool_call_id: string | null;
    }>;

    return rows.map((r) => ({
      role: r.role as Role,
      content: r.content,
      toolName: r.tool_name,
      toolCallId: r.tool_call_id,
    }));
  }

  clearMessages(userId: number, sessionId: number): void {
    const ok = this.db
      .prepare(`SELECT 1 FROM sessions WHERE user_id = ? AND id = ?`)
      .get(userId, sessionId);
    if (!ok) throw new Error("Session not found for user.");

    this.db.prepare(`DELETE FROM messages WHERE session_id = ?`).run(sessionId);
  }

  replaceAllMessagesWithSummary(opts: {
    userId: number;
    sessionId: number;
    summaryMessage: string;
  }): void {
    const tx = this.db.transaction(() => {
      const ok = this.db
        .prepare(`SELECT 1 FROM sessions WHERE user_id = ? AND id = ?`)
        .get(opts.userId, opts.sessionId);
      if (!ok) throw new Error("Session not found for user.");

      this.db.prepare(`DELETE FROM messages WHERE session_id = ?`).run(opts.sessionId);
      this.db
        .prepare(`INSERT INTO messages (session_id, role, content) VALUES (?, 'assistant', ?)`)
        .run(opts.sessionId, opts.summaryMessage);
    });
    tx();
  }
}

function formatDdMmYyyy(sqliteTimestamp: string): string {
  // SQLite DEFAULT CURRENT_TIMESTAMP: "YYYY-MM-DD HH:MM:SS"
  const isoish = sqliteTimestamp.includes("T")
    ? sqliteTimestamp
    : `${sqliteTimestamp.replace(" ", "T")}Z`;
  return new Date(isoish)
    .toLocaleDateString("pt-BR", { timeZone: "UTC" })
    .replace(/\//g, "-"); // dd-mm-yyyy
}

