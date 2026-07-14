# Testes de Software e DevOps

> Documento dos Caminhos de **Testes** e **DevOps/CI-CD** — CSI410 (UFOP).

## Parte 1 — Testes de aceitação automatizados

**Ferramenta:** Cypress (E2E), implementado por Tharsoso (Pessoa A) na branch
`test/cypress-acceptance-tests`, no pacote `hoppscotch-selfhost-web`.

**Local:** `packages/hoppscotch-selfhost-web/cypress/e2e/`
- `content-type-freeze.cy.ts`
- `env-variable-highlighting.cy.ts`

### Cenário 1 — Troca de content-type não congela a UI

```gherkin
Funcionalidade: Alternância de content-type do corpo da requisição
  Cenário: Trocar de "None" para "application/json" mantém a UI responsiva
    Dado que abri uma nova requisição REST
    Quando eu seleciono o content-type "application/json"
    Então o editor de corpo (raw body) deve estar visível
    E a interface deve responder dentro de um limite de tempo aceitável
```

**O que cobre:** guarda de regressão contra o freeze da issue #6339 — a troca
de content-type não deve bloquear a thread principal.

### Cenário 2 — Trocar para "Nenhum" limpa o body corretamente

```gherkin
Funcionalidade: Alternância de content-type do corpo da requisição
  Cenário: Trocar para "Nenhum" e voltar não deixa estado inconsistente
    Dado que preenchi o body da requisição com um JSON
    Quando eu troco o content-type para "Nenhum"
    Então o body deve ficar vazio
    Quando eu troco de volta para "application/json"
    Então o body deve continuar vazio (sem lixo de estado anterior)
```

**O que cobre:** efeitos colaterais da troca de content-type no estado do
body, cenário relacionado ao mesmo fluxo da issue.

### Cenário 3 — Highlight de variáveis de ambiente continua funcionando

```gherkin
Funcionalidade: Destaque de variáveis de ambiente no editor
  Cenário: Variável é destacada no body após trocar Content-Type repetidamente
    Dado que criei um ambiente com uma variável
    E selecionei esse ambiente
    Quando eu digito a variável no corpo da requisição
    E troco o content-type repetidamente
    Então o token da variável deve continuar recebendo a classe de destaque
```

**O que cobre:** garante que a correção do watcher em `HoppEnvironment.ts`
(Caminho A) **não quebrou** o highlight de variáveis — teste de não-regressão.
Usa um `data-testid` adicionado em `RawBody.vue` para selecionar o editor de
forma robusta (em vez de índice posicional de `.cm-content`).

### Instruções de execução

```bash
# na raiz do repositório
pnpm install

# subir o app self-hosted em modo dev (necessário para o Cypress)
pnpm --filter hoppscotch-selfhost-web dev

# em outro terminal, abrir o Cypress (modo interativo)
pnpm --filter hoppscotch-selfhost-web cypress open

# ou headless
pnpm --filter hoppscotch-selfhost-web cypress run
```

## Parte 2 — DevOps e CI/CD

### Pipeline existente (antes da melhoria)

O repositório possui os workflows em `.github/workflows/`:

| Workflow | Função |
|---|---|
| `tests.yml` | CI de testes (Vitest) em push/PR para `main`, `next`, `patch` |
| `build-hoppscotch-agent.yml` | Build do agente |
| `build-hoppscotch-desktop.yml` | Build do desktop (Tauri) |
| `release-push-docker.yml` | Release e push de imagens Docker |

O `tests.yml` rodava um único job (`test`) em `ubuntu-latest`, Node 22,
instalando com `pnpm` e executando apenas `pnpm test` (testes de unidade).

### Lacunas identificadas

1. **Ausência de testes E2E na CI** — a suíte Cypress (Parte 1) roda apenas
   localmente; não há job de CI para ela ainda (próximo passo natural, fora do
   escopo desta melhoria).
2. **Sem passo de lint/typecheck no pipeline** — `pnpm lint` e
   `pnpm typecheck` existem no `package.json` raiz mas nunca eram executados
   em PR/push.
3. **Débito técnico pré-existente:** hoje `pnpm lint` falha no monorepo
   inteiro por ~141 problemas pré-existentes, não relacionados a mudanças
   pontuais (constatado durante o desenvolvimento deste trabalho). Isso
   impede, por enquanto, transformar o lint num gate bloqueante sem quebrar
   todo PR já em andamento.

### Melhoria implementada (PR5)

Adicionado um **novo job `quality`** ao `tests.yml`, rodando em paralelo ao
job `test` existente, executando `pnpm lint` e `pnpm typecheck`:

```yaml
  quality:
    name: Lint & Typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: mv .env.example .env
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - uses: pnpm/action-setup@v3
        with: { version: 10, run_install: false }
      - run: pnpm install
        env:
          DATABASE_URL: postgresql://postgres:testpass@localhost:5432/hoppscotch
          DATA_ENCRYPTION_KEY: "12345678901234567890123456789012"
      - run: pnpm lint
        continue-on-error: true
      - run: pnpm typecheck
        continue-on-error: true
```

**Decisão de design — por que `continue-on-error: true`:**
Devido ao débito técnico pré-existente (item 3 acima), tornar o job
bloqueante quebraria a CI de qualquer PR, incluindo os deste próprio
trabalho. Optamos por introduzir **visibilidade primeiro**: o job roda e
reporta os problemas nos logs do Actions, sem impedir o merge. Isso é uma
prática real de evolução incremental de pipeline — o passo seguinte (fora do
escopo deste trabalho) seria quitar o débito de lint existente e então
remover o `continue-on-error`, transformando o job num gate de fato.

**Justificativa:** dá visibilidade contínua sobre regressões de estilo/tipo
introduzidas pelas refatorações do Caminho B, sem bloquear injustamente PRs
por causa de débito técnico alheio às mudanças propostas.
