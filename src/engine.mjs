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

// Supressão inline auditável (convergência de mercado: Semgrep `# nosemgrep`, Sonar `//NOSONAR`,
// OPA `exception`). Um hit na linha N é suprimido se a linha N ou N-1 tem
// `ttechspec-ignore: <rule-id>[, <rule-id>...]` (ou `*` pra qualquer regra). Fica NO DIFF — revisável.
function suppressed(lines, idx, ruleId) {
  const re = /ttechspec-ignore(?:-next-line)?:\s*([\w*][\w\-,\s*]*)/;
  const check = (s) => {
    const m = s && s.match(re);
    if (!m) return false;
    const ids = m[1].split(',').map((x) => x.trim());
    return ids.includes('*') || ids.includes(ruleId);
  };
  return check(lines[idx]) || check(lines[idx - 1]);
}

function selectFiles(allFiles, include, exclude) {
  return allFiles.filter((f) => matchAny(f, include) && !matchAny(f, exclude));
}

// --- runners por tipo de regra. Cada um retorna {id, severity, ok, detail, hits[], because, suppressed} ---

// Padroniza o resultado. severity: 'fail' (reprova), 'warn'/'info' (não reprova). `because` = razão
// da regra (ArchUnit `.because()`) surfada na saída e no SARIF. `suppressed` = nº de hits ignorados inline.
function mkResult(rule, defSeverity, ok, detail, hits, suppressedN) {
  return {
    id: rule.id, severity: rule.severity || defSeverity, ok, detail,
    hits: ok ? [] : hits, because: rule.because || null, suppressed: suppressedN || 0,
  };
}

function runForbidden(rule, root, files) {
  const sel = selectFiles(files, rule.include, rule.exclude);
  const hits = [];
  let skipped = 0;
  for (const f of sel) {
    const lines = fs.readFileSync(path.join(root, f), 'utf8').split('\n');
    lines.forEach((ln, i) => {
      if (!new RegExp(rule.pattern, rule.flags || '').test(ln)) return;
      if (suppressed(lines, i, rule.id)) { skipped++; return; }
      hits.push(`${f}:${i + 1}`);
    });
  }
  return mkResult(rule, 'fail', hits.length === 0, `${hits.length} ocorrência(s)`, hits, skipped);
}

