# openclaw-read-only-relay

Generic OpenClaw plugin for read-only messaging sources.

Requires OpenClaw `2026.8.2` or newer with the proposed `before_prompt_build` model-prompt replacement and Gateway-scope hook additions. Delivery enforcement uses the standard `reply_payload_sending` and `message_sending` hooks.

The plugin lets configured channel endpoints send inbound messages into OpenClaw while preventing OpenClaw from sending direct automatic replies or message-tool replies back through those same endpoints. Blocked replies are rerouted to a configured relay destination unless the attempted reply is exactly `SKIP_RELAY`. Authenticated operator sends such as `openclaw message send` carry `operator.write` or `operator.admin` scope and remain available.

The plugin ships with no facilities blocked. Configure either precise endpoint rules or the optional `blockedChannels` shorthand.

For a matching source, the default `promptTemplate: "{message}"` uses the original message as the model-visible inbound body.
Set `promptTemplate` to add source metadata and policy guidance without duplicating the message.

Local checkout install:

```bash
openclaw plugins install --link /path/to/openclaw-read-only-relay
openclaw config set plugins.entries.read-only-relay.enabled true
openclaw config set plugins.entries.read-only-relay.hooks.allowConversationAccess true
```

OpenClaw 2.0 requires the explicit conversation-access grant because the plugin
reads the current inbound message in `before_prompt_build`. Without it, delivery
blocking still loads but the configurable inbound prompt template does not run.

Precise endpoint rule:

```json
{
  "plugins": {
    "entries": {
      "read-only-relay": {
        "enabled": true,
        "config": {
          "rules": [
            {
              "channel": "imessage",
              "conversationId": "+15551234567",
              "relay": {
                "channel": "telegram",
                "to": "123456789"
              }
            }
          ]
        }
      }
    }
  }
}
```

Channel-wide shorthand:

```json
{
  "plugins": {
    "entries": {
      "read-only-relay": {
        "enabled": true,
        "config": {
          "blockedChannels": ["imessage", "whatsapp"],
          "relay": {
            "channel": "telegram",
            "to": "123456789"
          }
        }
      }
    }
  }
}
```

When a rule matches the current source, the plugin replaces the current inbound model prompt with the rendered `promptTemplate`. `{message}` is the exact current transcript message, not OpenClaw's model-only routing or context envelope. The default template is `{message}`.
Prompt template placeholders:

```text
{message}
{channel}
{platform}
{sender}
{conversation_id}
{account_id}
{relay_channel}
{relay_target}
{skip_relay_token}
{operator_guidance}
{response_options}
{relay_prefix_contract}
```

XML prompt replacement:

```json
{
  "plugins": {
    "entries": {
      "read-only-relay": {
        "enabled": true,
        "config": {
          "blockedChannels": ["imessage", "whatsapp"],
          "relay": {
            "channel": "telegram",
            "to": "123456789"
          },
          "promptTemplate": "<incoming_message_on_read_only_surface>\n  <platform>{platform}</platform>\n  <sender>{sender}</sender>\n  <system_note>{operator_guidance}</system_note>\n  <response_options>{response_options}</response_options>\n  <message>{message}</message>\n</incoming_message_on_read_only_surface>",
          "templateEscaping": "xml"
        }
      }
    }
  }
}
```
