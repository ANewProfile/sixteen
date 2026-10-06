const fs = require('fs');
const path = require('path').join(__dirname, '..') + '/';
const data = fs.readFileSync(path + 'assets/data.js', 'utf8');
const app  = fs.readFileSync(path + 'assets/app.js', 'utf8');
// take app.js up to the DOM wiring section
const pure = app.split('/* ───────────────────────────────── wiring')[0];
const stub = `
  var document = { getElementById: () => null, querySelectorAll: () => [], addEventListener: () => {} };
  var window = {}; var location = { origin: 'x', pathname: '/' };
  var localStorage = { _s: {}, getItem(k){ return this._s[k] ?? null; }, setItem(k,v){ this._s[k]=v; },
                       removeItem(k){ delete this._s[k]; } };
`;
const ctx = eval(stub + data + pure + `
  ({ norm, levenshtein, answerSet, matchAnswer, judge, promptIndex, fragmentForms,
     roundScore, roundCorrect, totalScore,
     dayNumber, dailyPromptIds, infinitePromptIds, LADDER, DIST_BUCKETS, PROMPTS, CATEGORIES,
     DAILY_SETS, PROMPT_BY_ID, SET_SIZE })
`);

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('  FAIL: ' + msg); } };

// ---- data integrity
const ids = new Set();
for (const p of ctx.PROMPTS) {
  ok(!ids.has(p.id), 'duplicate id ' + p.id); ids.add(p.id);
  ok(!!ctx.CATEGORIES[p.category], p.id + ' bad category');
  ok(p.answers.length >= 5, p.id + ' has only ' + p.answers.length + ' answers (need 5 for a sixteen)');
  /* Two shapes are allowed: the "...as you can." instruction, or a direct
   * question. Both read naturally above a text box; anything else is a slip. */
  ok(/(as you can\.|\?)$/.test(p.prompt), p.id + ' prompt phrasing');
  ok(/^[A-Z“]/.test(p.prompt), p.id + ' prompt should start with a capital');
  const keyOwner = new Map();
  ctx.answerSet(p).forEach((a, i) => {
    ok(a.canonical.length > 0, p.id + ' blank canonical');
    for (const k of a.keys) {
      if (keyOwner.has(k) && keyOwner.get(k) !== i)
        ok(false, `${p.id}: key "${k}" claimed by two answers (${a.canonical})`);
      keyOwner.set(k, i);
    }
  });
}
console.log(`prompts: ${ctx.PROMPTS.length}, categories covered: ` +
  [...new Set(ctx.PROMPTS.map(p => p.category))].length);

// ---- fuzzy ambiguity: a 1-typo neighborhood should not straddle two answers
const numeralsOf = (x) => (x.match(/\d+|\b[ivxlcdm]+\b/g) || []).join(' ');
for (const p of ctx.PROMPTS) {
  const as = ctx.answerSet(p);
  for (let i = 0; i < as.length; i++) for (let j = i + 1; j < as.length; j++)
    for (const a of as[i].keys) for (const b of as[j].keys) {
      if (a.length < 8 && b.length < 8) continue;
      if (numeralsOf(a) !== numeralsOf(b)) continue;   // the matcher refuses these outright
      const tol = Math.max(a.length, b.length) >= 14 ? 2 : 1;
      if (ctx.levenshtein(a, b) <= tol)
        console.log(`  WARN ${p.id}: "${a}" ~ "${b}" within fuzzy tolerance ${tol}`);
    }
}

// ---- daily sets
ctx.DAILY_SETS.forEach((set, n) => {
  ok(set.length === 5, `day ${n+1} must have 5 prompts`);
  set.forEach(id => ok(!!ctx.PROMPT_BY_ID[id], `day ${n+1} unknown id ${id}`));
  const cats = set.map(id => ctx.PROMPT_BY_ID[id].category);
  ok(new Set(cats).size === 5, `day ${n+1} repeats a category: ${cats}`);
  console.log(`day ${n+1}: ${cats.join(', ')}`);
});

// ---- matching
const dos = ctx.answerSet(ctx.PROMPT_BY_ID['lit-dostoevsky']);
const m = (set, s) => ctx.matchAnswer(s, set).index;
/* judge() against a whole prompt: 'hit' | 'ask' | 'miss' */
const J = (id, s) => ctx.judge(s, ctx.PROMPT_BY_ID[id]);
const kind = (id, s) => J(id, s).kind;
ok(m(dos, 'The Idiot') === 2, 'exact title');
ok(m(dos, 'idiot') === 2, 'article-stripped title');
ok(m(dos, 'Crime & Punishment') >= 0, 'ampersand');
ok(m(dos, 'crime and punishment') === 0, 'lowercase');
ok(m(dos, 'brothers karamazov') === 1, 'alias');
ok(m(dos, 'The Brothers Karamazov!') === 1, 'punctuation');
ok(m(dos, 'The Posessed') === 3, 'one typo on alias (Possessed)');
ok(m(dos, 'War and Peace') === -1, 'Tolstoy is not Dostoevsky');
ok(m(dos, '') === -1, 'empty');
ok(m(dos, '   ') === -1, 'whitespace');

