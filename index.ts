import {
  definePluginEntry,
  type OpenClawPluginApi,
  type PluginHookMessageSendingEvent,
  type PluginHookReplyPayload,
} from "openclaw/plugin-sdk/plugin-entry";
import {
  applyReadOnlyDeliveryPolicy,
  buildSourcePolicyResult,
  resolveReadOnlyRelayConfig,
  type ReadOnlyDeliveryDecision,
  type RelayDestination,
} from "./src/policy.js";

function mediaUrlsFromMetadata(metadata: Record<string, unknown> | undefined): string[] {
  const value = metadata?.mediaUrls;
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function startRelay(
  api: OpenClawPluginApi,
  destination: RelayDestination,
  payload: PluginHookReplyPayload,
): void {
  void (async () => {
    const adapter = await api.runtime.channel.outbound.loadAdapter(destination.channel);
    if (!adapter?.sendPayload) {
      throw new Error(`channel ${destination.channel} does not support payload delivery`);
    }
    await adapter.sendPayload({
      cfg: api.config,
      to: destination.to,
      text: payload.text ?? "",
      payload,
      ...(destination.accountId ? { accountId: destination.accountId } : {}),
      ...(destination.threadId !== undefined ? { threadId: destination.threadId } : {}),
    });
  })().catch((error) => {
    api.logger.error?.(`read-only-relay: relay failed: ${String(error)}`);
  });
}

function enforceDecision(
  api: OpenClawPluginApi,
  decision: ReadOnlyDeliveryDecision | undefined,
  payload: PluginHookReplyPayload,
): { cancel: true; reason: string; suppressFallback: true } | undefined {
  if (!decision) {
    return undefined;
  }
  if (decision.decision === "reroute") {
    startRelay(api, decision.destination, payload);
  }
  return { cancel: true, reason: decision.reason, suppressFallback: true };
}

function payloadFromMessageEvent(event: PluginHookMessageSendingEvent): PluginHookReplyPayload {
  const mediaUrls = mediaUrlsFromMetadata(event.metadata);
  return {
    text: event.content,
    ...(mediaUrls.length > 0 ? { mediaUrls } : {}),
  };
}

function isOperatorDelivery(scopes: readonly string[] | undefined): boolean {
  return scopes?.some((scope) => scope === "operator.write" || scope === "operator.admin") ?? false;
}

export default definePluginEntry({
  id: "read-only-relay",
  name: "Read-only Relay",
  description: "Blocks direct replies to configured read-only channel sources and relays them.",
  register(api: OpenClawPluginApi) {
    const getConfig = () => resolveReadOnlyRelayConfig(api.pluginConfig);

    api.on("before_prompt_build", (event, ctx) => {
      const channel = ctx.channel ?? ctx.messageProvider;
      if (!channel) {
        return undefined;
      }
      return buildSourcePolicyResult(getConfig(), {
        content: event.transcriptPrompt ?? event.prompt,
        channel,
        conversationId: ctx.chatId ?? ctx.channelId,
        accountId: ctx.accountId,
        sessionKey: ctx.sessionKey,
        senderId: ctx.senderId,
        senderName: ctx.senderName,
        senderE164: ctx.senderE164,
        senderIsSelf: ctx.channelContext?.sender?.isSelf === true,
      });
    });

    api.on("reply_payload_sending", (event, ctx) => {
      const sessionKey = event.sessionKey ?? ctx.sessionKey;
      const channel = event.channel ?? ctx.channelId;
      const to = ctx.conversationId;
      if (!sessionKey || !channel || !to) {
        return undefined;
      }
      const decision = applyReadOnlyDeliveryPolicy(getConfig(), {
        payload: event.payload,
        destination: {
          channel,
          to,
          conversationId: to,
          accountId: ctx.accountId,
        },
        sessionKey,
      });
      return enforceDecision(api, decision, event.payload);
    });

    api.on(
      "message_sending",
      (event, ctx) => {
        if (!ctx.channelId || isOperatorDelivery(ctx.gatewayClientScopes)) {
          return undefined;
        }
        const payload = payloadFromMessageEvent(event);
        const decision = applyReadOnlyDeliveryPolicy(getConfig(), {
          payload,
          destination: {
            channel: ctx.channelId,
            to: event.to,
            conversationId: event.to,
            accountId: ctx.accountId,
          },
          sessionKey: ctx.sessionKey,
        });
        const result = enforceDecision(api, decision, payload);
        return result ? { cancel: true, cancelReason: result.reason } : undefined;
      },
      { failurePolicy: "fail-closed" },
    );
  },
});

export {
  applyReadOnlyDeliveryPolicy,
  buildActiveReadOnlySource,
  buildSourcePolicyResult,
  isSkipRelayPayload,
  resolveReadOnlyRelayConfig,
} from "./src/policy.js";
export type {
  ActiveReadOnlySource,
  ReadOnlyDeliveryDecision,
  ReadOnlyDeliveryEvent,
  ReadOnlyRelayConfig,
  ReadOnlyRule,
  ReadOnlySourceEvent,
  RelayDestination,
} from "./src/policy.js";
