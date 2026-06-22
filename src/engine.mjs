// TTech Spec — módulo "Sentinels / Gate" — codinome: Falco Lombardi 🦅 (o ás que abate violações).
// Engine de sentinelas (regras como DADO, não script).
// PoC zero-dep (Node 18+). Generaliza os 4 arquétipos extraídos do audit-sentinels.sh da Ex:
//   forbidden-pattern · baseline-count · paired-file · spec-clarity (markers)
// É o "gate" — o moat vs Spec Kit/Kiro/OpenSpec, que só fazem o build loop e não reprovam PR.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const SKIP_DIRS = new Set(['node_modules', '.git', 'bin', 'obj', 'dist', '.next', 'docs-bundle', '.audit']);

// glob simplificado → regex. Suporta **, *, e literais. Casado contra path relativo com '/'.
export function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++; }
      else re += '[^/]*';
    } else if ('.+?^${}()|[]\\'.includes(c)) re += '\\' + c;
    else re += c;
  }
  return new RegExp('^' + re + '$');
}

export function walk(root, rel = '') {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      out.push(...walk(root, path.join(rel, e.name)));
    } else {
      out.push(rel ? path.join(rel, e.name) : e.name);
    }
  }
  return out;
}

function matchAny(file, globs) {
  if (!globs || globs.length === 0) return false;
  return globs.some((g) => globToRegex(g).test(file));
}

function selectFiles(allFiles, include, exclude) {
  return allFiles.filter((f) => matchAny(f, include) && !matchAny(f, exclude));
}

// --- runners por tipo de regra. Cada um retorna {id, severity, ok, detail, hits[]} ---

function runForbidden(rule, root, files) {
  const sel = selectFiles(files, rule.include, rule.exclude);
  const re = new RegExp(rule.pattern, rule.flags || 'g');
  const hits = [];
  for (const f of sel) {
    const lines = fs.readFileSync(path.join(root, f), 'utf8').split('\n');
    lines.forEach((ln, i) => { if (new RegExp(rule.pattern, rule.flags || '').test(ln)) hits.push(`${f}:${i + 1}`); });
  }
  void re;
  return { id: rule.id, severity: rule.severity || 'fail', ok: hits.length === 0, detail: `${hits.length} ocorrência(s)`, hits };
}

function runBaseline(rule, root, files) {
  const sel = selectFiles(files, rule.include, rule.exclude);
  // Contagem por LINHA (espelha 'grep -n | wc -l' dos sentinelas). ignoreComments pula linhas
  // de comentário (// ou *) — necessário pra baselines tipo client-hardcodes sem contar exemplos em doc.
  const re = new RegExp(rule.pattern);
  let count = 0;
  const hits = [];
  for (const f of sel) {
    const lines = fs.readFileSync(path.join(root, f), 'utf8').split('\n');
    lines.forEach((ln, i) => {
      const t = ln.trim();
      if (rule.ignoreComments && (t.startsWith('//') || t.startsWith('*'))) return;
      if (re.test(ln)) { count++; hits.push(`${f}:${i + 1}`); }
    });
  }
  const ok = count <= rule.baseline;
  return { id: rule.id, severity: rule.severity || 'fail', ok, detail: `atual=${count} baseline=${rule.baseline}`, hits: ok ? [] : hits };
}

function runPaired(rule, root, files) {
  const primaries = selectFiles(files, rule.primary ? [rule.primary] : rule.include, rule.exclude)
    .filter((f) => !f.endsWith(rule.companionSuffix)); // não exigir companion do companion
  const set = new Set(files);
  const hits = [];
  for (const f of primaries) {
    const companion = f.replace(/\.[^.]+$/, '') + rule.companionSuffix;
    if (!set.has(companion)) hits.push(`${f} (falta ${path.basename(companion)})`);
  }
  return { id: rule.id, severity: rule.severity || 'fail', ok: hits.length === 0, detail: `${hits.length} sem par`, hits };
}

