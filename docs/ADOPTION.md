# Playbook de adoção — trazer um produto pra mesma página + migrar pro TTech Spec

> Sequência testada na TTech Ex. **Não pule a Fase 0.** A ordem importa: primeiro a VERDADE
> (código, não memória), depois limpar lixo e achar o estado real, e só então migrar. Adotar o gate
> sobre um estado bagunçado só formaliza a bagunça.
>
> Regra de ouro deste playbook: **a fonte da verdade é o código + git + os menus** — nunca a memória
> de um agente. Toda conclusão abaixo deve ser confirmada contra o repo.

## Fase 0 — Verdade & limpeza (antes de qualquer migração)

1. **Git é a base.** Confirme que nada está perdido:
   ```bash
   git status --short      # tem trabalho não-commitado?
   git branch -a           # feature dormindo em branch?
   git stash list
   git log --oneline -30   # o que foi REALMENTE trabalhado por último
   ```

2. **Cruze 3 fontes objetivas** (acha divergência e lixo):
   - **Módulos no código** (ex: `apps/api/Modules/`) × **catálogo documentado** (`docs/modules/*.yaml`)
     × **menus expostos** (sidebar). Módulo no código sem doc = catálogo furado (feature "perdida").
   - **Telas órfãs**: páginas/rotas que existem mas **sumiram do menu** (sem link). São candidatas a
     lixo — decida com o dono: parquear (manter de propósito) ou remover.
   - `.disabled`, código comentado, itens `hidden` no menu.

3. **Capture decisões que só vivem na cabeça.** Pergunte ao dono o que mudou e não virou artefato
   (ex: "a feature X foi substituída por Y"). Marque o que ficou stale como **SUPERSEDED** no backlog/docs.
   Se vive só na memória de alguém, é dívida — registre agora.

4. **Escreva `docs/STATE.md`** — o "onde paramos" ancorado em código: recém-entregue + threads abertas
   (status / próximo passo / fonte). Complementa (não duplica) o backlog de features e o roadmap.

## Fase 1 — Adoção do TTech Spec

5. **Init** (no repo do produto):
   ```bash
   npx --yes github:ttechdigital/ttech-spec init
   ```
   Cria `.ttechspec/` (specs/ modules/ presets/ conventions.md + config) e os slash commands
   `/clarify` e `/ttechspec-audit` em `.claude/commands/`.

6. **Configure o gate** — `.ttechspec/ttechspec.config.json`:
   - `extends` herda os presets que fazem sentido pro produto (ajuste os globs em `.ttechspec/presets/*`).
   - `rules`: **só o específico do produto** (baselines de regressão, strings que não pode hardcodar, paths).
   - A base é SUA (do consumidor) — edite à vontade. O produto não é dono dela.

7. **Sentinela de cobertura de catálogo** (a que pegou o lixo na Ex) — garante código↔catálogo:
   - Um check (`script`) que falha se um módulo do código não tem `module.yaml`.
   - Rode: ele FALHA listando os módulos sem doc → **backfill** cada um a partir dos controllers reais →
     fica verde. A partir daí, módulo novo sem doc reprova o PR.

8. **Calibre os baselines** — `npx ... audit`; pra regras `baseline-count`, set baseline = contagem atual
   ("não crescer"). Itere até passar.

## Fase 2 — Travar (gate + CI + memória durável)

9. **CI + Makefile** (pin por tag, reprodutível):
   ```bash
   npx --yes github:ttechdigital/ttech-spec#vX.Y.Z audit
   ```
   Adicione como step do CI (e, se quiser, pre-commit). Mantenha o gate antigo em paralelo por uns ciclos
   antes de aposentar (prova de paridade).

10. **Push do estado pra plataforma** (memória agent-independent) — step no CI:
    ```bash
    npx --yes github:ttechdigital/ttech-spec#vX.Y.Z state > /tmp/state.json
    curl -fsS -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      --data @/tmp/state.json https://sua-plataforma.example/api/platform/architecture/state
    ```
    `$TOKEN` = PAT da plataforma (secret no CI). O produto vira um card em `/architecture/state`.

## Fase 3 — Loop vivo

11. **Specs reais** em `.ttechspec/specs/` (decisões de verdade, não stubs de demo). Marque dúvida com
    `[NEEDS CLARIFICATION]` / `TODO` / `???`.
12. **`/clarify`** ranqueia por pendência e orienta a resolver (decisão vai pra `## Clarifications`).
13. **Docs em sync**: o gate reprova divergência. Não deixe decisão solta no chat — vira artefato.

## Orientação do agente (pro bot que sobe os agentes)

No bootstrap de cada agente, em qualquer produto, injete:
```
Você trabalha no produto <X> (repo em checkout). Antes de agir, oriente-se:
1. Leia CLAUDE.md e docs/STATE.md (onde paramos).
2. Rode `npx --yes github:ttechdigital/ttech-spec clarify` (trabalho em aberto).
Fonte da verdade = repo + plataforma, NÃO memória de sessão anterior.
```
Visão cruzada de todos os produtos: `GET /api/platform/architecture/state`.

## Anti-padrões (o que deu errado e como evitar)

- ❌ Migrar sem a Fase 0 → formaliza a bagunça. Verdade primeiro.
- ❌ Confiar na memória do agente como fonte → ela é parcial e não viaja. Código manda.
- ❌ Backfillar catálogo "de cabeça" → leia os controllers reais (endpoints de verdade).
- ❌ Deixar decisão importante só no chat → registre em spec/STATE/backlog na hora.
- ❌ Dado de cliente/segredo em exemplo ou doc público → use placeholders.
