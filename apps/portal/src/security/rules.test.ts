/* ═════════════════════════════════════════════════ rules regression guard
 *
 * What this is: a static read of firestore.rules that asserts the two
 * privilege boundaries which everything else in this system rests on.
 *
 * What it is NOT: a behavioural test of the rules. That needs the Firestore
 * emulator (@firebase/rules-unit-testing), which needs a JVM, which is not
 * on every machine this repo is cloned onto — so it cannot be the thing
 * standing between a bad edit and production. This runs in the ordinary
 * `npm test` on any machine, in milliseconds, with no services.
 *
 * It is worth having because both failures it checks for were once real, and
 * both were *quiet*: the file read exactly as intended, the app behaved
 * correctly for every role, and the hole was only visible by asking "what
 * would this rule allow someone to write?" rather than "what does the UI do?"
 * A grep-shaped test is a poor substitute for an emulator and a good
 * substitute for remembering.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RULES = readFileSync(resolve(__dirname, '../../../../firestore.rules'), 'utf8');

/** The body of a `match /path/{x} { ... }` block, brace-balanced.
 *
 *  The path itself contains braces — `match /roles/{uid} {` — so the block
 *  opener is the trailing brace at the end of the match line, not the first
 *  brace after the keyword. */
function matchBlock(path: string): string {
  const head = RULES.indexOf(`match /${path}`);
  expect(head, `no match block for /${path}`).toBeGreaterThan(-1);
  const lineEnd = RULES.indexOf(String.fromCharCode(10), head);
  const open = RULES.lastIndexOf('{', lineEnd);
  let depth = 0;
  for (let i = open; i < RULES.length; i++) {
    if (RULES[i] === '{') depth++;
    else if (RULES[i] === '}' && --depth === 0) return RULES.slice(open + 1, i);
  }
  throw new Error(`unbalanced braces in /${path}`);
}

/** Statements granting `verb`, with comments stripped so prose never counts. */
function allowsFor(block: string, verb: string): string[] {
  return block
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .join('\n')
    .split(/allow\s+/)
    .slice(1)
    // The verbs of `allow create, update:` are the words before the colon.
    .filter((s) => s.slice(0, s.indexOf(':')).split(',').map((w) => w.trim()).includes(verb))
    .map((s) => s.slice(0, s.indexOf(';') === -1 ? undefined : s.indexOf(';')));
}

/* The roles collection is deliberately self-service: the header's role
 * switcher lets a signed-in user set their own role, which is how all three
 * roles are demonstrated from one browser. There are therefore no assertions
 * about role elevation here — it is open by choice, not by oversight. */

describe('dispatches — raw field records are not readable by every account', () => {
  const block = matchBlock('dispatches/{dispatchId}');

  it('does not grant read on authentication alone', () => {
    // `allow read: if request.auth != null;` is the specific regression.
    // Sign-in is open Google auth, so that grants the world the scientist's
    // raw notes, the field party, sample ids and incident reports.
    for (const branch of allowsFor(block, 'read')) {
      const condition = branch.slice(branch.indexOf('if') + 2).trim();
      expect(condition).not.toMatch(/^request\.auth\s*!=\s*null$/);
      expect(condition).toMatch(/authorUid|isPublisher\(\)|isAdmin\(\)/);
    }
  });

  it('scopes reads to the author or a reviewer', () => {
    const read = allowsFor(block, 'read').join('\n');
    expect(read).toMatch(/resource\.data\.authorUid\s*==\s*request\.auth\.uid/);
    expect(read).toMatch(/isPublisher\(\)/);
    expect(read).toMatch(/isAdmin\(\)/);
  });
});

describe('role lookups go through the null-safe helper', () => {
  it('has no inline roles/ get() left outside roleOf()', () => {
    // An inline get() on a missing roles document aborts rule evaluation
    // rather than reading as "no privileges", which is how a new sign-up
    // turns into a confusing denial somewhere unrelated.
    const inline = RULES.split('\n').filter(
      (l) => /get\(.*documents\/roles\//.test(l) && !/exists\(/.test(l)
    );
    // The single permitted occurrence is the ternary body inside roleOf().
    expect(inline.length, `inline role lookups: ${inline.join(' | ')}`).toBeLessThanOrEqual(1);
  });
});
