declare module "openclaw/plugin-sdk/plugin-entry" {
  export type PluginHookAgentContext = {
    runId?: string;
    sessionKey?: string;
  };

  export type PluginHookMessageContext = {
    channelId: string;
    accountId?: string;
    conversationId?: string;
    sessionKey?: string;
    runId?: string;
  };

  export type PluginHookBeforePromptBuildEvent = {
    prompt: string;
    messages: unknown[];
  };

  export type PluginHookBeforePromptBuildResult = {
    systemPrompt?: string;
    prependContext?: string;
    appendContext?: string;
    prependSystemContext?: string;
    appendSystemContext?: string;
  };

  export type PluginHookReplyPayload = {
    text?: string;
    mediaUrl?: string;
    mediaUrls?: string[];
    presentation?: unknown;
    interactive?: unknown;
    btw?: { question: string };
    spokenText?: string;
  };

  export type PluginHookSourcePolicyEvent = {
    content: string;
    body?: string;
    channel: string;
    accountId?: string;
    conversationId?: string;
    sessionKey?: string;
    runId?: string;
    senderId?: string;
    replyToId?: string;
    replyToBody?: string;
    replyToSender?: string;
    isGroup: boolean;
    chatType?: string;
    inboundEventKind?: string;
    requestedSourceReplyDeliveryMode?: string;
    configuredVisibleReplies?: "automatic" | "message_tool";
    defaultVisibleReplies?: "automatic" | "message_tool";
    sendPolicy: "allow" | "deny";
  };

  export type PluginHookSourcePolicyResult = {
    sourceReplyDeliveryMode?: "message_tool_only";
    reason?: string;
  };

  export type PluginHookOutboundDeliveryPolicyPath =
    | "durable_delivery"
    | "message_action"
    | "internal_source";

  export type PluginHookOutboundDeliveryPolicySource = {
    channel?: string;
    conversationId?: string;
    accountId?: string;
    sessionKey?: string;
    senderId?: string;
    threadId?: string | number;
    inboundEventKind?: string;
  };

  export type PluginHookOutboundDeliveryPolicyDestination = {
    channel: string;
    to: string;
    conversationId: string;
    accountId?: string;
    threadId?: string | number;
    path: PluginHookOutboundDeliveryPolicyPath;
  };

  export type PluginHookOutboundDeliveryPolicyEvent = {
    payload: PluginHookReplyPayload;
    kind: string;
    action?: string;
    source?: PluginHookOutboundDeliveryPolicySource;
    destination: PluginHookOutboundDeliveryPolicyDestination;
    sessionKey?: string;
    runId?: string;
  };

  export type PluginHookOutboundDeliveryPolicyResult =
    | {
        decision?: "allow";
        payload?: PluginHookReplyPayload;
        reason?: string;
      }
    | {
        decision: "cancel";
        payload?: PluginHookReplyPayload;
        reason?: string;
      }
    | {
        decision: "reroute";
        destination: PluginHookOutboundDeliveryPolicyDestination;
        payload?: PluginHookReplyPayload;
        reason?: string;
      };

  export type PluginHookHandlerMap = {
    source_policy: (
      event: PluginHookSourcePolicyEvent,
      ctx: PluginHookMessageContext,
    ) => PluginHookSourcePolicyResult | void | Promise<PluginHookSourcePolicyResult | void>;
    before_prompt_build: (
      event: PluginHookBeforePromptBuildEvent,
      ctx: PluginHookAgentContext,
    ) =>
      | PluginHookBeforePromptBuildResult
      | void
      | Promise<PluginHookBeforePromptBuildResult | void>;
    outbound_delivery_policy: (
      event: PluginHookOutboundDeliveryPolicyEvent,
      ctx: PluginHookMessageContext,
    ) =>
      | PluginHookOutboundDeliveryPolicyResult
      | void
      | Promise<PluginHookOutboundDeliveryPolicyResult | void>;
    agent_end: (event: unknown, ctx: PluginHookAgentContext) => void | Promise<void>;
  };

  export type OpenClawPluginApi = {
    pluginConfig?: Record<string, unknown>;
    on: <K extends keyof PluginHookHandlerMap>(
      hookName: K,
      handler: PluginHookHandlerMap[K],
      opts?: { priority?: number; timeoutMs?: number },
    ) => void;
  };

  export function definePluginEntry(params: {
    id: string;
    name: string;
    description: string;
    register: (api: OpenClawPluginApi) => void;
  }): {
    id: string;
    name: string;
    description: string;
    register: (api: OpenClawPluginApi) => void;
  };
}
