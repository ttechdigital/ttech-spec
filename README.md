# TTech Spec — CLI

Gate de arquitetura como código: **regras-como-dado que reprovam o PR** quando violadas, mais um método
leve de spec → convenção → audit → catálogo. Zero dependências, Node 18+, MIT.

O mercado de SDD (Spec Kit, Kiro, OpenSpec) resolve o *build loop* — spec → IA implementa. Aqui o foco é
o outro lado: **enforcement** (o gate bloqueia) e um **catálogo vivo** do que existe no repo. Os dois
encaixam: você pode gerar com qualquer ferramenta e usar o TTech Spec pra travar o resultado.

Método completo em [`docs/METHOD.md`](docs/METHOD.md) · workflow em [`docs/WORKFLOW.md`](docs/WORKFLOW.md) ·
playbook de adoção em [`docs/ADOPTION.md`](docs/ADOPTION.md).

## Começar

Zero-install, direto do GitHub (sem registry):

```bash
npx --yes github:ttechdigital/ttech-spec init     # scaffolda .ttechspec/ no seu repo
npx --yes github:ttechdigital/ttech-spec audit    # roda o gate (pre-commit + CI)
```

O `init` cria `.ttechspec/` (specs/ modules/ presets/ conventions.md + config) e os slash commands
`/clarify` e `/ttechspec-audit` em `.claude/commands/`. Daí em diante, o uso diário é o CLI curto ou os
slash commands no agente.

### Em um projeto que já roda (brownfield)

Não migre por cima de um estado bagunçado — o gate só formaliza a bagunça. Primeiro a verdade, depois o
travamento. Resumo (passo-a-passo completo em [`docs/ADOPTION.md`](docs/ADOPTION.md)):

```bash
# 1. confirme que nada está perdido (a fonte da verdade é o código + git, não a memória)
git status --short && git branch -a && git log --oneline -30

# 2. scaffolda
npx --yes github:ttechdigital/ttech-spec init

# 3. calibre os baselines: para regras baseline-count, baseline = contagem atual ("não crescer")
npx --yes github:ttechdigital/ttech-spec audit   # itere o config até passar no estado real de hoje

# 4. trave no CI, com pin por tag (reprodutível)
npx --yes github:ttechdigital/ttech-spec#vX.Y.Z audit
```

A ideia: o gate começa aceitando o que você já tem e impede a **regressão** (a contagem não sobe, o padrão
proibido não volta). Você aperta as regras com o tempo, não tudo no dia 1.

## Comandos

```bash
ttechspec init       # scaffolda .ttechspec/ (specs/ modules/ presets/ + config) + slash commands
ttechspec audit      # roda o gate — exit != 0 reprova (pre-commit + CI)
ttechspec clarify    # ranqueia specs por pendência ([NEEDS CLARIFICATION]/TODO/???)
ttechspec catalog    # lista/valida o registro de módulos (.ttechspec/modules/*.yaml)
ttechspec state      # snapshot JSON (gate+specs+catalog) — pra uma plataforma agregar vários repos
ttechspec agents     # (re)gera os slash commands /clarify e /ttechspec-audit (Claude Code)
```

`audit`/`clarify`/`catalog` aceitam `--json` (saída estruturada pra CI/ferramentas). O `state` é a memória
durável e independente de agente: o estado (decisões, pendências, módulos) mora no repo, não na sessão.

**Feito vs falta, dentro da spec.** Cada spec tem uma seção `## Tasks` com checkbox GitHub-padrão — `[x]` =
já virou código, `[ ]` = falta. Não é um backlog à parte: é a própria spec dizendo quanto de si está pronto.
O `clarify` mostra a coluna `Feito` (ex: `1/3`); o `state` carrega isso **dentro de cada item de `specs[]`**
(`tasks: { total, done, open, items }`), pra uma plataforma agregar "quanto de cada sistema está feito" sem
precisar de prompt.

## O gate = regras como dado

`.ttechspec/ttechspec.config.json` lista as regras. Cinco tipos:

- **forbidden-pattern** — reprova se um padrão (regex) aparece. *Ex: catch vazio, segredo numa response.*
- **baseline-count** — reprova se a contagem por arquivo sobe do baseline. *Ex: número de `[AllowAnonymous]`.*
- **paired-file** — cada arquivo X exige o irmão Y. *Ex: migration → `.Designer.cs`.*
- **spec-clarity** — reprova specs com pendência não resolvida (`[NEEDS CLARIFICATION]`/TODO/???).
- **script** — escape hatch: roda um comando, ok se o exit bate com o esperado.

## A base é do consumidor (o produto é só o engine)

O TTech Spec **não shippa presets opinativos**. Não dá pra cobrir toda stack, e qual é a base é decisão do
dono do repo. O produto entrega o **engine** (os tipos de regra) e o **CLI**; o `init` **semeia** um starter
no `.ttechspec/presets/` do seu repo, que a partir daí é **seu** pra editar — igual `eslint --init`: gera um
config que vira seu, não uma dependência da nossa opinião.

Tudo mora no repo do consumidor, em camadas:

- **Base** → `.ttechspec/presets/{base,dotnet,web}.json` — genéricas/por-stack, suas, editáveis.
- **Regras do projeto** → `.ttechspec/ttechspec.config.json` — o específico (baselines, strings, paths).

O config estende a base (resolvida no próprio repo, igual ESLint/tsconfig):

```json
{ "extends": ["dotnet", "web"], "rules": [ /* só o específico do projeto */ ] }
```

`extends: ["dotnet"]` resolve `.ttechspec/presets/dotnet.json` do repo. Caminho relativo (`"../base.json"`)
também vale — pra um time compartilhar uma base entre os repos dele. Merge por `id`, precedência crescente
(base → stack → projeto): pode redefinir um `id` pra ajustar severity/glob/baseline.

## Sobre os codinomes

O método tem etapas (orquestrador, gate, convenções, catálogo, specs, clarify). Internamente a gente
apelidou cada uma com tema Star Fox — Fox McCloud pro CLI, Falco pro gate, e por aí vai. É só sabor pra
deixar a conversa mais fácil; os codinomes aparecem em [`docs/METHOD.md`](docs/METHOD.md) como exemplo, não
são terminologia que você precisa aprender pra usar a ferramenta.

## Status (PoC)

Provado em dogfood real: `init` (greenfield), `audit` (o gate morde, exit≠0), `clarify` (ranking), e
paridade com um gate bespoke de 11 sentinelas (mesmos resultados). Zero deps, Node 18+, MIT.

Pronto: init/audit/clarify/catalog/state/agents, presets do consumidor, slash commands (Claude Code).
Roadmap: config em YAML, slash commands pra Copilot/Cursor, publicação opcional em registry, pin por tag.
