/**
 * Grants a portal role. This is the bootstrap path firestore.rules points at.
 *
 * Why it has to exist outside the app: privilege in this system is granted,
 * never claimed. `roles/{uid}` lets a signed-in user write exactly one value
 * for themselves — 'scientist' — and every elevation above that is gated on
 * isAdmin(). That is the correct shape, and it has one consequence: a project
 * with no admins cannot produce its first one from inside the app, by design.
 * There is deliberately no in-band escape hatch, because an in-band escape
 * hatch is the vulnerability this replaced.
 *
 * So the first admin is seeded here, with the Firebase CLI's own owner
 * credentials, which operate above the rules (see lib/firebase-rest.mjs).
 * Being able to run this means you already control the project.
 *
 *   node scripts/set-role.mjs <uid|email> <scientist|publisher|admin>
 *
 * Examples:
 *   node scripts/set-role.mjs aBc123... admin
 *   node scripts/set-role.mjs someone@example.com publisher
 *
 * An email is resolved to a UID through Identity Toolkit, because the person
 * doing the granting knows who someone is, not what their UID is. The account
 * must have signed in to the portal at least once before it can be found.
 */

import { accessToken, writeDoc, PROJECT } from './lib/firebase-rest.mjs';

const ROLES = ['scientist', 'publisher', 'admin'];
const NEWLINE = String.fromCharCode(10);

/** UID for an email address, or null if that account has never signed in. */
async function uidForEmail(email, token) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ email: [email] }),
    },
  );
  if (!res.ok) {
    // Not every project exposes this admin endpoint — a project still on
    // legacy Firebase Auth, rather than upgraded to Identity Platform,
    // answers 400 here. That is a limitation of the convenience path, not a
    // problem with the role grant, so say so and point at the UID instead of
    // failing with a bare status code.
    const body = await res.text();
    const err = new Error(
      `Could not resolve ${email} to a UID (HTTP ${res.status}).` + NEWLINE +
      body.trim().slice(0, 400) + NEWLINE + NEWLINE +
      'Pass the UID directly instead — this always works:' + NEWLINE +
      '  node scripts/set-role.mjs <uid> ' + '<role>' + NEWLINE + NEWLINE +
      'Find the UID in the portal under Manage roles ("Your own UID"), or in' + NEWLINE +
      'the Firebase console under Authentication -> Users.',
    );
    err.expected = true;
    throw err;
  }
  const { users } = await res.json();
  return users?.[0]?.localId ?? null;
}

async function main() {
  const [who, role] = process.argv.slice(2);

  if (!who || !role) {
    console.error('Usage: node scripts/set-role.mjs <uid|email> <scientist|publisher|admin>');
    process.exit(2);
  }
  if (!ROLES.includes(role)) {
    console.error(`Unknown role "${role}". Expected one of: ${ROLES.join(', ')}`);
    process.exit(2);
  }

  const token = await accessToken();

  let uid = who;
  if (who.includes('@')) {
    uid = await uidForEmail(who, token);
    if (!uid) {
      console.error(
        `No account for ${who}. They need to sign in to the portal once before a role can be granted.`,
      );
      process.exit(1);
    }
    console.log(`${who} → ${uid}`);
  }

  await writeDoc('roles', uid, { role }, token);
  console.log(`roles/${uid} = ${role}`);

  if (role === 'admin') {
    console.log(
      '\nThis account can now approve dispatches, publish to publicArchive, edit the\n' +
      'public site, and grant roles to anyone else. Grant it sparingly.',
    );
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
