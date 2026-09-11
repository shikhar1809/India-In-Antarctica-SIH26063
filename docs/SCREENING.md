# Screening field reports

A scientist's report no longer goes straight to the publishers. It goes to an
admin first, who screens it for personal and sensitive content, redacts what
should not travel, and decides where it goes.

```
scientist app ──► raw ──► admin: Manage media › Review & approve (marked “not screened”)
                              │  screen · redact · decide
                              ├──► public website (redacted record)
                              └──► cleared ──► publisher queue ──► studio ──► drafted ──► approve
```

| Status | Who sees it | Meaning |
|---|---|---|
| `raw` | the author, admins | Filed, not yet screened |
| `cleared` | + publishers | Screened and sent to the publishers. An admin's own post request is born `cleared` |
| `drafted` · `flagged` · `approved` | as before | The publisher's post, then approval |

The boundary is enforced in `firestore.rules`, not only the UI: a publisher's
read requires `status != 'raw'`, and the publisher query asks only for
`cleared`, `drafted`, `flagged` and `approved`.

## In the queue

Unscreened reports sit at the top of the admin's **Manage media → Review &
approve** queue, apart from the posts awaiting approval: dashed amber cards
tagged *From the field app*, an incident flag where it applies, and an
**AI screening** button that opens the report's screening page. A raw post
request made before requests were born cleared shows **Send to publishers**
instead. After screening, the admin lands back on the queue.

## The screening page

`/media/screen/:id` ([`pages/ScreenReport.tsx`](../apps/portal/src/pages/ScreenReport.tsx)),
three columns:

- **The report** — measurements, photographs (click to withhold one), and
  whether the observer is named on the public record or credited as "NCPOR
  field team".
- **Redact** — the free-text fields with every open finding highlighted.
  Select any words to redact them ("Redact as Name · Contact · Health …");
  Undo and Original are always there.
- **AI screening** — the findings, each with its category, the exact words,
  a reason and **Redact** / **Keep**; "Redact all recommended"; the model's
  summary and recommendation (*Fit to publish*, *Publish after redaction*,
  *Hold*); and the decision: publish to the public website, send to the
  publisher queue, or both. Every finding must be redacted or kept before it
  goes.

## Where the findings come from

Two sources, merged ([`screening/detect.ts`](../apps/portal/src/screening/detect.ts)):

- **Rules**, always: email addresses, phone numbers, Aadhaar/PAN/passport
  numbers, social handles, precise coordinates in prose, members of the field
  party named in the notes, and whole sentences about injury or an incident.
- **The model** (`functions/screen.js`, Gemini 2.5 Flash, admin-only): names,
  contact details, ID numbers, health, safety, security, precise locations,
  opinions about people. Every finding must quote the report exactly; a quote
  not found in the field it names is dropped server-side. If the model is
  unreachable, the rules' findings stand on their own.

Redaction writes a labelled placeholder — `[name withheld]`,
`[medical detail withheld]` — so the text still reads. A finding is followed
through earlier redactions: redacting a name inside a first-aid sentence
leaves the sentence itself open.

## What confirming does

1. The original words of every redacted field, and the full photo list, go to
   `dispatches/{id}/private/original` — readable by admins and the report's
   author only.
2. The redacted text is written over the dispatch, so the copy publishers
   read never held the removed words.
3. If chosen, the public record is published from the redacted report
   (safety-flagged and incident reports never are).
4. The status becomes `cleared` (sent to publishers), `approved` (published
   only) or stays `raw` (saved for later).

The publisher's studio shows that the report was screened, and the writer is
told never to mention or reconstruct a placeholder. When the admin later
approves the publisher's post, a record published at screening is updated in
place rather than minted twice. The activity log records a screening as
counts — "Redacted: 2 name, 1 contact" — never the words removed.
