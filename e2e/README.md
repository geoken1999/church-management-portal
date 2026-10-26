# End-to-end tests

Smoke tests that drive a real browser against the **built** web app. They check what unit tests cannot: that the
pages actually render, that private pages turn visitors away, that the endpoints answer sensibly, that the
security headers are on, and that the student portal sign-in behaves.

## Safe by design

They are **read-only**. They open public pages, check redirects and status codes, and submit only input that is
refused before anything is saved (for example a phone number nobody has). They never create, change or delete
data, so running them against the project in `.env.local` is safe. Keep it that way: a test that needs a signed-in
user or writes data belongs against a staging project with test data, not here.

The server they start sets a known `CRON_SECRET`, so the scheduled-job routes demand it, as in production.

## Run

```
npx next build
npm run e2e                       # starts the app on port 3111, runs desktop and phone sizes
E2E_BASE_URL=https://staging.example.com npm run e2e   # test a running deployment instead
npx playwright show-report        # after a failure
```

First time on a machine: `npx playwright install chromium`.

## Live stream and verse projection

- `live-stream.spec.ts`: the public routes (projector, OBS connection address, visitor pass, login redirects).
- `projector.spec.ts`: the projector page in a real browser (full screen, lower third, PowerPoint picture, OBS transparent
  background, colours and font, surviving a connection drop). It needs a projector token, which is a secret address, so it
  is skipped unless `E2E_PROJECTOR_TOKEN` is set. What the page shows is replaced with test data in the browser, so the
  church's real screen is never read or changed.
- `pptx-render.spec.ts`: draws sample PowerPoint decks (`fixtures/`) in a browser with the same code the importer uses and
  checks the pictures (size, background colour, words, picture). Screenshots go to `e2e/artifacts/` (not committed). It
  bundles the drawing code with vite from `src/` and does not touch the site under test.

```
E2E_BASE_URL=https://www.kingdomflow.in E2E_PROJECTOR_TOKEN=<token> npx playwright test live-stream projector pptx-render --project=desktop
```

## Not covered (needs a staging project with test data)

Signing in as a church admin (the Live stream and Verse projection consoles, the PowerPoint upload, going live), creating a program, buying a program through PayU test mode, an outsider applying
and signing in, recording a voice prayer. Add those once a staging Supabase project exists.