const tudor = ctx.answerSet(ctx.PROMPT_BY_ID['hist-tudors']);
ok(m(tudor, 'Henry VII') === 0 && m(tudor, 'Henry VIII') === 1, 'Henry VII vs VIII not confused');
ok(m(tudor, 'Elizabeth') === 4, 'bare Elizabeth');
ok(m(tudor, 'Henry IX') === -1, 'nonexistent Tudor');
ok(m(tudor, 'Henry VI') === -1, 'Henry VI is Lancastrian, not a typo for VII');
ok(m(tudor, 'Henry 8') === 1, 'arabic numeral alias');
ok(m(tudor, 'Edward VII') === -1, 'Edward VII is not a Tudor');
ok(m(tudor, 'Elizabth') === 4, 'typo with no numerals still forgiven');

const oly = ctx.answerSet(ctx.PROMPT_BY_ID['myth-olympians']);
ok(m(oly, 'Jupiter') === 0, 'Roman equivalent');
ok(m(oly, 'Hephaistos') === 9, 'transliteration');
ok(m(oly, 'Hades') === -1, 'Hades is not an Olympian');

const krebs = ctx.answerSet(ctx.PROMPT_BY_ID['sci-krebs']);
ok(m(krebs, 'alpha ketoglutarate') === 2, 'hyphen-insensitive');
ok(m(krebs, 'succinyl CoA') === 3, 'succinyl-CoA');
ok(m(krebs, 'glutamine') === -1, 'not in the cycle');
ok(m(krebs, 'citrate') === 0 && m(krebs, 'isocitrate') === 1, 'citrate vs isocitrate');

const gases = ctx.answerSet(ctx.PROMPT_BY_ID['sci-noble-gases']);
ok(m(gases, 'neon') === 1 && m(gases, 'xenon') === 4, 'neon vs xenon');
ok(m(gases, 'nitrogen') === -1, 'nitrogen is not noble');

const verdi = ctx.answerSet(ctx.PROMPT_BY_ID['arts-verdi-operas']);
ok(m(verdi, 'La Traviata') === 1 && m(verdi, 'Traviata') === 1, 'Italian article');
ok(m(verdi, 'Otello') === 3 && m(verdi, 'Oberto') === 15, 'Otello vs Oberto');
ok(m(verdi, 'Tosca') === -1, 'Puccini is not Verdi');

// ---- scoring
const R = (c, w) => ({ entries: [...Array(c).fill({correct:true}), ...Array(w).fill({correct:false})] });
ok(ctx.roundScore(R(0,0)) === 0, '0/0 = 0');
ok(ctx.roundScore(R(3,2)) === 0, '3 right + 2 wrong = 0 (spec example)');
ok(ctx.roundScore(R(5,0)) === 16, 'perfect round = 16');
ok(ctx.roundScore(R(1,0)) === 1 && ctx.roundScore(R(2,0)) === 2 &&
   ctx.roundScore(R(3,0)) === 4 && ctx.roundScore(R(4,0)) === 8, 'ladder 1/2/4/8');
ok(ctx.roundScore(R(0,5)) === -10, 'all wrong = -10');
ok(ctx.roundScore(R(4,1)) === 6, '4 right 1 wrong = 6');
ok(ctx.totalScore([R(5,0),R(5,0),R(5,0),R(5,0),R(5,0)]) === 80, 'perfect day = 80');

// ---- calendar
ok(ctx.dayNumber(new Date(2026,9,3)) === 1, 'epoch is day 1');
ok(ctx.dayNumber(new Date(2026,9,4)) === 2, 'next day');
ok(ctx.dayNumber(new Date(2026,9,5)) === 3, 'day 3 cycles sets');
ok(ctx.dailyPromptIds(1).join() === ctx.DAILY_SETS[0].join(), 'day 1 -> set 1');
const span = ctx.DAILY_SETS.length;
ok(ctx.dailyPromptIds(span).join() === ctx.DAILY_SETS[span - 1].join(), 'the last authored day');
ok(ctx.dailyPromptIds(span + 1).join() === ctx.DAILY_SETS[0].join(), 'the calendar wraps past the end');
ok(ctx.dailyPromptIds(span + 4).join() === ctx.DAILY_SETS[3].join(), 'and keeps its offset after wrapping');
ok(ctx.dailyPromptIds(0).length === 5 && ctx.dailyPromptIds(-3).length === 5,
   'days before the epoch still resolve to a set');

// ---- distribution buckets cover every reachable score
for (let s = -50; s <= 80; s++)
  ok(ctx.DIST_BUCKETS.filter(b => b.test(s)).length === 1, 'exactly one bucket for ' + s);

// ---- infinite sets
for (let i = 0; i < 300; i++) {
  const set = ctx.infinitePromptIds();
  ok(set.length === 5, 'infinite set size');
  ok(new Set(set).size === 5, 'infinite set has no repeats');
  const cats = set.map(id => ctx.PROMPT_BY_ID[id].category);
  ok(new Set(cats).size === 5, 'infinite set categories distinct: ' + cats);
}
const seen = {};
for (let i = 0; i < 2000; i++)
  ctx.infinitePromptIds().forEach(id => { const c = ctx.PROMPT_BY_ID[id].category; seen[c] = (seen[c]||0)+1; });
