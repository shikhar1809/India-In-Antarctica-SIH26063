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

### The eight steps

| Step | What it really does |
|---|---|
| **Reads the brief** | Classifies the content type from the wording and reports the phrases that decided it, with a confidence level |
| **Searches the archive** | Looks for a published record the brief refers to — by identifier, quoted title, or distinctive keyword overlap |
| **Works out who it is for** | Infers the audience from the content type, unless the publisher chose one |
| **Matches the tone** | Same, for tone |
| **Reads what each platform demands** | Character limits, whether a photograph is required, hashtag conventions — and flags what cannot be satisfied yet |
| **Learns from posts already sent** | Median caption length per platform and hashtag frequency, computed from posts confirmed sent |
| **Searches the web for references** | Real image search, with the queries and results shown as they arrive |
| **Writes three options** | The generation call, given everything above |

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

`/refs` needs no key at all: it is a search proxy, and it exists only
because those APIs either send no CORS headers or need a key that must not
ship in a JavaScript bundle.

---

## Pacing

The analysis steps complete in single-digit milliseconds. Eight results
appearing simultaneously reads as a page load, not as reasoning anyone can
follow, so each step holds for `STEP_DWELL_MS` (1150ms) after its work
finishes — long enough to read the conclusion, which is the entire point of
showing it.

A full run takes **25–35 seconds**, most of it genuine network time: three
live image searches and a generation call. `STEP_DWELL_MS` in
`studio/AgentThinking.tsx` is the single number to change if the pacing
feels wrong.

---

## Two bugs worth remembering

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
