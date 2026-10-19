# Security notes

## Connection secrets (encrypted at rest)

The secrets a church connects are encrypted with AES-256-GCM before they are stored (`src/lib/security/connection-secrets.ts`, format `cs1.<iv>.<tag>.<ciphertext>`):

| Secret | Table and column |
| --- | --- |
| Instagram access token | `instagram_connections.access_token` |
| YouTube access and refresh tokens | `youtube_connections.access_token`, `refresh_token` |
| Facebook Page access token | `facebook_connections.access_token` |
| Email (SMTP) password | `email_smtp_settings.password` |
| Church's own gateway key secret | `organization_razorpay_accounts.key_secret`, `organization_gateway_accounts.key_secret` |

WhatsApp credentials use their own key (`WHATSAPP_CREDENTIALS_KEY`, `src/lib/whatsapp/secret-box.ts`). The Facebook page picker cookie is sealed too.

- Key: `CONNECTION_SECRETS_KEY` (32 bytes, base64: `openssl rand -base64 32`). Set it in every environment that connects accounts. **Back it up.** Losing it makes the stored secrets unreadable and every church has to reconnect.
- Writing without the key fails with a clear error. A secret is never stored in plain text.
- Reading is tolerant: a value without the `cs1.` prefix is an older plain-text one and is passed through, so the app keeps working during rollout. It becomes encrypted the next time it is saved.
- Encrypt what is already stored with `node --env-file=.env.local scripts/encrypt-connection-secrets.mjs` (dry run) and then `--apply`. Safe to run again.
- Rollout order: set the key in the environment, deploy, run the script with `--apply`.
- Church admins can still select these rows through their own session, but now only see ciphertext. Reads and writes go through the data-access functions that open and seal values: add new readers there.
- Rotating the key is not automated. To rotate: decrypt with the old key and re-seal with a new one using a variant of the script.

## Browser security headers (`next.config.ts`)

- Everywhere: `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security` (1 year, no subdomains), `Permissions-Policy` (camera, microphone, location, screen capture limited to the site itself).
- Dashboard, platform admin, onboarding, sign-in and auth pages also send `X-Frame-Options: DENY` and `frame-ancestors 'none'`. Public pages stay embeddable because churches embed the website widget.
- The content security policy is sent as **`Content-Security-Policy-Report-Only`**: nothing is blocked. Violations are posted to `/api/csp-report` and written to the server log as `[csp-report]`. After a few weeks with no legitimate violations (calls, payments, live stream, YouTube embeds, the website widget), rename the header to `Content-Security-Policy` in `next.config.ts` to enforce it, then tighten `script-src` (it still allows `unsafe-inline` and `unsafe-eval`, which Next.js needs today).
