# Messaging Bot Boundary E2E Archived Design Note

This design note remains only as a short archive entry.

Final direction:

- E2E should validate real MoreChat service collaboration.
- For messaging, the browser talks to real `/api/*` endpoints and the system uses real storage, webhook handling, and WebSocket delivery.
- Local determinism comes from reset/seed scripts and a server-side Bot-boundary replacement, not from browser-side system API stubbing.

This archived note intentionally omits the retired step-by-step browser-stub guidance. For active guidance, use:

- `docs/e2e-testing-spec.md`
- `docs/e2e-testing-guide.md`
- `docs/e2e-test-plan.md`
