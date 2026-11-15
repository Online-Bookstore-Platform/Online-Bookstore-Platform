// Turns an lcov file into a coverage table for the GitHub Actions job summary.
// Usage: node coverage-summary.mjs <lcov file> <title>
import { readFileSync, appendFileSync } from 'node:fs';

const [file, title = 'Coverage'] = process.argv.slice(2);
const groups = new Map();
let current = null;

for (const line of readFileSync(file, 'utf8').split('\n')) {
  if (line.startsWith('SF:')) {
    const path = line.slice(3).replace(/\\/g, '/');
    const match = path.match(/src\/features\/([^/]+)/);
    const name = match ? `features/${match[1]}` : 'core (app, server, shared)';
    if (!groups.has(name)) groups.set(name, { lh: 0, lf: 0, bh: 0, bf: 0, fh: 0, ff: 0 });
    current = groups.get(name);
  } else if (current) {
    const [key, value] = line.split(':');
    const n = Number(value);
    if (key === 'LH') current.lh += n;
    if (key === 'LF') current.lf += n;
    if (key === 'BRH') current.bh += n;
    if (key === 'BRF') current.bf += n;
    if (key === 'FNH') current.fh += n;
    if (key === 'FNF') current.ff += n;
  }
}

const pct = (hit, found) => (found ? (100 * hit) / found : 100);
const badge = value => (value >= 90 ? '🟢' : value >= 75 ? '🟡' : '🔴');
const cell = (hit, found) => {
  const value = pct(hit, found);
  return `${badge(value)} ${value.toFixed(1)}% <sub>(${hit}/${found})</sub>`;
};

const total = { lh: 0, lf: 0, bh: 0, bf: 0, fh: 0, ff: 0 };
const rows = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, g]) => {
  for (const key of Object.keys(total)) total[key] += g[key];
  return `| \`${name}\` | ${cell(g.lh, g.lf)} | ${cell(g.bh, g.bf)} | ${cell(g.fh, g.ff)} |`;
});

const summary = [
  `### ${title}`,
  '',
  '| Area | Lines | Branches | Functions |',
  '|---|---|---|---|',
  ...rows,
  `| **Total** | **${cell(total.lh, total.lf)}** | **${cell(total.bh, total.bf)}** | **${cell(total.fh, total.ff)}** |`,
  '',
  '🟢 ≥ 90% · 🟡 ≥ 75% · 🔴 below 75%',
  '',
].join('\n');

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
console.log(summary);
