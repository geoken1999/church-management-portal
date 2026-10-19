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
- Writing without the key fails with a clear error (connecting an account, saving SMTP or gateway keys). A secret is never stored in plain text. Automatic token refreshes (YouTube, Instagram) are the exception that keeps a working connection alive: without the key they use the new token for that call but do not save it. Set the key before you deploy.
- Reading is tolerant: a value without the `cs1.` prefix is an older plain-text one and is passed through, so the app keeps working during rollout. It becomes encrypted the next time it is saved.
- Encrypt what is already stored with `node --env-file=.env.local scripts/encrypt-connection-secrets.mjs` (dry run) and then `--apply`. Safe to run again.
- Rollout order: set the key in the environment, deploy, run the script with `--apply`.
- Church admins can still select these rows through their own session, but now only see ciphertext. Reads and writes go through the data-access functions that open and seal values: add new readers there.
- Rotating the key: see "Key ownership and rotation" below.

## Key ownership and rotation

**Who holds the key.** `CONNECTION_SECRETS_KEY` lives in two places only: the hosting environment variables (Vercel, one copy per environment) and a password manager entry the owner of the platform controls, with at least one other trusted person able to open it. It is never in git, chat or email. Write down in that entry who has access and when it was last rotated. WhatsApp credentials use a different key (`WHATSAPP_CREDENTIALS_KEY`); rotating that one is a separate job and is not covered by the script.

**When to rotate.** Every 12 months, when anyone with access to the key leaves, or at once if it may have leaked (for example pasted in a ticket or shown on a screen share).

**How.**
1. Generate a new key: `openssl rand -base64 32`. Save it in the password manager next to the current one, labelled "new".
2. Dry run: `CONNECTION_SECRETS_KEY_OLD=<current> CONNECTION_SECRETS_KEY=<new> node --env-file=.env.local scripts/rotate-connection-secrets.mjs`. It lists how many values it would re-encrypt and fails if any value opens with neither key.
3. Pick a quiet time. Run the same command with `--apply`, then immediately set the new key as `CONNECTION_SECRETS_KEY` in the hosting environment and redeploy. Between those two steps the running app cannot read re-encrypted rows, so keep the gap to a few minutes.
4. Check an Instagram post, a YouTube page load, a test email and a gateway test payment. Keep the old key in the password manager, marked "retired", for 30 days, then delete it.
5. If something goes wrong, put the old key back and run the script the other way round (swap the two variables).

The script never overwrites a value that opens with neither key, so a mistake in the key variables cannot destroy data. Run it again after a failure: rows already moved are skipped.

## Browser security headers (`next.config.ts`)

- Everywhere: `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security` (1 year, no subdomains), `Permissions-Policy` (camera, microphone, location, screen capture limited to the site itself).
- Dashboard, platform admin, onboarding, sign-in and auth pages also send `X-Frame-Options: DENY` and `frame-ancestors 'none'`. Public pages stay embeddable because churches embed the website widget.
- The content security policy is sent as **`Content-Security-Policy-Report-Only`**: nothing is blocked. Violations are posted to `/api/csp-report` and written to the server log as `[csp-report]`. After a few weeks with no legitimate violations (calls, payments, live stream, YouTube embeds, the website widget), rename the header to `Content-Security-Policy` in `next.config.ts` to enforce it, then tighten `script-src` (it still allows `unsafe-inline` and `unsafe-eval`, which Next.js needs today).
