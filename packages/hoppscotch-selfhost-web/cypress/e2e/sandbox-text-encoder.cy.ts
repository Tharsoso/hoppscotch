/**
 * Acceptance tests for the fix to GitHub issue #6008 ("The string encrypted
 * by sha256 in the system does not match the actual sha256 encrypted
 * string").
 *
 * Root cause: the experimental scripting sandbox's TextEncoder/TextDecoder
 * were bridged through faraday-cage's encoding() module, whose generic
 * host->VM marshaller only special-cases Array.isArray() values. A real
 * Uint8Array (what TextEncoder.encode() returns) fails that check and loses
 * its length/byteLength, so crypto.subtle.digest() always hashed zero bytes
 * regardless of the input text.
 *
 * These tests run the exact script pattern from the issue report through the
 * app's own Pre-request Script tab and read the result back from the
 * sandbox's console.log output. The sandbox's console module always forwards
 * to the real browser console (see cage-modules/default.ts's ConsoleModule
 * onLog handler), so we spy on window.console.log rather than the app's own
 * in-app "Console" tab - that tab only reflects testResults.consoleEntries,
 * which is populated by the Tests/post-request script, not by the
 * Pre-request Script.
 */

// The dev server resolves its i18n locale from navigator.language when no
// locale preference is stored yet, and Cypress's headless Electron browser
// doesn't necessarily report "en-US" like a developer's real browser does.
// Force English so the tab/button labels used by these tests are stable
// regardless of what locale the environment running Cypress defaults to.
// Also stub console.log here (onBeforeLoad runs before any app code) so we
// can read back what the sandboxed script actually logged.
const visitInEnglish = (path: string) =>
  cy.visit(path, {
    onBeforeLoad(win) {
      Object.defineProperty(win.navigator, "language", { value: "en-US" })
      Object.defineProperty(win.navigator, "languages", {
        value: ["en-US"],
      })
      cy.stub(win.console, "log").as("consoleLog")
    },
  })

// EXPERIMENTAL_SCRIPTING_SANDBOX defaults to true (newstore/settings.ts), so
// a fresh browser profile already runs scripts through the sandbox that had
// the broken TextEncoder/TextDecoder - no need to toggle anything on.
const runPreRequestScript = (script: string) => {
  visitInEnglish("/")
  cy.contains("button, a, [role='tab']", "Pre-request Script", {
    timeout: 15000,
  }).click()

  cy.get(".monaco-editor", { timeout: 15000 }).should("be.visible").click()
  // Typing character-by-character via .type() fights Monaco's auto-closing
  // brackets (typing our own closing "})" duplicates the one Monaco already
  // inserted, corrupting the script). Paste the script in as one atomic
  // operation instead - Monaco's paste handler doesn't run autoclose logic.
  cy.get(".monaco-editor textarea").then(($el) => {
    const el = $el[0] as HTMLTextAreaElement
    const dataTransfer = new DataTransfer()
    dataTransfer.setData("text/plain", script)
    const pasteEvent = new ClipboardEvent("paste", {
      clipboardData: dataTransfer,
      bubbles: true,
      cancelable: true,
    })
    el.dispatchEvent(pasteEvent)
  })

  // The URL field is a custom CodeMirror-backed input, not a real <input>,
  // so cy.clear() doesn't apply here - select-all then type over it instead.
  cy.get('[placeholder="Enter a URL or paste a cURL command"]')
    .click()
    .type("{selectall}https://echo.hoppscotch.io")

  cy.get("#send").click()
}

describe("Scripting sandbox TextEncoder/TextDecoder (issue #6008)", () => {
  it("computes the correct SHA-256 digest of a script-encoded string", () => {
    runPreRequestScript(
      'const encoder = new TextEncoder();\n' +
        'const data = encoder.encode("Hello, World!");\n' +
        'crypto.subtle.digest("SHA-256", data).then((hashBuffer) => {\n' +
        '  const hashArray = Array.from(new Uint8Array(hashBuffer));\n' +
        '  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");\n' +
        '  console.log("HASH_RESULT:" + hashHex);\n' +
        '});\n'
    )

    cy.get("@consoleLog", { timeout: 15000 }).should(
      "have.been.calledWith",
      "HASH_RESULT:dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f"
    )
  })

  it("produces a real, correctly-sized byte array from TextEncoder.encode()", () => {
    runPreRequestScript(
      'const bytes = new TextEncoder().encode("qualquer texto aqui");\n' +
        'console.log("LENGTH_RESULT:" + bytes.length + ":" + bytes.byteLength + ":" + Array.isArray(bytes));\n'
    )

    cy.get("@consoleLog", { timeout: 15000 }).should(
      "have.been.calledWith",
      "LENGTH_RESULT:19:19:true"
    )
  })

  it("round-trips text through TextEncoder and TextDecoder", () => {
    runPreRequestScript(
      'const bytes = new TextEncoder().encode("round trip works");\n' +
        'const text = new TextDecoder().decode(bytes);\n' +
        'console.log("DECODE_RESULT:" + text);\n'
    )

    cy.get("@consoleLog", { timeout: 15000 }).should(
      "have.been.calledWith",
      "DECODE_RESULT:round trip works"
    )
  })
})
