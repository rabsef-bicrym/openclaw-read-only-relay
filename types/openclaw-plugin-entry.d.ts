declare module "openclaw/plugin-sdk/plugin-entry" {
  export type PluginHookAgentContext = {
    channelId?: string;
    channel?: string;
    messageProvider?: string;
    chatId?: string;
    accountId?: string;
    conversationId?: string;
    gatewayClientScopes?: readonly string[];
    sessionKey?: string;
    senderId?: string;
    senderName?: string;
    senderE164?: string;
    channelContext?: {
      sender?: {
        id?: string;
        isSelf?: boolean;
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
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

  export type PluginHookBeforePromptBuildEvent = {
    prompt: string;
    transcriptPrompt?: string;
    messages: unknown[];
  };

  export type PluginHookBeforePromptBuildResult = {
    prompt?: string;
    systemPrompt?: string;
    prependContext?: string;
    appendContext?: string;
    prependSystemContext?: string;
    appendSystemContext?: string;
  };

  export type PluginHookReplyPayloadSendingEvent = {
    payload: PluginHookReplyPayload;
    kind: string;
    channel?: string;
    sessionKey?: string;
    runId?: string;
  };

  export type PluginHookReplyPayloadSendingResult = {
    payload?: PluginHookReplyPayload;
    cancel?: boolean;
    reason?: string;
    suppressFallback?: boolean;
  };

  export type PluginHookMessageSendingEvent = {
    to: string;
    content: string;
    replyToId?: string | number;
    threadId?: string | number;
    metadata?: Record<string, unknown>;
  };

  export type PluginHookMessageSendingResult = {
    content?: string;
    cancel?: boolean;
    cancelReason?: string;
    metadata?: Record<string, unknown>;
  };

  export type PluginHookHandlerMap = {
    before_prompt_build: (
      event: PluginHookBeforePromptBuildEvent,
      ctx: PluginHookAgentContext,
    ) =>
      | PluginHookBeforePromptBuildResult
      | void
      | Promise<PluginHookBeforePromptBuildResult | void>;
    reply_payload_sending: (
      event: PluginHookReplyPayloadSendingEvent,
      ctx: PluginHookAgentContext,
    ) =>
      | PluginHookReplyPayloadSendingResult
      | void
      | Promise<PluginHookReplyPayloadSendingResult | void>;
    message_sending: (
      event: PluginHookMessageSendingEvent,
      ctx: PluginHookAgentContext,
    ) => PluginHookMessageSendingResult | void | Promise<PluginHookMessageSendingResult | void>;
  };

  export type ChannelOutboundAdapter = {
    sendPayload?: (params: {
      cfg: unknown;
      to: string;
      text: string;
      payload: PluginHookReplyPayload;
      accountId?: string;
      threadId?: string | number;
    }) => Promise<unknown>;
  };

  export type OpenClawPluginApi = {
    config: unknown;
    pluginConfig?: Record<string, unknown>;
    logger: {
      error?: (message: string) => void;
    };
    runtime: {
      channel: {
        outbound: {
          loadAdapter: (channel: string) => Promise<ChannelOutboundAdapter | undefined>;
        };
      };
    };
    on: <K extends keyof PluginHookHandlerMap>(
      hookName: K,
      handler: PluginHookHandlerMap[K],
      opts?: {
        priority?: number;
        timeoutMs?: number;
        failurePolicy?: K extends "message_sending" ? "fail-open" | "fail-closed" : never;
      },
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
