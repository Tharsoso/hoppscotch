// Ignore uncaught exceptions unrelated to the flows under test (e.g. the
// GraphQL backend not being reachable in a REST-only e2e run), so a failed
// background network call doesn't fail an otherwise passing test.
Cypress.on("uncaught:exception", () => false)
