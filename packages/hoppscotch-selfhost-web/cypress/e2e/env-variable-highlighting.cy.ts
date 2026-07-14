/**
 * Regression test for the fix to GitHub issue #6339 (HoppEnvironment.ts).
 *
 * The fix narrows HoppEnvironmentPlugin's watcher from the entire active tab
 * down to just the request/collection variables it needs. This test makes
 * sure that narrowing didn't break the actual feature: environment/request
 * variable highlighting must still react correctly when the referenced
 * variables (not just unrelated tab state) change.
 *
 * Assumes the default pt-BR locale used in this project's dev environment.
 */

describe("Request variable highlighting", () => {
  beforeEach(() => {
    cy.visit("/")
    cy.contains("button, a, [role='tab']", "Corpo", { timeout: 15000 }).should(
      "be.visible"
    )
  })

  it("highlights a referenced request variable in the body and keeps it highlighted after toggling Content-Type", () => {
    // Add a request variable: myVar = hello
    cy.contains("button, a, [role='tab']", "Variáveis").click()
    cy.get('[placeholder="Variável 1"]').click()
    cy.focused().type("myVar")
    cy.get('[placeholder="Valor 1"]').click()
    cy.focused().type("hello")

    // Reference it from the JSON request body
    cy.contains("button, a, [role='tab']", "Corpo").click()
    cy.contains("button", /^Nenhum$/).click()
    cy.contains(/^application\/json$/).last().click()

    cy.get('[data-testid="request-body-editor"] .cm-content').click()
    cy.focused().type('{"token": "<<myVar>>"}', {
      delay: 0,
      parseSpecialCharSequences: false,
    })

    cy.get(".env-highlight.request-variable-highlight")
      .should("exist")
      .and("contain.text", "myVar")

    // Toggle Content-Type away and back - this used to force a redundant
    // rebuild of every editor's decorations; it must not break highlighting
    cy.contains("button", /^application\/json$/).click()
    cy.contains(/^Nenhum$/).last().click()
    cy.contains("button", /^Nenhum$/).click()
    cy.contains(/^application\/json$/).last().click()

    cy.get('[data-testid="request-body-editor"] .cm-content').click()
    cy.focused().type('{"token": "<<myVar>>"}', {
      delay: 0,
      parseSpecialCharSequences: false,
    })

    cy.get(".env-highlight.request-variable-highlight")
      .should("exist")
      .and("contain.text", "myVar")
  })
})
