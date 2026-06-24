#!/usr/bin/env node
// TTech Spec — módulo "Core / Orquestrador" — codinome: Fox McCloud 🦊 (lidera o esquadrão).
// CLI — produto-no-repo. Comandos: init · audit · clarify · catalog · agents.
// Moat vs Spec Kit/Kiro/OpenSpec: eles fazem spec→IA implementa. Aqui o gate REPROVA o PR e o
// catálogo registra. Método em docs/METHOD.md, workflow em docs/WORKFLOW.md.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
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

// --- compute (dados puros, reusados por render humano + --json + state) ---

function auditData() {
  const results = runAudit(loadConfig(), cwd);
  const rules = results.map((r) => ({ id: r.id, severity: r.severity, ok: r.ok, detail: r.detail, hits: r.hits || [] }));
  const fails = rules.filter((r) => !r.ok && r.severity === 'fail').length;
  const warns = rules.filter((r) => !r.ok && r.severity !== 'fail').length;
  return { ok: fails === 0, fails, warns, total: rules.length, rules };
}

function clarifyData() {
  const config = loadConfig();
  const rule = (config.rules || []).find((r) => r.type === 'spec-clarity')
    || { id: 'spec-clarity', type: 'spec-clarity', include: ['.ttechspec/specs/**/*.md'], exclude: ['**/_template.md'] };
  const rows = (specClarity(rule, cwd, walk(cwd)).rows || [])
    .map((r) => ({ file: r.file, title: r.title, pending: r.pend, lines: r.lines, clarified: r.hasClar, tasks: r.tasks }));
  const top = rows.find((r) => r.pending > 0) || null;
  return { specs: rows, pendingTotal: rows.reduce((a, r) => a + r.pending, 0), resumeAt: top ? top.file : null };
}

