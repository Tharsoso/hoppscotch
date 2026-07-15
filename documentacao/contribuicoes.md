# Contribuições da Dupla

> CSI410 — Engenharia de Software II — Trabalho Prático (Open Source Engineering Challenge)
> Projeto: [Hoppscotch](https://github.com/hoppscotch/hoppscotch)

## Integrantes e papéis

| Integrante | Papel principal |
|---|---|
| Tharsoso (Pessoa A) | Caminho A (correção da issue #6339) + testes de aceitação Cypress |
| João Vitor Cota (Pessoa B) | Caminho B (refatoração + code smells + padrões), arquitetura, DevOps/CI-CD, documentação |

> Ambos revisam os PRs um do outro (revisão entre membros — requisito do TP).

## Caminho A — Manutenção Corretiva

- **Issue escolhida:** [#6339 — UI freeze while changing Content type](https://github.com/hoppscotch/hoppscotch/issues/6339)
- **Causa raiz:** watcher com `deep: true` sobre o documento inteiro da aba
  ativa em `helpers/editor/extensions/HoppEnvironment.ts`, que percorre a
  árvore reativa completa (incluindo corpo e resposta JSON) a cada mudança.
- **Descrição da solução:** substituir o `deep watch` por um watcher enxuto
  (identidade da aba + `requestVariables` + variáveis de coleção) e aplicar
  *debounce* na reconfiguração do editor. Detalhes em
  [`padroes_e_smells.md`](./padroes_e_smells.md) (Smell #1).
- **Validação:** _(preencher)_ evidências de reprodução antes/depois
  (profiler do DevTools) + testes de aceitação (`testes_devops.md`).

## Caminho B — Engenharia de Qualidade e Refatoração

- **Code smells tratados:** ver [`padroes_e_smells.md`](./padroes_e_smells.md)
  (mínimo 3): deep watch, long method / cadeia if-else de linguagem, custo
  ignorado em arquivos grandes.
- **Padrões aplicados/sugeridos:** Strategy (seleção de linguagem),
  Dependency Injection (`dioc`), Observer (RxJS).
- **Descrição da refatoração:** _(preencher com o diff final e justificativas)_.

## Lista de Pull Requests

> Preencher com os links reais conforme os PRs forem abertos no fork.

| PR | Conteúdo | Autor | Branch | Link |
|---|---|---|---|---|
| PR1 | Arquitetura (`documentacao/arquitetura.md`) | João (B) | `docs/arquitetura` | _(preencher)_ |
| PR2 | Padrões e smells (`documentacao/padroes_e_smells.md`) | João (B) | `docs/padroes-smells` | _(preencher)_ |
| PR3 | Refatoração (Caminho B) | João (B) | `refactor/codemirror-quality` | _(preencher)_ |
| PR4 | Testes de aceitação (Cypress) | Tharsoso (A) | `test/cypress-acceptance-tests` | _(preencher)_ |
| PR5 | DevOps / CI (`tests.yml` job de qualidade) | João (B) | `ci/quality-job` | _(preencher)_ |
| PR6 | Correção da issue #6339 (Caminho A) | Tharsoso (A) | `fix/content-type-freeze` | _(preencher)_ |

## Links de entrega (Moodle)

- **Fork:** _(preencher com o link do fork do colega)_
- **Repositório público:** sim / não — _(confirmar)_
