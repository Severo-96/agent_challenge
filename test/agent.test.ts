import { describe, expect, test, vi } from "vitest";

vi.mock("../src/tools/index.js", () => {
  return {
    getOpenAIResponsesTools: () => [],
    executeToolCall: vi.fn().mockResolvedValue({
      toolCallId: "call_1",
      name: "get_country_info",
      output: "tool-output",
    }),
  };
});

import { runAgentTurnStreaming } from "../src/agent.js";

function makeMockStream(opts: {
  fire?: Array<{ event: string; payload: any }>;
  finalResponse: any;
}) {
  const handlers = new Map<string, Array<(p: any) => void>>();
  return {
    on(event: string, cb: (p: any) => void) {
      const arr = handlers.get(event) ?? [];
      arr.push(cb);
      handlers.set(event, arr);
    },
    async finalResponse() {
      for (const e of opts.fire ?? []) {
        const arr = handlers.get(e.event) ?? [];
        for (const cb of arr) cb(e.payload);
      }
      return opts.finalResponse;
    },
  };
}

describe("agent tool-calling loop (mocked)", () => {
  test("executes tool call then continues with function_call_output input", async () => {
    const calls: any[] = [];
    const openaiMock: any = {
      responses: {
        stream: (params: any) => {
          calls.push(params);
          if (calls.length === 1) {
            return makeMockStream({
              fire: [
                { event: "response.output_item.added", payload: { item: { type: "function_call", name: "get_country_info" } } },
              ],
              finalResponse: {
                id: "resp1",
                output: [
                  {
                    type: "function_call",
                    name: "get_country_info",
                    call_id: "call_1",
                    arguments: '{"country_name":"Brazil"}',
                  },
                ],
              },
            });
          }
          return makeMockStream({
            fire: [{ event: "response.output_text.delta", payload: { delta: "final answer" } }],
            finalResponse: { id: "resp2", output: [] },
          });
        },
      },
    };

    const toolNames: string[] = [];
    let text = "";

    const result = await runAgentTurnStreaming(
      { openai: openaiMock, model: "gpt-4.1-mini", temperature: 0.2, metadata: { userId: "u1" } },
      [{ role: "user", content: "Tell me about Brazil" }],
      {
        onTextDelta: (t) => (text += t),
        onToolName: (n) => toolNames.push(n as any),
      }
    );

    expect(toolNames).toContain("get_country_info");
    expect(text).toContain("final answer");
    expect(result.toolResults.length).toBe(1);
    expect(result.toolResults[0].output).toBe("tool-output");

    // Second request should carry previous_response_id and function_call_output input
    expect(calls.length).toBe(2);
    expect(calls[1].previous_response_id).toBe("resp1");
    expect(Array.isArray(calls[1].input)).toBe(true);
    expect(calls[1].input[0].type).toBe("function_call_output");
    expect(calls[1].input[0].call_id).toBe("call_1");
  });
});


