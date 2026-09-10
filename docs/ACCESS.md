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

The right-hand column of the Access page. Every entry records **who** (name,
email, and their role *at the time*), **which tool**, **what** it was done to,
and **what changed**:

| Tool | Logged |
|---|---|
| Sign-in check | Every visit: IP, location, whether location was allowed, device — refused attempts in red |
| Site editor | Every publish, with a block-by-block diff: *Edited Hero: heading, body*, *Added Gallery*, *Removed Banner*, *Reordered blocks* |
| Maintenance mode | Site taken offline / brought back |
| Site analytics | Clarity project connected or changed |
| Q&A moderation | Questions approved or rejected, answers published (and whether edited first) |
| Deposit review | Repository deposits published or rejected |
| Approve desk | Field records approved and published |
| Social queue | Posts scheduled, sent, marked as posted, cancelled — with the permalink |
| Access | Role changes, permission grants and removals, invitations, revokes and restores |
| Role switcher | Self role changes |

Filters: by person, by tool, *site changes only*, *security alerts only*.
A *Tools used* card per person shows which tools they have touched and how
often.

### What the rules guarantee

[`firestore.rules`](../firestore.rules), `match /auditLog`:

- An entry can only be written **as yourself** (`actorUid == request.auth.uid`)
  and **on the server's clock** (`at == request.time`) — nobody can file one
  as someone else, or backdate one.
- **Nothing can be edited or deleted** from a client, admins included.
- Only admins can read it.

`rules.test.ts` asserts all three.

### What it does not guarantee

Tool entries are written by the portal when an action succeeds, so a
modified client could skip writing one. Sign-in checks are written server
side and cannot be skipped. Moving every tool's logging into Firestore
triggers would close the gap, at the cost of the *which tool and why*
context a trigger watching raw writes cannot see.

---

## Seeing it without signing in

In `npm run dev:portal`, these render the real components against fixtures:

| Route | Shows |
|---|---|
| `/__securitycheck?status=granted\|unassigned\|revoked` | The sign-in check and the warning |
| `/__access` | The activity log and the revoke control |

Excluded from production builds by an `import.meta.env.DEV` guard.
