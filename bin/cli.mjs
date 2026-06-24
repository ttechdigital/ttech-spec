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
  fs.copyFileSync(path.join(PKG, 'templates', 'module.template.yaml'), path.join(base, 'modules', '_template.yaml'));
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
  const rules = results.map((r) => ({
    id: r.id, severity: r.severity, ok: r.ok, detail: r.detail, hits: r.hits || [],
    because: r.because || null, suppressed: r.suppressed || 0, waived: r.waived || null,
  }));
  const fails = rules.filter((r) => !r.ok && !r.waived && r.severity === 'fail').length;
  const warns = rules.filter((r) => !r.ok && !r.waived && r.severity !== 'fail').length;
  const waived = rules.filter((r) => !r.ok && r.waived).length;
  const suppressed = rules.reduce((a, r) => a + (r.suppressed || 0), 0);
  return { ok: fails === 0, fails, warns, waived, suppressed, total: rules.length, rules };
}

// SARIF 2.1.0 (--sarif): saída padrão que o GitHub Code Scanning ingere → anotação inline no PR.
// Formatter puro sobre o auditData; nenhum dado novo. Diferencial: ArchUnit/dep-cruiser/Sonar não exportam.
const SARIF_LEVEL = { fail: 'error', warn: 'warning', info: 'note' };
function sarifData(d) {
  const offenders = d.rules.filter((r) => !r.ok && !r.waived);
  const ruleDescriptors = offenders.map((r) => ({
    id: r.id, ...(r.because ? { shortDescription: { text: r.because } } : {}),
  }));
  const results = offenders.flatMap((r) => {
    const level = SARIF_LEVEL[r.severity] || 'warning';
    const locs = (r.hits.length ? r.hits : [r.detail]).map((h) => {
      const m = String(h).match(/^(.+?):(\d+)$/);
      return m
        ? { physicalLocation: { artifactLocation: { uri: m[1] }, region: { startLine: Number(m[2]) } } }
        : { physicalLocation: { artifactLocation: { uri: '.ttechspec/ttechspec.config.json' } } };
    });
    return locs.map((location) => ({
      ruleId: r.id, level, message: { text: `${r.id} — ${r.detail}${r.because ? ` (${r.because})` : ''}` },
      locations: [location],
    }));
  });
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json', version: '2.1.0',
    runs: [{ tool: { driver: { name: 'ttechspec', informationUri: 'https://github.com/ttechdigital/ttech-spec', rules: ruleDescriptors } }, results }],
  };
}

// status derivado das tasks (determinístico, à la BMAD sprint-status mas sem o drift deles): a própria
// spec diz onde está, sem campo mantido na mão. Alimenta o rollup do visualizador multi-produto.
function specStatus(t) {
  if (!t || t.total === 0) return 'no-tasks';
  if (t.done === 0) return 'backlog';
  if (t.done < t.total) return 'in-progress';
  return 'done';
}

function clarifyData() {
  const config = loadConfig();
  const rule = (config.rules || []).find((r) => r.type === 'spec-clarity')
    || { id: 'spec-clarity', type: 'spec-clarity', include: ['.ttechspec/specs/**/*.md'], exclude: ['**/_template.md'] };
  const rows = (specClarity(rule, cwd, walk(cwd)).rows || [])
    .map((r) => ({ file: r.file, title: r.title, pending: r.pend, lines: r.lines, clarified: r.hasClar, tasks: r.tasks, status: specStatus(r.tasks) }));
  const top = rows.find((r) => r.pending > 0) || null;
  // rollup agregado (não é feature segregada — só somatórios derivados, igual pendingTotal)
  const rollup = rows.reduce((a, r) => {
    a[r.status] = (a[r.status] || 0) + 1;
    a.tasksDone += r.tasks?.done || 0; a.tasksTotal += r.tasks?.total || 0;
    return a;
  }, { done: 0, 'in-progress': 0, backlog: 0, 'no-tasks': 0, tasksDone: 0, tasksTotal: 0 });
  return { specs: rows, pendingTotal: rows.reduce((a, r) => a + r.pending, 0), resumeAt: top ? top.file : null, rollup };
}

