# Access, sign-in and the activity log

Who can use the portal, what each person can open, how every visit is
checked, and how everything they do is recorded.

---

## Roles

| Role | Opens | Default permissions |
|---|---|---|
| **Scientist** | Home, Archive | Archive: everything |
| **Publisher** | Menu, Archive, Media (compose, queue, analytics) | Archive, Analytics |
| **Admin** | Everything, including Access | Archive, Site, Analytics |
| **Site Manager** | **Site only** — the site hub, uptime, the page editor and Q&A moderation | Site |

Roles live in `roles/{uid}`. Per-person overrides (`archiveAccess`,
`siteAccess`, `analyticsAccess`) sit on the same document and win over the
role's defaults — so an admin can open one station's archive to a site
manager, or Analytics to a scientist, from the Access page.

A site manager's restriction is enforced on the routes, not just the menu:
[`App.tsx`](../apps/portal/src/App.tsx) renders a separate route table for
the role, and any other URL lands back on Site. The Moderation page hides its
*Repository* tab from anyone but an admin — publishing a deposit writes the
public archive, which the rules allow an admin and nobody else.

Firestore resolves Site access exactly as the portal does
(`canManageSite()` in [`firestore.rules`](../firestore.rules)): an explicit
`siteAccess` wins, otherwise admin or site manager. Switching Site off for a
person on the Access page closes their writes to `publicSiteData`, not just
the link in the header.

### The role switcher, and revoking

The header's role switcher lets a signed-in user set their own role — it is
how every role is demonstrated from one browser, and it is open by choice.
Switching resets per-person overrides, so "what does a site manager see" is
answered by the role's defaults, not by a grant left over from an earlier
role.

**Revoke access** (bottom-left of a person's permissions panel on the
Access page) drops them to Scientist with no archive, Site or Analytics
access, and sets `revoked: true`. The rules then refuse that person's own
writes to their roles document — so the switcher cannot put them straight
back to Admin, and they cannot clear the flag. Only an admin assigning them
a role again restores access. An admin cannot revoke themselves.

---

## The sign-in security check

Every sign-in passes a check before the portal renders
([`components/SecurityCheck.tsx`](../apps/portal/src/components/SecurityCheck.tsx)):

1. **Login credentials** — a fresh ID token, not a cached one
2. **Consent** — the person is told IP and location are recorded, and asked
3. **IP address** — as Google's front end saw the request, from the server
4. **Location** — from the device if allowed; otherwise an approximate
   location from the network, recorded as approximate
5. **Access** — the server reads `roles/{uid}` and decides

Then either *Signed in as <role>*, or — for an account nobody has granted a
role, or one an admin revoked — a formal warning that this is a Government
of India system, a table of what was recorded, and sign-out after five
seconds.

The IP and the decision come from
[`functions/access.js`](../functions/access.js), not the browser: a page can
claim any IP, and an unauthorised attempt must be on record even if the tab
is closed the instant the warning appears. The function writes the log entry
itself, with the Admin SDK.

The check runs once per sign-in session (a reload does not repeat it; a new
sign-in or a new tab does). If the access function cannot be reached, the
decision falls back to the roles document the portal already has, and the
visit is logged from the browser, marked as such — failing closed on a cold
function would lock every admin out.

Place names come from coordinates via BigDataCloud's free client-side
reverse-geocoding endpoint.

---

## The activity log

The right-hand column of the Access page. Every create, edit and delete in
the database is recorded by a Firestore trigger
([`functions/audit.js`](../functions/audit.js)) — whether it came from the
portal, the Flutter field app, the public site or a Cloud Function. Each
entry records **who** (name, email, role at the time; *Public visitor* for
anonymous writes, *System* for functions), **what** (create / edit / delete,
and what it was done to) and **what changed** (a field-level diff), under a
**category**:

| Category | What lands there |
|---|---|
| Security | Every sign-in check (IP, location, device), refused attempts, revokes |
| Access | Roles given and changed, permissions, invitations, restores |
| Archive | Records published, edited (field by field) or removed; deposits filed, reviewed, edited |
| Field reports | Reports filed from the field app, and edits to them |
| Post requests | Admins asking publishers for a post |
| Media studio | Posts submitted for approval |
| Review & approval | Approved, sent back, returned; graphics marked up |
| Social | Posts scheduled, sent, failed, cancelled; permalinks linked to records |
| Website | Homepage edits (block by block), maintenance mode, site settings, Q&A moderation |
| Profile · Support | Profile edits · bug reports from the game |

Filter by category (chips with counts), by person, or *alerts only*. An
*Areas worked in* card per person shows where they have been active.

Not logged, on purpose: writes to the log itself, the identifier counters,
and the analytics sync refreshing a post's engagement numbers — hundreds of
"likes went from 4 to 5" entries would bury everything that matters.

### What the rules guarantee

[`firestore.rules`](../firestore.rules), `match /auditLog`: nothing can be
edited or deleted from a client, admins included; only admins can read it.
The trigger writes with the server's credentials, so a client cannot skip or
forge an entry. (The portal can still write one kind of entry itself — the
sign-in check's fallback when the access function is unreachable — and only
as its own user, on the server clock.)

`rules.test.ts` and `functions/test/audit.test.js` pin both halves.

---

## Seeing it without signing in

In `npm run dev:portal`, these render the real components against fixtures:

| Route | Shows |
|---|---|
| `/__securitycheck?status=granted\|unassigned\|revoked` | The sign-in check and the warning |
| `/__access` | The activity log and the revoke control |
| `/__postrequest` | The admin's *Create a new post* wizard (never writes) |

Excluded from production builds by an `import.meta.env.DEV` guard.