// Linhas ADICIONADAS vs uma branch de referência (git diff -U0). Map<file, Set<linha-no-novo>>.
// Null se não há git/ref (→ runBaseline cai no modo contagem-total). Base do ratchet diff-aware:
// em vez de um inteiro que deriva e dá pra burlar, conta só o que ESTE PR introduziu (Sonar "New Code").
function addedLines(root, ref) {
  let out;
  try { out = execSync(`git diff --unified=0 --no-color ${ref} -- .`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { return null; }
  const map = new Map();
  let cur = null, newLine = 0;
  for (const line of out.split('\n')) {
    if (line.startsWith('+++ ')) {
      const f = line.slice(4).replace(/^b\//, '').trim();
      cur = f === '/dev/null' ? null : f;
      if (cur && !map.has(cur)) map.set(cur, new Set());
    } else if (line.startsWith('@@')) {
      const m = line.match(/\+(\d+)/); newLine = m ? Number(m[1]) : 0;
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      if (cur) map.get(cur).add(newLine);
      newLine++;
    }
  }
  return map;
}

function runBaseline(rule, root, files) {
  const sel = selectFiles(files, rule.include, rule.exclude);
  // ignoreComments pula linhas de comentário (// ou *) — não contar exemplos em doc.
  // referenceBranch ligado → conta SÓ ocorrências em linhas novas vs a ref (ratchet diff-aware,
  // à prova de burla, auto-mantido). Sem isso → contagem-total por linha (modo legado, inteiro baseline).
  const re = new RegExp(rule.pattern);
  const added = rule.referenceBranch ? addedLines(root, rule.referenceBranch) : null;
  const diffMode = !!added;
  const baseline = diffMode ? (rule.baseline ?? 0) : rule.baseline;
  let count = 0, skipped = 0;
  const hits = [];
  for (const f of sel) {
    const set = diffMode ? added.get(f) : null;
    if (diffMode && !set) continue; // arquivo não tocado pelo PR
    const lines = fs.readFileSync(path.join(root, f), 'utf8').split('\n');
    lines.forEach((ln, i) => {
      if (diffMode && !set.has(i + 1)) return; // só linhas novas
      const t = ln.trim();
      if (rule.ignoreComments && (t.startsWith('//') || t.startsWith('*'))) return;
      if (!re.test(ln)) return;
      if (suppressed(lines, i, rule.id)) { skipped++; return; }
      count++; hits.push(`${f}:${i + 1}`);
    });
  }
  const ok = count <= baseline;
  const detail = diffMode
    ? `novas=${count} (vs ${rule.referenceBranch}) baseline=${baseline}`
    : `atual=${count} baseline=${baseline}`;
  return mkResult(rule, 'fail', ok, detail, hits, skipped);
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
  return mkResult(rule, 'fail', hits.length === 0, `${hits.length} sem par`, hits, 0);
}

// spec-clarity: a "categorização" do print do amigo, virada GATE. Conta marcadores de pendência
// por spec ([NEEDS CLARIFICATION], TODO, ???) e reprova/avisa specs ainda ambíguas.
// "Clarified" só conta se a seção ## Clarifications tiver CONTEÚDO real (não só o header do template
// nem comentários HTML de dica). Antes /^##\s+Clarifications/ dava falso-positivo em stub não-clarificado.
function clarHasContent(txt) {
  const lines = txt.split('\n');
  const i = lines.findIndex((l) => /^##\s+Clarifications\b/.test(l.trim()));
  if (i < 0) return false;
  for (let j = i + 1; j < lines.length; j++) {
    const t = lines[j].trim();
    if (t.startsWith('## ')) break;        // próxima seção
    if (!t || t.startsWith('<!--')) continue; // linha vazia ou comentário-dica do template
    return true;                           // conteúdo de verdade
  }
  return false;
}

// tasks: clareza do que JÁ virou código vs o que falta, dentro da própria spec (não um backlog à parte).
// Lê os checkboxes GitHub-padrão (- [ ] / - [x]) da seção ## Tasks. Box marcado = pronto; vazio = falta.
// Para a plataforma agregar "quanto de cada sistema está feito" via state, sem prompt.
function parseTasks(txt) {
  const lines = txt.split('\n');
  const i = lines.findIndex((l) => /^##\s+Tasks\b/i.test(l.trim()));
  const items = [];
  if (i >= 0) {
    for (let j = i + 1; j < lines.length; j++) {
      const t = lines[j].trim();
      if (t.startsWith('## ')) break; // próxima seção
      const m = t.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
      if (m) items.push({ text: m[2].trim(), done: m[1].toLowerCase() === 'x' });
    }
  }
  const done = items.filter((t) => t.done).length;
  return { total: items.length, done, open: items.length - done, items };
}

export function specClarity(rule, root, files) {
  const sel = selectFiles(files, rule.include, rule.exclude);
  const markers = rule.markers || ['\\[NEEDS CLARIFICATION\\]', '\\bTODO\\b', '\\?\\?\\?'];
  const re = new RegExp(markers.join('|'), 'g');
  const rows = [];
  for (const f of sel) {
    const txt = fs.readFileSync(path.join(root, f), 'utf8');
    const pend = (txt.match(re) || []).length;
    const lines = txt.split('\n').length;
    const hasClar = clarHasContent(txt);
    const tasks = parseTasks(txt);
    const title = (txt.match(/^#\s+(.+)$/m) || [])[1] || path.basename(f);
    rows.push({ file: f, title: title.trim(), pend, lines, hasClar, tasks });
  }
  rows.sort((a, b) => b.pend - a.pend);
  const offenders = rows.filter((r) => r.pend > (rule.maxPending ?? 0));
  return {
    ...mkResult(rule, 'warn', offenders.length === 0,
      `${offenders.length} spec(s) com pendência > ${rule.maxPending ?? 0}`,
      offenders.map((r) => `${r.file} (${r.pend} pendências)`), 0),
    rows,
  };
}

// script: escape hatch pros checks complexos (i18n drift, layout) que não cabem nos arquétipos.
// Roda um comando; ok se exit == expectExit (default 0). É o que torna o gate 100% expressivo.
function runScript(rule, root) {
  try {
    execSync(rule.run, { cwd: root, stdio: 'pipe', shell: '/bin/bash' });
    return mkResult(rule, 'fail', (rule.expectExit ?? 0) === 0, 'exit 0', [], 0);
  } catch (e) {
    const code = typeof e.status === 'number' ? e.status : 1;
    const ok = code === (rule.expectExit ?? 0);
    const tail = (e.stdout?.toString() || e.stderr?.toString() || '').trim().split('\n').slice(-3);
    return mkResult(rule, 'fail', ok, `exit ${code}`, tail, 0);
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

// Waivers: aceitar uma violação de propósito, de forma AUDITÁVEL (motivo obrigatório, expiração
// opcional). Convergência: OPA `exception`, Sonar "won't fix". Vive no config como
//   "waivers": [{ "rule": "no-empty-catch", "reason": "legado X, ticket TT-123", "expires": "2026-12-31" }]
// Waiver expirado volta a reprovar (força revisão). Surfado separado no resumo — nunca silencioso.
function activeWaiver(config, ruleId) {
  const now = Date.now();
  return (config.waivers || []).find((w) =>
    w.rule === ruleId && (!w.expires || Date.parse(w.expires) >= now)) || null;
}

export function runAudit(config, root) {
  const files = walk(root);
  const results = [];
  for (const rule of config.rules || []) {
    const runner = RUNNERS[rule.type];
    let result;
    if (!runner) result = { id: rule.id, severity: 'fail', ok: false, detail: `tipo desconhecido: ${rule.type}`, hits: [], because: null, suppressed: 0 };
    else { try { result = runner(rule, root, files); } catch (e) { result = { id: rule.id, severity: 'fail', ok: false, detail: `erro: ${e.message}`, hits: [], because: null, suppressed: 0 }; } }
    if (!result.ok) {
      const w = activeWaiver(config, rule.id);
      if (w) result.waived = { reason: w.reason || '', expires: w.expires || null };
    }
    results.push(result);
  }
  return results;
}
