import type { Metadata } from 'next';
import Link from 'next/link';
import { STRICTNESS } from '@/lib/answers';
import { CATEGORIES } from '@/lib/categories';
import { MAX_ANSWERS, MIN_ANSWERS } from '@/lib/prompts';
import { PLAYTHROUGH_THRESHOLD } from '@/lib/rating';
import { MAX_ENTRIES } from '@/lib/scoring';
import styles from '../guide.module.css';

export const metadata: Metadata = {
  title: 'Writing prompts · SIXTEEN',
  description: 'How to write and add good SIXTEEN prompts.',
};

const example = `[
  {
    "category": 1,
    "text": "US presidents whose first name was John",
    "note": "Only people who served as president",
    "authorScore": 6,
    "answers": [
      { "canonical": "John Adams", "aliases": [], "rejects": ["John Quincy Adams"] },
      { "canonical": "John Quincy Adams", "aliases": ["JQA"] },
      { "canonical": "John Tyler", "aliases": [] },
      { "canonical": "John F. Kennedy", "aliases": ["JFK", "Kennedy"] },
      { "canonical": "Calvin Coolidge", "aliases": [], "prompts": ["Coolidge"], "ask": "Which Coolidge? (full name)" }
    ]
  }
]`;

/** Public, so it can be shared with anyone; only admins can add prompts. */
export default function PromptGuidePage() {
  return (
    <main className={styles.page}>
      <p className={styles.muted}>SIXTEEN</p>
      <h1>Writing prompts</h1>
      <p>
        A prompt asks players to name things from a list, like “Countries that border Bolivia”. Players get{' '}
        {MAX_ENTRIES} guesses. Their score doubles with each right answer (1, 2, 4, 8, 16 points), and wrong guesses
        take points away the same way. Only admins can add prompts, from the{' '}
        <Link href="/admin/add-prompt">admin portal</Link>.
      </p>

      <section className={styles.checklist} aria-labelledby="tldr">
        <h2 id="tldr" style={{ marginTop: 0 }}>
          TL;DR: check every prompt before you upload
        </h2>
        <ol>
          <li>
            It has <strong>
              {MIN_ANSWERS}–{MAX_ANSWERS} answers
            </strong>
            , every one <strong>objectively correct</strong>, and the list is <strong>complete</strong>. A correct
            guess that isn’t on your list counts as a miss.
          </li>
          <li>
            The <strong>note never contains an accepted answer</strong>. Use it to say what <em>doesn’t</em> count.
          </li>
          <li>
            Every answer has the <strong>aliases</strong> players will really type: short forms, other spellings, and
            the name without a leading “The”.
          </li>
          <li>
            Answers that could be confused have <strong>prompt or reject lines</strong> (John Adams vs. John Quincy
            Adams).
          </li>
          <li>
            The <strong>author score</strong> is your honest guess of the points an average player scores (0–16; higher
            means easier).
          </li>
          <li>
            You uploaded each prompt <strong>once</strong>. If some fail, fix only those; the rest are already in.
          </li>
        </ol>
      </section>

      <h2>1. Choosing a prompt</h2>
      <ul>
        <li>
          Pick a list with a clear, factual boundary: “Noble gases”, not “Great novels”. If two knowledgeable people
          could disagree about whether something belongs, tighten the wording or use the note.
        </li>
        <li>
          It needs between {MIN_ANSWERS} and {MAX_ANSWERS} answers. Fewer answers make a prompt harder (players run out
          of things to name); more make it easier.
        </li>
        <li>
          List <strong>every</strong> correct answer. The game can only accept what is on your list.
        </li>
        <li>Pick the category the prompt is mainly about:</li>
      </ul>
      <div className={styles.tableWrap}>
        <table>
          <tbody>
            {CATEGORIES.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.icon} {c.name}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>2. The note</h2>
      <p>
        The note is optional and is shown with the prompt. Use it for grey areas, for example “Only current members”
        or “Not including dwarf planets”. It must <strong>never</strong> contain an accepted answer or alias; uploads
        that do are rejected.
      </p>

      <h2>3. The author score</h2>
      <p>
        Your estimate of how many points an average player will score, from 0 (almost nobody gets anything) to 16
        (most people name five). It helps build balanced sets, where a hard prompt is offset by an easy one.
      </p>
      <p>
        Until a prompt has been played {PLAYTHROUGH_THRESHOLD} times, its difficulty is 60% your author score and 40%
        an estimate from how many answers it has. After that, real results take over (75%), so an honest guess
        matters most early on.
      </p>

      <h2>4. Answers</h2>
      <p>Each answer has up to five parts. Only the first is required.</p>
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>Part</th>
              <th>What it’s for</th>
              <th>Example</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Answer</td>
              <td>The name shown when answers are revealed. Players who type it are accepted.</td>
              <td>John F. Kennedy</td>
            </tr>
            <tr>
              <td>Aliases</td>
              <td>Other forms that are just as correct.</td>
              <td>JFK; Kennedy</td>
            </tr>
            <tr>
              <td>Prompt on</td>
              <td>
                Forms that are on the right track but not specific enough. The player is asked for more, at no cost,
                up to two times.
              </td>
              <td>Coolidge</td>
            </tr>
            <tr>
              <td>Directed prompt</td>
              <td>Optional question shown with that prompt, instead of a generic “Prompt”.</td>
              <td>Which Coolidge? (full name)</td>
            </tr>
            <tr>
              <td>Reject</td>
              <td>Forms that must never count for this answer. Matched exactly (ignoring case and accents).</td>
              <td>John Quincy Adams</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className={styles.muted}>In the form, separate several aliases, prompts or rejects with a semicolon (;).</p>

      <h3>What the game already handles</h3>
      <p>
        Answer checking uses qbreader’s{' '}
        <a href="https://github.com/qbreader/qb-answer-checker">qb-answer-checker</a>, so you don’t need aliases for:
      </p>
      <ul>
        <li>capital letters, accents and punctuation (“antonin dvorak” matches Antonín Dvořák);</li>
        <li>initials of the whole answer (“JQA”), numerals (“Henry 8”), and common forms like “WW2”;</li>
        <li>hyphens vs. spaces (“jean paul sartre”);</li>
        <li>
          small typos: roughly one per {STRICTNESS} letters of a word. Short words must be exact, so “Pairs” is not
          Paris;
        </li>
        <li>word order (“Zedong Mao”);</li>
        <li>extra words before or after the answer (“the Mississippi River delta”).</li>
      </ul>

      <h3>What you need to add yourself</h3>
      <ul>
        <li>
          <strong>Surnames and short forms.</strong> The whole answer is required, so “Kennedy” only counts if it’s an
          alias. Decide whether a short form is an alias (clearly enough) or a prompt (needs more).
        </li>
        <li>
          <strong>A leading “The”.</strong> “Great Gatsby” is not accepted for “The Great Gatsby” unless you add it as
          an alias.
        </li>
        <li>
          <strong>Look-alike answers.</strong> Extra words <em>inside</em> an answer are never accepted, so “John Quincy
          Adams” is not John Adams. Rejects are still useful for misspellings you want to rule out exactly.
        </li>
        <li>
          <strong>Parentheses.</strong> Text in parentheses is ignored when checking, so “Georgia (country)” and
          “Georgia (US state)” both match just “georgia”. Use them for the reveal, and give each a distinguishing
          alias.
        </li>
      </ul>

      <h3>When a guess fits more than one answer</h3>
      <p>
        Players always get the benefit of the doubt. A guess that fits several answers is matched so that as many of
        the player’s guesses count as possible, preferring the closest fit (longer match, then exact over a typo),
        then alphabetical order. A guess left with no unused answer is ignored, not counted as a miss.
      </p>

      <h2>5. Adding them</h2>
      <ol>
        <li>
          Open <Link href="/admin/add-prompt">Add prompts</Link> in the admin portal.
        </li>
        <li>Fill in the form, adding as many prompts as you like, or paste JSON to fill it in for you.</li>
        <li>
          Check each one against the TL;DR above, then upload. Prompts that pass are added; any that fail stay in the
          form with their errors. Fix and upload only those.
        </li>
      </ol>
      <p>Pasted JSON looks like this:</p>
      <pre>{example}</pre>
      <p className={styles.muted}>
        <code>note</code>, <code>prompts</code>, <code>ask</code> and <code>rejects</code> are optional. Categories are
        numbered 0–9 in the order listed above.
      </p>
    </main>
  );
}