// parse YAML minimalista (zero-dep): escalar `key: val` e lista (`key:` seguido de `- item`).
function yamlScalar(txt, key) {
  const m = txt.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : null;
}
function yamlList(txt, key) {
  const lines = txt.split('\n');
  const i = lines.findIndex((l) => new RegExp(`^\\s*${key}:\\s*$`).test(l));
  if (i < 0) {
    const inline = txt.match(new RegExp(`^\\s*${key}:\\s*\\[(.+)\\]\\s*$`, 'm')); // forma inline [a, b]
    return inline ? inline[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : [];
  }
  const out = [];
  for (let j = i + 1; j < lines.length; j++) {
    const m = lines[j].match(/^\s*-\s+(.+)$/);
    if (m) out.push(m[1].trim().replace(/^['"]|['"]$/g, ''));
    else if (lines[j].trim() && !/^\s/.test(lines[j])) break; // saiu da indentação → fim da lista
  }
  return out;
}

function catalogData() {
  const dir = path.join(cwd, '.ttechspec', 'modules');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f) && !f.startsWith('_')).sort() : [];
  const modules = files.map((f) => {
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    const slug = (yamlScalar(txt, 'slug') || '?').trim();
    // campos tipados + relações (à la Backstage) — viram grafo no visualizador multi-produto.
    return {
      slug, file: f,
      owner: yamlScalar(txt, 'owner'), lifecycle: yamlScalar(txt, 'lifecycle'), type: yamlScalar(txt, 'type'),
      dependsOn: yamlList(txt, 'dependsOn'), partOf: yamlList(txt, 'partOf'),
      hasSurface: /^\s*surface:/m.test(txt), hasHistory: /^\s*history:/m.test(txt),
    };
  });
  return { modules, total: modules.length, incomplete: modules.filter((m) => !m.hasSurface || !m.hasHistory).length };
}

const wantsJson = (argv) => argv.includes('--json');

function cmdAudit(argv) {
  const d = auditData();
  const observe = argv.includes('--observe'); // warn-mode global: roda tudo sem reprovar (rollout)
  const exit = observe ? 0 : (d.fails > 0 ? 1 : 0);
  if (argv.includes('--sarif')) { console.log(JSON.stringify(sarifData(d), null, 2)); process.exit(exit); }
  if (wantsJson(argv)) { console.log(JSON.stringify(d, null, 2)); process.exit(exit); }
  for (const r of d.rules) {
    const mark = r.ok ? `${C.grn}OK  ${C.x}`
      : r.waived ? `${C.dim}WAIV${C.x}`
      : (r.severity === 'fail' ? `${C.red}FAIL${C.x}` : `${C.yel}WARN${C.x}`);
    const extra = r.waived ? ` ${C.dim}(waiver: ${r.waived.reason || 'sem motivo'}${r.waived.expires ? ` até ${r.waived.expires}` : ''})${C.x}`
      : (r.suppressed ? ` ${C.dim}(${r.suppressed} suprimido inline)${C.x}` : '');
    console.log(`${mark} ${C.b}${r.id}${C.x} ${C.dim}— ${r.detail}${C.x}${extra}`);
    if (r.because && !r.ok) console.log(`       ${C.dim}↳ ${r.because}${C.x}`);
    if (!r.ok && !r.waived) r.hits.slice(0, argv.includes('-v') ? 999 : 5).forEach((h) => console.log(`       ${C.dim}${h}${C.x}`));
  }
  const tail = `fails: ${d.fails}  warns: ${d.warns}  waived: ${d.waived}  suprimidos: ${d.suppressed}  (${d.total} regras)`;
  console.log(`\n${C.b}=== resumo ===${C.x}  ${tail}${observe ? `  ${C.dim}[observe: não reprova]${C.x}` : ''}`);
  process.exit(exit);
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
  console.log(`${C.dim}  Slug                    Surf  Hist  Owner            Lifecycle  Relações${C.x}`);
  const mk = (ok) => (ok ? `${C.grn}✓${C.x}` : `${C.yel}–${C.x}`);
  for (const m of d.modules) {
    const rel = [...(m.dependsOn || []).map((x) => `→${x}`), ...(m.partOf || []).map((x) => `⊂${x}`)].join(' ') || `${C.dim}–${C.x}`;
    console.log(`  ${m.slug.padEnd(22)}  ${mk(m.hasSurface)}     ${mk(m.hasHistory)}     ${(m.owner || '–').padEnd(15)}  ${(m.lifecycle || '–').padEnd(9)}  ${C.dim}${rel}${C.x}`);
  }
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
    console.log('  ttechspec audit     roda o gate de sentinelas (exit!=0 reprova)   [--json|--sarif|--observe|-v]');
    console.log('  ttechspec clarify   ranqueia specs por pendência (estilo SDD)      [--json]');
    console.log('  ttechspec catalog   lista/valida o registro de módulos            [--json]');
    console.log('  ttechspec state     snapshot JSON (gate+specs+catalog) p/ a plataforma agregar');
    console.log('  ttechspec agents    (re)gera os slash commands (/clarify, /ttechspec-audit)');
    console.log(`\n${C.dim}Método: docs/METHOD.md · Workflow: docs/WORKFLOW.md${C.x}`);
}