console.log('infinite category mix over 2000 sets:', seen);
for (const cat of Object.keys(ctx.CATEGORIES)) {
  const share = (seen[cat] || 0) / 2000;
  ok(share > 0.44 && share < 0.56, `${cat} should appear in half of all sets, got ${share}`);
}


// ---- half-stated answers are prompted, not judged
ok(kind('hist-tudors', 'Henry') === 'ask', 'bare Henry is prompted, not judged');
ok(kind('hist-tudors', 'Henry VII') === 'hit', 'the specific Henry still scores');
ok(kind('hist-tudors', 'Henry VIII') === 'hit', 'the other Henry too');
ok(kind('hist-tudors', 'henry') === 'ask', 'prompting is case-insensitive');
ok(kind('hist-tudors', 'Mary') === 'hit', 'a declared alias beats the fragment rule');
ok(kind('hist-tudors', 'Jane') === 'ask', 'a lone first name is prompted');
ok(kind('hist-tudors', 'VII') === 'miss', 'a bare numeral names nothing');
ok(kind('hist-tudors', 'Stephen') === 'miss', 'an unrelated monarch is still wrong');

ok(kind('hist-died-in-office', 'Roosevelt') === 'ask', 'declared prompt fires');
ok(J('hist-died-in-office', 'Roosevelt').message === 'Which Roosevelt?', 'custom wording used');
ok(kind('hist-died-in-office', 'FDR') === 'hit', 'the unambiguous form still scores');
ok(kind('hist-died-in-office', 'Harrison') === 'ask', 'shared surname is prompted');
ok(J('hist-died-in-office', 'Harrison').message === 'Which Harrison?', 'second custom wording');
ok(kind('hist-died-in-office', 'William Henry Harrison') === 'hit', 'full name scores');
ok(kind('hist-died-in-office', 'William') === 'ask', 'a lone given name is prompted');
ok(kind('hist-died-in-office', 'Lincoln') === 'hit', 'an unambiguous surname scores');

ok(kind('lit-dostoevsky', 'Crime') === 'ask', 'half a title is prompted');
ok(kind('lit-dostoevsky', 'Notes') === 'ask', 'a shared title word is prompted');
ok(kind('lit-dostoevsky', 'Crime and Punishment') === 'hit', 'the whole title scores');
ok(kind('lit-dostoevsky', 'of') === 'miss', 'a lone preposition names nothing');
ok(kind('lit-dostoevsky', 'The') === 'miss', 'a lone article names nothing');
ok(kind('lit-dostoevsky', 'Anna Karenina') === 'miss', 'wrong author is still wrong');

ok(kind('sci-leptons', 'Muon') === 'hit', 'a complete answer that also begins another one');
ok(kind('sci-leptons', 'Tau') === 'hit', 'same for tau');
ok(kind('sci-leptons', 'Neutrino') === 'ask', 'which neutrino?');
ok(kind('sci-leptons', 'Muon neutrino') === 'hit', 'the specific neutrino scores');
ok(kind('sci-leptons', 'Proton') === 'miss', 'a proton is not a lepton');

ok(kind('lit-morrison', 'Love') === 'hit', 'a one-word title scores');
ok(kind('lit-morrison', 'Song') === 'ask', 'half of Song of Solomon is prompted');
ok(kind('arts-hudson-river', 'Cole') === 'hit', 'surname alias scores');
ok(kind('arts-hudson-river', 'Thomas') === 'ask', 'Thomas Cole or Thomas Moran?');
ok(kind('sci-krebs', 'Alpha') === 'ask', 'a lone modifier is prompted');
ok(kind('myth-norse', 'Thor') === 'hit', 'short single-word answers are unaffected');

// a typo inside a fragment still prompts rather than scoring a miss
ok(kind('lit-dostoevsky', 'Karamzov') === 'ask', 'misspelt fragment is prompted');

// ---- no answer may be shadowed: every accepted form of every answer must score
for (const p of ctx.PROMPTS) {
  const { answers } = ctx.promptIndex(p);
  answers.forEach((a, i) => {
    for (const key of a.keys) {
      const r = ctx.judge(key, p);
      ok(r.kind === 'hit' && r.index === i,
         `${p.id}: "${key}" (${a.canonical}) judged ${r.kind}` +
         (r.kind === 'hit' ? ` as ${answers[r.index].canonical}` : ''));
    }
  });
}

// ---- a declared prompt must not duplicate an accepted answer, or it never fires
for (const p of ctx.PROMPTS) {
  const { answers, asks } = ctx.promptIndex(p);
  const complete = new Set(answers.flatMap((a) => a.keys));
  for (const trigger of asks.keys())
    ok(!complete.has(trigger),
       `${p.id}: promptOn "${trigger}" is also an accepted answer, so it can never fire`);
}

// ---- prompting never silently swallows a whole category of wrong answers
const wrongs = [
  ['geo-afghanistan', 'Nepal'], ['geo-danube', 'Spain'], ['sci-noble-gases', 'Nitrogen'],
  ['myth-olympians', 'Hades'], ['arts-verdi-operas', 'Tosca'], ['lit-ibsen', 'Hamlet'],
  ['hist-tudors', 'Victoria'], ['arts-les-six', 'Debussy'], ['myth-plato', 'Nicomachean Ethics'],
  ['sci-amino-acids', 'Citrate'],
];
for (const [id, answer] of wrongs)
  ok(kind(id, answer) === 'miss', `${id}: "${answer}" must cost 2, not prompt`);


