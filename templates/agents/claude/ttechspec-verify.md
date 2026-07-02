---
description: Use antes de dizer que algo está pronto/corrigido/passando, ou antes de commitar/abrir PR — exige rodar o gate e confirmar a saída antes de qualquer afirmação de sucesso. Evidência antes de afirmar, sempre.
---

# Verificação antes de concluir (via gate determinístico)

**Lei de ferro:** nenhuma afirmação de "pronto / corrigido / passando" sem ter rodado o gate e lido a saída. O gate é a evidência; sua confiança não é.

## Portão (rode antes de concluir ou commitar)

1. Execute: `npx --yes github:ttechdigital/ttech-spec audit`
2. Leia a saída inteira e o exit code. `fails: 0` = ok; `fails > 0` = NÃO está pronto.
3. Para cada `FAIL`, abra o arquivo apontado e corrija conforme a convenção da regra (`↳` mostra o porquê). Rode de novo até zerar.
4. Só então afirme conclusão — citando a saída real (ex: "gate verde, fails: 0"), nunca "deve passar".

## Bandeiras vermelhas (PARE)

- "provavelmente passa" / "deve estar ok" → rode o gate.
- vai commitar sem ter rodado `audit` → rode primeiro.
- `WARN` acumulando → avalie; se for aceitar de propósito, use `waivers` (com motivo) ou `// ttechspec-ignore: <rule-id>`, nunca ignore no escuro.

## Por que importa

O gate reprova o PR de qualquer jeito. Descobrir a violação agora (local) é barato; descobrir no CI, depois de afirmar "pronto", queima confiança. Evidência antes de afirmar.