function catalogData() {
  const dir = path.join(cwd, '.ttechspec', 'modules');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort() : [];
  const modules = files.map((f) => {
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    const slug = ((txt.match(/^\s*slug:\s*(.+)$/m) || [])[1] || '?').trim().replace(/['"]/g, '');
    return { slug, file: f, hasSurface: /^\s*surface:/m.test(txt), hasHistory: /^\s*history:/m.test(txt) };
  });
  return { modules, total: modules.length, incomplete: modules.filter((m) => !m.hasSurface || !m.hasHistory).length };
}

const wantsJson = (argv) => argv.includes('--json');

function cmdAudit(argv) {
  const d = auditData();
  if (wantsJson(argv)) { console.log(JSON.stringify(d, null, 2)); process.exit(d.fails > 0 ? 1 : 0); }
  for (const r of d.rules) {
    const mark = r.ok ? `${C.grn}OK  ${C.x}` : (r.severity === 'fail' ? `${C.red}FAIL${C.x}` : `${C.yel}WARN${C.x}`);
    console.log(`${mark} ${C.b}${r.id}${C.x} ${C.dim}— ${r.detail}${C.x}`);
    if (!r.ok) r.hits.slice(0, argv.includes('-v') ? 999 : 5).forEach((h) => console.log(`       ${C.dim}${h}${C.x}`));
  }
  console.log(`\n${C.b}=== resumo ===${C.x}  fails: ${d.fails}  warns: ${d.warns}  (${d.total} regras)`);
  process.exit(d.fails > 0 ? 1 : 0);
}

// clarify — categorização do SDD (ranking por pendência) virada estado retomável.
function cmdClarify(argv) {
  const d = clarifyData();
  if (wantsJson(argv)) { console.log(JSON.stringify(d, null, 2)); return; }
  if (d.specs.length === 0) { console.log('Nenhuma spec encontrada em .ttechspec/specs/.'); return; }
  console.log(`${C.b}${d.specs.length} specs${C.x} — ordenadas por pendência (TODO / [NEEDS CLARIFICATION] / ???):\n`);
  console.log(`${C.dim}  #  Pend  Feito  Clar  Spec${C.x}`);
  d.specs.forEach((r, i) => {
    const clar = r.clarified ? `${C.grn}sim ${C.x}` : `${C.yel}não ${C.x}`;
    const t = r.tasks || { total: 0, done: 0 };
    const prog = t.total ? `${t.done}/${t.total}` : ` - `;
    const progC = t.total && t.done === t.total ? `${C.grn}${prog.padStart(5)}${C.x}` : prog.padStart(5);
    console.log(`  ${String(i + 1).padStart(2)}  ${String(r.pending).padStart(4)}  ${progC}  ${clar}  ${r.title} ${C.dim}(${path.basename(r.file)})${C.x}`);
  });
  console.log(d.resumeAt
    ? `\n${C.dim}Retomar por: ${path.basename(d.resumeAt)} (mais pendências).${C.x}`
    : `\n${C.grn}Todas as specs sem pendências.${C.x}`);
}

// catalog (codinome ROB 64): lista + valida o registro de módulos (.ttechspec/modules/*.yaml).
function cmdCatalog(argv) {
  const d = catalogData();
  if (wantsJson(argv)) { console.log(JSON.stringify(d, null, 2)); return; }
  if (d.total === 0) { console.log('Nenhum module.yaml em .ttechspec/modules/.'); return; }
  console.log(`${C.b}${d.total} módulos${C.x} (.ttechspec/modules/):\n`);
  console.log(`${C.dim}  Slug                    Surface  History  Arquivo${C.x}`);
  const mk = (ok) => (ok ? `${C.grn}✓${C.x}` : `${C.yel}–${C.x}`);
  for (const m of d.modules) console.log(`  ${m.slug.padEnd(22)}  ${mk(m.hasSurface)}        ${mk(m.hasHistory)}        ${C.dim}${m.file}${C.x}`);
  console.log(`\n${C.b}=== ${d.total} módulos, ${d.incomplete} incompletos (sem surface/history) ===${C.x}`);
}

// state — snapshot estruturado do repo pra a plataforma agregar ("onde cada sistema parou"),
// independente do agente. Sempre JSON. project vem do config.
// repo de origem ("org/name") — deixa a plataforma (Ex) ler as docs do produto via GitHub pull.
// Fonte: campo `repo` no config; fallback pro `git remote origin`.
function resolveRepo(cfg) {
  if (cfg && typeof cfg.repo === 'string' && cfg.repo.trim()) return cfg.repo.trim();
  try {
    const url = execSync('git config --get remote.origin.url', { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const m = url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/);
    return m ? m[1] : null;
  } catch { return null; }
}

function cmdState() {
  let project = path.basename(cwd);
  let cfg = null;
  try { cfg = JSON.parse(fs.readFileSync(path.join(cwd, '.ttechspec', CONFIG), 'utf8')); project = cfg.project || project; } catch {}
  const snapshot = {
    project,
    repo: resolveRepo(cfg),
    generatedAt: new Date().toISOString(),
    gate: auditData(),
    specs: clarifyData(),
    catalog: catalogData(),
  };
  console.log(JSON.stringify(snapshot, null, 2));
}

const [, , cmd, ...rest] = process.argv;
switch (cmd) {
  case 'init': cmdInit(); break;
  case 'audit': cmdAudit(rest); break;
  case 'clarify': cmdClarify(rest); break;
  case 'catalog': cmdCatalog(rest); break;
  case 'state': cmdState(); break;
  case 'agents': cmdAgents(); break;
  default:
    console.log(`${C.b}ttechspec${C.x} — gate de arquitetura como código + método spec→skill→convenção→audit→catálogo\n`);
    console.log('  ttechspec init      scaffolda .ttechspec/ + base + slash commands');
    console.log('  ttechspec audit     roda o gate de sentinelas (exit!=0 reprova)   [--json]');
    console.log('  ttechspec clarify   ranqueia specs por pendência (estilo SDD)      [--json]');
    console.log('  ttechspec catalog   lista/valida o registro de módulos            [--json]');
    console.log('  ttechspec state     snapshot JSON (gate+specs+catalog) p/ a plataforma agregar');
    console.log('  ttechspec agents    (re)gera os slash commands (/clarify, /ttechspec-audit)');
    console.log(`\n${C.dim}Método: docs/METHOD.md · Workflow: docs/WORKFLOW.md${C.x}`);
}
