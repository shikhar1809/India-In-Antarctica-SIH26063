# The post studio

How a field dispatch becomes a social media post, and what the agent does
before anyone writes a word.

The studio is where a publisher — often a communications officer rather than
a designer — turns a scientist's field report into something a general
audience will read. It is five steps: **Brief → Pick → Refine → Public page
→ Review**. Nothing it produces reaches an audience on its own; submitting
sets the dispatch to `drafted` and an admin still approves.

---

## Why the generation step is an agent

The original flow was a button and a spinner. A publisher typed what
happened, clicked *generate*, waited, and got three options. If the
generator had misread the brief — treated a dataset release as a field
report, wrote for the public when the audience was researchers — the first
sign of it was three wrong options at the end.

The work is now a sequence of named steps, each showing what it actually
concluded. The publisher can see a wrong inference at step two instead of at
the end.

The important property is that **the visible reasoning is the reasoning**.
Every step corresponds to a decision genuinely made in
[`studio/agent.ts`](../apps/portal/src/studio/agent.ts), and the result of
that analysis is what the language model is then given as its brief. It
would have been easy to build a progress animation over a single prompt
fired at the start; this is not that, and the tests in
`studio/agent.test.ts` pin the behaviour down.

### The Basic questions

Before the agent starts, the Basic step asks what it would otherwise guess,
in three columns — each question a row of options, most with **Agent
decides** as the default ([`studio/basics.ts`](../apps/portal/src/studio/basics.ts)):

| Column | Question | What it settles |
|---|---|---|
| **What is it about** | What happened? | The story, from the field notes |
| | What kind of post is it? | The content type, and the three angles the writer takes |
| | Is it about, or citing, something in the public knowledge base? | *No* skips the archive search; *about* or *cites* links a record — its facts go into the brief, its permanent address onto every caption. Removing it takes its facts back out |
| | How firm is the data? | Preliminary readings are labelled; "confirms" and "proves" are banned |
| **What do you want the post to have** | Images | Uploaded photographs are measured: under 1080 px on the short side is flagged *low-res* (soft on Instagram), under 600 px *too small*. Or **Let the agent find one** — see below |
| | Reference posts | Up to three posts whose shape and voice to follow: one of the portal's own sent posts, or a pasted link with its text. Style only — never facts |
| | Links | One box per link, **+** for another (up to five). The portal adds them to the end of every caption after writing — the model never types a URL — and the alignment check confirms each one arrived |
| | Who gets credit? | NCPOR and the station, the observer by name, or no individual |
| **Who is it meant for** | Audience, tone, language, platforms | Who reads it, how it sounds, English / Hindi / both, where it goes |

**An admin's post request asks the same questions.** "Create a new post"
(`pages/PostRequestWizard.tsx`) uses the same fields
([`studio/BasicFields.tsx`](../apps/portal/src/studio/BasicFields.tsx)) in
the same groups, and stores the answers on the request (`request.basics`);
photographs the admin attaches ride on the dispatch like a field report's.
In the studio, a request shows **Auto-fill from the admin's requirements**
on Basic — one click puts the admin's answers in (with Undo), and the
publisher changes whatever they need. A field report from the scientist app
has no request, so no button: the publisher answers everything. The
*Requirements as per admin* drawer and the admin's own review screen list the
request through one function (`studio/requestSummary.ts`), and anything the
admin left to the agent is not held against the drafts by the alignment
check.

The call to action is no longer asked: a post linked to a record asks readers
to read it. The observance is left to the agent, which asks during the run.

**When the agent finds the photograph**, it takes it from the image search
(Wikimedia Commons, NASA, Openverse) only if all of these hold: the title is
on the post's subject or its polar setting; the licence is public domain,
CC0, CC BY or CC BY-SA (never NC, ND or unknown — text is laid over it, and
this is an official account); and it is at least 600 px, preferring 1080 px.
It is copied into the portal's storage where the source allows, and every
caption must end with its credit line — which the alignment check verifies.

### The eleven steps

