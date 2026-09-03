# Deployment

One Firebase project — `indiainantartica` — with four hosting sites, Cloud
Functions, Firestore and Storage. Requires the Blaze plan (Functions and
Storage).

```bash
npm i -g firebase-tools
firebase login
```

## Hosting targets

| Target | Source | Site |
|---|---|---|
| `main` | `apps/public-site/dist` | iia-public.web.app |
| `portal` | `apps/portal/dist` | iia-portal.web.app |
| `game` | `apps/game/dist` | iia-game.web.app |
| `legacy` | `apps/game/dist` | indiainantarctica.web.app |

Target names map to site names in `.firebaserc`; paths live in
`firebase.json`.

## Deploying

```bash
npm run build              # all three web apps
npm run deploy:hosting     # or: firebase deploy --only hosting:portal
npm run deploy:rules       # firestore + storage rules
npm run deploy:api         # cloud functions
```

Deploy rules **before** shipping code that depends on them.

```bash
firebase deploy --only hosting:portal      # one site
firebase deploy --only firestore:rules     # rules alone
```

## First-time project setup

Both of these are one-off console actions that cannot be scripted:

1. **Storage** must be provisioned at
   `console.firebase.google.com/project/<project>/storage` → *Get Started*.
   Until then `firebase deploy --only storage` fails with *"Firebase Storage
   has not been set up"*, and every upload fails at runtime while the client
   code looks correct. This was a real bug in this project — the code was
   fine, the bucket did not exist.
2. **Blaze plan** is required for Cloud Functions.

After the first Functions deploy, set an image cleanup policy or old
containers accumulate and bill:

```bash
firebase functions:artifacts:setpolicy --location asia-south1 --days 3
```

## Roles

Roles live in `roles/{uid}` as `scientist` | `publisher` | `admin`. Any signed-in
user can set their own to `publisher` or `admin` via the switcher in the
portal header — deliberate, so the pipeline can be demonstrated end to end
without seeding accounts. **Tighten this before any real deployment**: remove
the self-service branch from the `roles` rule so only an existing admin can
promote.

## Seeding

Scripts in `scripts/`, run from the repo root. They authenticate with the
Firebase CLI's stored login — see the header of
[`scripts/lib/firebase-rest.mjs`](../scripts/lib/firebase-rest.mjs) for what
that means, in particular that they operate **above** `firestore.rules` and so
are not evidence the rules permit the same thing through the app.

| Command | Effect |
|---|---|
| `npm run generate:records` | Regenerates `historicalRecords.ts` from the source archive data |
| `npm run seed:historical` | Publishes the 11 founding records to `publicArchive` |
| `npm run seed:deposits` | Deposits those records into the Knowledge Repository and links the public records back to them |
| `npm run seed:demo` | Publishes two demonstration field observations through the real pipeline |

`seed:demo -- --remove` and `seed:deposits -- --remove` undo their writes.

Order matters on a fresh project: `generate:records` → `seed:historical` →
`seed:deposits`.

The portal also has an admin-only **Import historical records** button on the
Knowledge Repository page, which does the same thing from inside the app under
normal auth.

## Verifying a deployment

```bash
npm run test:api     # anonymous checks against the deployed rules and API
npm run test:e2e     # a real browser against the live site
```

Both hit production, so they are a genuine post-deploy smoke test. See
[TESTING.md](TESTING.md).