// ---- the expanded content: regnal numbers, fragments, and traps
ok(kind('hist-romanovs', 'Peter') === 'ask', 'which Peter?');
ok(kind('hist-romanovs', 'Peter I') === 'hit' && kind('hist-romanovs', 'Peter III') === 'hit',
   'specific Peters score');
ok(J('hist-romanovs', 'Peter I').index !== J('hist-romanovs', 'Peter II').index,
   'Peter I and Peter II are never conflated');
ok(kind('hist-romanovs', 'Catherine') === 'ask', 'which Catherine?');
ok(kind('hist-romanovs', 'Catherine the Great') === 'hit', 'the epithet disambiguates');
ok(kind('hist-romanovs', 'Lenin') === 'miss', 'Lenin was no Romanov');

ok(kind('geo-eight-thousanders', 'Gasherbrum') === 'ask', 'which Gasherbrum?');
ok(kind('geo-eight-thousanders', 'Gasherbrum I') === 'hit', 'and the numbered one scores');
ok(kind('geo-eight-thousanders', 'K2') === 'hit', 'a two-character answer still works');
ok(kind('geo-eight-thousanders', 'Mont Blanc') === 'miss', 'not an eight-thousander');

ok(kind('hist-thirteen-colonies', 'Carolina') === 'ask', 'which Carolina?');
ok(J('hist-thirteen-colonies', 'North Carolina').index !== J('hist-thirteen-colonies', 'South Carolina').index,
   'the Carolinas are distinct despite being two edits apart');
ok(kind('hist-thirteen-colonies', 'Vermont') === 'miss', 'Vermont was not a colony');

ok(J('hist-wwii-conferences', 'Yalta').index !== J('hist-wwii-conferences', 'Malta').index,
   'Yalta and Malta stay separate conferences');
ok(kind('hist-wwii-conferences', 'Conference') === 'ask', 'a bare noun is a fragment');

ok(kind('hist-chief-justices', 'Warren') === 'ask', 'Earl Warren or Warren Burger?');
ok(kind('hist-chief-justices', 'Earl Warren') === 'hit', 'the full name resolves it');
ok(kind('hist-chief-justices', 'Thurgood Marshall') === 'miss', 'he was an associate justice');

ok(kind('arts-wright-buildings', 'Taliesin') === 'hit', 'Taliesin stands alone');
ok(kind('arts-wright-buildings', 'Taliesin West') === 'hit', 'as does Taliesin West');
ok(kind('lit-sophocles', 'Oedipus') === 'ask', 'Oedipus Rex or at Colonus?');
ok(kind('lit-sophocles', 'Medea') === 'miss', 'Medea is Euripides');
ok(kind('phil-fallacies', 'Appeal') === 'ask', 'appeal to what?');
ok(kind('geo-straits', 'Strait') === 'ask', 'which strait?');
ok(kind('arts-holst-planets', 'Mars') === 'hit', 'a Holst movement scores');
ok(kind('arts-holst-planets', 'Earth') === 'miss', 'Earth is absent from The Planets');
ok(kind('sci-quarks', 'Up') === 'hit', 'two-letter answers work');
ok(kind('sci-quarks', 'Gluon') === 'miss', 'a gluon is not a quark');

const traps = [
  ['arts-dutch-golden-age', 'Rubens'], ['hist-mesoamerica', 'Inca'],
  ['sci-dwarf-planets', 'Charon'], ['lit-bronte', 'Middlemarch'],
  ['myth-vishnu-avatars', 'Ganesha'], ['phil-presocratics', 'Socrates'],
  ['geo-arabian-peninsula', 'Jordan'], ['sci-mohs-scale', 'Granite'],
  ['geo-soviet-republics', 'Poland'], ['myth-nine-muses', 'Athena'],
  ['hist-reformers', 'Ignatius of Loyola'], ['sci-cranial-nerves', 'Sciatic'],
  ['lit-epics', 'Ulysses'], ['arts-bebop', 'Louis Armstrong'],
];
for (const [id, answer] of traps)
  ok(kind(id, answer) === 'miss', `${id}: "${answer}" must be a miss, got ${kind(id, answer)}`);


// ---- the third wave of content
ok(kind('sci-vitamins', 'Vitamin B') === 'ask', 'Vitamin B alone names no vitamin');
ok(J('sci-vitamins', 'Vitamin B').message === 'Which B vitamin?', 'with its own wording');
ok(kind('sci-vitamins', 'Vitamin B1') === 'hit' && kind('sci-vitamins', 'Thiamine') === 'hit',
   'letter and chemical name both score');
ok(J('sci-vitamins', 'Vitamin B1').index === J('sci-vitamins', 'Thiamine').index,
   'and they are the same answer');
ok(J('sci-vitamins', 'Vitamin B1').index !== J('sci-vitamins', 'Vitamin B2').index,
   'B1 and B2 are never conflated');
