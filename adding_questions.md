# Adding questions to SIXTEEN

Everything you need to touch lives in **`assets/data.js`**. You do not need to
read or change `app.js` to add content.

The short version:

1. Write a prompt object and drop it into the `PROMPTS` array.
2. Optionally schedule it by adding its `id` to a day in `DAILY_SETS`.
3. Run `node tests/data.test.js`.

Step 2 is optional because **anything in `PROMPTS` is immediately live in
INFINITE mode**. Scheduling only controls whether it shows up as somebody's
DAILY puzzle.

---

## Contents

- [The file map](#the-file-map)
- [The prompt object](#the-prompt-object)
- [Writing the prompt text](#writing-the-prompt-text)
- [Writing the answers](#writing-the-answers)
- [What the matcher forgives for free](#what-the-matcher-forgives-for-free)
- [Typo tolerance, exactly](#typo-tolerance-exactly)
- [Half-answers: the three prompting mechanisms](#half-answers-the-three-prompting-mechanisms)
- [How a typed answer is judged](#how-a-typed-answer-is-judged)
- [Scheduling a day](#scheduling-a-day)
- [Adding a new category](#adding-a-new-category)
- [Checking your work](#checking-your-work)
- [Troubleshooting](#troubleshooting)
- [A complete worked example](#a-complete-worked-example)
- [Checklist](#checklist)

---

## The file map

| Location | What it holds |
|---|---|
| `assets/data.js:13` | `CATEGORIES` — the ten categories, their display names and emoji |
| `assets/data.js:29` | `SET_SIZE` — how many categories INFINITE draws per set |
| `assets/data.js:31` | `PROMPTS` — every prompt, grouped by category under banner comments |
| `assets/data.js:5299` | `DAILY_SETS` — the calendar, one array of five ids per day |
| `assets/data.js:5400` | `DAILY_EPOCH` — the local date that is day 1 |

Inside `PROMPTS`, find the banner comment for your category and add your prompt
there. The grouping is cosmetic — nothing breaks if a prompt is in the "wrong"
place — but keep it tidy.

```
GEOGRAPHY                 data.js:32
HISTORY                   data.js:601
LITERATURE                data.js:1221
SCIENCE                   data.js:1821
VISUAL ARTS & MUSIC       data.js:2324    the original arts- prompts, now split by category
MYTHOLOGY & PHILOSOPHY    data.js:2535    the original myth- and phil- prompts, now split
VISUAL ARTS               data.js:2756
MUSIC                     data.js:3186
MYTHOLOGY                 data.js:3552
PHILOSOPHY                data.js:3821
SOCIAL SCIENCE            data.js:4227
POP CULTURE               data.js:4700
```

The two older blocks predate the split. Each prompt in them carries its own
`category`, and its id keeps the old `arts-`, `myth-` or `phil-` prefix because
ids are never renamed. New prompts use the prefixes `vis-`, `mus-`, `myth-`,
`phil-`, `socsci-` and `pop-`, and go in the matching new block.

---

## The prompt object

```js
{
  id: 'geo-baltic',
  category: 'geography',
  prompt: 'Name as many countries that border the Baltic Sea as you can.',
  note: 'Nine.',
  answers: [
    'Denmark', 'Germany', 'Poland', 'Lithuania', 'Latvia', 'Estonia',
    'Russia|Russian Federation', 'Finland', 'Sweden',
  ],
}
```

| Field | Required | What it does |
|---|---|---|
| `id` | yes | Unique across all prompts. Convention: `category-topic`, kebab-case. Used by `DAILY_SETS` and saved into players' browsers, so **never rename an id** once it has been scheduled. |
| `category` | yes | A key of `CATEGORIES`: `geography`, `history`, `literature`, `science`, `visual`, `music`, `mythology`, `philosophy`, `socsci`, `popculture`. |
| `prompt` | yes | The question. Must end with the words **`as you can.`** — the test suite enforces it. |
| `note` | no | One short italic line under the question. Use it to state a count, resolve an ambiguity, or warn off a near-miss. |
| `answers` | yes | At least **five** entries. Each is `'Canonical\|alias\|alias'`. |
| `promptOn` | no | Extra half-answers to prompt on. See [below](#2-promptonmanual-override). |
| `noise` | no | Words every answer shares, stripped before matching. See [below](#3-noisethe-word-every-answer-shares). |

---

## Writing the prompt text

**Two shapes are allowed**, and the suite enforces it: the prompt must either end
with `as you can.` or be a direct question ending in `?`. Both read naturally
above a text box. `'Name five noble gases.'` fails the build.

**Vary the shape.** Two hundred prompts that all open "Name as many" read like a
spreadsheet. The library currently runs about 58% plain instruction, 30% direct
question, 12% lead-in, and the suite fails if any single three-word opening
exceeds 80% of all prompts. Pick whichever fits the subject:

```js
// Plain instruction — the workhorse.
prompt: 'Name as many oceanic trenches as you can.'

// Direct question — best when the set has a natural "which" or "who".
prompt: 'Which countries does the equator pass through?'
prompt: 'Who sailed with Jason aboard the Argo?'
prompt: 'What are the Seven Hills of Rome?'

// Lead-in and instruction — best when a fact makes the prompt land harder.
prompt: 'Twelve people have walked on the Moon. Name as many as you can.'
prompt: 'Five countries ring the Caspian Sea. Name as many as you can.'
prompt: 'Queen Victoria had nine children. Name as many as you can.'
```

A lead-in is also the natural place to put a count or a constraint that would
otherwise go in `note`. Keep it to one short sentence.

Beyond shape, three things make a prompt good:

**The answer list must be complete. This is the one hard rule.** A correct
answer must never be marked wrong, so every prompt asks for a set you can list
in full, every member of it. If you cannot be sure you have them all, the prompt
does not go in. Compare:

```js
// Closed: the list is the whole truth. A wrong answer is genuinely wrong.
prompt: 'Name as many of the Seven Hills of Rome as you can.'

// Open: a well-read player may name a real battle you did not list and eat -2.
// Not allowed, however long the list.
prompt: 'Name as many battles of the Napoleonic Wars as you can.'
```

Watch for the quieter ways a set leaks:

- **Fuzzy edges.** "Members of the Acropolis complex", "kinds of cadence",
  "logical connectives", "anyone who was ever a Beatle": each has a core
  everyone agrees on and a fringe nobody does. Narrow the prompt to the core
  (`'Five master painters frescoed the Sistine walls…'`) and keep the fringe as
  accepted extras if you like. Over-accepting is fine; under-accepting is not.
- **Lists that grow.** Prizes, filmographies, discographies and memberships
  change. Put the end year **in the prompt text itself**, not only in `note`
  (`'Who won the Turner Prize between 1984 and 2025?'`). The suite checks this
  for the award prompts.
- **Translations and variant lists.** Where sources disagree (the Seven Sages,
  Aristotle's virtues), accept every standard variant and say so in `note`.

**Say the count in `note` when the set is closed.** It tells the player when to
stop guessing, which is the heart of the game.

```js
prompt: 'Name as many of the fifteen republics of the former Soviet Union as you can.',
```

or

```js
note: 'Sixty-three of them.',
```

**Use `note` to pre-empt the obvious trap.** These both save a player from an
unfair −2:

```js
note: 'The Inca were Andean, not Mesoamerican.',
note: 'Rubens and Van Dyck were Flemish, not Dutch.',
```

---

## Writing the answers

Each entry is one pipe-separated string. **The first form is canonical** — it is
what the reveal screen shows and what the "already counted" message names. Every
later form is silently accepted.

```js
answers: [
  'Crime and Punishment',                                  // no aliases needed
  'Demons|The Possessed|The Devils|Besy',                  // alternate titles
  'One Hundred Years of Solitude|Cien años de soledad',    // translation
  'Franklin D. Roosevelt|Franklin Delano Roosevelt|FDR',   // shorthand
  'Zeus|Jupiter|Jove',                                     // equivalents
]
```

### At least five answers, always

Four answers makes a perfect sixteen unreachable, so the suite rejects it. Five
is the floor, not the target — if a set only has four members, pick a different
subject or widen it.

### What aliases are for

| Use an alias for | Example |
|---|---|
| Translated or original-language titles | `'The Magic Flute\|Die Zauberflöte'` |
| Genuinely alternate titles | `'The Rite of Spring\|Le Sacre du printemps'` |
| Transliterations | `'Hephaestus\|Hephaistos\|Vulcan'` |
| Common shorthands and initialisms | `'John F. Kennedy\|JFK'` |
| A bare surname that is unambiguous *in this prompt* | `'Thomas Cole\|Cole'` |
| Numeral styles | `'Henry VIII\|Henry 8\|Henry the Eighth'` |

### What aliases are *not* for

Do not add misspellings, capitalisations, accent-free spellings, or
punctuation variants. The matcher already handles all of those — see the next
section. Adding them by hand is noise, and two answers that share a normalised
key will fail the suite.

---

## What the matcher forgives for free

`norm()` (`assets/app.js:19`) folds both your answer keys and whatever the
player types through the same pipeline, so none of this needs aliases:

| Handled | Player types | Matches key |
|---|---|---|
| Case | `CRIME AND PUNISHMENT` | `crime and punishment` |
| Accents and diacritics | `cien anos de soledad` | `cien años de soledad` |
| Apostrophes, straight or curly | `A Doll's House`, `A Doll’s House` | `dolls house` |
| Punctuation of any kind | `The Brothers Karamazov!` | `brothers karamazov` |
| `&` → `and` | `Antony & Cleopatra` | `antony and cleopatra` |
| A leading article, English or otherwise | `traviata` | `la traviata` |
| Extra whitespace | `  Mount   Everest ` | `mount everest` |

The articles dropped from the front are: `the a an la le les il lo el los las
der die das l`. This is why `The Idiot` and `Idiot` are the same answer, and why
`La traviata` is stored as the key `traviata`.

> **Gotcha.** Article-stripping happens only at the *start* of the string. `Les
> Noces` becomes `noces`, but `Jeu de cartes` keeps its interior `de`.

---

## Typo tolerance, exactly

After exact matching fails everywhere, the matcher tries again allowing typos
(`assets/app.js:93`). The rules are strict and worth knowing:

| Key length (normalised) | Edits allowed |
|---|---|
| 7 characters or fewer | **none** |
| 8 to 13 characters | 1 |
| 14 or more | 2 |

Three consequences that surprise people:

**Short answers must be typed correctly.** `Sweden` normalises to six
characters, so `sweeden` is a plain miss. Same for `Thor`, `Agon`, `Neon`,
`Sula`. If a short answer has a common misspelling, add it as an explicit alias
— that is the one legitimate reason to alias a misspelling.

**A transposition costs two edits.** `Leaf Strom` does *not* match `Leaf Storm`
(10 characters, 1 edit allowed). Swapped letters are the most common real typo,
so for frequently-fumbled titles, add the fumble as an alias.

**Numerals must agree exactly** (`assets/app.js:83`). Digits and Roman numerals
are extracted from both strings and compared before any typo is forgiven:

```
Henry VI      → does NOT match Henry VII   (vi ≠ vii)
Vitamin B     → does NOT match Vitamin B1  ("" ≠ 1)
Vitamin B1    → does NOT match Vitamin B2  (1 ≠ 2)
Symphony No. 4 → does NOT match No. 5
```

This is deliberate: `Henry VI` is a real Lancastrian king, not a typo, and
crediting it would be wrong. Digits count even when glued to a letter, which is
what keeps `K2`/`K3`/`K4` and the B vitamins apart.

**Ties ask instead of guessing.** If a typo lands equally close to two different
answers, the player is asked to be more specific rather than given one of them.

---

## Half-answers: the three prompting mechanisms

A player who types `Henry` when the answer is `Henry VII` is neither right nor
wrong. The game asks them to be more specific: no slot is used, no points move,
and the text they typed stays in the box so they can finish it. Three mechanisms
produce that outcome.

### 1. Derived fragments (automatic — you do nothing)

`fragmentForms()` (`assets/app.js:140`) takes **every contiguous run of words
shorter than a whole answer** and makes it a prompt trigger. From
`'Henry VII'` and `'Henry VIII'` it derives `henry`. From
`'Crime and Punishment'` it derives `crime`, `punishment`, `crime and`, and
`and punishment`.

Two exclusions keep this honest:

- **A run that is itself somebody's complete answer is not a fragment.** This is
  why `Muon` scores as the lepton even though it also begins `Muon Neutrino`,
  and `Love` scores as the Morrison novel. Exact matches are always checked
  first.
- **A run of nothing but articles, prepositions and numerals is ignored**, so
  `of`, `the` and `VII` are plain misses rather than free passes. The stopword
  list is at `assets/app.js:121`.

You get all of this without writing anything. Check what it produced with
`node tests/try.js <id>`.

### 2. `promptOn` (manual override)

Fragments are substrings of answers, so a word that appears in **no** answer
cannot be derived. The classic case is a surname shared with a famous relative:

```js
{
  id: 'hist-died-in-office',
  prompt: 'Name as many U.S. presidents who died in office as you can.',
  promptOn: [
    { on: 'Roosevelt', say: 'Which Roosevelt?' },   // custom wording
    { on: 'Harrison', say: 'Which Harrison?' },
    'Adams',                                        // bare string = generic wording
  ],
  answers: [
    'Franklin D. Roosevelt|Franklin Delano Roosevelt|FDR',
    // note: no bare 'Roosevelt' alias — see below
  ],
}
```

Use `promptOn` for two things: **custom wording**, and **triggers the fragment
rule cannot see**.

> **Hard rule.** A `promptOn` trigger must not also be an accepted answer. Exact
> answers are matched *before* declared prompts, so a colliding trigger could
> never fire. The suite fails with *"promptOn X is also an accepted answer, so it
> can never fire"*. If you want `Roosevelt` prompted, remove it from the alias
> list.

### 3. `noise` (the word every answer shares)

In a prompt about national parks, the words *National Park* identify nothing.
Rather than alias all 63 parks twice, declare the shared phrase:

```js
{
  id: 'geo-national-parks',
  prompt: 'Name as many U.S. national parks as you can.',
  noise: ['National Park'],
  answers: ['Acadia', 'Arches', 'Yellowstone', 'Grand Canyon', /* ... */],
}
```

The phrase is stripped from **both** the answer keys and the typed response, so
`Yellowstone` and `Yellowstone National Park` become the same answer. Prompts in
the repo using this: `Trench`, `Plate`, `Lake`, `Mountains`, `Cathedral`,
`Strait of`, `Operation`, `Conference`.

Three details:

- A response made of **nothing but noise** (`National Park`, `Lake`, `Strait`)
  is treated as under-specified and prompted, not penalised.
- Longer phrases are stripped first, so `['Mountain Range', 'Mountains', 'Range']`
  behaves sensibly.
- Stripping **never empties an answer**. If it would, the unstripped form is kept
  as the key, and the suite verifies every answer in every prompt retains at
  least one key.

Declare `noise` when a word appears in most answers *and* players will type it
inconsistently. Do not declare it for a word that distinguishes answers —
`noise: ['Lake']` would be wrong in a prompt where both `Lake Erie` and `Erie,
Pennsylvania` were answers.

---

## How a typed answer is judged

`judge()` (`assets/app.js:198`) decides in this order. The order is the whole
design — earlier rules win.

1. Empty after normalisation → **miss**
2. Nothing but declared `noise` → **ask**
3. Exact match on any answer key → **hit** *(this is why a complete answer always beats a fragment reading)*
4. Matches a `promptOn` trigger → **ask**, with your wording if you supplied one
5. Matches a derived fragment → **ask**
6. Typo-matches two answers equally well → **ask**
7. Typo-matches one answer → **hit**
8. Typo-matches a fragment → **ask**
9. Otherwise → **miss**, costing 2 points

A repeat of an answer already given is caught separately, in the UI: it is
reported as already counted and does not consume one of the five slots.

---

## Scheduling a day

`DAILY_SETS` (`assets/data.js:5299`) is an array of days. Each day is five
prompt ids, **no category twice**:

```js
const DAILY_SETS = [
  ['geo-afghanistan', 'hist-died-in-office', 'lit-dostoevsky', 'sci-noble-gases', 'arts-stravinsky-ballets'],
  // ...
  ['geo-african-island-nations', 'hist-fifth-republic', 'sci-carpals', 'socsci-mbti', 'pop-pink-floyd'],
];
```

Day *N* uses set `(N − 1) % DAILY_SETS.length`, so the calendar cycles once it
runs out. Day 1 is `DAILY_EPOCH`, currently `[2026, 9, 3]` — note the month is
**zero-based**, so that is 3 October 2026.

The 97 days written so far use every prompt in the library exactly once, so
any prompt you add is unscheduled until you give it a day. Days 1 and 2 are the
originals; the rest were laid out so that each category turns up at least every
five days, every pair of categories meets regularly, and no day carries more
than two giant (30+ answer) lists. New days should keep that spread; the suite
enforces only "five distinct categories".

> **Append; do not reorder.** A finished DAILY is cached in the player's browser
> along with the prompt ids they saw. Rearranging existing days means a player
> resuming mid-puzzle sees their saved prompts while a friend starting fresh sees
> different ones. Changing `DAILY_EPOCH` shifts the entire calendar for everyone.

Unscheduled prompts are not wasted — they feed INFINITE. To see what is
available, run:

```sh
node tests/try.js --list geography
```

and look for ids reported as `Infinite only` by `node tests/try.js <id>`.

### How INFINITE picks

`infinitePromptIds()` draws `SET_SIZE` (five) distinct categories uniformly at
random from all ten in `CATEGORIES` and shows them in the order `CATEGORIES`
lists them. Every category therefore appears in exactly half of all sets. It
then picks one prompt per category at random, holding back everything the
player has seen recently.

That holdback is `RECENT_MEMORY`, which scales with the library
(`Math.max(25, Math.round(PROMPTS.length * 0.8))`, 388 at 485 prompts). The
practical effect: typically about eighty consecutive sets before anything
repeats, and the suite insists on at least fifty-five. Keep the categories roughly the same size (the suite allows a
spread of ten prompts), because a small category runs out of fresh prompts
first. **Every prompt you add widens that window
automatically**, and you register nothing for a prompt to appear here.

---

## Adding a new category

Two edits:

1. Add an entry to `CATEGORIES` (`assets/data.js:13`) with a `name` and an
   `icon` emoji. The icon appears in the UI and in the shareable result squares.
   INFINITE picks it up automatically. With eleven categories, each one would
   appear in 5/11 of sets instead of half, and the suite's 50% check needs
   loosening to match.
2. Add CSS if you want it coloured differently — not required.

> **Gotcha.** The suite asserts every category in `CATEGORIES` has at least 35
> prompts, and that the largest and smallest categories differ by no more than
> ten. A new category needs about as many prompts as the others before it can
> ship. Write the prompts first, or relax those checks deliberately.

---

## Checking your work

### Inspect one prompt

```sh
node tests/try.js geo-seven-summits
```

```
🗺️  Geography   [geo-seven-summits]
"Name as many of the Seven Summits as you can."
note: The highest peak on each continent; two lists disagree about Oceania.
scheduled: day 21

8 answers (canonical → match keys):
  Mount Everest                          mount everest | everest
  Aconcagua                              aconcagua
  Denali                                 denali | mount mckinley
  ...

7 derived fragments (these ask for a fuller answer):
  carstensz · jaya · massif · mckinley · mount · puncak · pyramid
```

This is the fastest way to see what your aliases actually became and what will
prompt.

### Rule specific answers

Pass answers as extra arguments:

```sh
node tests/try.js sci-vitamins "Vitamin B" "Thiamine" "Vitamin B1" "vitamin b4"
```

```
? ASK   "Vitamin B"                Which B vitamin?
         normalised: "vitamin b"
✓ HIT   "Thiamine"                 Thiamine
         normalised: "thiamine"
✓ HIT   "Vitamin B1"               Thiamine
         normalised: "vitamin b1"
✕ MISS  "vitamin b4"               wrong — costs 2 points
         normalised: "vitamin b4"
```

Always try: the canonical form, every alias, a plausible half-answer, a
plausible wrong answer, and a typo.

### Run the suites

```sh
node tests/data.test.js     # content and matching rules
node tests/play.test.js     # a full five-prompt game against a fake DOM
```

`data.test.js` enforces, across every prompt:

| Check | Why |
|---|---|
| Unique `id`, valid `category` | Structural |
| Prompt text ends `as you can.` | Consistent voice |
| At least five answers | A perfect sixteen must be reachable |
| No two answers share a normalised key | Otherwise one shadows the other |
| Every accepted form of every answer scores as **itself** | Catches an answer hidden by another answer's fragment |
| No `promptOn` trigger is also an answer | It could never fire |
| No answer loses all keys to `noise` | Stripping went too far |
| Each day: five ids that exist, five distinct categories | Calendar integrity |
| Dozens of known-wrong answers still miss | No leniency rule turns misses into credit |
| No three-word opening used by more than 80% of prompts | Keeps the writing varied |
| At least 20 question-form prompts and 15 with lead-ins | Same |
| Every category has at least 35 prompts, all within ten of each other | Infinite never leans on a thin category |
| Every category appears in about half of Infinite sets | The draw is uniform |
| Infinite runs 75+ sets without repeating a prompt | The library is deep enough to feel bottomless |

It also prints `WARN` lines for answer pairs close enough that a typo on one
could reach the other. A warning is not a failure — exact matching runs first and
equidistant inputs prompt — but if you see a new one, add an assertion proving
the two resolve to different answers, the way the existing ones do for
`north/south carolina` and the vitamins.

---

## A complete worked example

Say you want a Baltic Sea prompt.

**1. Write it** and paste it into the geography block of `PROMPTS`:

```js
  {
    id: 'geo-baltic',
    category: 'geography',
    prompt: 'Name as many countries that border the Baltic Sea as you can.',
    note: 'Nine.',
    answers: [
      'Denmark', 'Germany', 'Poland', 'Lithuania', 'Latvia', 'Estonia',
      'Russia|Russian Federation', 'Finland', 'Sweden',
    ],
  },
```

Nine answers, closed set, count stated, ends with `as you can.`

**2. Inspect it:**

```sh
$ node tests/try.js geo-baltic

🗺️  Geography   [geo-baltic]
"Name as many countries that border the Baltic Sea as you can."
note: Nine.
scheduled: Infinite only

9 answers (canonical → match keys):
  Denmark                                denmark
  Russia                                 russia | russian federation
  ...

2 derived fragments (these ask for a fuller answer):
  federation · russian
```

Sensible: `Russian` alone will ask for more, everything else is a single word.

**3. Try some answers:**

```sh
$ node tests/try.js geo-baltic "Sweden" "sweeden" "Russian Federation" "Norway" "Baltic"

✓ HIT   "Sweden"                   Sweden
✕ MISS  "sweeden"                  wrong — costs 2 points
✓ HIT   "Russian Federation"       Russia
✕ MISS  "Norway"                   wrong — costs 2 points
✕ MISS  "Baltic"                   wrong — costs 2 points
```

`Norway` correctly misses — it borders the North Sea, not the Baltic. But
`sweeden` missing is a judgement call: `sweden` is six characters, under the
typo threshold. If you think that spelling is common enough to forgive, alias
it explicitly:

```js
'Sweden|Sweeden',
```

**4. Schedule it** (optional) by appending a new day to `DAILY_SETS`, alongside
four other new prompts from other categories (every existing prompt already has
a day):

```js
  ['geo-baltic', 'socsci-big-five', 'pop-muppets', 'arts-les-six', 'phil-razors'],
```

Check for category clashes — that line is geography, social science, pop
culture, music (`arts-les-six` is a music prompt despite its prefix) and
philosophy. Good.

**5. Run the suites:**

```sh
$ node tests/data.test.js
prompts: 486, categories covered: 10
…
<n>/<n> checks passed
```

Done.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `FAIL: <id> has only 4 answers` | Fewer than five | Add answers or drop the prompt |
| `FAIL: <id> prompt phrasing` | Text does not end `as you can.` | Reword |
| `FAIL: key "x" claimed by two answers` | Two answers normalise identically | Make one more specific, or merge them into one entry with aliases |
| `FAIL: <id>: "key" (Answer) judged ask` | An answer is shadowed by another answer's fragment | Rare. Usually means two answers overlap confusingly; rename the canonical or drop the colliding alias |
| `FAIL: promptOn "x" is also an accepted answer` | Contradiction | Remove `x` from the alias list, or drop the `promptOn` entry |
| `FAIL: "Answer" lost all its keys to noise stripping` | A `noise` phrase swallowed a whole answer | Narrow the noise phrase |
| `FAIL: day N repeats a category` | Two prompts in one day share a category | Swap one out |
| `FAIL: <cat> should carry its weight` | A category has under 15 prompts | Write more, or relax the assertion |
| A correct answer is rejected in play | Not in your list, or short with a typo | Add it as an alias |
| Everything a player types asks for specificity | A `noise` phrase is too aggressive, or answers are long and overlapping | Run `node tests/try.js <id>` and read the fragment list |
| A wrong answer is accepted | Typo tolerance crossed to a neighbour | Check for a `WARN` pair; consider renaming the canonical form or splitting the prompt |
| New `WARN` line appears | Two answers are within typo range | Verify with `try.js` that both still resolve correctly, then add a distinctness assertion |

---

## Checklist

Before you commit:

- [ ] `id` is unique and will never be renamed
- [ ] `category` is a real key of `CATEGORIES`
- [ ] Prompt text ends with `as you can.` or is a question ending in `?`
- [ ] Its shape is not the same as the last five prompts you wrote
- [ ] Five answers minimum, and **every** correct answer listed: no open-ended sets
- [ ] A list that can grow (prizes, filmographies, memberships) names its end year in the prompt
- [ ] `note` states the count for a closed set, or warns off the obvious trap
- [ ] Aliases cover translations, alternate titles and shorthands — not spellings
- [ ] Short answers (7 characters or fewer) that are easy to misspell have explicit aliases
- [ ] `node tests/try.js <id>` shows the keys and fragments you expected
- [ ] You tried a half-answer, a wrong answer and a typo through `try.js`
- [ ] `node tests/data.test.js` passes, with no new unexplained `WARN`
- [ ] `node tests/play.test.js` passes
- [ ] If scheduled: appended a new day, did not reorder existing ones
