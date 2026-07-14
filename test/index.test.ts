import type {
  OpenClawPluginApi,
  PluginHookHandlerMap,
} from "openclaw/plugin-sdk/plugin-entry";
import { describe, expect, it } from "vitest";
import plugin from "../index.js";

type CapturedHooks = Partial<PluginHookHandlerMap>;

function createApi(overrides: Partial<OpenClawPluginApi> = {}) {
  const hooks: CapturedHooks = {};
  const api: OpenClawPluginApi = {
    ...overrides,
    on(hookName, handler) {
      hooks[hookName] = handler as CapturedHooks[typeof hookName];
    },
  };
  return { api, hooks };
}

describe("read-only relay plugin entry", () => {
  it("uses the plugin config supplied by OpenClaw", async () => {
    const { api, hooks } = createApi({
      pluginConfig: {
        blockedChannels: ["imessage"],
        relay: {
          channel: "telegram",
          to: "relay-room",
        },
        promptTemplate:
          "<read_only>{message}:{platform}:{sender}</read_only>",
        templateEscaping: "xml",
      },
    });
    plugin.register(api);

    const result = await hooks.source_policy?.(
      {
        content: "hello <world>",
        body: "hello <world>",
        channel: "imessage",
        conversationId: "+15551234567",
        senderId: "+15551234567",
        isGroup: false,
        sendPolicy: "allow",
      },
      {
        channelId: "imessage",
        conversationId: "+15551234567",
      },
    );

    expect(result).toEqual({
      promptBody:
        "<read_only>hello &lt;world&gt;:iMessage:+15551234567</read_only>",
      currentInboundContext: null,
      reason: "source channel imessage is read-only",
    });
  });
});
