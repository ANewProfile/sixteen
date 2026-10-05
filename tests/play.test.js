/* Drives app.js through a fake DOM to smoke-test every render path. */
const fs = require('fs');
const root = require('path').join(__dirname, '..') + '/';

function makeEl(id) {
  const el = {
    id, innerHTML: '', textContent: '', value: '', disabled: false, className: '',
    _classes: new Set(),
    classList: {
      add: (c) => el._classes.add(c),
      remove: (c) => el._classes.delete(c),
      contains: (c) => el._classes.has(c),
      toggle: (c, force) => {
        const on = force === undefined ? !el._classes.has(c) : force;
        on ? el._classes.add(c) : el._classes.delete(c);
        return !on ? false : true;
      },
    },
    addEventListener: (ev, fn) => { (el._h ||= {})[ev] = fn; },
    hasAttribute: () => false,
    focus() {}, select() {}, scrollIntoView() {}, setSelectionRange() {},
    fire(ev, arg) { el._h && el._h[ev] && el._h[ev](arg || { preventDefault() {} }); },
  };
  el.parentElement = el;
  return el;
}
const els = {};
global.document = {
  getElementById: (id) => (els[id] ||= makeEl(id)),
  querySelectorAll: () => [],
  createElement: () => makeEl('tmp'),
  body: { appendChild() {}, removeChild() {} },
  addEventListener() {},
  execCommand: () => true,
};
/* Freeze the clock on DAILY_EPOCH so this test always plays puzzle No. 1.
 * Without this it silently starts testing whatever today's puzzle happens to
 * be, and the expected answers below stop matching. */
const RealDate = Date;
global.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [2026, 9, 3])); }
  static now() { return new RealDate(2026, 9, 3).getTime(); }
};

global.window = { scrollTo() {} };
global.location = { origin: 'https://theo.github.io', pathname: '/sixteen/index.html' };
global.navigator = { clipboard: { writeText: async () => {} } };
global.confirm = () => true;
global.localStorage = {
  _s: {}, getItem(k) { return this._s[k] ?? null; },
  setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; },
};
Object.defineProperty(global.localStorage, 'length', { get() { return Object.keys(this._s).length; } });
global.Object.keys = Object.keys;

const sandbox = { ...global };
eval(fs.readFileSync(root + 'assets/data.js', 'utf8') + '\n' +
     fs.readFileSync(root + 'assets/app.js', 'utf8') + '\n' +
     'global.__api = { startDaily, startInfinite, submitAnswer, lockRound, nextRound, ' +
     'shareText, renderHome, renderStats, renderResults, totalScore, dayNumber, statsFor, ' +
     'get game() { return game; } };');
const api = global.__api;

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL: ' + m); } };
const el = (id) => document.getElementById(id);
const type = (s) => { el('answer-input').value = s; api.submitAnswer(); };

// home rendered on load
ok(el('daily-title').textContent.startsWith('Puzzle No.'), 'home shows puzzle number');
ok(el('home-stats').innerHTML.includes('Average'), 'home stats render');

api.startDaily();
ok(el('prompt-text').textContent.length > 10, 'prompt text rendered: ' + el('prompt-text').textContent);
ok(el('cat-chip').innerHTML.includes('Geography'), 'first category is geography');
ok(el('dots').innerHTML.split('dot').length - 1 === 5, 'five progress dots');

// round 1: borders of Afghanistan — 3 right, 2 wrong => 4 - 4 = 0 (spec example)
type('Iran'); ok(el('feedback').textContent.includes('Iran'), 'hit feedback');
type('iran');  ok(el('feedback').textContent.includes('Already counted'), 'duplicate rejected');
ok(api.game.rounds[0].entries.length === 1, 'duplicate did not consume a slot');
type('Pakistan'); type('Tajikistan');
type('India');   ok(el('feedback').textContent.includes('−'), 'miss feedback shows penalty');
type('Russia');
ok(api.game.rounds[0].entries.length === 5, 'five entries fill the round');
ok(api.game.rounds[0].locked, 'round auto-locks at five answers');
ok(el('reveal-score').textContent === '0', '3 right + 2 wrong = 0, got ' + el('reveal-score').textContent);
ok(el('reveal-label').textContent.includes('3 correct'), 'reveal label: ' + el('reveal-label').textContent);
ok(el('reveal-answers').innerHTML.includes('Turkmenistan'), 'reveal lists missed answers');
ok((el('reveal-answers').innerHTML.match(/pill hit/g) || []).length === 3, 'three answers marked hit');
ok(el('btn-next').textContent === 'Next prompt', 'next button label');

api.nextRound();
ok(el('cat-chip').innerHTML.includes('History'), 'advanced to history');
ok(el('scale').innerHTML.includes('5 → 16'), 'ladder shown');