ok(J('sci-vitamins', 'Vitamin B1').index !== J('sci-vitamins', 'Vitamin B12').index,
   'nor B1 and B12');
ok(kind('sci-vitamins', 'Vitamin B4') === 'miss', 'there is no vitamin B4');

ok(J('arts-ballets', 'La Sylphide').index !== J('arts-ballets', 'Les Sylphides').index,
   'La Sylphide and Les Sylphides are different ballets');
ok(J('geo-tectonic-plates', 'North American Plate').index
   !== J('geo-tectonic-plates', 'South American Plate').index, 'the American plates stay apart');
ok(J('geo-states-named-after-people', 'North Carolina').index
   !== J('geo-states-named-after-people', 'South Carolina').index, 'both Carolinas count separately');
ok(J('lit-euripides', 'Iphigenia in Tauris').index !== J('lit-euripides', 'Iphigenia in Aulis').index,
   'the two Iphigenias are different plays');
ok(J('sci-muscles', 'Biceps brachii').index !== J('sci-muscles', 'Triceps brachii').index,
   'biceps and triceps stay apart');
ok(J('sci-muscles', 'Pectoralis major').index !== J('sci-muscles', 'Pectoralis minor').index,
   'pectoralis major and minor stay apart');
ok(J('sci-muscles', 'Gluteus maximus').index !== J('sci-muscles', 'Gluteus minimus').index,
   'gluteus maximus and minimus stay apart');
ok(J('sci-collective-nouns', 'School of fish').index !== J('sci-collective-nouns', 'Shoal of fish').index,
   'a school and a shoal are different nouns');
ok(kind('hist-vps-to-president', 'George W. Bush') === 'ask', 'George W. was never vice president');
ok(kind('hist-french-regimes', 'Sixth Republic') === 'ask', 'there is no Sixth Republic yet');
ok(kind('myth-titans', 'Thetis') === 'miss', 'Thetis is a Nereid, not a Titan');
ok(J('geo-states-ending-a', 'North Carolina').index !== J('geo-states-ending-a', 'South Carolina').index,
   'the Carolinas again');
ok(J('sci-acids', 'Ethanoic acid').index !== J('sci-acids', 'Methanoic acid').index,
   'ethanoic (acetic) and methanoic (formic) are different acids');
ok(J('hist-us-wars', 'World War I').index !== J('hist-us-wars', 'World War II').index,
   'the world wars stay apart');
ok(kind('lit-number-titles', 'Fahrenheit 452') === 'miss', 'numerals in titles must agree');
ok(kind('geo-tectonic-plates', 'American Plate') === 'ask', 'which American plate?');

ok(kind('geo-national-parks', 'Yosemite') === 'hit', 'a park scores');
ok(kind('geo-national-parks', 'Canyon') === 'ask', 'which canyon?');
ok(kind('geo-national-parks', 'Yellowstone National Park') === 'hit', 'the suffix is tolerated');
ok(kind('geo-national-parks', 'Niagara Falls') === 'miss', 'not a national park');

ok(kind('lit-canterbury-tales', 'The Miller\u2019s Tale') === 'hit', 'a tale scores');
ok(kind('lit-canterbury-tales', "The Miller's Tale") === 'hit', 'typed apostrophe works too');
ok(kind('lit-canterbury-tales', 'Miller') === 'hit', 'naming the teller is enough');
ok(kind('lit-canterbury-tales', 'Tale') === 'ask', 'which tale?');
ok(kind('lit-canterbury-tales', 'Nun') === 'ask', 'the Second Nun or the Nun\u2019s Priest?');

ok(kind('lit-shakespeare-histories', 'Henry IV Part 1') === 'hit', 'a numbered part scores');
ok(J('lit-shakespeare-histories', 'Henry IV Part 1').index
   !== J('lit-shakespeare-histories', 'Henry IV Part 2').index, 'the parts are distinct');
ok(kind('lit-shakespeare-histories', 'Henry IV') === 'ask', 'which part?');
ok(kind('lit-shakespeare-histories', 'Hamlet') === 'miss', 'Hamlet is no history play');

ok(kind('hist-supreme-court-cases', 'Marbury v. Madison') === 'hit', 'a case scores');
ok(kind('hist-supreme-court-cases', 'Marbury') === 'ask', 'half a case name is prompted');
ok(kind('hist-moonwalkers', 'Neil Armstrong') === 'hit', 'a moonwalker scores');
ok(kind('hist-moonwalkers', 'Michael Collins') === 'miss', 'he stayed in orbit');
ok(kind('hist-moonwalkers', 'Yuri Gagarin') === 'miss', 'and he never left Earth orbit');

ok(kind('phil-thought-experiments', 'Trolley problem') === 'hit', 'a thought experiment scores');
ok(kind('phil-thought-experiments', 'Ship of Theseus') === 'hit', 'and another');
ok(kind('myth-apostles', 'James') === 'ask', 'which James?');
ok(kind('myth-apostles', 'Peter') === 'hit', 'Peter is unambiguous');
ok(kind('sci-units-after-people', 'Newton') === 'hit', 'a named unit scores');
ok(kind('sci-units-after-people', 'Metre') === 'miss', 'the metre is named after nobody');
ok(kind('arts-tempo-markings', 'Allegro') === 'hit', 'a tempo marking scores');
ok(kind('arts-tempo-markings', 'Forte') === 'miss', 'forte is a dynamic, not a tempo');

