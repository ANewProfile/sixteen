/* SIXTEEN — game logic. Vanilla JS, no build step, no network. */

const MAX_ANSWERS = 5;
const LADDER = [0, 1, 2, 4, 8, 16];   // points by number of correct answers
const MISS_PENALTY = -2;
const PERFECT = LADDER[5] * 5;        // 80

const K_STATS  = 'sixteen.stats.v2';
const K_DAILY  = 'sixteen.daily.v2.';
const K_RECENT = 'sixteen.recent.v2';

const $ = (id) => document.getElementById(id);
const PROMPT_BY_ID = Object.fromEntries(PROMPTS.map((p) => [p.id, p]));

/* ──────────────────────────── answer matching ──────────────────────────── */

/* Fold a typed answer down to a comparable key: lowercase, de-accented,
 * punctuation-free, with leading articles in several languages dropped. */
function norm(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['‘’ʼ]/g, '')          // Doll's == Doll’s == Dolls
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^(the|a|an|la|le|les|il|lo|el|los|las|der|die|das|l) /, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/* Words a prompt's answers all share, which carry no information inside it:
 * "National Park" in a prompt about national parks, "Trench" in one about
 * trenches. Declared as `noise` in data.js and dropped from both the answer
 * keys and the typed response, so Yellowstone and Yellowstone National Park are
 * one and the same. */
function noisePhrases(prompt) {
  return (prompt.noise || [])
    .map(norm)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);     // longest phrase first
}

function stripNoise(n, phrases) {
  let out = n;
  for (const phrase of phrases) {
    out = (' ' + out + ' ').split(' ' + phrase + ' ').join(' ').replace(/\s+/g, ' ').trim();
  }
  return out;                                 // '' means the whole thing was noise
}

/* Expand a prompt's "Canonical|alias|..." specs into match keys. */
function answerSet(prompt) {
  const noise = noisePhrases(prompt);
  return prompt.answers.map((spec) => {
    const forms = spec.split('|').map((f) => f.trim()).filter(Boolean);
    const keys = forms.map((f) => stripNoise(norm(f), noise) || norm(f)).filter(Boolean);
    return { canonical: forms[0], keys: [...new Set(keys)] };
  });
}

/* Regnal numbers and ordinals must agree exactly — Henry VI is not a typo
 * for Henry VII, Symphony No. 4 is not No. 5, and Vitamin B1 is not B2. Digits
 * count even when glued to a letter, which is what keeps the B vitamins and the
 * Karakoram's K-numbers apart. */
function numerals(s) {
  return (s.match(/\d+|\b[ivxlcdm]+\b/g) || []).join(' ');
}

/* Finds the answer a typed response names. Returns { index, tie }, where index
 * is -1 for no match and tie is true when two different answers are equally
 * close — the caller asks for a more specific answer rather than guessing.
 * Tolerates one typo on keys of 8+ characters and two on keys of 14+, but only
 * after exact matching fails everywhere, so near-identical answers never
 * shadow each other. */
function matchAnswer(input, answers) {
  const n = norm(input);
  if (!n) return { index: -1, tie: false };
  for (let i = 0; i < answers.length; i++) {
    if (answers[i].keys.includes(n)) return { index: i, tie: false };
  }
  const nNum = numerals(n);
  let best = -1;
  let bestDist = Infinity;
  let tie = false;
  for (let i = 0; i < answers.length; i++) {
    for (const key of answers[i].keys) {
      if (key.length < 8) continue;
      if (numerals(key) !== nNum) continue;
      const tolerance = key.length >= 14 ? 2 : 1;
      const d = levenshtein(n, key);
      if (d > tolerance) continue;
      if (d < bestDist) { best = i; bestDist = d; tie = false; }
      else if (d === bestDist && i !== best) { tie = true; }
    }
  }
  return { index: best, tie };
}

/* ──────────────────────── asking for a fuller answer ───────────────────── */

/* Words that identify nothing on their own, so a fragment made only of these
 * is just a miss rather than a half-stated answer. */
const STOPWORDS = new Set([
  'of', 'and', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'from', 'for', 'with',
  'by', 'de', 'del', 'della', 'di', 'da', 'du', 'des', 'von', 'zu', 'aus',
  'dem', 'den', 'el', 'los', 'las', 'la', 'le', 'les', 'il', 'lo', 'i', 'un',
  'una', 'uno', 'al', 'no', 'not', 'all', 'too', 'my', 'his', 'her', 'its',
  'our', 'their', 'is', 'was', 'o',
]);

const isNumeralWord = (w) => /^(\d+|[ivxlcdm]+)$/.test(w);

function carriesMeaning(words) {
  return words.some((w) => w.length > 1 && !STOPWORDS.has(w) && !isNumeralWord(w));
}

/* Every contiguous run of words shorter than a whole answer: the half-stated
 * forms a moderator prompts on. "Henry" for Henry VII, "Crime" for Crime and
 * Punishment, "neutrino" for the muon neutrino. A run that is itself somebody's
 * complete answer is excluded — Muon stands on its own even though it also
 * begins Muon Neutrino. */
function fragmentForms(answers) {
  const complete = new Set();
  answers.forEach((a) => a.keys.forEach((k) => complete.add(k)));
  const fragments = new Set();
  for (const answer of answers) {
    for (const key of answer.keys) {
      const words = key.split(' ');
      if (words.length < 2) continue;
      for (let i = 0; i < words.length; i++) {
        for (let j = i + 1; j <= words.length; j++) {
          if (j - i === words.length) continue;          // that's the whole answer
          const run = words.slice(i, j);
          if (!carriesMeaning(run)) continue;
          const form = run.join(' ');
          if (!complete.has(form)) fragments.add(form);
        }
      }
    }
  }
  return fragments;
}

/* Author-declared prompts, for fragments no rule can derive — a surname shared
 * with a famous relative, say. See promptOn in data.js. */
function declaredPrompts(prompt) {
  const out = new Map();
  for (const entry of prompt.promptOn || []) {
    const on = typeof entry === 'string' ? entry : entry.on;
    const say = typeof entry === 'string' ? null : (entry.say || null);
    const key = norm(on);
    if (key) out.set(key, say);
  }
  return out;
}

/* Answer keys, fragments, and declared prompts are derived once per prompt. */
const PROMPT_INDEX = new Map();
function promptIndex(prompt) {
  let entry = PROMPT_INDEX.get(prompt.id);
  if (!entry) {
    const answers = answerSet(prompt);
    entry = {
      answers,
      fragments: fragmentForms(answers),
      asks: declaredPrompts(prompt),
      noise: noisePhrases(prompt),
    };
    PROMPT_INDEX.set(prompt.id, entry);
  }
  return entry;
}

/* Rules a typed response against a prompt. Returns one of:
 *   { kind: 'hit',  index }    a complete answer
 *   { kind: 'ask',  message }  half an answer — neither credited nor penalised
 *   { kind: 'miss' }           wrong
 * Order matters: a complete answer always beats a fragment reading, so Love
 * scores as Toni Morrison's novel and Muon as the lepton. */
function judge(input, prompt) {
  const { answers, fragments, asks, noise } = promptIndex(prompt);
  const raw = norm(input);
  if (!raw) return { kind: 'miss' };
  const n = stripNoise(raw, noise);
  if (!n) return { kind: 'ask', message: null };   // nothing but noise: "Strait", "Conference"

  for (let i = 0; i < answers.length; i++) {
    if (answers[i].keys.includes(n)) return { kind: 'hit', index: i };
  }
  if (asks.has(n)) return { kind: 'ask', message: asks.get(n) };
  if (fragments.has(n)) return { kind: 'ask', message: null };

  const m = matchAnswer(n, answers);
  if (m.tie) return { kind: 'ask', message: null };
  if (m.index >= 0) return { kind: 'hit', index: m.index };

  const nNum = numerals(n);
  for (const fragment of fragments) {
    if (fragment.length < 8) continue;
    if (numerals(fragment) !== nNum) continue;
    if (levenshtein(n, fragment) <= 1) return { kind: 'ask', message: null };
  }
  return { kind: 'miss' };
}

/* ───────────────────────────────── scoring ─────────────────────────────── */

const roundCorrect = (round) => round.entries.filter((e) => e.correct).length;
const roundMisses  = (round) => round.entries.filter((e) => !e.correct).length;
const roundScore   = (round) => LADDER[roundCorrect(round)] + MISS_PENALTY * roundMisses(round);
const totalScore   = (rounds) => rounds.reduce((sum, r) => sum + roundScore(r), 0);

/* ──────────────────────────────── calendar ─────────────────────────────── */

function localMidnight(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayNumber(date = new Date()) {
  const epoch = new Date(DAILY_EPOCH[0], DAILY_EPOCH[1], DAILY_EPOCH[2]).getTime();
  return Math.floor((localMidnight(date) - epoch) / 86400000) + 1;
}

function dailyPromptIds(day) {
  const i = ((day - 1) % DAILY_SETS.length + DAILY_SETS.length) % DAILY_SETS.length;
  return DAILY_SETS[i];
}

/* How many recently-seen prompts INFINITE refuses to repeat. Scaled to the size
 * of the library so the promise holds as content grows: with 250 prompts it
 * holds back 150, about the last thirty sets. */
const RECENT_MEMORY = Math.max(25, Math.round(PROMPTS.length * 0.6));

/* An infinite set keeps one prompt per category slot, with Myth & Philosophy
 * occasionally displacing history, literature, or fine arts. */
function infinitePromptIds() {
  const slots = CATEGORY_SLOTS.slice();
  if (Math.random() < 0.4) {
    slots[SWAPPABLE_SLOTS[Math.floor(Math.random() * SWAPPABLE_SLOTS.length)]] = 'mythphil';
  }
  const recent = read(K_RECENT, []);
  const ids = slots.map((cat) => {
    const pool = PROMPTS.filter((p) => p.category === cat);
    const fresh = pool.filter((p) => !recent.includes(p.id));
    const from = fresh.length ? fresh : pool;
    return from[Math.floor(Math.random() * from.length)].id;
  });
  write(K_RECENT, [...ids, ...recent].slice(0, RECENT_MEMORY));
  return ids;
}

/* ──────────────────────────────── storage ─────────────────────────────── */

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
}

const blankStats = () => ({ played: 0, totalScore: 0, best: null, streak: 0, maxStreak: 0, lastDay: null, perfects: 0, dist: {} });

function statsFor() {
  return Object.assign(blankStats(), read(K_STATS, {}));
}

const DIST_BUCKETS = [
  { key: 'neg', label: '≤ 0',  test: (s) => s <= 0 },
  { key: 'b1',  label: '1–16',  test: (s) => s >= 1 && s <= 16 },
  { key: 'b2',  label: '17–32', test: (s) => s >= 17 && s <= 32 },
  { key: 'b3',  label: '33–48', test: (s) => s >= 33 && s <= 48 },
  { key: 'b4',  label: '49–64', test: (s) => s >= 49 && s <= 64 },
  { key: 'b5',  label: '65–80', test: (s) => s >= 65 },
];

function recordDaily(day, score, rounds) {
  const s = statsFor();
  if (s.lastDay === day) return;              // never double-count a day
  s.played += 1;
  s.totalScore += score;
  s.best = s.best === null ? score : Math.max(s.best, score);
  s.streak = s.lastDay === day - 1 ? s.streak + 1 : 1;
  s.maxStreak = Math.max(s.maxStreak, s.streak);
  s.perfects += rounds.filter((r) => roundCorrect(r) === MAX_ANSWERS).length;
  const bucket = DIST_BUCKETS.find((b) => b.test(score));
  s.dist[bucket.key] = (s.dist[bucket.key] || 0) + 1;
  s.lastDay = day;
  write(K_STATS, s);
}

/* ───────────────────────────────── state ──────────────────────────────── */

let game = null;

function newGame(mode, ids, day) {
  return {
    mode, day,
    promptIds: ids,
    index: 0,
    rounds: ids.map(() => ({ entries: [], locked: false })),
    finished: false,
  };
}

const currentPrompt = () => PROMPT_BY_ID[game.promptIds[game.index]];
const currentRound  = () => game.rounds[game.index];

function saveGame() {
  if (game && game.mode === 'daily') write(K_DAILY + game.day, game);
}

/* ──────────────────────────────── screens ─────────────────────────────── */

function show(which) {
  ['home', 'game', 'results'].forEach((name) => {
    $('screen-' + name).classList.toggle('hidden', name !== which);
  });
  $('btn-home').classList.toggle('shown', which !== 'home');
  window.scrollTo(0, 0);
}

function renderHome() {
  const day = dayNumber();
  const saved = read(K_DAILY + day, null);
  $('daily-title').textContent = 'Puzzle No. ' + day;
  if (saved && saved.finished) {
    $('daily-sub').textContent = 'Completed — ' + totalScore(saved.rounds) + '/' + PERFECT + '. See your results.';
  } else if (saved) {
    $('daily-sub').textContent = 'In progress — prompt ' + (saved.index + 1) + ' of 5. Resume.';
  } else {
    $('daily-sub').textContent = 'Everyone gets the same five prompts.';
  }

  const s = statsFor();
  const avg = s.played ? Math.round(s.totalScore / s.played) : 0;
  $('home-stats').innerHTML = [
    ['Played', s.played],
    ['Streak', s.streak],
    ['Average', avg],
    ['Best', s.best === null ? '–' : s.best],
  ].map(([label, value]) => `<div class="home-stat"><b>${value}</b><span>${label}</span></div>`).join('');
  show('home');
}

function renderGame() {
  const prompt = currentPrompt();
  const round = currentRound();
  const answers = promptIndex(prompt).answers;
  const cat = CATEGORIES[prompt.category];

  $('dots').innerHTML = game.rounds.map((r, i) => {
    const cls = i === game.index ? 'active' : (r.locked ? 'done' : '');
    return `<span class="dot ${cls}"></span>`;
  }).join('');
  const label = game.mode === 'daily' ? 'Daily · No. ' + game.day : 'Infinite';
  const banked = game.rounds.filter((r) => r.locked);
  const running = totalScore(banked);
  $('game-meta').textContent = banked.length
    ? `${label} · ${running} pt${Math.abs(running) === 1 ? '' : 's'}`
    : label;

  $('cat-chip').innerHTML = `<span>${cat.icon}</span>${cat.name}`;
  $('prompt-text').textContent = prompt.prompt;
  $('prompt-note').textContent = prompt.note || '';

  $('slots').innerHTML = Array.from({ length: MAX_ANSWERS }, (_, i) => {
    const entry = round.entries[i];
    if (!entry) {
      const isNext = !round.locked && i === round.entries.length;
      return `<li class="slot ${isNext ? 'next' : ''}">
        <span class="slot-num">${i + 1}</span>
        <span class="slot-text" style="color:var(--ink-faint)">${isNext ? 'Your next answer…' : ''}</span>
      </li>`;
    }
    const shown = entry.correct && entry.canonical && norm(entry.canonical) !== norm(entry.text)
      ? `${escapeHtml(entry.canonical)} <span class="corrected">(you typed &ldquo;${escapeHtml(entry.text)}&rdquo;)</span>`
      : escapeHtml(entry.text);
    return `<li class="slot ${entry.correct ? 'correct' : 'wrong'}">
      <span class="slot-num">${i + 1}</span>
      <span class="mark">${entry.correct ? '✓' : '✕'}</span>
      <span class="slot-text">${shown}</span>
      <span class="slot-pts">${entry.correct ? 'hit' : MISS_PENALTY}</span>
    </li>`;
  }).join('');

  const got = roundCorrect(round);
  $('scale').innerHTML = LADDER.slice(1).map((pts, i) => {
    const n = i + 1;
    const cls = n === got ? 'current' : (n < got ? 'reached' : '');
    return `<span class="step ${cls}">${n} → ${pts}</span>`;
  }).join('');

  const liveScore = roundScore(round);
  $('btn-lock').textContent = round.entries.length
    ? `Lock in ${liveScore >= 0 ? '+' : ''}${liveScore} · see answers`
    : 'Pass — see answers';

  if (round.locked) {
    renderReveal(prompt, round, answers);
  } else {
    $('reveal').classList.add('hidden');
    $('entry-form').classList.remove('hidden');
    $('btn-lock').parentElement.classList.remove('hidden');
    $('answer-input').value = '';
    $('answer-input').disabled = false;
    setTimeout(() => $('answer-input').focus(), 30);
  }
  show('game');
}

function renderReveal(prompt, round, answers) {
  $('entry-form').classList.add('hidden');
  $('btn-lock').parentElement.classList.add('hidden');
  $('feedback').textContent = ' ';

  const score = roundScore(round);
  const el = $('reveal-score');
  el.textContent = (score > 0 ? '+' : '') + score;
  el.className = 'reveal-score ' + (score > 0 ? 'pos' : score < 0 ? 'neg' : '');
  const got = roundCorrect(round);
  const missed = roundMisses(round);
  $('reveal-label').textContent =
    `${got} correct${missed ? `, ${missed} miss${missed > 1 ? 'es' : ''}` : ''}` +
    (got === MAX_ANSWERS && !missed ? ' — a perfect sixteen' : '');

  const hits = new Set(round.entries.filter((e) => e.correct).map((e) => e.answerIndex));
  $('reveal-answers').innerHTML = answers
    .map((a, i) => `<span class="pill ${hits.has(i) ? 'hit' : ''}">${escapeHtml(a.canonical)}</span>`)
    .join('');

  $('btn-next').textContent = game.index === game.rounds.length - 1 ? 'See results' : 'Next prompt';
  $('reveal').classList.remove('hidden');
  setTimeout(() => $('btn-next').focus(), 30);
}

function verdict(score) {
  if (score === PERFECT) return 'Flawless. Sixteen across the board.';
  if (score >= 64) return 'Tournament form.';
  if (score >= 48) return 'A strong day at the buzzer.';
  if (score >= 32) return 'Respectable. The ladder was climbed.';
  if (score >= 16) return 'Points on the board.';
  if (score > 0) return 'Survived, barely.';
  if (score === 0) return 'Dead even. Three right, two wrong, nothing to show.';
  return 'The penalties won today.';
}

function renderResults() {
  const score = totalScore(game.rounds);
  $('results-kicker').textContent = game.mode === 'daily'
    ? 'Sixteen · Puzzle No. ' + game.day
    : 'Infinite set';
  $('results-total').innerHTML = `${score}<small>/${PERFECT}</small>`;
  $('results-verdict').textContent = verdict(score);

  $('breakdown').innerHTML = game.promptIds.map((id, i) => {
    const prompt = PROMPT_BY_ID[id];
    const round = game.rounds[i];
    const pts = roundScore(round);
    const squares = squareClasses(round)
      .map((c) => `<span class="sq ${c}"></span>`).join('');
    return `<div class="brow">
      <span class="brow-icon">${CATEGORIES[prompt.category].icon}</span>
      <span class="brow-cat">${CATEGORIES[prompt.category].name}</span>
      <span class="brow-squares">${squares}</span>
      <span class="brow-pts ${pts > 0 ? 'pos' : pts < 0 ? 'neg' : ''}">${pts > 0 ? '+' : ''}${pts}</span>
    </div>`;
  }).join('');

  $('btn-again').classList.toggle('hidden', game.mode !== 'infinite');
  $('btn-share').textContent = game.mode === 'daily' ? 'Copy results' : 'Copy summary';
  $('share-feedback').textContent = ' ';
  $('review-panel').classList.add('hidden');
  $('btn-review').textContent = 'Review answers';

  $('review-panel').innerHTML = game.promptIds.map((id, i) => {
    const prompt = PROMPT_BY_ID[id];
    const answers = promptIndex(prompt).answers;
    const hits = new Set(game.rounds[i].entries.filter((e) => e.correct).map((e) => e.answerIndex));
    const misses = game.rounds[i].entries.filter((e) => !e.correct)
      .map((e) => escapeHtml(e.text)).join(', ');
    return `<div class="review-item">
      <div class="cat-chip"><span>${CATEGORIES[prompt.category].icon}</span>${CATEGORIES[prompt.category].name}</div>
      <h3 class="prompt">${escapeHtml(prompt.prompt)}</h3>
      ${misses ? `<p class="prompt-note">Your misses: ${misses}</p>` : ''}
      <div class="pill-list">${answers.map((a, j) =>
        `<span class="pill ${hits.has(j) ? 'hit' : ''}">${escapeHtml(a.canonical)}</span>`).join('')}</div>
    </div>`;
  }).join('');

  show('results');
}

/* Per-answer result squares: green hit, red miss, grey unused slot. */
function squareClasses(round) {
  const out = round.entries.map((e) => (e.correct ? 'g' : 'r'));
  while (out.length < MAX_ANSWERS) out.push('o');
  return out;
}

function shareText() {
  const score = totalScore(game.rounds);
  const head = game.mode === 'daily'
    ? `SIXTEEN No. ${game.day} — ${score}/${PERFECT}`
    : `SIXTEEN · infinite — ${score}/${PERFECT}`;
  const emoji = { g: '\u{1F7E9}', r: '\u{1F7E5}', o: '⬛' };
  const rows = game.promptIds.map((id, i) => {
    const round = game.rounds[i];
    const pts = roundScore(round);
    const squares = squareClasses(round).map((c) => emoji[c]).join('');
    return `${CATEGORIES[PROMPT_BY_ID[id].category].icon} ${squares} ${pts > 0 ? '+' : ''}${pts}`;
  });
  const url = location.origin + location.pathname.replace(/index\.html$/, '');
  return [head, ...rows, url].join('\n');
}

async function copyResults() {
  const text = shareText();
  const note = $('share-feedback');
  try {
    await navigator.clipboard.writeText(text);
    note.textContent = 'Copied to clipboard.';
    note.className = 'feedback good';
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    note.textContent = ok ? 'Copied to clipboard.' : 'Copy failed — select the text manually.';
    note.className = 'feedback ' + (ok ? 'good' : 'bad');
  }
}

/* ──────────────────────────────── actions ─────────────────────────────── */

function submitAnswer() {
  const input = $('answer-input');
  const round = currentRound();
  const note = $('feedback');
  const raw = input.value.trim();
  if (!raw || round.locked || round.entries.length >= MAX_ANSWERS) return;

  const prompt = currentPrompt();
  const { answers } = promptIndex(prompt);
  const ruling = judge(raw, prompt);

  if (ruling.kind === 'ask') {
    note.textContent = ruling.message
      || `More specific \u2014 \u201c${raw}\u201d is only part of an answer.`;
    note.className = 'feedback ask';
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    return;                       // costs nothing: no slot, no points either way
  }

  const idx = ruling.kind === 'hit' ? ruling.index : -1;
  const already = idx >= 0 && round.entries.some((e) => e.answerIndex === idx);

  if (already) {
    note.textContent = `Already counted — that’s ${answers[idx].canonical}.`;
    note.className = 'feedback';
    input.select();
    return;
  }

  round.entries.push({
    text: raw,
    correct: idx >= 0,
    canonical: idx >= 0 ? answers[idx].canonical : null,
    answerIndex: idx,
  });

  if (round.entries.length >= MAX_ANSWERS) round.locked = true;
  saveGame();
  renderGame();

  if (!round.locked) {
    note.textContent = idx >= 0
      ? `✓ ${answers[idx].canonical} — ${LADDER[roundCorrect(round)]} pts if you stop now.`
      : `✕ Not accepted. −2.`;
    note.className = 'feedback ' + (idx >= 0 ? 'good' : 'bad');
  }
}

function lockRound() {
  currentRound().locked = true;
  saveGame();
  renderGame();
}

function nextRound() {
  if (game.index < game.rounds.length - 1) {
    game.index += 1;
    saveGame();
    renderGame();
  } else {
    game.finished = true;
    saveGame();
    if (game.mode === 'daily') recordDaily(game.day, totalScore(game.rounds), game.rounds);
    renderResults();
  }
}

function startDaily() {
  const day = dayNumber();
  const saved = read(K_DAILY + day, null);
  if (saved && Array.isArray(saved.promptIds) && saved.promptIds.every((id) => PROMPT_BY_ID[id])) {
    game = saved;
    if (game.finished) { renderResults(); return; }
    renderGame();
    return;
  }
  game = newGame('daily', dailyPromptIds(day), day);
  saveGame();
  renderGame();
}

function startInfinite() {
  game = newGame('infinite', infinitePromptIds(), null);
  renderGame();
}

/* ───────────────────────────────── modals ─────────────────────────────── */

function openModal(id) {
  if (id === 'modal-stats') renderStats();
  $(id).classList.remove('hidden');
}
function closeModals() {
  document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
}

function renderStats() {
  const s = statsFor();
  const avg = s.played ? (s.totalScore / s.played).toFixed(1) : '0';
  $('stat-grid').innerHTML = [
    ['Played', s.played],
    ['Average', avg],
    ['Best', s.best === null ? '–' : s.best],
    ['Streak', s.streak],
    ['Max streak', s.maxStreak],
    ['Sixteens', s.perfects],
  ].map(([label, value]) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`).join('');

  const counts = DIST_BUCKETS.map((b) => s.dist[b.key] || 0);
  const max = Math.max(1, ...counts);
  $('dist').innerHTML = DIST_BUCKETS.map((b, i) => `<div class="dist-row">
      <span class="dist-label">${b.label}</span>
      <span class="dist-bar-wrap"><span class="dist-bar ${counts[i] === max && counts[i] > 0 ? 'hot' : ''}"
        style="width:${(counts[i] / max) * 100}%"></span></span>
      <span class="dist-count">${counts[i]}</span>
    </div>`).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ───────────────────────────────── wiring ─────────────────────────────── */

$('btn-play-daily').addEventListener('click', startDaily);
$('btn-play-infinite').addEventListener('click', startInfinite);
$('btn-home').addEventListener('click', renderHome);
$('btn-how').addEventListener('click', () => openModal('modal-how'));
$('btn-stats').addEventListener('click', () => openModal('modal-stats'));
$('btn-lock').addEventListener('click', lockRound);
$('btn-next').addEventListener('click', nextRound);
$('btn-share').addEventListener('click', copyResults);
$('btn-again').addEventListener('click', startInfinite);
$('btn-review').addEventListener('click', () => {
  const panel = $('review-panel');
  const hidden = panel.classList.toggle('hidden');
  $('btn-review').textContent = hidden ? 'Review answers' : 'Hide answers';
  if (!hidden) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('entry-form').addEventListener('submit', (e) => { e.preventDefault(); submitAnswer(); });

$('btn-reset').addEventListener('click', () => {
  if (!confirm('Erase all SIXTEEN progress and statistics on this device?')) return;
  Object.keys(localStorage)
    .filter((k) => k.startsWith('sixteen.'))
    .forEach((k) => localStorage.removeItem(k));
  game = null;
  closeModals();
  renderHome();
});

document.querySelectorAll('.modal').forEach((m) => {
  m.addEventListener('click', (e) => {
    if (e.target === m || e.target.hasAttribute('data-close')) closeModals();
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModals();
});

renderHome();
