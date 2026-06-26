import type {
  PluginHookOutboundDeliveryPolicyEvent,
  PluginHookSourcePolicyEvent,
} from "openclaw/plugin-sdk/plugin-entry";
import { describe, expect, it } from "vitest";
import {
  applyReadOnlyDeliveryPolicy,
  buildActiveReadOnlySource,
  buildReadOnlyPromptContext,
  buildSourcePolicyResult,
  collectTurnKeys,
  isSkipRelayPayload,
  resolveReadOnlyRelayConfig,
} from "../src/policy.js";

const baseConfig = resolveReadOnlyRelayConfig({
  rules: [
    {
      channel: "bluebubbles",
      conversationId: "chat-1",
      relay: {
        channel: "telegram",
        to: "relay-room",
      },
    },
  ],
});

const sourceEvent: PluginHookSourcePolicyEvent = {
  content: "hello",
  channel: "bluebubbles",
  conversationId: "chat-1",
  sessionKey: "session-1",
  runId: "run-1",
  isGroup: false,
  sendPolicy: "allow",
};

function outboundEvent(
  overrides: Partial<PluginHookOutboundDeliveryPolicyEvent> = {},
): PluginHookOutboundDeliveryPolicyEvent {
  return {
    kind: "message_action",
    payload: { text: "hello back" },
    source: {
      channel: "bluebubbles",
      conversationId: "chat-1",
      sessionKey: "session-1",
    },
    destination: {
      channel: "bluebubbles",
      to: "chat-1",
      conversationId: "chat-1",
      path: "message_action",
    },
    sessionKey: "session-1",
    runId: "run-1",
    ...overrides,
  };
}

describe("read-only relay policy", () => {
  it("forces matching source replies through the message tool", () => {
    expect(buildSourcePolicyResult(baseConfig, sourceEvent)).toEqual({
      sourceReplyDeliveryMode: "message_tool_only",
      reason: "source channel bluebubbles is read-only",
    });
  });

  it("adds LLM-visible metadata for a read-only source", () => {
    const active = buildActiveReadOnlySource(baseConfig, sourceEvent);
    expect(active).toBeDefined();

    const result = buildReadOnlyPromptContext(active!);
    expect(result.prependContext).toContain("Read-only channel delivery policy");
    expect(result.prependContext).toContain("must not send direct replies");
    expect(result.prependContext).toContain('channel "telegram", target "relay-room"');
    expect(result.prependContext).toContain("exactly SKIP_RELAY");
  });

  it("reroutes direct replies to the configured relay destination", () => {
    expect(applyReadOnlyDeliveryPolicy(baseConfig, outboundEvent())).toEqual({
      decision: "reroute",
      destination: {
        channel: "telegram",
        to: "relay-room",
        conversationId: "relay-room",
        path: "message_action",
      },
      reason: "read_only_source_relay",
    });
  });

  it("cancels exact text-only SKIP_RELAY replies", () => {
    expect(
      applyReadOnlyDeliveryPolicy(
        baseConfig,
        outboundEvent({
          payload: { text: " SKIP_RELAY " },
        }),
      ),
    ).toEqual({
      decision: "cancel",
      reason: "skip_relay",
    });
  });

  it("does not treat mixed payloads as SKIP_RELAY", () => {
    expect(
      isSkipRelayPayload({ text: "SKIP_RELAY", mediaUrl: "file://image.png" }, "SKIP_RELAY"),
    ).toBe(false);
  });

  it("blocks implicit current-source replies even before an explicit channel route exists", () => {
    expect(
      applyReadOnlyDeliveryPolicy(
        baseConfig,
        outboundEvent({
          destination: {
            channel: "bluebubbles",
            to: "current-run",
            conversationId: "current-run",
            path: "internal_source",
          },
        }),
      ),
    ).toEqual({
      decision: "reroute",
      destination: {
        channel: "telegram",
        to: "relay-room",
        conversationId: "relay-room",
        path: "internal_source",
      },
      reason: "read_only_source_relay",
    });
  });

  it("can block direct sends to a configured read-only endpoint without source metadata", () => {
    expect(
      applyReadOnlyDeliveryPolicy(
        baseConfig,
        outboundEvent({
          source: undefined,
        }),
      ),
    ).toMatchObject({
      decision: "reroute",
      reason: "read_only_source_relay",
    });
  });

  it("uses run and session keys for turn correlation", () => {
    expect(collectTurnKeys({ runId: "run-1", sessionKey: "session-1" })).toEqual([
      "run:run-1",
      "session:session-1",
    ]);
  });
});
