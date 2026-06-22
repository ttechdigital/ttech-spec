# TTech Spec — contexto do projeto

> Lido pelo Claude Code ao abrir este repo. Aqui se trabalha NO PRODUTO (o engine + CLI), não num
> consumidor. Regras/specs de um projeto específico vivem no `.ttechspec/` DO CONSUMIDOR, nunca aqui.

## O que é

TTech Spec é um **gate de arquitetura como código**: regras-como-DADO que **reprovam o PR** quando violadas,
mais o método **spec → skill → convenção → audit → catálogo**. Zero-dep, Node 18+, MIT.

**Moat (não diluir):** o mercado SDD (GitHub Spec Kit, Kiro, OpenSpec, BMAD) resolve o *build loop*
(spec → IA implementa). Aqui o diferencial é **enforcement** (o gate bloqueia) + **catálogo vivo**. A
herança de config (`extends`) é commodity; o que ganha é "regra herdável que BLOQUEIA" + método junto.

## Princípio central: somos o ENGINE, a base é do CONSUMIDOR

- **Aqui (produto):** tipos de regra, CLI, e *seeds* de base (`templates/presets/`). NUNCA regras de um
  projeto real, strings de cliente, IDs, paths específicos.
- **No repo do consumidor (`.ttechspec/`):** a base dele (`presets/`, semeada pelo `init` e editável),
  as regras dele (`ttechspec.config.json`), specs, checks custom (`checks/*.mjs`).
- Se for adicionar valor, adicione **tipo de regra** ou **capability genérica** — não regra de projeto.

## Arquitetura (módulos = etapas do método; codinome Star Fox)

| Módulo | Arquivo | Codinome |
|---|---|---|
| Core / Orquestrador (CLI) | `bin/cli.mjs` | Fox McCloud |
| Sentinels / Gate (engine) | `src/engine.mjs` | Falco Lombardi |
| Constitution (convenções) | template `conventions.md` | General Pepper |
| Catalog (registry) | (roadmap) | ROB 64 |
| Specs | template `spec.template.md` | Peppy Hare |
| Skills (commands/multi-agente) | (roadmap) | Slippy Toad |
| Clarify (qualidade de spec) | `clarify` em `cli.mjs` | Krystal |

Reserva pra módulos futuros: Wolf (SaaS), Pigma (licenciamento), Katt (notificações), Bill (CI), Leon (security).

## Tipos de regra (a API do gate — `src/engine.mjs`)

- `forbidden-pattern` — reprova se um regex aparece (com `include`/`exclude` globs, `severity`).
- `baseline-count` — reprova se a contagem por-linha sobe do `baseline` (`ignoreComments` pula comentários).
- `paired-file` — cada arquivo X exige o irmão Y (`companionSuffix`).
- `spec-clarity` — ranqueia/reprova specs por marcadores de pendência (`[NEEDS CLARIFICATION]`/TODO/???).
- `script` — escape hatch: roda um comando, ok se exit == `expectExit`.

`extends` em `ttechspec.config.json` herda presets do `.ttechspec/presets/` do consumidor (merge por `id`).

## Comandos

```bash
node bin/cli.mjs init      # scaffolda .ttechspec/ (specs/ commands/ modules/ presets/ + config)
node bin/cli.mjs audit     # roda o gate — exit != 0 reprova
node bin/cli.mjs clarify   # ranqueia specs por pendência
```

Consumo (modelo Spec Kit, sem registry): `npx github:ttechdigital/ttech-spec <cmd>`.

## Desenvolvimento

- **Zero dependências.** Não adicionar libs sem necessidade forte (parte do apelo é `npx` instantâneo).
- **Teste manual obrigatório ao mexer no engine:** prove que o gate (a) PASSA numa árvore limpa e
  (b) MORDE (exit≠0) num caso violado. Ex: `mkdir -p /tmp/t && cd /tmp/t && node <repo>/bin/cli.mjs init`
  então injete `try{}catch(e){}` num `.ts` e rode `audit` (deve falhar).
- Mudou tipo de regra? Atualize este CLAUDE.md (seção Tipos de regra) + o README.

## Origem e co-evolução

Nasceu incubado dentro da plataforma **TTech Ex** (extraído preservando a ideia, history reiniciado pra
release pública). A dinâmica esperada: times usam o TTech Spec nos repos deles, **descobrem melhorias na
prática** e contribuem aqui. Toda contribuição deve manter o engine **genérico** — o que é específico de
um projeto fica no `.ttechspec/` daquele repo.

## Anti-padrões (não fazer)

- ❌ Hardcodar regra/strings de um projeto específico no engine ou nos presets seed.
- ❌ Adicionar dependência pesada (quebra o `npx` zero-config).
- ❌ Shippar presets "que cobrem toda stack" como autoridade — a base é decisão/posse do consumidor.
- ❌ Vazar dado de cliente/segredo em exemplos (use placeholders `acme-*`, GUID zero).
