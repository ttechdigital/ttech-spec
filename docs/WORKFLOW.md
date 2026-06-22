# Workflow — do spec ao gate

> Como evoluir uma feature com o TTech Spec, ponta a ponta. Dois loops complementares: o **loop de
> spec** (decidir antes de codar) e o **loop de teste** (provar antes de shippar).

## O loop de spec (estruturar a decisão)

1. **Spec primeiro** — crie `.ttechspec/specs/<feature>.md` (copie `_template.md`). Onde houver dúvida,
   marque `[NEEDS CLARIFICATION]`, `TODO` ou `???`.
2. **Clarify** — `ttechspec clarify` ranqueia as specs por pendência (mais ambígua primeiro).
3. **Resolva** — ataque a mais furada: responda cada pergunta e mova a decisão pra seção
   `## Clarifications`. Rode `clarify` de novo: pendência cai a 0 e a spec marca **Clarified** = pronta.
4. **Implemente** — com a spec sem buracos como contrato.
5. **Gate** — `ttechspec audit` no pre-commit + CI reprova quem violar convenção.
6. **Catálogo** — atualize o `module.yaml` do módulo tocado (superfície + history).

## O loop de teste (o teste é a spec)

TDD no nível do produto, não só do código. Toda mudança prova-se antes de shippar:

```
1. Descreva o caso (real ou fictício)
2. Escreva o teste no MENOR nível que expressa o caso (RED)
   └── use os valores REAIS do incidente quando existirem
3. Rode — falha
4. Mudança mínima pra passar (GREEN) — diff pequeno, sem refactor junto
5. Rode a suíte inteira — nada regrediu
6. Commit referenciando o caso
7. Push — CI confirma
```

### Regra da âncora

Pra todo bug que chegou em produção, o teste usa o **input exato que quebrou**, não uma paráfrase.
Se o teste usa uma versão simplificada, alguém escreve um "fix" que passa no simplificado e continua
quebrando no real.

### Escolhendo o nível do teste

Comece no menor nível que expressa o caso; só suba quando precisar (níveis altos são mais lentos e
flaky). Lógica pura → unit; toca DB → integration; bate num endpoint → API; precisa do browser → e2e.

## Critérios: quando algo vira SPEC

Cumulativos:
1. Gasta-se >10min relendo código pra entender o "como" sem quebrar.
2. Tem ≥3 lugares de mudança coordenada quando se adiciona algo.
3. O erro de implementação não é óbvio na hora (acerto numérico, ordering, edge case silencioso).

Se não cumpre os 3, prefira: comentário inline · `module.yaml` (se é de 1 módulo) · não documentar.

## Estrutura de uma spec

1. Contexto (≤3 parágrafos) · 2. Contrato/schema · 3. Como adicionar/modificar · 4. Anti-padrões ·
5. Checklist antes de subir · 6. Clarifications (decisões resolvidas) · 7. Histórico.

## Anti-padrões

- "Adiciono o teste depois." Não. O teste é a spec; depois nunca vem.
- Testar a implementação em vez do comportamento (quebra ao refatorar sem mudar contrato).
- Asserção larga (`NotBeNull`) que passa pra qualquer saída — afirme o valor exato.
- Refatorar no meio do bug fix — o diff do fix contém só o fix.
- Convenção sem sentinela — vira sugestão ignorada.
