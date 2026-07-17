# Testes de Software e DevOps

> Documento dos Caminhos de **Testes** e **DevOps/CI-CD** — CSI410 (UFOP).

## Parte 1 — Testes de aceitação automatizados

**Ferramenta:** Cypress (E2E), implementado por Tharsoso (Pessoa A) na branch
`test/cypress-sandbox-encoding`, no pacote `hoppscotch-selfhost-web`. Cobre a
correção da issue [#6008](https://github.com/hoppscotch/hoppscotch/issues/6008)
("The string encrypted by sha256 in the system does not match the actual
sha256 encrypted string"), feita na branch `fix/sandbox-text-encoder`
(Caminho A).

**Contexto do bug:** o sandbox experimental de scripts (QuickJS via
`faraday-cage`) expõe `TextEncoder`/`TextDecoder` para os scripts de
Pre-request/Tests. O marshalling genérico de valores do `faraday-cage`, ao
passar um `Uint8Array` do host para dentro da VM, só trata corretamente
valores que passam em `Array.isArray()` — um `Uint8Array` real falha nesse
teste e cai num branch genérico de "objeto plano" que copia as chaves
numéricas mas descarta `length`/`byteLength`. Resultado: `TextEncoder.encode()`
devolvia um objeto sem tamanho dentro do sandbox, e qualquer código que
dependesse desse tamanho (como `crypto.subtle.digest`) processava efetivamente
zero bytes — daí o hash SHA-256 errado relatado na issue. A correção
substitui o módulo de encoding do `faraday-cage` por um módulo próprio
(`cage-modules/encoding.ts`) que reaproveita o marshaller correto que o
projeto já usa para `crypto` (`uint8ArrayToVmArray`/`vmArrayToUint8Array`).

**Local:** `packages/hoppscotch-selfhost-web/cypress/e2e/`
- `sandbox-text-encoder.cy.ts`

Os três testes rodam o script diretamente na aba **Pre-request Script** do
app (o mesmo caminho de código relatado na issue) e leem o resultado via
`console.log`, que o sandbox sempre encaminha para o console real do
navegador (`cage-modules/default.ts`) — por isso os testes espionam
`window.console.log` em vez da aba "Console" do app, que só reflete o
Post-request Script.

### Cenário 1 — Hash SHA-256 correto de uma string codificada no script

```gherkin
Funcionalidade: TextEncoder/TextDecoder no sandbox de scripts
  Cenário: crypto.subtle.digest calcula o SHA-256 correto de um texto
    Dado que estou na aba "Pre-request Script" de uma requisição
    Quando eu colo um script que codifica "Hello, World!" com TextEncoder
      e calcula o hash SHA-256 do resultado com crypto.subtle.digest
    E envio a requisição
    Então o console deve logar o hash
      "dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f"
```

**O que cobre:** reproduz exatamente o sintoma relatado na issue #6008 —
antes da correção, o hash logado não batia com o SHA-256 real do texto
(porque `crypto.subtle.digest` recebia um array com tamanho 0).

### Cenário 2 — TextEncoder.encode() produz um array de bytes real

```gherkin
Funcionalidade: TextEncoder/TextDecoder no sandbox de scripts
  Cenário: encode() devolve um array com tamanho correto
    Dado que estou na aba "Pre-request Script" de uma requisição
    Quando eu colo um script que codifica "qualquer texto aqui" com TextEncoder
    E envio a requisição
    Então o console deve logar length 19, byteLength 19 e Array.isArray true
```

**O que cobre:** verifica a causa raiz diretamente — antes da correção,
`length`/`byteLength` vinham `undefined` e `Array.isArray()` era `false`
(o valor caía no branch de "objeto plano" do marshaller quebrado).

### Cenário 3 — Round-trip TextEncoder → TextDecoder

```gherkin
Funcionalidade: TextEncoder/TextDecoder no sandbox de scripts
  Cenário: texto codificado e decodificado continua idêntico
    Dado que estou na aba "Pre-request Script" de uma requisição
    Quando eu colo um script que codifica "round trip works" com TextEncoder
      e decodifica o resultado de volta com TextDecoder
    E envio a requisição
    Então o console deve logar "round trip works"
```

**O que cobre:** garante que o novo módulo de encoding funciona nos dois
sentidos (encode e decode), não só no caminho que a issue original expôs.

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
