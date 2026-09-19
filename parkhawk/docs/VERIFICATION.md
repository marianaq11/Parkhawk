# Verification

Completed against the source in this package:

- Dependency installation completed with npm; the lockfile is included.
- SQLite schema creation and demo seeding completed.
- `npm test`: 9 passing tests, including SQLite workflow/security checks and the actual PostgreSQL migration executed in PGlite.
- `npm run lint`: passed without warnings or errors.
- `npm run build`: passed, including TypeScript checks and route generation.
- `npm run test:e2e`: the complete browser workflow passed against the development server.
- The same browser workflow passed against `next start` using the production build (`TEST_PRODUCTION=1`).
- Desktop and 390px mobile screenshots were captured from the running production app and inspected. The mobile page had no horizontal overflow.

The browser workflow exercises login/logout, protected pages, all four report types, independent confirmation, duplicate-feedback denial, aggregate-only search data, admin location creation/deactivation, report removal, reporting suspension/restoration, and cross-origin rejection. It asserts that no browser runtime errors occurred. Business-logic tests verify expiration boundaries and that expired reports do not affect scores.

Tests use isolated databases and do not modify your local demonstration database. Set `TEST_PRODUCTION=1` when running Playwright to use an existing production build. On PowerShell, use `$env:TEST_PRODUCTION="1"` before `npm run test:e2e`.

## External services

A live Supabase project was not available. Its hosted authentication, service credentials, HTTP database access, seed execution, and hosting deployment have not been verified. PGlite tests validate the SQL migration and permission model locally, using a minimal stand-in for Supabase's auth schema; they are not a hosted Supabase integration test.

Follow the README's Supabase setup and deployment steps before publishing. The local SQLite demo works without those credentials.
