# SIXTEEN

A daily quiz bowl game. Five prompts a day, each from a different category, five answers apiece.

Correct answers compound — **1, 2, 4, 8, 16** points — and every miss costs **2**.
Three right and two wrong nets zero, so knowing when to stop is the game.
Eighty points is a perfect day.

There are ten categories: geography, history, literature, science, visual arts,
music, mythology, philosophy, social science and pop culture. Most of it is the
canon that actually shows up at an NAQT tournament, with pop culture for a
lighter turn. Each set of five draws its categories at random, so any one
category turns up in exactly half of all sets.

## A day's worth of prompts

> 🗺️ **Geography** — Fourteen mountains rise above 8,000 metres. Name as many as you can.
>
> 🏛️ **History** — Twelve people have walked on the Moon. Name as many as you can.
>
> 📖 **Literature** — Which authors are better known by a pen name?
>
> 🔬 **Science** — Euler put his name on a staggering amount of mathematics. Name as many things named after him as you can.
>
> 🎨 **Visual Arts** — Raphael crowded dozens of thinkers onto one wall of the Vatican. Which philosophers appear in The School of Athens?

Other days bring 🎼 **Music**, 🏺 **Mythology**, 🦉 **Philosophy**, 📊 **Social
Science** or 🎬 **Pop Culture** in place of some of these.

Prompts come in three shapes — a direct question, a lead-in and an instruction,
or the plain "name as many" form — and ask for all sorts of things: the
movements of a suite, the cast of a painting, the stages of a process, the
tellers of the Canterbury Tales, things named after Euler, oceanic trenches,
metrical feet, Yoruba orishas, codenamed military operations, unsolved problems
in mathematics, books that were never finished, and countries that no longer
exist.

## Modes

- **Daily** — the same five prompts for everyone, keyed to the calendar date.
  Progress is saved, so you can finish later, and the results screen gives you a
  spoiler-free block of squares to copy and share.
- **Infinite** — a freshly assembled set of five, as often as you like. Recently
  seen prompts are held back in proportion to the size of the library, so you can
  typically play about eighty consecutive sets (some 400 prompts) before anything
  repeats.

Everything is stored in `localStorage` on your own device. There is no backend,
no network request, and no build step.

## Running it locally

```sh
python3 -m http.server 8777    # then open http://localhost:8777
```

Opening `index.html` directly from the filesystem works too.

## Deploying to GitHub Pages

**As your user site** (`https://<USER>.github.io`) — put these files at the root of a
repo named `<USER>.github.io` and push to `main`.

**As a project site** (`https://<USER>.github.io/sixteen/`):

```sh
git add -A && git commit -m "SIXTEEN"
git remote add origin git@github.com:<USER>/sixteen.git
git push -u origin main
```

