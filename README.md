# 🤖 OpenAI Tools CLI (TypeScript)

A CLI assistant built with TypeScript using OpenAI (tools/function calling + traces) and SQLite for sessions, history and context control. The behavior preserves the original Python flow: conversation menu, exit/clear commands, history that influences responses, and automatic calls to country and exchange rate tools.

## 🚀 Running the CLI

1) Install dependencies  
```bash
npm install
```

2) Set environment variables:
```bash
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
```

3) Run the chat (CLI)  
```bash
npm start
```

Commands during chat:
- `sair | quit | exit | q` to quit
- `limpar | clear | reset` to clear history and start a new session

## 🧠 What was implemented

- TypeScript + OpenAI SDK directly (function calling/tools, `project` headers for traces/observability).
- Tool orchestration (REST Countries and ExchangeRate) via function calling.
- Context with session history (SQLite) and automatic summarization when token limit is reached.
- Multi-user: each run asks for a `login`; sessions are isolated per user.
- Interactive CLI with previous conversation selection.

## 🗂️ Structure

```
src/
 ├─ config.ts        # env/config
 ├─ db.ts            # SQLite store (sessions/messages)
 ├─ types.ts         # shared TypeScript types
 ├─ memory/          # context building + summarization
 ├─ tools/           # external tools (country/exchange)
 ├─ agent/           # OpenAI orchestration + function calling + system prompt
 ├─ cli/             # CLI interface
 ├─ util/            # utilities (token counting, fetch retry)
 └─ index.ts         # entrypoint
test/                # vitest tests
```

## 🧪 Tests

```bash
npm test
```

Cover basic SQLite operations and summarization triggering without calling the real API.

## 📝 Notes

- External tools don't require API keys (REST Countries and ExchangeRate). The only required key is `OPENAI_API_KEY`.
- See `.env.example` for all available configuration options.
