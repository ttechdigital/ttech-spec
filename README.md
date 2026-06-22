# TTech Spec — CLI (PoC)

Produto-no-repo do método TTech Spec (`docs/TTECH-SPEC-METHOD.md`). **Moat**: enquanto Spec Kit /
Kiro / OpenSpec fazem o *build loop* (spec → IA implementa), aqui o **gate REPROVA o PR** e o
catálogo registra. Ver posicionamento em `docs/TTECH-SPEC-PRODUCT.md`.

## Comandos

```bash
ttechspec init       # scaffolda .ttechspec/ (specs/ commands/ modules/ conventions.md + config do gate)
ttechspec audit      # roda o gate de sentinelas — exit != 0 reprova (pre-commit + CI)
ttechspec clarify    # ranqueia specs por pendência ([NEEDS CLARIFICATION]/TODO/???), estilo SDD
```

## A base é DO CONSUMIDOR (o produto é só o engine)

Decisão de design: o TTech Spec **não shippa presets opinativos** — não dá pra cobrir toda stack, e qual
é a base é decisão do dono do repo. O produto entrega o **engine** (tipos de regra) + o **CLI**; o
`init` **semeia** um starter de base no `.ttechspec/presets/` do consumidor, que a partir daí é **dele**
pra editar. (Como `eslint --init`: gera um config que vira seu, não uma dependência do nosso opinião.)

Tudo mora no repo do consumidor, em camadas:

- **Base** → `.ttechspec/presets/{base,dotnet,web}.json` — genéricas/por-stack, **do consumidor** (editáveis).
- **Regras do projeto** → `.ttechspec/ttechspec.config.json` — o específico (baselines, strings de cliente).

O config estende a base (resolução **no próprio repo**; igual ESLint/tsconfig):

```json
{ "extends": ["dotnet", "web"], "rules": [ /* só o específico do projeto */ ] }
```

`extends: ["dotnet"]` → `.ttechspec/presets/dotnet.json` (do repo). Caminho relativo (`"../base.json"`) também
vale — pra um time compartilhar UMA base entre os repos DELE. Merge por `id`: base → stack → projeto
(precedência crescente; pode redefinir um `id` pra ajustar severity/glob/baseline). Ver `.ttechspec/` da Ex.

## O gate = regras como DADO

`.ttechspec/ttechspec.config.json` lista regras. 4 arquétipos (extraídos do `audit-sentinels.sh` da Ex):

- **forbidden-pattern** — reprova se um padrão aparece (catch vazio, segredo em response…).
- **baseline-count** — reprova se a contagem sobe do baseline (ex: `[AllowAnonymous]`).
- **paired-file** — cada X exige o irmão Y (migration → `.Designer.cs`).
- **spec-clarity** — specs com pendência não resolvida (a "categorização" do SDD, virada gate).

## Módulos (razão social → nome fantasia, tema Star Fox)

O produto é feito das próprias etapas do método (dogfooding). Codinomes em `docs/TTECH-SPEC-METHOD.md`:

| Razão social | Codinome | Papel |
|---|---|---|
| Core / Orquestrador (CLI) | **Fox McCloud** | comanda os outros |
| Sentinels / Gate (engine) | **Falco Lombardi** | reprova o PR — o moat |
| Constitution (convenções) | **General Pepper** | define a lei |
| Catalog (registry) | **ROB 64** | cataloga module.yaml + history |
| Specs | **Peppy Hare** | guarda as decisões |
| Skills (commands/multi-agente) | **Slippy Toad** | constrói as ferramentas |
| Clarify (qualidade de spec) | **Krystal** | dissolve a ambiguidade |

Banco de reserva: Wolf (SaaS), Pigma (licenciamento), Katt (notificações), Bill (CI), Leon (security).

## Status (PoC)

Provado em dogfood real: `init` (greenfield), `audit` (gate morde, exit≠0), `clarify` (ranking),
e **paridade** com um gate bespoke de 11 sentinelas (mesmos resultados). Zero deps, Node 18+. MIT.

### Instalar (modelo git+https, sem registry)

```bash
npx github:ttechdigital/ttech-spec init     # scaffolda .ttechspec/ no seu repo
npx github:ttechdigital/ttech-spec audit    # roda o gate (use no pre-commit + CI)
```

Pendente de produtizar: config em YAML, `catalog` (gera module.yaml), geração de comandos
multi-agente (Claude/Copilot/Cursor), publicação opcional em registry.
