import type { OpenClawPluginApi, PluginHookHandlerMap } from "openclaw/plugin-sdk/plugin-entry";
import { describe, expect, it, vi } from "vitest";
import plugin from "../index.js";

type CapturedHooks = Partial<PluginHookHandlerMap>;
type CapturedHookOptions = Partial<
  Record<keyof PluginHookHandlerMap, { failurePolicy?: "fail-open" | "fail-closed" }>
>;

function createApi(overrides: Partial<OpenClawPluginApi> = {}) {
  const hooks: CapturedHooks = {};
  const hookOptions: CapturedHookOptions = {};
  const sendPayload = vi.fn(async () => ({ ok: true }));
  const api: OpenClawPluginApi = {
    config: {},
    logger: {},
    pluginConfig: {},
    runtime: {
      channel: {
        outbound: {
          loadAdapter: async () => ({ sendPayload }),
        },
      },
    },
    ...overrides,
    on(hookName, handler, options) {
      hooks[hookName] = handler as CapturedHooks[typeof hookName];
      hookOptions[hookName] = options;
    },
  };
  return { api, hooks, hookOptions, sendPayload };
}

const pluginConfig = {
  blockedChannels: ["imessage"],
  relay: {
    channel: "telegram",
    to: "relay-room",
  },
  promptTemplate: "<read_only>{message}:{platform}:{sender}</read_only>",
  templateEscaping: "xml",
};

describe("read-only relay plugin entry", () => {
  it("registers outbound enforcement as fail closed", () => {
    const { api, hookOptions } = createApi({ pluginConfig });

    plugin.register(api);

    expect(hookOptions.message_sending).toEqual({ failurePolicy: "fail-closed" });
  });

  it("replaces one model prompt using the plugin configuration", async () => {
    const { api, hooks } = createApi({ pluginConfig });
    plugin.register(api);

    const result = await hooks.before_prompt_build?.(
      {
        prompt: "OpenClaw assembled metadata\n\nhello <world>",
        transcriptPrompt: "hello <world>",
        messages: [],
      },
      {
        channelId: "+15551234567",
        channel: "imessage",
        chatId: "+15551234567",
        senderId: "chat_id:329",
        senderName: "Alice",
        senderE164: "+15551234567",
        channelContext: { sender: { isSelf: true } },
      },
    );

    expect(result).toEqual({
      prompt:
        "<read_only>hello &lt;world&gt;:iMessage:Alice (+15551234567)</read_only>",
    });
  });

  it("uses the model prompt when no separate transcript prompt is available", async () => {
    const { api, hooks } = createApi({ pluginConfig });
    plugin.register(api);

    const result = await hooks.before_prompt_build?.(
      { prompt: "hello", messages: [] },
      { channel: "imessage", chatId: "+15551234567", senderId: "+15551234567" },
    );

    expect(result).toEqual({
      prompt: "<read_only>hello:iMessage:+15551234567</read_only>",
    });
  });

  it("forwards the channel-authenticated self sender fact", async () => {
    const { api, hooks } = createApi({
      pluginConfig: { ...pluginConfig, promptTemplate: "{operator_guidance}" },
    });
    plugin.register(api);

    const result = await hooks.before_prompt_build?.(
      { prompt: "hello", messages: [] },
      {
        channel: "imessage",
        senderId: "+15551234567",
        channelContext: { sender: { isSelf: true } },
      },
    );

    expect(result?.prompt).toContain("direct instruction from your user");
  });

  it("cancels an automatic blocked reply and relays its full payload", async () => {
    const { api, hooks, sendPayload } = createApi({ pluginConfig });
    plugin.register(api);

    const payload = { text: "relay this", mediaUrls: ["file:///tmp/image.png"] };
    const result = await hooks.reply_payload_sending?.(
      { payload, kind: "final", channel: "imessage", sessionKey: "agent:main:eric" },
      {
        channelId: "imessage",
        conversationId: "+15551234567",
        sessionKey: "agent:main:eric",
      },
    );

    expect(result).toEqual({
      cancel: true,
      reason: "read_only_source_relay",
      suppressFallback: true,
    });
    await vi.waitFor(() => expect(sendPayload).toHaveBeenCalledOnce());
    expect(sendPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "relay-room",
        text: "relay this",
        payload,
      }),
    );
  });

  it("cancels exact SKIP_RELAY without sending a relay", async () => {
    const { api, hooks, sendPayload } = createApi({ pluginConfig });
    plugin.register(api);

    const result = await hooks.reply_payload_sending?.(
      {
        payload: { text: "SKIP_RELAY" },
        kind: "final",
        channel: "imessage",
        sessionKey: "agent:main:eric",
      },
      {
        channelId: "imessage",
        conversationId: "+15551234567",
        sessionKey: "agent:main:eric",
      },
    );

    expect(result).toEqual({ cancel: true, reason: "skip_relay", suppressFallback: true });
    expect(sendPayload).not.toHaveBeenCalled();
  });

  it("allows authenticated operator CLI sends even when delivery derives a session", async () => {
    const { api, hooks, sendPayload } = createApi({ pluginConfig });
    plugin.register(api);

    const result = await hooks.message_sending?.(
      { to: "+15551234567", content: "operator message" },
      {
        channelId: "imessage",
        conversationId: "+15551234567",
        gatewayClientScopes: ["operator.write"],
        sessionKey: "agent:main:imessage:direct:+15551234567",
      },
    );

    expect(result).toBeUndefined();
    expect(sendPayload).not.toHaveBeenCalled();
  });

  it("blocks non-operator delivery even when no session is attached", async () => {
    const { api, hooks, sendPayload } = createApi({ pluginConfig });
    plugin.register(api);

    const result = await hooks.message_sending?.(
      { to: "+15551234567", content: "background delivery" },
      { channelId: "imessage", conversationId: "+15551234567" },
    );

    expect(result).toEqual({ cancel: true, cancelReason: "read_only_source_relay" });
    await vi.waitFor(() => expect(sendPayload).toHaveBeenCalledOnce());
  });

  it("cancels and relays an explicit agent message-tool send", async () => {
    const { api, hooks, sendPayload } = createApi({ pluginConfig });
    plugin.register(api);

    const result = await hooks.message_sending?.(
      { to: "+15551234567", content: "explicit reply" },
      {
        channelId: "imessage",
        conversationId: "+15551234567",
        sessionKey: "agent:main:eric",
      },
    );

    expect(result).toEqual({ cancel: true, cancelReason: "read_only_source_relay" });
    await vi.waitFor(() => expect(sendPayload).toHaveBeenCalledOnce());
  });
});