const moreTraps = [
  ['geo-landlocked-africa', 'Kenya'], ['geo-hawaiian-islands', 'Guam'],
  ['geo-seven-summits', 'K2'], ['hist-seven-hills', 'Olympus'],
  ['hist-hanseatic-cities', 'Venice'], ['lit-harlem-renaissance', 'Walt Whitman'],
  ['lit-russian-poets', 'Tolstoy'], ['lit-joyce', 'Waiting for Godot'],
  ['sci-carpals', 'Femur'], ['sci-organelles', 'Nephron'],
  ['sci-crystal-systems', 'Amorphous'], ['sci-carbon-allotropes', 'Silicone'],
  ['arts-gaudi', 'Guggenheim Museum'], ['arts-baroque-painters', 'Monet'],
  ['myth-greek-monsters', 'Fenrir'], ['myth-hindu-gods', 'Amaterasu'],
  ['phil-chinese', 'Nagarjuna'], ['phil-enlightenment', 'Nietzsche'],
  ['myth-deadly-sins', 'Charity'], ['myth-underworld-rivers', 'Jordan'],
];
for (const [id, answer] of moreTraps)
  ok(kind(id, answer) === 'miss', `${id}: "${answer}" must be a miss, got ${kind(id, answer)}`);

// ---- the calendar should stay wide enough to be worth playing
ok(ctx.DAILY_SETS.length >= 40, 'at least 40 authored days');
ok(ctx.PROMPTS.length >= 250, 'at least 250 prompts');
const perCat = {};
ctx.PROMPTS.forEach((p) => { perCat[p.category] = (perCat[p.category] || 0) + 1; });
for (const cat of Object.keys(ctx.CATEGORIES))
  ok(perCat[cat] >= 35, `${cat} should carry its weight in Infinite (has ${perCat[cat] || 0})`);

// ---- variety: the prompts should not all read the same way
const openers = {};
ctx.PROMPTS.forEach((p) => {
  const k = p.prompt.split(' ').slice(0, 3).join(' ');
  openers[k] = (openers[k] || 0) + 1;
});
const commonest = Math.max(...Object.values(openers));
ok(commonest / ctx.PROMPTS.length < 0.8,
   `too samey: ${commonest} of ${ctx.PROMPTS.length} prompts share an opening`);
ok(ctx.PROMPTS.filter((p) => p.prompt.endsWith('?')).length >= 20,
   'at least 20 prompts should be phrased as direct questions');
ok(ctx.PROMPTS.filter((p) => /\. /.test(p.prompt)).length >= 15,
   'at least 15 prompts should carry a lead-in sentence');

// ---- Infinite should not repeat itself for a long stretch
{
  localStorage.removeItem('sixteen.recent.v2');
  const seen = new Set();
  let sets = 0;
  for (; sets < 500; sets++) {
    const set = ctx.infinitePromptIds();
    if (set.some((id) => seen.has(id))) break;
    set.forEach((id) => seen.add(id));
  }
  ok(sets >= 75, `Infinite repeated a prompt after only ${sets} sets`);
}


// ---- declared noise: the shared word in a prompt carries no information
const sameAnswer = (id, a, b) => {
  const x = J(id, a), y = J(id, b);
  return x.kind === 'hit' && y.kind === 'hit' && x.index === y.index;
};
ok(sameAnswer('geo-national-parks', 'Yellowstone', 'Yellowstone National Park'),
   'a park is itself with or without the suffix');
ok(sameAnswer('geo-national-parks', 'Grand Canyon', 'Grand Canyon National Park'),
   'and so is a two-word park');
ok(kind('geo-national-parks', 'National Park') === 'ask', 'the bare suffix names no park');
ok(sameAnswer('geo-african-lakes', 'Victoria', 'Lake Victoria'), 'Lake Victoria == Victoria');
ok(kind('geo-african-lakes', 'Lake') === 'ask', 'the bare word Lake names no lake');
ok(sameAnswer('geo-tectonic-plates', 'Pacific', 'Pacific Plate'), 'Pacific Plate == Pacific');
ok(sameAnswer('geo-mountain-ranges', 'Rocky Mountains', 'Rockies'), 'Rockies == Rocky Mountains');
ok(sameAnswer('geo-mountain-ranges', 'Andes', 'Andes Mountains'), 'the suffix is optional');
ok(sameAnswer('arts-gothic-cathedrals', 'Cologne', 'Cologne Cathedral'), 'cathedral suffix optional');
ok(sameAnswer('hist-wwii-operations', 'Overlord', 'Operation Overlord'), 'Operation prefix optional');
ok(sameAnswer('geo-straits', 'Hormuz', 'Strait of Hormuz'), 'Strait of is optional');
ok(kind('geo-straits', 'Strait') === 'ask', 'the bare word Strait names no strait');
ok(sameAnswer('hist-wwii-conferences', 'Yalta', 'Yalta Conference'), 'Conference suffix optional');
ok(J('hist-wwii-conferences', 'Yalta').index !== J('hist-wwii-conferences', 'Malta').index,
   'Yalta and Malta remain separate after stripping');

