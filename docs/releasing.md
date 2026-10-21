# Releasing

How a release is cut for the web app, the mobile app and the database. Versions are **not** bumped on ordinary
pushes; they change once, on purpose, when a production build is made. That keeps the numbers shown in Super
Admin → Versions meaning "what is actually released".

## Tickets

Every bug fix, feature and change request has a ticket in **Super Admin → Tickets** (KF-1, KF-2, ...). Raise one
there for anything you want changed ("Raise a new ticket or change request"). When work is done, move it to Done
and fill in the release and references. Developers log finished work with `scripts/create-ticket.mjs`. Put the
ticket keys in the release notes.

## 1. Decide the version

| Change | Bump |
| --- | --- |
| Fixes only | patch (1.4.2 → 1.4.3) |
| New features, nothing breaks | minor (1.4.x → 1.5.0) |
| Breaking change, agreed in advance | major |

Both apps can move independently, but a release that needs the other side (a new API, a new database function)
must say so in its notes and be deployed in the order in step 4.

## 2. Check before bumping

1. Everything on `main`, working tree clean.
2. Web: `npx tsc --noEmit`, `npx eslint src scripts`, `npx vitest run`, `npx next build`.
3. Mobile: `flutter analyze` (no errors or warnings), `flutter test`, `flutter build apk --debug` (and an iOS build on a Mac).
4. End-to-end smoke tests against the built web app: `npm run e2e` (see `e2e/README.md`).
5. Database: every new migration is listed in the release notes. Run `supabase/setup/verify-migrations-0182-0198.sql` and `supabase/setup/verify-migrations-0199-0207.sql` (one line per migration: OK, or how many things are missing)
   on staging first (extend it for new migrations).
6. Secrets and settings the release needs are set in the target environment (for example
   `CONNECTION_SECRETS_KEY`, `CRON_SECRET`).
7. Real-phone check of anything native: recording, full screen video, sign-in, payments.

## 3. Bump

- Web: `npm run version:bump` (patch by default; see `scripts/bump-version.mjs` for minor and major).
- Mobile: `tool/bump_version.sh patch|minor|major` (raises the build number too).

Commit the bump on its own: `Release web 1.0.38 / app 1.5.0`.

## 4. Deploy in this order

1. Apply the new **database migrations** (Supabase SQL editor, in number order). They are written to be safe
   before the code that uses them.
2. Set any new **environment variables**.
3. Deploy the **web app** (push to `main`; Vercel builds it).
4. Run any one-off scripts (for example `scripts/encrypt-connection-secrets.mjs --apply`).
5. Build and upload the **mobile app** (Play Console; App Store when live). The app needs the web app first,
   because it calls new API routes.
6. Check Super Admin → Versions shows the new numbers.

## 5. After

- Watch Super Admin → Platform events and the server log for errors for the first hour.
- Keep the previous mobile build available in Play Console for a quick rollback.
- Database changes are not rolled back automatically: each migration ends with a commented reversal.
