#!/usr/bin/env node
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const CONCURRENCY = 16;
const JSON_MODE = process.argv.includes('--json');

// ── file discovery ──────────────────────────────────────────────────────────
function collectMainFiles() {
  const files = [];
  let dirs;
  try { dirs = readdirSync(PROJECTS_DIR); } catch { return files; }
  for (const proj of dirs) {
    const projPath = join(PROJECTS_DIR, proj);
    try {
      if (!statSync(projPath).isDirectory()) continue;
    } catch { continue; }
    let entries;
    try { entries = readdirSync(projPath); } catch { continue; }
    for (const entry of entries) {
      if (!entry.endsWith('.jsonl')) continue;
      const fp = join(projPath, entry);
      try {
        const st = statSync(fp);
        if (st.isFile()) files.push({ path: fp, proj, mtime: st.mtime });
      } catch { continue; }
    }
  }
  return files;
}

function projectName(dir) {
  const stripped = dir.replace(/^-home-[^-]+/, '').replace(/^-/, '');
  return stripped || '~/ (home)';
}

// ── scan one file ────────────────────────────────────────────────────────────
async function scanFile(filePath) {
  let planCycles = 0;
  let firstTs = null;
  return new Promise((resolve) => {
    const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    rl.on('line', (line) => {
      if (line.includes('"ExitPlanMode"')) planCycles++;
      if (!firstTs && line.includes('"timestamp"')) {
        const m = line.match(/"timestamp":"(\d{4}-\d{2})/);
        if (m) firstTs = m[1];
      }
    });
    rl.on('close', () => resolve({ planCycles, firstTs }));
    rl.on('error', () => resolve({ planCycles: 0, firstTs: null }));
  });
}

// ── bar chart ────────────────────────────────────────────────────────────────
function bar(count, max, width = 24) {
  const filled = max > 0 ? Math.round((count / max) * width) : 0;
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const files = collectMainFiles();
  if (files.length === 0) {
    console.error('No session files found in ~/.claude/projects/');
    process.exit(1);
  }

  const results = [];
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (f) => ({ ...f, ...(await scanFile(f.path)) }))
    );
    results.push(...batchResults);
  }

  // ── aggregate ──────────────────────────────────────────────────────────────
  const totalSessions = results.length;
  let totalPlanCycles = 0;
  let planSessions = 0;
  let peakCycles = 0;

  const dist = { '1': 0, '2-5': 0, '6-20': 0, '21+': 0 };
  const byMonth = {};
  const byProj = {};

  for (const r of results) {
    const n = r.planCycles;
    totalPlanCycles += n;
    if (n > 0) {
      planSessions++;
      if (n > peakCycles) peakCycles = n;
      if (n === 1)      dist['1']++;
      else if (n <= 5)  dist['2-5']++;
      else if (n <= 20) dist['6-20']++;
      else              dist['21+']++;
    }

    const mo = r.firstTs || r.mtime.toISOString().slice(0, 7);
    if (!byMonth[mo]) byMonth[mo] = { sessions: 0, plan: 0 };
    byMonth[mo].sessions++;
    if (n > 0) byMonth[mo].plan++;

    const pn = projectName(r.proj);
    if (!byProj[pn]) byProj[pn] = { sessions: 0, plan: 0, cycles: 0 };
    byProj[pn].sessions++;
    if (n > 0) { byProj[pn].plan++; byProj[pn].cycles += n; }
  }

  const adoptionRate = totalSessions > 0 ? (planSessions / totalSessions * 100) : 0;
  const avgPerPlan = planSessions > 0 ? (totalPlanCycles / planSessions) : 0;

  // ── JSON output ────────────────────────────────────────────────────────────
  if (JSON_MODE) {
    console.log(JSON.stringify({
      totalSessions, planSessions, adoptionRate: +adoptionRate.toFixed(1),
      totalPlanCycles, avgPerPlanSession: +avgPerPlan.toFixed(1), peakCycles,
      distribution: dist, byMonth, byProject: byProj,
    }, null, 2));
    return;
  }

  // ── CLI output ─────────────────────────────────────────────────────────────
  const W = 56;
  const line = '─'.repeat(W);

  console.log('');
  console.log('cc-plan — Claude Code plan mode usage');
  console.log('');
  console.log(`  Total sessions:       ${totalSessions.toLocaleString()}`);
  console.log(`  Sessions w/ plan:     ${planSessions.toLocaleString()} (${adoptionRate.toFixed(1)}% of sessions)`);
  console.log(`  Total plan cycles:    ${totalPlanCycles.toLocaleString()}`);
  console.log(`  Avg per plan session: ${avgPerPlan.toFixed(1)} cycles`);
  console.log(`  Peak in one session:  ${peakCycles}`);

  // distribution
  const maxDist = Math.max(...Object.values(dist), 1);
  console.log('');
  console.log(line);
  console.log('  Plan cycles per session (sessions with plan mode)');
  console.log('');
  for (const [label, count] of Object.entries(dist)) {
    const pct = planSessions > 0 ? (count / planSessions * 100).toFixed(1) : '0.0';
    console.log(`  ${label.padEnd(8)} ${bar(count, maxDist)}  ${String(count).padStart(4)}  (${pct}%)`);
  }

  // monthly
  const months = Object.keys(byMonth).sort().slice(-12);
  if (months.length > 1) {
    const maxPlan = Math.max(...months.map(m => byMonth[m].plan), 1);
    console.log('');
    console.log(line);
    console.log('  Plan sessions by month');
    console.log('');
    for (const mo of months) {
      const { sessions, plan } = byMonth[mo];
      const rate = sessions > 0 ? (plan / sessions * 100).toFixed(0) : '0';
      console.log(`  ${mo}  ${bar(plan, maxPlan)}  ${String(plan).padStart(3)} sessions (${rate}% plan)`);
    }
  }

  // by project
  const projList = Object.entries(byProj)
    .filter(([, d]) => d.plan > 0)
    .sort((a, b) => b[1].cycles - a[1].cycles)
    .slice(0, 8);
  if (projList.length > 0) {
    const maxCycles = Math.max(...projList.map(([, d]) => d.cycles), 1);
    console.log('');
    console.log(line);
    console.log('  By project (plan cycles, top 8)');
    console.log('');
    for (const [name, d] of projList) {
      const rate = d.sessions > 0 ? (d.plan / d.sessions * 100).toFixed(0) : '0';
      const label = name.length > 22 ? name.slice(0, 21) + '…' : name;
      console.log(`  ${label.padEnd(23)} ${bar(d.cycles, maxCycles)}  ${d.cycles} cycles / ${rate}%`);
    }
  }

  console.log('');
}

main().catch(e => { console.error(e.message); process.exit(1); });
