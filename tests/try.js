#!/usr/bin/env node
/* Authoring helper. Inspect one prompt, or see how it rules on typed answers.
 *
 *   node tests/try.js lit-dostoevsky
 *   node tests/try.js lit-dostoevsky "the idiot" "Crime" "War and Peace"
 *   node tests/try.js --list literature
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

/* Load data.js and the pure half of app.js (everything above the DOM wiring). */
const app = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8')
  .split('/* ───────────────────────────────── wiring')[0];
const stub = `
  var document = { getElementById: () => null, querySelectorAll: () => [], addEventListener() {} };
  var window = {}; var location = { origin: '', pathname: '/' };
  var localStorage = { _s: {}, getItem(k) { return this._s[k] ?? null; },
                       setItem(k, v) { this._s[k] = v; }, removeItem() {} };
`;
const ctx = eval(stub + fs.readFileSync(path.join(root, 'assets/data.js'), 'utf8') + app +
  '({ PROMPTS, CATEGORIES, DAILY_SETS, PROMPT_BY_ID, promptIndex, judge, norm })');

const [first, ...rest] = process.argv.slice(2);

if (!first || first === '--help') {
  console.log('usage: node tests/try.js <prompt-id> ["answer" ...]');
  console.log('       node tests/try.js --list [category]');
  process.exit(0);
}

if (first === '--list') {
  const only = rest[0];
  for (const p of ctx.PROMPTS) {
    if (only && p.category !== only) continue;
    console.log(`${p.id.padEnd(30)} ${String(p.answers.length).padStart(3)} answers  ${p.prompt}`);
  }
  process.exit(0);
}

const prompt = ctx.PROMPT_BY_ID[first];
if (!prompt) {
  console.error(`No prompt with id "${first}". Try: node tests/try.js --list`);
  process.exit(1);
}

const { answers, fragments, asks, noise } = ctx.promptIndex(prompt);
const scheduled = ctx.DAILY_SETS.findIndex((set) => set.includes(prompt.id));

console.log(`\n${ctx.CATEGORIES[prompt.category].icon}  ${ctx.CATEGORIES[prompt.category].name}   [${prompt.id}]`);
console.log(`"${prompt.prompt}"`);
if (prompt.note) console.log(`note: ${prompt.note}`);
console.log(`scheduled: ${scheduled >= 0 ? 'day ' + (scheduled + 1) : 'Infinite only'}`);
if (noise.length) console.log(`noise stripped: ${noise.join(', ')}`);
if (asks.size) console.log(`declared prompts: ${[...asks.keys()].join(', ')}`);

if (!rest.length) {
  console.log(`\n${answers.length} answers (canonical → match keys):`);
  answers.forEach((a) => console.log(`  ${a.canonical.padEnd(38)} ${a.keys.join(' | ')}`));
  console.log(`\n${fragments.size} derived fragments (these ask for a fuller answer):`);
  console.log('  ' + [...fragments].sort().join(' · '));
  console.log('\nPass answers as extra arguments to see how they are ruled.');
  process.exit(0);
}

const mark = { hit: '✓ HIT ', ask: '? ASK ', miss: '✕ MISS' };
console.log('');
for (const typed of rest) {
  const r = ctx.judge(typed, prompt);
  const detail = r.kind === 'hit' ? answers[r.index].canonical
    : r.kind === 'ask' ? (r.message || 'be more specific — costs nothing')
    : 'wrong — costs 2 points';
  console.log(`${mark[r.kind]}  ${JSON.stringify(typed).padEnd(26)} ${detail}`);
  console.log(`         normalised: "${ctx.norm(typed)}"`);
}
