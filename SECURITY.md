# Security

Do not put credentials, tokens, device states or private instance URLs in public issues or pull requests. Report vulnerabilities privately to the repository maintainer through a private channel listed on their profile or GitHub private vulnerability reporting when enabled.

This starter authenticates directly from the browser to Home Assistant. Session tokens are available to same-origin scripts; it does not provide server-side authentication for future Next.js endpoints. Keep the hosting origin trusted and use Home Assistant permissions appropriate to the user.

Use HTTPS in production. Do not disable certificate checks or browser protections to work around connectivity. Service calls are intentionally not retried automatically. Check device state before retrying a command whose result was lost.
