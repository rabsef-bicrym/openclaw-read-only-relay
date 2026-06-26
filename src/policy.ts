import type {
  PluginHookBeforePromptBuildResult,
  PluginHookOutboundDeliveryPolicyDestination,
  PluginHookOutboundDeliveryPolicyEvent,
  PluginHookOutboundDeliveryPolicyResult,
  PluginHookOutboundDeliveryPolicySource,
  PluginHookReplyPayload,
  PluginHookSourcePolicyEvent,
  PluginHookSourcePolicyResult,
} from "openclaw/plugin-sdk/plugin-entry";

const DEFAULT_SKIP_RELAY_TOKEN = "SKIP_RELAY";

export type RelayDestination = {
  channel: string;
  to: string;
  accountId?: string;
  threadId?: string | number;
};

export type ReadOnlyRule = {
  channel: string;
  conversationId?: string;
  accountId?: string;
  relay: RelayDestination;
};

export type ReadOnlyRelayConfig = {
  enabled: boolean;
  skipRelayToken: string;
  rules: ReadOnlyRule[];
};

export type ActiveReadOnlySource = {
  rule: ReadOnlyRule;
  source: {
    channel: string;
    conversationId?: string;
    accountId?: string;
  };
  skipRelayToken: string;
};

type Endpoint = {
  channel?: string;
  conversationId?: string;
  accountId?: string;
};

/** Parse plugin config into the strict rule shape consumed by the hooks. */
export function resolveReadOnlyRelayConfig(rawConfig: unknown): ReadOnlyRelayConfig {
  const input = isRecord(rawConfig) ? rawConfig : {};
  const skipRelayToken = cleanString(input.skipRelayToken) ?? DEFAULT_SKIP_RELAY_TOKEN;
  const rules = Array.isArray(input.rules) ? input.rules.flatMap((entry) => parseRule(entry)) : [];

  return {
    enabled: input.enabled !== false,
    skipRelayToken,
    rules,
  };
}

/** Return the first configured read-only rule matching an inbound source event. */
export function findRuleForSource(
  config: ReadOnlyRelayConfig,
  event: PluginHookSourcePolicyEvent,
): ReadOnlyRule | undefined {
  if (!config.enabled) {
    return undefined;
  }
  const source = {
    channel: event.channel,
    conversationId: event.conversationId,
    accountId: event.accountId,
  };
  return config.rules.find((rule) => matchesRuleEndpoint(rule, source));
}

/** Force source-visible replies through the message tool when the source is read-only. */
export function buildSourcePolicyResult(
  config: ReadOnlyRelayConfig,
  event: PluginHookSourcePolicyEvent,
): PluginHookSourcePolicyResult | undefined {
  const rule = findRuleForSource(config, event);
  if (!rule) {
    return undefined;
  }
  return {
    sourceReplyDeliveryMode: "message_tool_only",
    reason: `source channel ${rule.channel} is read-only`,
  };
}

/** Create the LLM-visible policy instructions for the active read-only source. */
export function buildReadOnlyPromptContext(
  active: ActiveReadOnlySource,
): PluginHookBeforePromptBuildResult {
  const sourceLabel = describeEndpoint(active.source);
  const relayLabel = describeRelay(active.rule.relay);
  return {
    prependContext: [
      "Read-only channel delivery policy:",
      `- The current source ${sourceLabel} can send inbound messages into OpenClaw, but OpenClaw must not send direct replies back through that source channel.`,
      `- If you need to answer the human, write the answer normally; OpenClaw will relay blocked source-channel delivery to ${relayLabel}.`,
      `- To intentionally suppress relay, respond with exactly ${active.skipRelayToken} and no other content.`,
    ].join("\n"),
  };
}

/** Apply read-only relay rules to an outbound delivery attempt. */
export function applyReadOnlyDeliveryPolicy(
  config: ReadOnlyRelayConfig,
  event: PluginHookOutboundDeliveryPolicyEvent,
): PluginHookOutboundDeliveryPolicyResult | undefined {
  if (!config.enabled) {
    return undefined;
  }

  const rule =
    findRuleForOutboundSource(config, event.source) ??
    config.rules.find((candidate) => matchesDestination(candidate, event.destination));
  if (!rule) {
    return undefined;
  }

  if (!shouldBlockDestination(rule, event)) {
    return undefined;
  }

  if (isSkipRelayPayload(event.payload, config.skipRelayToken)) {
    return {
      decision: "cancel",
      reason: "skip_relay",
    };
  }

  const destination = buildRelayDestination(rule, event.destination.path);
  if (matchesDestination(rule, destination)) {
    return {
      decision: "cancel",
      reason: "read_only_relay_destination_matches_blocked_source",
    };
  }

  return {
    decision: "reroute",
    destination,
    reason: "read_only_source_relay",
  };
}

