# Contribuições da Dupla

> CSI410 — Engenharia de Software II — Trabalho Prático (Open Source Engineering Challenge)
> Projeto: [Hoppscotch](https://github.com/hoppscotch/hoppscotch)

## Integrantes e papéis

| Integrante | Papel principal |
|---|---|
| Tharsoso (Pessoa A) | Caminho A (correção da issue #6008) + testes de aceitação Cypress |
| João Vitor Cota (Pessoa B) | Caminho B (refatoração + code smells + padrões), arquitetura, DevOps/CI-CD, documentação |

> Ambos revisam os PRs um do outro (revisão entre membros — requisito do TP).

## Caminho A — Manutenção Corretiva

- **Issue escolhida:** [#6008 — The string encrypted by sha256 in the system does not match the actual sha256 encrypted string](https://github.com/hoppscotch/hoppscotch/issues/6008)
- **Causa raiz:** o `TextEncoder`/`TextDecoder` usados dentro do sandbox de
  scripts (pre-request/testes) vêm do módulo `encoding()` da biblioteca de
  terceiros `faraday-cage`. A função genérica dessa biblioteca que converte
  valores do host para dentro da VM isolada só trata como array de verdade
  valores que passam em `Array.isArray()`. Um `Uint8Array` (o que
  `TextEncoder.encode()` de fato devolve) falha nesse teste e cai no caminho
  de "objeto comum", que copia os bytes indexados mas descarta `length`/
  `byteLength`. Resultado: `crypto.subtle.digest()` não sabe quantos bytes
  processar, trata como 0 e acaba sempre fazendo o hash de um array vazio —
  não importa o texto de entrada.
- **Descrição da solução:** criar um módulo próprio de `TextEncoder`/
  `TextDecoder` em `hoppscotch-js-sandbox/src/cage-modules/encoding.ts`,
  reaproveitando as funções de marshaling já corretas usadas pelo módulo de
  `crypto` (`uint8ArrayToVmArray`/`vmArrayToUint8Array`, em
  `cage-modules/utils/vm-marshal.ts`), e substituir o `encoding()` quebrado do
  `faraday-cage` por esse módulo próprio em `cage-modules/default.ts`.
- **Validação:** reprodução manual na tela (antes: hash sempre igual ao
  SHA-256 de string vazia; depois: hash correto e batendo com o valor
  esperado) + suíte completa do pacote (1388 testes) sem regressões. Detalhes
  em [`testes_devops.md`](./testes_devops.md).

## Caminho B — Engenharia de Qualidade e Refatoração

- **Code smells tratados:** ver [`padroes_e_smells.md`](./padroes_e_smells.md)
  (mínimo 3): deep watch, long method / cadeia if-else de linguagem, custo
  ignorado em arquivos grandes.
- **Padrões aplicados/sugeridos:** Strategy (seleção de linguagem),
  Dependency Injection (`dioc`), Observer (RxJS).
- **Descrição da refatoração:** _(preencher com o diff final e justificativas)_.

## Lista de Pull Requests


| PR | Conteúdo | Autor | Branch | Link |
|---|---|---|---|---|
| PR1 | Arquitetura (`documentacao/arquitetura.md`) | João (B) | `docs/arquitetura` | https://github.com/Tharsoso/hoppscotch/pull/1 |
| PR2 | Padrões e smells (`documentacao/padroes_e_smells.md`) | João (B) | `docs/padroes-smells` | https://github.com/Tharsoso/hoppscotch/pull/3 |
| PR3 | Refatoração (Caminho B) | João (B) | `refactor/codemirror-quality` | https://github.com/Tharsoso/hoppscotch/pull/4 |
| PR4 | Testes de aceitação (Cypress) | Tharsoso (A) | `test/cypress-acceptance-tests` | _(preencher)_ |
| PR5 | DevOps / CI (`tests.yml` job de qualidade) | João (B) | `ci/quality-job` | https://github.com/Tharsoso/hoppscotch/pull/5 |
| PR6 | Correção da issue #6008 (Caminho A) | Tharsoso (A) | `fix/sandbox-text-encoder` | _(preencher)_ |

## Links de entrega (Moodle)

- **Fork:** https://github.com/Tharsoso/hoppscotch
- **Repositório público:** sim
