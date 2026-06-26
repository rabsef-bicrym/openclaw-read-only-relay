# openclaw-read-only-relay

Generic OpenClaw plugin for read-only messaging sources.

The plugin lets a configured channel endpoint send inbound messages into OpenClaw while preventing OpenClaw from sending direct automatic replies or message-tool replies back through that same endpoint. Blocked replies are rerouted to a configured relay destination unless the attempted reply is exactly `SKIP_RELAY`.

```json
{
  "plugins": {
    "entries": {
      "read-only-relay": {
        "enabled": true,
        "config": {
          "rules": [
            {
              "channel": "bluebubbles",
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

When a rule matches the current source, the plugin adds prompt context explaining that the source channel is read-only, direct delivery is blocked, relay is required, and `SKIP_RELAY` suppresses relay only when used as the entire reply.
