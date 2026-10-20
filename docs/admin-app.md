# KingdomFlow Admin app (Android)

Source: `MobApps/kingdomflow_admin` (its README has the screens, build and release notes). This file is the server side.

## API

Routes under `src/app/api/admin-app/`, all with `Authorization: Bearer <Supabase access token>`:

| Route | Scope | Notes |
| --- | --- | --- |
| `GET /me` | any | who is signed in, role (`owner` or `service`) and scopes |
| `GET /overview` | overview | `getPlatformOverview()` |
| `GET /churches`, `?id=` | churches | `getAllTenants()`, `getTenantUsage(id)` |
| `GET /tickets`, `?id=`, `?status=`, `?q=` | tickets | list with counts and choices, or one ticket with comments |
| `POST /tickets` | tickets | `{action:"create", ...}` or `{action:"comment", id, body}` |
| `PATCH /tickets` | tickets | `{id, status?, priority?, assignee?, release?}` |
| `GET /billing` | billing | earnings report, subscriptions by status, latest payments, owed to churches |
| `GET /health` | health | `getMobileHealth()` and the latest platform events (`?level=`) |

## Access

`src/lib/admin-app/auth.ts`: an email in `PLATFORM_ADMIN_EMAILS` is a platform owner with every scope; otherwise the
person needs an active row in `platform_service_users` (migration `0205`) and gets exactly the scopes on it. Every
route names the scope it needs through `withAdminScope`, so a new kind of user or section changes data, not logic.
The scopes are listed in `src/lib/admin-app/scopes.ts`.

## Not built yet

Managing service users from a screen (today a row is added by hand, see the app's README), push notifications for
the admin app, and write actions beyond tickets (for example payouts, feature flags, custom plans).
