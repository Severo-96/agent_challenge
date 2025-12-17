# 🤖 OpenAI Tools CLI (TypeScript)

A CLI assistant built with TypeScript using OpenAI (tools/function calling + traces) and SQLite for sessions, history and context control. The behavior preserves the original Python flow: conversation menu, exit/clear commands, history that influences responses, and automatic calls to country and exchange rate tools.

## 🚀 Running the CLI

1) Install dependencies  
```bash
npm install
```

2) Set environment variables (create a `.env` file):  
```
OPENAI_API_KEY=...
# optional for observability/traces in OpenAI dashboard
OPENAI_PROJECT_ID=...
MODEL_NAME=gpt-4.1-mini
TEMPERATURE=0.5
TS_DB_PATH=./data/ts_sessions.db
SUMMARY_TOKEN_TARGET=700
SUMMARY_TRIGGER_TOKENS=70000
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
 ├─ prompts.ts       # system prompt
 ├─ types.ts         # shared TypeScript types
 ├─ memory/          # context building + summarization
 ├─ tools/           # external tools (country/exchange)
 ├─ agent.ts         # OpenAI orchestration + function calling
 ├─ cli/             # CLI interface
 ├─ util/            # utilities (token counting)
 └─ index.ts         # entrypoint
test/                # vitest tests
```

## 🧪 Tests

```bash
npm test
```

Cover basic SQLite operations and summarization triggering without calling the real API.

## 📝 Notes

- This version is **100% TypeScript** (the legacy Python code was removed).
- External tools don't require API keys (REST Countries and ExchangeRate). The only required key is `OPENAI_API_KEY`.