/** Build a per-turn active source record for later LLM prompt metadata. */
export function buildActiveReadOnlySource(
  config: ReadOnlyRelayConfig,
  event: PluginHookSourcePolicyEvent,
): ActiveReadOnlySource | undefined {
  const rule = findRuleForSource(config, event);
  if (!rule) {
    return undefined;
  }
  return {
    rule,
    source: {
      channel: event.channel,
      ...(event.conversationId ? { conversationId: event.conversationId } : {}),
      ...(event.accountId ? { accountId: event.accountId } : {}),
    },
    skipRelayToken: config.skipRelayToken,
  };
}

/** Return stable correlation keys shared across source, prompt, and cleanup hooks. */
export function collectTurnKeys(params: { runId?: string; sessionKey?: string }): string[] {
  const keys: string[] = [];
  if (params.runId) {
    keys.push(`run:${params.runId}`);
  }
  if (params.sessionKey) {
    keys.push(`session:${params.sessionKey}`);
  }
  return keys;
}

/** Decide whether a payload is the exact configured no-relay signal. */
export function isSkipRelayPayload(payload: PluginHookReplyPayload, token: string): boolean {
  if ((payload.text ?? "").trim() !== token) {
    return false;
  }
  return (
    !payload.mediaUrl &&
    (!payload.mediaUrls || payload.mediaUrls.length === 0) &&
    !payload.presentation &&
    !payload.interactive &&
    !payload.btw &&
    !payload.spokenText
  );
}

function parseRule(value: unknown): ReadOnlyRule[] {
  if (!isRecord(value)) {
    return [];
  }
  const channel = cleanString(value.channel);
  const relay = parseRelay(value.relay);
  if (!channel || !relay) {
    return [];
  }
  return [
    {
      channel,
      ...(cleanString(value.conversationId)
        ? { conversationId: cleanString(value.conversationId) }
        : {}),
      ...(cleanString(value.accountId) ? { accountId: cleanString(value.accountId) } : {}),
      relay,
    },
  ];
}

function parseRelay(value: unknown): RelayDestination | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const channel = cleanString(value.channel);
  const to = cleanString(value.to);
  if (!channel || !to) {
    return undefined;
  }
  const threadId =
    typeof value.threadId === "string" || typeof value.threadId === "number"
      ? value.threadId
      : undefined;
  return {
    channel,
    to,
    ...(cleanString(value.accountId) ? { accountId: cleanString(value.accountId) } : {}),
    ...(threadId !== undefined ? { threadId } : {}),
  };
}

function findRuleForOutboundSource(
  config: ReadOnlyRelayConfig,
  source: PluginHookOutboundDeliveryPolicySource | undefined,
): ReadOnlyRule | undefined {
  if (!source) {
    return undefined;
  }
  return config.rules.find((rule) => matchesRuleEndpoint(rule, source));
}

function shouldBlockDestination(
  rule: ReadOnlyRule,
  event: PluginHookOutboundDeliveryPolicyEvent,
): boolean {
  if (event.destination.path === "internal_source") {
    return true;
  }
  return matchesDestination(rule, event.destination);
}

function matchesDestination(
  rule: ReadOnlyRule,
  destination: Pick<
    PluginHookOutboundDeliveryPolicyDestination,
    "channel" | "conversationId" | "accountId"
  >,
): boolean {
  return matchesRuleEndpoint(rule, destination);
}

function matchesRuleEndpoint(rule: ReadOnlyRule, endpoint: Endpoint): boolean {
  if (rule.channel !== endpoint.channel) {
    return false;
  }
  if (rule.accountId && rule.accountId !== endpoint.accountId) {
    return false;
  }
  if (rule.conversationId && rule.conversationId !== endpoint.conversationId) {
    return false;
  }
  return true;
}

function buildRelayDestination(
  rule: ReadOnlyRule,
  path: PluginHookOutboundDeliveryPolicyDestination["path"],
): PluginHookOutboundDeliveryPolicyDestination {
  return {
    channel: rule.relay.channel,
    to: rule.relay.to,
    conversationId: rule.relay.to,
    path,
    ...(rule.relay.accountId ? { accountId: rule.relay.accountId } : {}),
    ...(rule.relay.threadId !== undefined ? { threadId: rule.relay.threadId } : {}),
  };
}

function describeEndpoint(endpoint: Endpoint): string {
  const parts = [`channel "${endpoint.channel ?? "unknown"}"`];
  if (endpoint.conversationId) {
    parts.push(`conversation "${endpoint.conversationId}"`);
  }
  if (endpoint.accountId) {
    parts.push(`account "${endpoint.accountId}"`);
  }
  return parts.join(", ");
}

function describeRelay(relay: RelayDestination): string {
  const parts = [`channel "${relay.channel}"`, `target "${relay.to}"`];
  if (relay.accountId) {
    parts.push(`account "${relay.accountId}"`);
  }
  if (relay.threadId !== undefined) {
    parts.push(`thread "${String(relay.threadId)}"`);
  }
  return parts.join(", ");
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