| Step | What it really does |
|---|---|
| **Reads the brief** | Classifies the content type from the wording and reports the phrases that decided it, with a confidence level |
| **Searches the archive** | Looks for a published record the brief refers to — by identifier, quoted title, or distinctive keyword overlap |
| **Reads what each platform demands** | Character limits, whether a photograph is required, hashtag conventions — and flags what cannot be satisfied yet |
| **Reads the accounts' analytics** | Followers and 30-day reach per connected account, the best day of the week to post (with how many days of data it rests on), and Instagram's audience by age and place |
| **Learns from posts already sent** | Real engagement on posts the portal sent — per platform, the best post, the hashtags on the stronger half — plus the house style of earlier captions |
| **Chooses who it is for and how it sounds** | Audience and tone, weighed from the content type, the purpose, the platforms and who actually follows — unless the publisher chose them |
| **Checks what people are paying attention to** | Wikipedia daily views for the subject (this week against the month before), recent news coverage, and upcoming observances that fit the topic |
| **Gathers sources** | Wikipedia background for checking claims, and peer-reviewed papers (OpenAlex) — offered only if they are on the post's subject |
| **Searches the web for references** | Real image search, with the queries and results shown as they arrive |
| **Writes three options** | The generation call, given everything above — with a per-platform hashtag plan and a suggested posting time |
| **Checks the drafts against the requirements** | Reads the finished drafts back against every requirement — the admin's post request, the Basic answers, the platforms' rules — and marks each met, partly met, missed, or for a person to judge |

Reach, trends, sources and image references all start together when the run
begins, and each can fail on its own: the step says what failed and the run
continues without it.

### The alignment check

Telling the writer the requirements is not the same as meeting them, and
asking a model "did you follow the brief?" gets a yes. So the last step
checks by rule, against the actual captions
([`studio/alignment.ts`](../apps/portal/src/studio/alignment.ts)):

- **From the admin** — purpose, platforms, audience, tone, the archive record
  (and that every draft links to it), the deadline against the suggested
  posting time, and the free-text notes (never auto-passed: marked for a
  person, with which of their key words appear)
- **From Basic** — call to action at the end of each caption, no overclaiming
  on preliminary data, the credit rule, the language, the takeaway, the day
- **Platform rules** — every caption within its length limit; the planned
  hashtags used

A posting time after the admin's deadline is put to the publisher as a
question. Misses in the words themselves can be fixed with **one** rewrite,
if the publisher says so — the writer is told exactly what was missed, and
the result is checked again. The verdicts appear as ✓ ◐ ✗ ? beside each
requirement in the *Requirements as per admin* drawer, and at the top of the
trace the approving admin reads.

### Content types

Seven, each carrying its own audience and tone defaults and its own
direction to the generator:

`field-report` · `dataset-drop` · `expedition-report` · `institutional` ·
`observance` · `follow-up` · `explainer`

Classification is weighted keyword evidence plus, when the brief was built
on an archive record, that record's own `kind` — a brief built on something
filed as *Dataset* is a dataset release even if the publisher's sentence
never uses the word.

Confidence is reported honestly. A brief with no strong signal returns
`low` and the default for a dispatch-driven studio, rather than a confident
guess.

### Inference never overrides a choice

Audience and tone are optional on the brief. Left unset, the agent decides
and says it decided. Chosen explicitly, the agent leaves them alone and says
that too. The distinction is tracked separately from the values themselves,
so a publisher's deliberate choice is never quietly replaced by an
inference.

---

## Explainability: every decision has its basis

A post the agent helped write is approved by an admin who did not watch it
being made. So every step records four things, and shows them:

- **Looked at** — the inputs it examined, with each source linked
- **Reasoning** — how it got from those to a conclusion
- **Decision** — what it will do because of it
- **Confidence** — high, medium or low, stated rather than implied

Findings say how much evidence they rest on. "Sunday is the best day to
post" is reported as coming from four Sundays of data; a platform with no
analytics says so instead of borrowing another platform's numbers; a
Wikipedia page read by four people a day is labelled *too few to read*
rather than reported as "+100%, rising".

### When it doesn't know, it asks

The agent stops and puts a question to the publisher — with a sentence on
why it could not decide — instead of guessing:

| Situation | Question |
|---|---|
| The wording fits several content types | *What kind of post is this?* |
| The only archive match is a keyword overlap | *Is this post about “…”?* — the wrong record would put its facts and link in the post |
| Instagram is selected and there is no photograph | Drop Instagram, or keep it and add a photo |
| The brief is very short and has no record behind it | *What is the one fact this post has to get across?* |
| A relevant observance is coming up (and Basic left it open) | *Tie this post to it?* — an editorial call, not the agent's |
| The best posting time is after the admin's deadline | *Which should win?* |
| The drafts missed a requirement a rewrite could fix | *Rewrite them?* |

The answer changes what follows (a picked content type re-derives audience
and tone; a declined observance never reaches the writer) and is kept.

### The trace travels with the post