// spec-clarity: a "categorização" do print do amigo, virada GATE. Conta marcadores de pendência
// por spec ([NEEDS CLARIFICATION], TODO, ???) e reprova/avisa specs ainda ambíguas.
export function specClarity(rule, root, files) {
  const sel = selectFiles(files, rule.include, rule.exclude);
  const markers = rule.markers || ['\\[NEEDS CLARIFICATION\\]', '\\bTODO\\b', '\\?\\?\\?'];
  const re = new RegExp(markers.join('|'), 'g');
  const rows = [];
  for (const f of sel) {
    const txt = fs.readFileSync(path.join(root, f), 'utf8');
    const pend = (txt.match(re) || []).length;
    const lines = txt.split('\n').length;
    const hasClar = /^##\s+Clarifications/m.test(txt);
    const title = (txt.match(/^#\s+(.+)$/m) || [])[1] || path.basename(f);
    rows.push({ file: f, title: title.trim(), pend, lines, hasClar });
  }
  rows.sort((a, b) => b.pend - a.pend);
  const offenders = rows.filter((r) => r.pend > (rule.maxPending ?? 0));
  return {
    id: rule.id, severity: rule.severity || 'warn', ok: offenders.length === 0,
    detail: `${offenders.length} spec(s) com pendência > ${rule.maxPending ?? 0}`,
    hits: offenders.map((r) => `${r.file} (${r.pend} pendências)`), rows,
  };
}

// script: escape hatch pros checks complexos (i18n drift, layout) que não cabem nos arquétipos.
// Roda um comando; ok se exit == expectExit (default 0). É o que torna o gate 100% expressivo.
function runScript(rule, root) {
  try {
    execSync(rule.run, { cwd: root, stdio: 'pipe', shell: '/bin/bash' });
    return { id: rule.id, severity: rule.severity || 'fail', ok: (rule.expectExit ?? 0) === 0, detail: 'exit 0', hits: [] };
  } catch (e) {
    const code = typeof e.status === 'number' ? e.status : 1;
    const ok = code === (rule.expectExit ?? 0);
    const tail = (e.stdout?.toString() || e.stderr?.toString() || '').trim().split('\n').slice(-3);
    return { id: rule.id, severity: rule.severity || 'fail', ok, detail: `exit ${code}`, hits: ok ? [] : tail };
  }
}

const RUNNERS = {
  'forbidden-pattern': runForbidden,
  'baseline-count': runBaseline,
  'paired-file': runPaired,
  'spec-clarity': specClarity,
  'script': runScript,
};

// Resolve `extends`: a config de ARQUITETURA BASE é DO CONSUMIDOR — mora no .ttechspec/presets/ do
// repo dele, junto das regras específicas. O produto NÃO shippa presets opinativos (não dá pra cobrir
// toda stack; é decisão do dono do repo). 'init' semeia um starter que ele passa a possuir/editar.
// Merge por id: base → stack → regras do projeto (precedência crescente).
//   extends: ["dotnet"]        → .ttechspec/presets/dotnet.json (do consumidor)
//   extends: ["../shared.json"] → caminho relativo (base compartilhada entre repos do próprio time)
export function resolveConfig(raw, { repoDir }) {
  const merged = new Map(); // id → rule (inserção preserva ordem; colisão sobrescreve)
  const apply = (rules) => { for (const r of rules || []) merged.set(r.id, { ...(merged.get(r.id) || {}), ...r }); };

  for (const ext of raw.extends || []) {
    const file = (ext.includes('/') || ext.endsWith('.json'))
      ? path.resolve(repoDir, ext)
      : path.join(repoDir, '.ttechspec', 'presets', ext + '.json');
    const preset = JSON.parse(fs.readFileSync(file, 'utf8'));
    const resolved = resolveConfig(preset, { repoDir }); // preset pode estender preset
    apply(resolved.rules);
  }
  apply(raw.rules);

  return { ...raw, extends: undefined, rules: [...merged.values()] };
}

export function runAudit(config, root) {
  const files = walk(root);
  const results = [];
  for (const rule of config.rules || []) {
    const runner = RUNNERS[rule.type];
    if (!runner) { results.push({ id: rule.id, severity: 'fail', ok: false, detail: `tipo desconhecido: ${rule.type}`, hits: [] }); continue; }
    try { results.push(runner(rule, root, files)); }
    catch (e) { results.push({ id: rule.id, severity: 'fail', ok: false, detail: `erro: ${e.message}`, hits: [] }); }
  }
  return results;
}