// noise is per-prompt and must not leak
ok(kind('sci-saturn-moons', 'Trench') === 'miss', 'Trench means nothing here');
ok(kind('geo-great-lakes', 'Lake') === 'miss', 'Lake is not declared noise in this prompt');
ok(kind('geo-national-parks', 'Trench') === 'miss', 'nor Trench in the parks prompt');

// stripping must never collapse an answer to nothing
for (const p of ctx.PROMPTS) {
  const { answers } = ctx.promptIndex(p);
  answers.forEach((a) => ok(a.keys.length > 0 && a.keys.every((k) => k.length > 0),
    `${p.id}: "${a.canonical}" lost all its keys to noise stripping`));
}


// ---- the fourth wave: new shapes
ok(kind('geo-equator', 'Kenya') === 'hit', 'an equatorial country scores');
ok(kind('geo-equator', 'Tanzania') === 'miss', 'Tanzania is just south of the line');
ok(kind('geo-former-countries', 'Yugoslavia') === 'hit', 'a vanished country scores');
ok(kind('geo-former-countries', 'Croatia') === 'miss', 'Croatia still exists');
ok(kind('geo-state-capitals', 'Sacramento') === 'hit', 'a state capital scores');
ok(kind('geo-state-capitals', 'Los Angeles') === 'miss', 'not a capital');
ok(kind('geo-peninsulas', 'Iberian Peninsula') === 'hit', 'the suffix is noise here');
ok(kind('geo-peninsulas', 'Peninsula') === 'ask', 'the bare suffix names nothing');

ok(kind('hist-presidents-sec-state', 'James Monroe') === 'hit', 'Monroe held both offices');
ok(kind('hist-presidents-sec-state', 'Abraham Lincoln') === 'miss', 'Lincoln never did');
ok(kind('hist-popes-20c', 'John Paul II') === 'hit', 'a 20th-century pope scores');
ok(J('hist-popes-20c', 'John Paul I').index !== J('hist-popes-20c', 'John Paul II').index,
   'the two John Pauls are distinct');
ok(kind('hist-popes-20c', 'Francis') === 'miss', 'Francis was elected in 2013');
ok(kind('hist-sieges', 'Siege of Vienna') === 'hit', 'the Siege of prefix is noise');
ok(kind('hist-ancient-battles', 'Battle of Marathon') === 'hit', 'the Battle of prefix is noise');
ok(kind('hist-ancient-battles', 'Waterloo') === 'miss', 'Waterloo is not antiquity');

ok(kind('lit-pen-names', 'Mark Twain') === 'hit', 'the pen name scores');
ok(kind('lit-pen-names', 'Samuel Clemens') === 'hit', 'and so does the real name');
ok(J('lit-pen-names', 'Mark Twain').index === J('lit-pen-names', 'Samuel Clemens').index,
   'they are the same answer');
ok(kind('lit-metrical-feet', 'Iamb') === 'hit', 'a metrical foot scores');
ok(kind('lit-metrical-feet', 'Sonnet') === 'miss', 'a sonnet is not a foot');
ok(kind('lit-unfinished', 'The Watsons') === 'hit', 'an unfinished novel scores');
ok(kind('lit-unfinished', 'Pride and Prejudice') === 'miss', 'that one Austen finished');

ok(kind('sci-eponymous-laws', 'Ohm') === 'hit', 'a bare surname scores here');
ok(kind('sci-eponymous-laws', 'Ohm\u2019s law') === 'hit', 'as does the full name');
ok(kind('sci-named-after-euler', 'Euler') === 'ask', 'Euler what?');
ok(J('sci-named-after-euler', 'Euler').message === 'Euler what?', 'with its own wording');
ok(kind('sci-named-after-euler', 'Euler characteristic') === 'hit', 'a specific one scores');
ok(kind('sci-glycolysis', 'Glucose-6-phosphate') === 'hit', 'a glycolysis intermediate scores');
ok(J('sci-glycolysis', 'glucose 6 phosphate').index
   !== J('sci-glycolysis', 'fructose 6 phosphate').index, 'the two hexose phosphates are distinct');
ok(kind('sci-glycolysis', 'Lactate') === 'miss', 'lactate comes after glycolysis');
ok(kind('sci-si-prefixes', 'Femto') === 'hit', 'an SI prefix scores');
ok(kind('sci-insect-orders', 'Coleoptera') === 'hit', 'an insect order scores');
ok(kind('sci-insect-orders', 'Arachnida') === 'miss', 'spiders are not insects');

ok(kind('arts-school-of-athens', 'Plato') === 'hit', 'a figure in the fresco scores');
ok(kind('arts-school-of-athens', 'Raphael') === 'miss', 'the painter is not a philosopher in it');
ok(kind('arts-brass', 'Trombone') === 'hit', 'a brass instrument scores');
ok(kind('arts-brass', 'Oboe') === 'miss', 'the oboe is a woodwind');
ok(kind('arts-percussion', 'Timpani') === 'hit', 'a percussion instrument scores');
ok(kind('arts-tempo-markings', 'Largo') === 'hit', 'a tempo marking scores');