All of it — steps, sources, questions and answers, and **the exact
instructions the writer received** — is collected into an `AgentTrace`
([`studio/trace.ts`](../apps/portal/src/studio/trace.ts)) and saved on the
dispatch as `agentTrace` when the post is submitted. The approve desk renders
it as *How the agent made this post*
([`studio/TraceView.tsx`](../apps/portal/src/studio/TraceView.tsx)). The
redaction table marks it *withheld*: it is review evidence, never published.

### Fences on how research may be used

The research is handed to the writer with rules attached
([`studio/insight.ts`](../apps/portal/src/studio/insight.ts),
`researchDirection`), and `insight.test.ts` pins them:

- **Headlines** are context for relevance only — never repeated as facts.
- **Background** may inform wording; no fact may be added beyond the brief
  unless the background states it.
- **Papers** may be cited on LinkedIn by their DOI exactly as given, or not
  at all — and only papers whose title is on the post's subject reach the
  writer. A search for "Maitri" returns meteorite-dust papers; those are
  shown as *rejected as off-topic*, not offered for a glacier survey.
- **Observances** reach the writer only if the publisher said yes.

### Research providers

All free, none needs a key, every result links to its source
([`functions/research.js`](../functions/research.js)):

| Provider | Used for |
|---|---|
| Wikimedia page views | Public interest: daily views, last 7 days against the 30 before |
| Google News RSS | The latest coverage of the subject, as a possible hook |
| Wikipedia summaries | Two-sentence background per subject |
| OpenAlex | Peer-reviewed papers with DOIs, searched by subject rather than by station |
| Upload-Post analytics | Account reach and audience (via the `engagement` function, signed-in staff only) |

GDELT was tried first for news and refuses anything faster than one request
per five seconds per IP, which shared Cloud Functions egress hits
permanently. Google Trends has no public API. Google News RSS is fine for a
demonstration; a production deployment should use a licensed news API.

---

## Visual references, and what could not be built

The agent searches for style references before proposing anything, and shows
what it is looking at: the queries as they are issued, which providers
answered, and thumbnails as they arrive.

### What works with no credentials

| Provider | Licence position |
|---|---|
| **Wikimedia Commons** | Per-image, returned with each result |
| **NASA image library** | Public domain — the one provider whose results can be reused outright |
| **Openverse** | Openly licensed; intermittently unreachable, so it runs on a 3-second leash |

### Pinterest and Google Images

Both were asked for. Neither could be shipped honestly, and the reasoning is
kept in [`functions/imagesearch.js`](../functions/imagesearch.js) rather than
buried here:

- **Pinterest has no open search API.** The v5 API requires an OAuth
  application approved by Pinterest against a named business use case.
  Scraping the web UI breaches their terms and is actively blocked. A
  "Pinterest search" built that way works on a developer's laptop and fails
  in front of an audience, which is the worst of both outcomes.
- **Google Images has no public search API either.** The legitimate route is
  the Programmable Search Engine JSON API with `searchType=image`. That
  **is** implemented: set `GOOGLE_CSE_KEY` and `GOOGLE_CSE_CX` and the
  provider turns itself on. It is capped at 100 free queries a day, and
  returns no licence field — results say so rather than implying reuse is
  safe.

A provider being down is not the search failing. Each query reports which
providers answered, and the UI shows that rather than implying full
coverage.

---

## Marking up the graphic

The approvals desk already let an admin draw on a post and pin comments to
specific places on it. Publishers could read those notes but had no way to
make marks of their own — so the one person actually editing the post was
the one person who had to describe a layout problem in prose.

Publishers now get the same annotator, pointed at their own graphic, and the
pins do something the admin flow never needed: **the comments and the
marked-up render both go to the model, which returns the copy revised.**

Sending the image matters. Half these notes are about position — *"this
overlaps the roofline"* is not actionable from text alone, and a model that
can see where the pin sits can shorten the right line.

Nothing is applied silently. Each note comes back paired with what was
actually done about it, so a publisher can see a note was understood — or
that it could not be honoured — rather than diffing two blocks of text by
eye. They accept or discard the lot.

---

## A/B comparison

The studio generated three variants and the publisher picked one. The other
two did not disappear, so the comparison is between **two options that both
genuinely exist** rather than a synthetic pair invented for the exercise.

The model returns a verdict factor by factor — hook placement, length
against the platform's norms, concreteness, institutional voice, whether the
first sentence survives a non-specialist reading — and hashtags with a
reason attached to each. A hashtag with no reasoning is noise, and the
publisher is the one who has to defend it.

**What is deliberately not claimed: this predicts nothing about reach.**
There are no engagement figures in this system to learn from, so the
judgement is about fit. Presenting it as a performance forecast would be
inventing a finding.

