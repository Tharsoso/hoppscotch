# Padrões de Projeto, Code Smells e Refatoração

> Documento do **Caminho B** — CSI410 (UFOP).
> Refatoração aplicada em `packages/hoppscotch-common/src/composables/codemirror.ts`
> (composable que integra o editor CodeMirror ao restante do app).
>
> **Commit da refatoração:** `refactor(common): melhora qualidade do composable do CodeMirror`
> (branch `refactor/codemirror-quality`).
>
> ⚠️ **Coordenação da dupla:** o Caminho A (issue #6339, feito pela Pessoa A)
> alterou `HoppEnvironment.ts`. Para evitar conflitos de merge, a refatoração do
> Caminho B foi feita em `codemirror.ts`, um arquivo **não tocado** pela Pessoa A.

## Code Smells (mínimo 3)

### Smell #1 — Long Method / cadeia `if/else if` em `getLanguage` (viola OCP)

**Arquivo:** `codemirror.ts` — função `getLanguage`

**Antes:**
```ts
const getLanguage = (langMime: string): Language | null => {
  if (isJSONContentType(langMime)) {
    return jsoncLanguage
  } else if (langMime === "application/javascript" || langMime === "javascript") {
    return javascriptLanguage
  } else if (langMime === "graphql") {
    return GQLLanguage
  } else if (langMime === "application/xml") {
    return xmlLanguage
  } else if (langMime === "htmlmixed") {
    return StreamLanguage.define(html)
  } // ... mais 3 ramos else if
}
```

**Problema:** cada nova linguagem exige **editar** a função, adicionando um
ramo `else if`. Isso viola o **Open/Closed Principle (OCP)** e produz um método
longo e repetitivo.

**Solução aplicada:** tabela de estratégias (fábricas lazy) — padrão **Strategy**:
```ts
const languageStrategies: Record<string, () => Language> = {
  "application/javascript": () => javascriptLanguage,
  javascript: () => javascriptLanguage,
  graphql: () => GQLLanguage,
  "application/xml": () => xmlLanguage,
  htmlmixed: () => StreamLanguage.define(html),
  "application/x-sh": () => StreamLanguage.define(shell),
  "text/x-yaml": () => StreamLanguage.define(yaml),
}

const getLanguage = (langMime: string): Language | null => {
  if (isJSONContentType(langMime)) return jsoncLanguage
  const strategy = languageStrategies[langMime]
  if (strategy) return strategy()
  const streamLang = streamLanguageMap[langMime]
  if (streamLang) return StreamLanguage.define(streamLang)
  return null
}
```
Agora adicionar uma linguagem é **acrescentar uma entrada** no mapa, sem
alterar `getLanguage`. As fábricas são *lazy* para preservar o comportamento
original (`StreamLanguage.define` só executa quando a linguagem é solicitada).

---

### Smell #2 — Código duplicado (viola DRY): leitura do documento inteiro

**Arquivo:** `codemirror.ts` — completer, linter e update listener

**Antes:** a mesma serialização aparecia em **três** lugares, cada uma com um
comentário "expensive on big files":
```ts
// no completer
const text = context.state.doc.toJSON().join(context.state.lineBreak)
// no linter
await hoppLinter(view.state.doc.toJSON().join(view.state.lineBreak))
// no update listener
cachedValue.value = update.state.doc.toJSON().join(update.state.lineBreak)
```

**Problema:** duplicação (**DRY**). Além disso, a dívida técnica ("expensive")
estava espalhada, sem um ponto único para eventual otimização.

**Solução aplicada:** extração para um único helper:
```ts
const getDocText = (state: EditorState): string =>
  state.doc.toJSON().join(state.lineBreak)
```
Os três locais passam a chamar `getDocText(state)`, criando um **choke point**
único caso a leitura precise ser otimizada no futuro.

---

### Smell #3 — God Function: `initView` acumulando responsabilidades (viola SRP)

**Arquivo:** `codemirror.ts` — função `initView`

**Problema:** `initView` montava, num só corpo, extensões, listeners de DOM,
context menu, **configuração de keymaps** e ciclo de vida do editor — baixa
coesão (**Long Method / God Function**, viola **SRP**).

**Solução aplicada:** extração da configuração de keymaps para uma função
coesa de nível de módulo:
```ts
const buildEditorKeymap = (): Extension[] => [
  keymap.of([...defaultKeymap, /* Tab, Shift-Tab */]),
  Prec.highest(keymap.of([/* Ctrl-y / redo */])),
  Prec.highest(keymap.of([/* Ctrl-Enter */])),
]
```
E, dentro de `initView`, o bloco inline dá lugar a `...buildEditorKeymap()`,
reduzindo o tamanho do método e isolando a responsabilidade de atalhos.

## Padrões de Projeto (mínimo 2)

### Padrão #1 — Strategy (seleção de linguagem)

**Onde:** `languageStrategies` em `codemirror.ts` (Smell #1).
**Justificativa:** encapsula cada regra de mapeamento MIME→linguagem numa
"estratégia" registrável, permitindo estender sem modificar (**OCP**).

### Padrão #2 — Dependency Injection via container `dioc`

**Onde:** já adotado no projeto — serviços como `RESTTabService`,
`InspectionService` são resolvidos por `getService(...)` / `useService(...)`
em vez de instanciados diretamente.
**Justificativa:** desacopla consumidores das implementações concretas de
estado, aplicando **Inversão de Dependência (DIP)** e facilitando testes. A
refatoração mantém esse padrão como base da arquitetura do editor.

### (Complementar) Observer — RxJS streams

**Onde:** `newstore/environments` (`aggregateEnvsWithCurrentValue$`), consumido
pelo `HoppEnvironmentPlugin`.
**Justificativa:** a correção da issue #6339 (Caminho A) baseia-se justamente
em **confiar nesse Observer** em vez do `deep watch`, demonstrando o padrão
sendo usado corretamente.

## Resumo

| # | Smell | Refatoração aplicada | Princípio / Padrão |
|---|---|---|---|
| 1 | `if/else` de linguagem | Tabela `languageStrategies` | OCP, **Strategy** |
| 2 | Leitura de doc duplicada | Helper `getDocText` | DRY (SRP) |
| 3 | God function `initView` | `buildEditorKeymap` extraído | SRP |

> **Verificação:** a refatoração preserva o comportamento (mesma serialização,
> mesma ordem de resolução de linguagem, mesmo conjunto de atalhos). Rodar
> `pnpm --filter hoppscotch-common lint` e `pnpm --filter hoppscotch-common typecheck`
> antes de abrir o PR (ver seção de execução em `testes_devops.md`).