Then in the repo: **Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)`**.
All paths are relative, so the app works from any subdirectory. The `.nojekyll`
file keeps Pages from running the files through Jekyll.

## Adding more days

> Writing prompts is documented in full in **[adding_questions.md](adding_questions.md)**
> — field reference, how answer matching and prompting work, the rules the test
> suite enforces, and a worked example. What follows is the summary.


`assets/data.js` holds everything: 485 prompts over ten categories, 44 to 54
apiece, and ninety-seven authored days that use every prompt exactly once. Day 98
wraps back to day 1's set, so the calendar cycles until you add more. Every
prompt's answer list is complete: a correct answer is never marked wrong.

A prompt looks like this:

```js
{
  id: 'geo-danube',
  category: 'geography',            // see CATEGORIES
  prompt: 'Name as many countries through which the Danube River flows as you can.',
  note: 'Ten countries, more than any other river.',   // optional
  answers: [
    'Germany',
    'France|French Guiana',         // first form is canonical, rest are accepted
  ],
}
```

Answer matching lowercases, strips accents and punctuation, drops leading
articles (`the`, `la`, `il`, `der`, …), and forgives a single typo on longer
answers — but never across differing regnal numbers, so *Henry VI* is not
accepted for *Henry VII*. Aliases exist for translations, alternate titles,
and shorthands, not for misspellings.

### Half-stated answers are prompted

Say *Henry* when the answer is *Henry VII* and the game neither credits nor
penalises you: it asks for a more specific answer, keeps what you typed so you
can finish it, and spends none of your five slots. This is the moderator's
"prompt on partial answer," and it is derived automatically — every contiguous
run of words shorter than a whole answer becomes a prompt trigger, so *Crime*,
*Notes*, *Thomas*, *neutrino* and *Alpha* all ask rather than score. A run that
is somebody's complete answer is excluded, which is why *Muon* scores as the
lepton and *Love* as the Toni Morrison novel even though both also begin a
longer answer. Runs made only of articles, prepositions and numerals are
ignored, so *of* and *VII* are plain misses.

Nothing is required of you to get this. Add `promptOn` only to override the
generic wording, or to catch a fragment the rule cannot derive — a surname
shared with a famous relative, say, where the word appears in no answer at all:

```js
promptOn: [
  { on: 'Roosevelt', say: 'Which Roosevelt?' },
  'Harrison',                                   // bare string uses the generic wording
],
```

A `promptOn` trigger must not also be an accepted answer, or it could never
fire — the test suite rejects that contradiction. So if you want *Roosevelt*
prompted, remove it from the alias list.

### Noise: the word every answer shares

In a prompt about national parks, the words *National Park* identify nothing, so
listing both `Yellowstone` and `Yellowstone National Park` as aliases sixty-three
times would be waste. Declare the shared phrase instead:

```js
noise: ['National Park'],
```

The phrase is stripped from the answer keys and from whatever the player types,
so the two forms become one, and a response made of nothing but noise
(`National Park`, `Lake`, `Strait`) is treated as under-specified and prompted
rather than penalised. Several prompts use it: `Trench`, `Plate`, `Lake`,
`Mountains`, `Cathedral`, `Strait of`, `Operation`, `Conference`. Stripping never
empties an answer — the test suite checks every answer in every prompt keeps at
least one key.

A day is five prompt ids, no two from the same category:

```js
const DAILY_SETS = [
  ['geo-afghanistan', 'hist-died-in-office', 'lit-dostoevsky', 'sci-noble-gases', 'arts-stravinsky-ballets'],
  // append a new array for day 3, day 4, …
];
```

Give every prompt **at least five accepted answers**, or a perfect sixteen is
unreachable. The test suite enforces that.

## Tests

No dependencies — plain Node.

```sh
node tests/data.test.js    # prompt data integrity, answer matching, scoring, calendar
node tests/play.test.js    # a full five-prompt playthrough against a fake DOM
```

There is also an authoring helper, which inspects a single prompt or shows how it
rules on answers you type:

```sh
node tests/try.js geo-seven-summits
node tests/try.js sci-vitamins "Vitamin B" "Thiamine" "vitamin b4"
node tests/try.js --list literature
```

`data.test.js` checks that every prompt has five answers, that no two answers in
one prompt share a match key, that daily sets never repeat a category, and that
no answer is shadowed by another answer's fragment — every accepted form of
every answer in every prompt is replayed through the matcher and must score as
itself. It also asserts that a few dozen plausible-but-wrong answers still cost
you two points, so no leniency rule quietly turns misses into credit.
`play.test.js` plays a day end to end — duplicates, passes, early locks, the
share string, stats, and mid-puzzle resume.

## Layout

```
index.html             markup and modals
assets/styles.css      styles
assets/data.js         categories, prompts, daily sets  ← edit this to add content
assets/app.js          matching, scoring, rendering, storage
tests/data.test.js     content and matching rules
tests/play.test.js     a full game against a fake DOM
tests/try.js           authoring helper: inspect a prompt, rule an answer
adding_questions.md    how to write prompts and answers
```