The same honesty applies to the house-style figures: caption lengths and
hashtag frequencies are reported as *what has gone out*, which is worth
matching for consistency of voice. Claiming they are worth matching for
reach would be a different and unsupported claim.

---

## The pre-publication photograph check

Two of the five SOP checklist items used to be an honour system. The
photograph is now actually looked at, by a vision model, for two things a
rule cannot judge:

1. **A visible watermark, logo or station credit** — reported honestly,
   including its absence.
2. **Anything a government research institution must not publish** —
   obscenity, injury, visible identity documents, a person who appears not
   to have consented. Explicitly *not* aesthetics: being unglamorous or
   badly lit is not a concern.

A clean verdict ticks the photograph box — which the publisher can still
untick, because the model advises and does not approve. A **blocker
disables submission** until the photograph changes.

The verdict is stored on the dispatch as `photoCheck`, so an approver sees
the evidence behind the ticked box rather than taking the tick on trust.
Adding that field was a compile error until it was declared in
`repository/redaction.ts` — the redaction guard doing exactly its job.

---

## Endpoints

All share one Cloud Function deployment and one `GEMINI_API_KEY`, in
`asia-south1`. With no key configured every model-backed route returns 503
and the studio falls back to its offline template draft — the whole flow
still works end to end on a fresh clone with no credentials.

| Route | Model | Purpose |
|---|---|---|
| `POST /studio/copy` | text | Three caption variants, given the agent's analysis |
| `POST /studio/refs` | **none** | Image reference search proxy |
| `POST /studio/abtest` | text | Compares two captions, suggests hashtags with reasons |
| `POST /studio/revise` | text + vision | Applies marked-up notes to the copy |
| `POST /studio/moderate` | vision | Watermark and suitability check on a photograph |
| `POST /studio/review` | text | Editorial review for the approvals desk |
| `POST /studio/trends` | **none** | Wikipedia interest and recent news for the research terms |
| `POST /studio/sources` | **none** | Wikipedia background and OpenAlex papers |
| `POST /studio/publish` | **none** | Posts one caption to one platform through Upload-Post — see [SOCIAL.md](SOCIAL.md) |
| `GET /studio/publish-status` | **none** | Which platforms are genuinely connected |

`/refs`, `/trends` and `/sources` need no key at all: they are proxies, and
exist because those APIs either send no CORS headers, want a named user
agent, or need a key that must not ship in a JavaScript bundle. Research
results are cached per instance for ten minutes.

---

## Pacing

The analysis steps complete in single-digit milliseconds. Eleven results
appearing simultaneously reads as a page load, not as reasoning anyone can
follow, so each step stays on screen for at least `MIN_STEP_MS` (800ms) from
when it started — long enough to read the conclusion. A step whose research
already took longer than that adds nothing.

The network work — analytics, trends, sources, three live image searches —
starts in parallel when the run begins, so a full run costs roughly the
slowest lookup plus the generation call (**about 20 seconds**), plus however
long the publisher takes to answer questions.

---

## Bugs worth remembering

Both were found by watching the thing run, not by reading it.

**The step loop cancelled itself.** The orchestration callbacks were in a
`useEffect` dependency list, and `Studio` passes them as inline arrows — new
identity every render. The effect tore down continuously and its cleanup,
which sets the cancel flag, killed the run milliseconds after it started.
The symptom was a pipeline frozen on step one.

**Then StrictMode cancelled it again.** React deliberately mounts, unmounts
and remounts every effect in development. The unmount ran the cleanup; the
remount declined to restart because the "already started" guard was set. Dev
only, which is the worst place for a bug to hide. The fix re-arms the flag
on effect entry, so a still-running loop survives a remount while a genuine
unmount still stops it.

**And the whole flow was briefly unreachable.** The button that starts the
agent sat at the foot of a long form; opening the knowledge base pushed it
338px below the fold with nothing indicating it was there, while the right
half of a wide screen sat empty. The brief is now two columns with a sticky
action rail. Verifying that a string exists in a deployed bundle is not the
same as verifying a human can reach it.

**The trace caught the agent being wrong.** The first run of the research
steps offered *"Probing the nature of extraterrestrial dust … collected from
the Maitri station"* as further reading for a glacier stake survey at Maitri
— it had matched on the station name. Nobody would have noticed in a
finished caption; it was obvious in the trace. Papers are now searched by
subject, and a title check decides what is on topic. The same run showed
Maitri's Wikipedia page "rising 100%" on four views a day, which is why
interest below 50 views a day is now reported as too few to read.
