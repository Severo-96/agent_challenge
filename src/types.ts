export type Role = "system" | "user" | "assistant" | "tool";

// Configuration
export type AppConfig = {
  openaiApiKey: string;
  openaiProjectId: string | null;
  modelName: string;
  temperature: number;
  dbPath: string;
  summaryTokenTarget: number;
  summaryTriggerTokens: number;
};

export type SessionListItem = {
  id: number;
  firstMessage: string;
  updatedAt: string; // dd-mm-YYYY
};

export type SessionRef = {
  sessionId: number;
};

// Minimal shape used to build LLM context (no ids/timestamps needed)
export type StoredMessage = {
  role: Role;
  content: string;
  toolName?: string | null;
  toolCallId?: string | null;
};

// Tools/function-calling
export type ToolName = "get_country_info" | "get_exchange_rate";

export type ToolCall = {
  callId: string;
  name: ToolName;
  argumentsJson: string;
};

export type ToolResult = {
  toolCallId: string; // Response API call_id
  name: ToolName;
  output: string;
};

// Responses stream item (function_call) shape
export type StreamFunctionCallItem = {
  type?: string;
  name?: ToolName;
  call_id?: string;
  arguments?: string;
  status?: string;
  id?: string;
};

// Agent / streaming
export type AgentOptions = {
  openai: import("openai").default;
  model: string;
  temperature: number;
  metadata?: Record<string, string>;
};

export type StreamCallbacks = {
  onTextDelta: (text: string) => void;
  onToolName: (name: ToolName) => void;
};

export type AgentTurnResult = {
  assistantText: string;
  toolResults: ToolResult[];
};

// Context building
export type ContextBuildOptions = {
  system: import("openai/resources/chat/completions").ChatCompletionMessageParam;
  messages: StoredMessage[];
};


