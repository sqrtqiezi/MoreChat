# E2E Testing Next Phase Archived Note

This planning document is retained only as historical context.

Status on May 3, 2026:

- The repository no longer treats browser-side stubbing of MoreChat system APIs as an active direction for E2E.
- Messaging E2E has moved to real-environment execution with real MoreChat services and a server-side Bot-boundary replacement for local runs.
- Follow the current documents instead of this archived note:
  - `docs/e2e-testing-spec.md`
  - `docs/e2e-testing-guide.md`
  - `docs/e2e-test-plan.md`

Historical summary:

- This note previously proposed a reusable browser-stub path for chat scenarios.
- That approach has been superseded and should not be revived for current-project `/api/*` testing.
- Remaining E2E expansion work should continue with environment preparation, reset/seed scripts, and real service coverage for media, search, feed, and topics.
