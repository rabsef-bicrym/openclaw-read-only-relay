import { definePluginEntry, type OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import {
  applyReadOnlyDeliveryPolicy,
  buildActiveReadOnlySource,
  buildReadOnlyPromptContext,
  buildSourcePolicyResult,
  collectTurnKeys,
  resolveReadOnlyRelayConfig,
  type ActiveReadOnlySource,
} from "./src/policy.js";

const activeSources = new Map<string, ActiveReadOnlySource>();

function rememberActiveSource(keys: string[], active: ActiveReadOnlySource): void {
  for (const key of keys) {
    activeSources.set(key, active);
  }
}

function resolveActiveSource(keys: string[]): ActiveReadOnlySource | undefined {
  for (const key of keys) {
    const active = activeSources.get(key);
    if (active) {
      return active;
    }
  }
  return undefined;
}

function forgetActiveSource(keys: string[]): void {
  for (const key of keys) {
    activeSources.delete(key);
  }
}

export default definePluginEntry({
  id: "read-only-relay",
  name: "Read-only Relay",
  description: "Blocks direct replies to configured read-only channel sources and relays them.",
  register(api: OpenClawPluginApi) {
    const config = resolveReadOnlyRelayConfig(api.pluginConfig);

    api.on("source_policy", (event, ctx) => {
      const active = buildActiveReadOnlySource(config, event);
      if (active) {
        rememberActiveSource(
          collectTurnKeys({
            runId: event.runId ?? ctx.runId,
            sessionKey: event.sessionKey ?? ctx.sessionKey,
          }),
          active,
        );
      }
      return buildSourcePolicyResult(config, event);
    });

    api.on("before_prompt_build", (_event, ctx) => {
      const active = resolveActiveSource(
        collectTurnKeys({
          runId: ctx.runId,
          sessionKey: ctx.sessionKey,
        }),
      );
      return active ? buildReadOnlyPromptContext(active) : undefined;
    });

    api.on("outbound_delivery_policy", (event) => applyReadOnlyDeliveryPolicy(config, event));

    api.on("agent_end", (_event, ctx) => {
      forgetActiveSource(
        collectTurnKeys({
          runId: ctx.runId,
          sessionKey: ctx.sessionKey,
        }),
      );
    });
  },
});

export {
  applyReadOnlyDeliveryPolicy,
  buildActiveReadOnlySource,
  buildReadOnlyPromptContext,
  buildSourcePolicyResult,
  collectTurnKeys,
  isSkipRelayPayload,
  resolveReadOnlyRelayConfig,
} from "./src/policy.js";
export type { ActiveReadOnlySource, ReadOnlyRelayConfig, ReadOnlyRule } from "./src/policy.js";
