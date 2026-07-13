import {
  definePluginEntry,
  type OpenClawPluginApi,
} from "openclaw/plugin-sdk/plugin-entry";
import {
  applyReadOnlyDeliveryPolicy,
  buildSourcePolicyResult,
  resolveReadOnlyRelayConfig,
} from "./src/policy.js";

export default definePluginEntry({
  id: "read-only-relay",
  name: "Read-only Relay",
  description:
    "Blocks direct replies to configured read-only channel sources and relays them.",
  register(api: OpenClawPluginApi) {
    const getConfig = () => resolveReadOnlyRelayConfig(api.pluginConfig);

    api.on("source_policy", (event) => {
      return buildSourcePolicyResult(getConfig(), event);
    });

    api.on("outbound_delivery_policy", (event) =>
      applyReadOnlyDeliveryPolicy(getConfig(), event),
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
  ReadOnlyRelayConfig,
  ReadOnlyRule,
} from "./src/policy.js";
