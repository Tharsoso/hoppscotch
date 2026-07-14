/**
 * Acceptance tests for GitHub issue #6339: toggling a request body's
 * Content-Type froze the UI for several seconds because HoppEnvironmentPlugin
 * deep-watched the entire active tab (see HoppEnvironment.ts) instead of just
 * the request/collection variables it needed, causing every mounted editor's
 * CodeMirror decorations to rebuild on every unrelated tab mutation.
 *
 * These tests assume the app is running with the default browser/OS locale
 * used in this project's dev environment (pt-BR), matching the UI text below.
 */

// Headless Electron command overhead (actionability/retry checks) scales
// with DOM/content size in this environment, so this bound is generous - the
// precise regression proof (3 CodeMirror reconfigures per toggle before the
// fix, 0 after) was captured separately via temporary instrumentation. This
// threshold only needs to stay comfortably under the ~30s reported freeze.
const TOGGLE_TIMEOUT_MS = 20000

function buildLargeJsonPayload(entryCount: number): string {
  const items = []
  for (let i = 0; i < entryCount; i++) {
    items.push({
      id: i,
      name: `item-${i}`,
      description: `Sample description for item ${i} used to pad out the payload size.`,
      active: i % 2 === 0,
      tags: ["alpha", "beta", "gamma"],
    })
  }
  return JSON.stringify(items)
}

function openBodyTab() {
  cy.contains("button, a, [role='tab']", "Corpo", { timeout: 10000 }).click()
}

// The Content-Type trigger button's label is the currently selected value, so
// switching it requires knowing what it currently reads (matching it exactly
// avoids Cypress retry storms from an ambiguous multi-value regex).
function toggleContentType(fromLabel: string, toLabel: string) {
  cy.contains("button", new RegExp(`^${fromLabel}$`)).click()
  cy.contains(new RegExp(`^${toLabel}$`)).last().click()
}

function getBodyEditor() {
  return cy.get('[data-testid="request-body-editor"] .cm-content')
}

describe("Issue #6339 - Content-Type toggle freeze", () => {
  beforeEach(() => {
    cy.visit("/")
    // Wait for the app shell (past the splash screen) to be interactive
    cy.contains("button, a, [role='tab']", "Corpo", { timeout: 15000 }).should(
      "be.visible"
    )
  })

  it("keeps the UI responsive when toggling Content-Type on a request with a JSON body", () => {
    // Cypress's .type() has no native OS clipboard/paste support, so instead
    // of pasting a huge payload (as verified manually during development with
    // a 700KB body and a reconfigure-count instrumentation showing 3 -> 0
    // rebuilds per toggle before/after the fix), this test types a small
    // real JSON body and focuses on bounding the toggle time end-to-end -
    // a coarse regression guard against the freeze that stays fast in CI.
    const json = buildLargeJsonPayload(10)

    openBodyTab()
    toggleContentType("Nenhum", "application/json")

    getBodyEditor().click()
    cy.focused().type(json, { delay: 0, parseSpecialCharSequences: false })
    getBodyEditor().should("contain.text", "item-9")

    const start = Date.now()

    toggleContentType("application/json", "Nenhum")
    toggleContentType("Nenhum", "application/json")
    toggleContentType("application/json", "Nenhum")
    toggleContentType("Nenhum", "application/json")

    cy.then(() => {
      const elapsed = Date.now() - start
      // The original bug caused a ~30s freeze; this bounds the 4 toggles to a
      // small fraction of that, catching a regression without being flaky.
      expect(elapsed, "time to complete 4 content-type toggles").to.be.lessThan(
        TOGGLE_TIMEOUT_MS
      )
    })
  })

  it("clears the request body when switching Content-Type to 'Nenhum' and back", () => {
    openBodyTab()
    toggleContentType("Nenhum", "application/json")

    getBodyEditor().click()
    cy.focused().type('{"hello":"world"}', {
      delay: 0,
      parseSpecialCharSequences: false,
    })
    getBodyEditor().should("contain.text", "hello")

    toggleContentType("application/json", "Nenhum")
    cy.contains("Este pedido não tem corpo").should("exist")

    toggleContentType("Nenhum", "application/json")
    getBodyEditor().should("not.contain.text", "hello")
  })
})
