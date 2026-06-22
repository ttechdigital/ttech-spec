#!/usr/bin/env node
// TTech Spec — módulo "Core / Orquestrador" — codinome: Fox McCloud 🦊 (lidera o esquadrão).
// CLI (PoC) — produto-no-repo. Comandos:
//   ttechspec init         scaffolda .ttechspec/ (specs, commands, conventions, config) + hooks
//   ttechspec audit        roda o gate de sentinelas (regras como dado) — exit !=0 se reprovar
//   ttechspec clarify      ranqueia specs por pendência ([NEEDS CLARIFICATION]/TODO/???) — igual SDD, + gate
//
// Moat vs Spec Kit/Kiro/OpenSpec: eles fazem spec→IA implementa. Aqui o gate REPROVA o PR e o
// catálogo registra. Ver docs/TTECH-SPEC-PRODUCT.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAudit, resolveConfig, specClarity, walk } from '../src/engine.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.join(here, '..');
const cwd = process.cwd();
const CONFIG = 'ttechspec.config.json';

const C = { red: '\x1b[31m', grn: '\x1b[32m', yel: '\x1b[33m', dim: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' };

function loadConfig() {
  const p = path.join(cwd, '.ttechspec', CONFIG);
  if (!fs.existsSync(p)) { console.error(`${C.red}Sem .ttechspec/${CONFIG}. Rode 'ttechspec init'.${C.x}`); process.exit(2); }
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  return resolveConfig(raw, { repoDir: cwd }); // herda a base do PRÓPRIO repo (.ttechspec/presets) + regras do projeto
}

function cmdInit() {
  const base = path.join(cwd, '.ttechspec');
  if (fs.existsSync(base)) { console.error(`${C.yel}.ttechspec já existe — nada a fazer.${C.x}`); process.exit(0); }
  for (const d of ['specs', 'commands', 'modules', 'presets']) fs.mkdirSync(path.join(base, d), { recursive: true });
  fs.copyFileSync(path.join(PKG, 'templates', CONFIG), path.join(base, CONFIG));
  fs.copyFileSync(path.join(PKG, 'templates', 'conventions.md'), path.join(base, 'conventions.md'));
  fs.copyFileSync(path.join(PKG, 'templates', 'spec.template.md'), path.join(base, 'specs', '_template.md'));
  // Semeia a base (starter). A partir daqui é DO CONSUMIDOR — ele edita/estende. O produto não é dono.
  for (const p of fs.readdirSync(path.join(PKG, 'templates', 'presets'))) {
    fs.copyFileSync(path.join(PKG, 'templates', 'presets', p), path.join(base, 'presets', p));
  }
  fs.writeFileSync(path.join(base, 'commands', '.gitkeep'), '');
  fs.writeFileSync(path.join(base, 'modules', '.gitkeep'), '');
  console.log(`${C.grn}✓ .ttechspec/ criado${C.x} (specs/ commands/ modules/ presets/ conventions.md ${CONFIG})`);
  console.log(`${C.dim}A base em presets/ é SUA agora — edite/estenda. Próximo: ajuste ${CONFIG} e rode 'ttechspec audit'.${C.x}`);
  console.log(`${C.dim}CI: adicione 'npx ttechspec audit' como step + pre-commit hook.${C.x}`);
}

function cmdAudit(argv) {
  const config = loadConfig();
  const results = runAudit(config, cwd);
  let fails = 0, warns = 0;
  for (const r of results) {
    const mark = r.ok ? `${C.grn}OK  ${C.x}` : (r.severity === 'fail' ? `${C.red}FAIL${C.x}` : `${C.yel}WARN${C.x}`);
    console.log(`${mark} ${C.b}${r.id}${C.x} ${C.dim}— ${r.detail}${C.x}`);
    if (!r.ok) {
      (r.hits || []).slice(0, argv.includes('-v') ? 999 : 5).forEach((h) => console.log(`       ${C.dim}${h}${C.x}`));
      if (r.severity === 'fail') fails++; else warns++;
    }
  }
  console.log(`\n${C.b}=== resumo ===${C.x}  fails: ${fails}  warns: ${warns}  (${results.length} regras)`);
  process.exit(fails > 0 ? 1 : 0);
}

// clarify — replica a "categorização" do SDD (ranking por pendência) e ainda mostra o gate.
function cmdClarify() {
  const config = loadConfig();
  const rule = (config.rules || []).find((r) => r.type === 'spec-clarity')
    || { id: 'spec-clarity', type: 'spec-clarity', include: ['.ttechspec/specs/**/*.md'], exclude: ['**/_template.md'] };
  const res = specClarity(rule, cwd, walk(cwd));
  const rows = res.rows || [];
  if (rows.length === 0) { console.log('Nenhuma spec encontrada em .ttechspec/specs/.'); return; }
  console.log(`${C.b}${rows.length} specs${C.x} — ordenadas por pendência (TODO / [NEEDS CLARIFICATION] / ???):\n`);
  console.log(`${C.dim}  #  Pend  Linhas  Clar  Spec${C.x}`);
  rows.forEach((r, i) => {
    const clar = r.hasClar ? `${C.grn}sim ${C.x}` : `${C.yel}não ${C.x}`;
    console.log(`  ${String(i + 1).padStart(2)}  ${String(r.pend).padStart(4)}  ${String(r.lines).padStart(6)}  ${clar}  ${r.title} ${C.dim}(${path.basename(r.file)})${C.x}`);
  });
  const top = rows.find((r) => r.pend > 0);
  console.log(top
    ? `\n${C.dim}Mais ambígua: ${top.title} — comece por ela.${C.x}`
    : `\n${C.grn}Todas as specs sem pendências.${C.x}`);
}

const [, , cmd, ...rest] = process.argv;
switch (cmd) {
  case 'init': cmdInit(); break;
  case 'audit': cmdAudit(rest); break;
  case 'clarify': cmdClarify(); break;
  default:
    console.log(`${C.b}ttechspec${C.x} (PoC) — produto-no-repo do método TTech Spec\n`);
    console.log('  ttechspec init      scaffolda .ttechspec/ + config do gate');
    console.log('  ttechspec audit     roda o gate de sentinelas (exit!=0 reprova)');
    console.log('  ttechspec clarify   ranqueia specs por pendência (estilo SDD)');
    console.log(`\n${C.dim}Ver docs/TTECH-SPEC-PRODUCT.md${C.x}`);
}
