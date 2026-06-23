# O método TTech Spec

> Não é uma ferramenta nem um doc — é um **ciclo** com cinco tipos de artefato que se reforçam.
> Este é o manual: o que cada peça é, como se encaixam, e quando usar qual. O CLI (`init`/`audit`/
> `clarify`/`catalog`) automatiza o ciclo; este doc explica o porquê.

## Por que existe

Projeto multi-pessoa, multi-sessão, com IA escrevendo código junto. Sem método, o conhecimento de
"como fazer certo" mora na cabeça de quem estava presente — e some. Cada reimplementação erra os
mesmos cantos silenciosos (ordering, multi-tenant, edge case que não estoura na hora).

O TTech Spec transforma conhecimento em **artefatos que agem**: a decisão vira spec, a execução vira
skill guiada, a regra vira convenção, e a convenção vira **gate automático** que recusa o PR errado.
O catálogo registra o que existe. Nada depende de alguém lembrar.

## O ciclo

```
   SPEC   -->   SKILL   -->   CONVENÇÃO   -->   AUDIT   -->   CATÁLOGO
 (decisão)   (execução)     (regra)         (gate)      (módulo + history)
```

**Feedback (fecha o ciclo):** quando o **AUDIT** reprova um caso, isso vira uma nova **SPEC** — e o ciclo recomeça.

1. **Spec** desenha o certo (decisão + contrato + anti-padrões).
2. **Skill** automatiza o fluxo guiado que a spec descreve (slash command).
3. **Convenção** destila a regra absoluta e curta que a spec implica.
4. **Audit (sentinela)** transforma a convenção em gate de pre-commit/CI — recusa o errado.
5. **Catálogo** (`module.yaml` + `history`) registra a superfície e a evolução.
6. O audit, ao reprovar, expõe um buraco → vira nova spec. O ciclo fecha.

## Os cinco artefatos

| Artefato | Onde vive | O que é | Quando criar |
|---|---|---|---|
| **Spec** | `.ttechspec/specs/*.md` | Decisão transversal: contrato + como mexer + anti-padrões | >10min relendo código pra entender o "como"; ≥3 lugares de mudança coordenada; erro silencioso |
| **Skill** | `.claude/commands/*.md` (gerado) | Fluxo guiado executável (slash command) pra uma tarefa repetível | A spec tem um passo a passo que se repete |
| **Convenção** | `.ttechspec/conventions.md` | Regra curta e absoluta | A spec implica uma regra que vale **sempre** |
| **Sentinela** | `.ttechspec/ttechspec.config.json` | Regra-como-dado que o `audit` aplica e reprova | A convenção é detectável por padrão (regex/contagem/par/script) |
| **Módulo** | `.ttechspec/modules/*.yaml` | Catálogo: superfície + decisões + history | Todo módulo tem um; PR que toca o módulo atualiza |

**Regra de ouro:** uma convenção sem sentinela é só uma sugestão. O que diferencia o TTech Spec de
"ter boa documentação" é que a regra **executa**.

## Quando usar qual (árvore de decisão)

```
Tenho uma decisão de arquitetura nova?
- Cruza >=3 módulos e erra fácil?          -> SPEC
    - ...e tem um fluxo repetível?         -> + SKILL
    - ...e implica uma regra absoluta?     -> + CONVENÇÃO
        - ...detectável por padrão?        -> + SENTINELA (gate)
- É de 1 módulo só?                        -> module.yaml
- É uma regra curta e universal?           -> CONVENÇÃO direto
- É trivial (código bem nomeado já diz)?   -> não documentar
```

Subir o nível só quando precisa. A maioria das mudanças não vira spec — vira linha no `module.yaml`
ou comentário inline. Spec é caro; reserve pro que erra.

## A base é DO CONSUMIDOR

O TTech Spec é o **engine** (tipos de regra + CLI). Não shippa presets opinativos — não dá pra cobrir
toda stack, e qual é a base é decisão do dono do repo. O `init` **semeia** uma base em
`.ttechspec/presets/` que vira **sua** pra editar; o `extends` herda dela (merge por `id`:
base → stack → projeto). O específico (strings, baselines, IDs) fica no `.ttechspec/` do consumidor —
nunca no produto.

## Posição no mercado

A categoria SDD (Spec Kit, Kiro, OpenSpec, BMAD) resolve o **build loop** (spec → IA implementa). O
diferencial do TTech Spec é **enforcement** (o gate REPROVA o PR, com severity) + **catálogo vivo**.
A herança de config (`extends`) é commodity (ESLint/Spec Kit já têm); o que ganha é "regra herdável
que bloqueia" + método junto.