// round 2: a half-stated answer is neither credited nor penalised
type('Roosevelt');
ok(el('feedback').textContent === 'Which Roosevelt?', 'declared prompt shown: ' + el('feedback').textContent);
ok(api.game.rounds[1].entries.length === 0, 'a prompted answer uses no slot');
type('William');
ok(/More specific/.test(el('feedback').textContent), 'generic prompt shown: ' + el('feedback').textContent);
ok(api.game.rounds[1].entries.length === 0, 'still no slot used');
ok(el('answer-input').value === 'William', 'the typed text is kept so it can be completed');
ok(!api.game.rounds[1].locked, 'prompting cannot end the round');

// round 2: five correct => 16, prompting having cost nothing
['Lincoln', 'JFK', 'FDR', 'Zachary Taylor', 'McKinley'].forEach(type);
ok(el('reveal-score').textContent === '+16', 'perfect round = +16, got ' + el('reveal-score').textContent);
ok(el('reveal-label').textContent.includes('perfect sixteen'), 'perfect round called out');

// round 3: pass with zero answers
api.nextRound();
ok(el('game-meta').textContent.includes('16 pts'), 'header banks the running total: ' + el('game-meta').textContent);
ok(el('btn-lock').textContent.startsWith('Pass'), 'empty round offers a pass');
api.lockRound();
ok(el('reveal-score').textContent === '0', 'passing scores 0');

// round 4: 1 correct, then lock early
api.nextRound();
type('Argon');
ok(el('btn-lock').textContent.includes('+1'), 'lock button previews score: ' + el('btn-lock').textContent);
api.lockRound();
ok(el('reveal-score').textContent === '+1', 'early lock keeps 1 pt');

// round 5: all misses => -10
api.nextRound();
['nope', 'wrong', 'bad', 'no', 'nah'].forEach(type);
ok(el('reveal-score').textContent === '-10', 'five misses = -10, got ' + el('reveal-score').textContent);
ok(el('btn-next').textContent === 'See results', 'last round advances to results');

api.nextRound();
const total = 0 + 16 + 0 + 1 - 10;
ok(el('results-total').innerHTML.startsWith(String(total)), `results total ${total}, got ${el('results-total').innerHTML}`);
ok(el('results-kicker').textContent.includes('Puzzle No.'), 'results kicker');
ok((el('breakdown').innerHTML.match(/class="brow"/g) || []).length === 5, 'five breakdown rows');
ok(el('review-panel').innerHTML.includes('Dostoevsky'), 'review panel includes prompt text');
ok(el('results-verdict').textContent.length > 0, 'verdict: ' + el('results-verdict').textContent);

const share = api.shareText();
console.log('\n--- share text ---\n' + share + '\n------------------');
ok(share.split('\n').length === 7, 'share = header + 5 rows + url');
ok(share.includes(`${total}/80`), 'share shows total');
ok(/\u{1F7E9}{5}/u.test(share), 'perfect row is five green squares');
ok(/\u{1F7E5}{5}/u.test(share), 'all-miss row is five red squares');
ok(share.includes('⬛'), 'unused slots shown as blanks');
ok(share.trim().endsWith('https://theo.github.io/sixteen/'), 'share ends with clean url');

// stats recorded once, and only once
let s = api.statsFor();
ok(s.played === 1 && s.streak === 1, 'daily recorded: ' + JSON.stringify(s));
ok(s.perfects === 1, 'one perfect prompt counted');
api.nextRound(); api.nextRound();
ok(api.statsFor().played === 1, 'replaying results never double-counts');

// resume: a saved finished day jumps straight to results
api.startDaily();
ok(el('results-total').innerHTML.startsWith(String(total)), 'finished day reopens at results');
api.renderHome();
ok(el('daily-sub').textContent.includes('Completed'), 'home reflects completion: ' + el('daily-sub').textContent);

// in-progress resume
localStorage.removeItem('sixteen.daily.v2.' + api.dayNumber());
api.startDaily(); type('Iran'); api.nextRound();
api.renderHome();
ok(el('daily-sub').textContent.includes('In progress'), 'home reflects progress: ' + el('daily-sub').textContent);
api.startDaily();
ok(api.game.index === 1 && api.game.rounds[0].entries.length === 1, 'resumed mid-puzzle');

// infinite mode
api.startInfinite();
ok(el('game-meta').textContent === 'Infinite', 'infinite meta label');
for (let i = 0; i < 5; i++) { api.lockRound(); api.nextRound(); }
ok(el('results-kicker').textContent === 'Infinite set', 'infinite results kicker');
ok(api.statsFor().played === 1, 'infinite play does not touch daily stats');
ok(api.shareText().includes('infinite'), 'infinite share is labelled');

api.renderStats();
ok(el('stat-grid').innerHTML.includes('Max streak'), 'stats modal renders');
ok((el('dist').innerHTML.match(/dist-row/g) || []).length === 6, 'six distribution rows');

console.log(`\n${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
