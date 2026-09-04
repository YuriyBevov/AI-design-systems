import { describe, expect, it } from "vitest";

import { readWidgetEventStream, resolveWidgetApiBase, widgetSessionStorageKey } from "../src/api";

describe("widget API client", () => {
  it("resolves the API next to the hosted versioned widget", () => {
    expect(resolveWidgetApiBase("https://assist.example/widget/v1/widget.js")).toBe(
      "https://assist.example/api/v1",
    );
  });

  it("isolates stored sessions by service origin and assistant", () => {
    expect(widgetSessionStorageKey("https://assist.example/api/v1", "asst_example_123456")).toBe(
      "ai-assist:session:https://assist.example:asst_example_123456",
    );
  });

  it("parses fragmented server-sent events", async () => {
    const encoder = new TextEncoder();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('event: meta\r\ndata: {"requestId":"req_1",'));
          controller.enqueue(
            encoder.encode(
              '"conversationId":"conv_123456789012","userMessageId":"00000000-0000-4000-8000-000000000001","assistantMessageId":"00000000-0000-4000-8000-000000000002"}\r\n\r\nevent: delta\ndata: {"text":"Привет"}\r\n\r\n',
            ),
          );
          controller.close();
        },
      }),
    );
    const events: string[] = [];
    await readWidgetEventStream(response, (event) => events.push(event.type));
    expect(events).toEqual(["meta", "delta"]);
  });
});