ok(kind('myth-children-of-zeus', 'Athena') === 'hit', 'a child of Zeus scores');
ok(kind('myth-children-of-zeus', 'Poseidon') === 'miss', 'Poseidon is his brother');
ok(kind('myth-trojan-war', 'Achilles') === 'hit', 'a Trojan War figure scores');
ok(kind('myth-trojan-war', 'Theseus') === 'miss', 'Theseus was a generation earlier');
ok(kind('myth-orishas', 'Shango') === 'hit', 'an orisha scores');
ok(kind('phil-women', 'Hannah Arendt') === 'hit', 'a woman philosopher scores');
ok(kind('phil-ethical-theories', 'Utilitarianism') === 'hit', 'an ethical theory scores');
ok(kind('phil-ethical-theories', 'Epistemology') === 'miss', 'that is a branch, not a theory');
ok(kind('phil-islamic', 'Avicenna') === 'hit' && kind('phil-islamic', 'Ibn Sina') === 'hit',
   'both names for Avicenna score');

// ---- ten categories: fine arts and myth & philosophy split, social science and pop culture added
for (const cat of ['visual', 'music', 'mythology', 'philosophy', 'socsci', 'popculture'])
  ok(!!ctx.CATEGORIES[cat], `${cat} is a category`);
ok(!ctx.CATEGORIES.arts && !ctx.CATEGORIES.mythphil, 'the merged categories are gone');
ok(ctx.PROMPT_BY_ID['arts-van-gogh'].category === 'visual', 'old arts- ids keep working as visual arts');
ok(ctx.PROMPT_BY_ID['arts-verdi-operas'].category === 'music', 'and as music');
ok(ctx.PROMPT_BY_ID['phil-five-pillars'].category === 'mythology', 'religion stays with mythology');
ok(ctx.PROMPT_BY_ID['myth-plato'].category === 'philosophy', 'Plato moved to philosophy');
ok(ctx.PROMPT_BY_ID['arts-pixar'].category === 'popculture', 'Pixar moved to pop culture');
{
  const counts = Object.values(perCat);
  ok(Math.max(...counts) - Math.min(...counts) <= 10, 'categories stay roughly the same size: ' + counts);
}

ok(kind('pop-mcu', 'Iron Man 2') === 'hit', 'a numbered sequel scores');
ok(kind('pop-mcu', 'Iron Man 4') === 'miss', 'one that was never made does not');
ok(kind('pop-star-trek-series', 'Star Trek: Voyager') === 'hit', 'the franchise name is noise');
ok(kind('pop-star-trek-series', 'Star Trek') === 'ask', 'which Star Trek?');
ok(kind('pop-bond-films', 'Never Say Never Again') === 'miss', 'not an Eon film');
ok(kind('pop-disney-princesses', 'Elsa') === 'miss', 'Elsa is not in the lineup');
ok(kind('pop-spielberg', 'E.T.') === 'hit' && kind('pop-spielberg', 'ET') === 'hit', 'E.T. either way');
ok(kind('socsci-scotus-cases', 'Roe vs Wade') === 'hit', 'v. and vs. are the same');
ok(kind('socsci-econ-nobel', 'Diamond') === 'ask', 'which Diamond?');
ok(kind('socsci-econ-nobel', 'Keynes') === 'miss', 'Keynes died before the prize existed');
ok(kind('socsci-cognitive-biases', 'Confirmation bias') === 'hit', 'the word bias is noise');
ok(kind('socsci-generations', 'Gen X') === 'hit', 'Gen X is Generation X');
ok(kind('socsci-opec', 'Qatar') === 'miss', 'Qatar left OPEC');
ok(kind('mus-modes', 'Lydian') === 'hit', 'a mode scores');
ok(kind('mus-dynamics', 'ff') === 'hit', 'the abbreviation scores');
ok(J('mus-intervals', 'Minor third').index !== J('mus-intervals', 'Major third').index,
   'major and minor thirds are different intervals');
ok(kind('vis-classical-orders', 'Doric order') === 'hit', 'the word order is noise');
ok(kind('vis-classical-orders', 'Gothic') === 'miss', 'Gothic is not a classical order');
ok(kind('myth-pleiades', 'Electra') === 'hit', 'a Pleiad scores');
ok(J('myth-volsungs', 'Sigmund').index === J('myth-volsungs', 'Siegmund').index,
   'Sigmund and Siegmund are the same man');
ok(kind('phil-five-ways', 'Argument from motion') === 'hit', 'the argument-from prefix is noise');
ok(kind('phil-syllogisms', 'Barbara') === 'hit', 'the first syllogism scores');
ok(J('phil-syllogisms', 'Celarent').index !== J('phil-syllogisms', 'Celaront').index,
   'Celarent and Celaront are different moods');
ok(J('socsci-ocracies', 'Matriarchy').index !== J('socsci-ocracies', 'Patriarchy').index,
   'matriarchy and patriarchy stay apart');
ok(J('socsci-scripts', 'Linear A').index !== J('socsci-scripts', 'Linear B').index,
   'Linear A and Linear B stay apart');

console.log(`\n${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
