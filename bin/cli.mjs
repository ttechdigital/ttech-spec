#!/usr/bin/env node
// TTech Spec — módulo "Core / Orquestrador" — codinome: Fox McCloud 🦊 (lidera o esquadrão).
// CLI — produto-no-repo. Comandos: init · audit · clarify · catalog · agents.
// Moat vs Spec Kit/Kiro/OpenSpec: eles fazem spec→IA implementa. Aqui o gate REPROVA o PR e o
// catálogo registra. Método em docs/METHOD.md, workflow em docs/WORKFLOW.md.
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

// Skills (codinome Slippy Toad): gera os slash commands do agente em .claude/commands/ — a UX
// /clarify e /ttechspec-audit dentro do Claude Code. Idempotente (sobrescreve os do TTech Spec).
function genAgents() {
  const srcDir = path.join(PKG, 'templates', 'agents', 'claude');
  const dstDir = path.join(cwd, '.claude', 'commands');
  fs.mkdirSync(dstDir, { recursive: true });
  const written = [];
  for (const f of fs.readdirSync(srcDir)) {
    fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f));
    written.push('/' + f.replace(/\.md$/, ''));
  }
  return written;
}

function cmdInit() {
  const base = path.join(cwd, '.ttechspec');
  if (fs.existsSync(base)) { console.error(`${C.yel}.ttechspec já existe — nada a fazer. (use 'ttechspec agents' pra regerar os slash commands)${C.x}`); process.exit(0); }
  for (const d of ['specs', 'modules', 'presets']) fs.mkdirSync(path.join(base, d), { recursive: true });
  fs.copyFileSync(path.join(PKG, 'templates', CONFIG), path.join(base, CONFIG));
  fs.copyFileSync(path.join(PKG, 'templates', 'conventions.md'), path.join(base, 'conventions.md'));
  fs.copyFileSync(path.join(PKG, 'templates', 'spec.template.md'), path.join(base, 'specs', '_template.md'));
  // Semeia a base (starter). A partir daqui é DO CONSUMIDOR — ele edita/estende. O produto não é dono.
  for (const p of fs.readdirSync(path.join(PKG, 'templates', 'presets'))) {
    fs.copyFileSync(path.join(PKG, 'templates', 'presets', p), path.join(base, 'presets', p));
  }
  fs.writeFileSync(path.join(base, 'modules', '.gitkeep'), '');
  const agents = genAgents();
  console.log(`${C.grn}✓ .ttechspec/ criado${C.x} (specs/ modules/ presets/ conventions.md ${CONFIG})`);
  console.log(`${C.grn}✓ slash commands${C.x} em .claude/commands/: ${agents.join('  ')}`);
  console.log(`${C.dim}A base em presets/ é SUA agora — edite/estenda. Próximo: ajuste ${CONFIG} e rode 'ttechspec audit'.${C.x}`);
  console.log(`${C.dim}CI: adicione 'npx --yes github:ttechdigital/ttech-spec audit' como step.${C.x}`);
}

function cmdAgents() {
  const agents = genAgents();
  console.log(`${C.grn}✓ slash commands${C.x} (re)gerados em .claude/commands/: ${agents.join('  ')}`);
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

// catalog (codinome ROB 64): lista + valida o registro de módulos (.ttechspec/modules/*.yaml).
function cmdCatalog() {
  const dir = path.join(cwd, '.ttechspec', 'modules');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)) : [];
  if (files.length === 0) { console.log('Nenhum module.yaml em .ttechspec/modules/.'); return; }
  console.log(`${C.b}${files.length} módulos${C.x} (.ttechspec/modules/):\n`);
  console.log(`${C.dim}  Slug                    Surface  History  Arquivo${C.x}`);
  let incompletos = 0;
  for (const f of files.sort()) {
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    const slug = ((txt.match(/^\s*slug:\s*(.+)$/m) || [])[1] || '?').trim().replace(/['"]/g, '');
    const hasSurface = /^\s*surface:/m.test(txt);
    const hasHistory = /^\s*history:/m.test(txt);
    if (!hasSurface || !hasHistory) incompletos++;
    const mk = (ok) => (ok ? `${C.grn}✓${C.x}` : `${C.yel}–${C.x}`);
    console.log(`  ${slug.padEnd(22)}  ${mk(hasSurface)}        ${mk(hasHistory)}        ${C.dim}${f}${C.x}`);
  }
  console.log(`\n${C.b}=== ${files.length} módulos, ${incompletos} incompletos (sem surface/history) ===${C.x}`);
}

const [, , cmd, ...rest] = process.argv;
switch (cmd) {
  case 'init': cmdInit(); break;
  case 'audit': cmdAudit(rest); break;
  case 'clarify': cmdClarify(); break;
  case 'catalog': cmdCatalog(); break;
  case 'agents': cmdAgents(); break;
  default:
    console.log(`${C.b}ttechspec${C.x} — gate de arquitetura como código + método spec→skill→convenção→audit→catálogo\n`);
    console.log('  ttechspec init      scaffolda .ttechspec/ + base + slash commands');
    console.log('  ttechspec audit     roda o gate de sentinelas (exit!=0 reprova)');
    console.log('  ttechspec clarify   ranqueia specs por pendência (estilo SDD)');
    console.log('  ttechspec catalog   lista/valida o registro de módulos');
    console.log('  ttechspec agents    (re)gera os slash commands (/clarify, /ttechspec-audit)');
    console.log(`\n${C.dim}Método: docs/METHOD.md · Workflow: docs/WORKFLOW.md${C.x}`);
}
