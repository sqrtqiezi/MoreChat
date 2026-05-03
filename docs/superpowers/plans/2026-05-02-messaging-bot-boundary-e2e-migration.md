# Messaging Bot Boundary E2E Migration Archived Note

This file is an archival handoff note for a migration that has already been executed.

Status on May 3, 2026:

- Messaging E2E now runs against real MoreChat services.
- Local messaging runs rely on server-side Bot-boundary replacement plus reset/seed scripts.
- Browser-side stubbing of current-project `/api/*` is no longer part of the active test strategy.

Use the current source-of-truth docs for live work:

- `docs/e2e-testing-spec.md`
- `docs/e2e-testing-guide.md`
- `docs/e2e-test-plan.md`

Historical summary:

- The original migration removed browser-side system API stubs from messaging coverage.
- It also retired the related helper files and contributor guidance that encouraged that path.
- Follow-up work should continue on remaining features and real-environment data preparation rather than revisiting the retired browser-stub approach.
