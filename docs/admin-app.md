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

## More sections (generic)

`GET /sections` lists the extra sections a person may open; `GET /sections?section=<key>&filter=` returns one as a
document (title, headline numbers, groups of rows, buttons and the questions each button asks), and
`POST /sections {section, action, id, input}` runs a button. The app draws any of them with one screen, so a section
is added by writing a loader in `src/lib/admin-app/sections/`, with no new screen in the app.

| Scope | Sections |
| --- | --- |
| finance | Earnings, Expenses & investments, Payouts, Invoices (send again) |
| operations | Church usage, Active sessions, Cron jobs, Logs, Lapsed churches, Versions, Mobile app health, WhatsApp health |
| platform | Feature flags, Modules & pricing, Invoice template, WhatsApp templates, Onboarding |
| support | Support tickets, Deletion requests (app and web form) |
| users | Admin app users (platform owners only; it can't be given to a service user) |

`POST /churches` runs church actions: extend trial, give a plan, landing listing, Bible School and live streaming access.

## Not built yet

Uploading onboarding documents (done on the web dashboard; verifying them is in the app), custom plan rule overrides
(`CustomPlanDialog`), deleting a church, exporting a church report, the invoice logo and colours, the docs page, and
push notifications for the admin app.
