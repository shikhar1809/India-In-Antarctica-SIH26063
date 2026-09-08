/* ═══════════════════════════════════════════════════ outreach summarising
 *
 * A field dispatch is written by a scientist for other scientists: "Freeboard
 * 8 cm, stake MAI-S12, surface wind slab." Published straight to the public
 * site that means nothing to anyone. This module drafts the plain-language
 * version — a headline, two or three short paragraphs, a key-facts table and,
 * where the numbers genuinely support one, a chart.
 *
 * It is a template, not an AI call: deterministic, offline, and testable. The
 * publisher edits whatever it produces before anything is submitted — the
 * draft exists to save them from a blank box, not to replace their judgement.
 */

import type { Dispatch } from '../types';
import type { Measurement, RecordChart, RecordFact, ReportSection } from './contract';
import { measurementValue, isPlausible } from './contract';

export interface PublicSummary {
  /** Plain-language headline. */
  title: string;
  /** Outreach paragraphs — the first answers "what is this", the second "why
   *  does it matter". */
  body: string[];
  /** Key facts, already formatted with units. */
  table: RecordFact[];
  chart?: RecordChart;
}

/* ─────────────────────────────────────────────────────── draft provenance ──
 * A drafted paragraph is not one voice. The opening sentence is the field
 * observation; the sentence after it is standing station background; the
 * "why this matters" paragraph is outreach writing that owes nothing to this
 * particular dispatch. The public site cites each of those differently, so
 * the draft is assembled as spans and only joined into paragraphs at the
 * end — one construction, so the prose and its provenance cannot drift. */

export type DraftSourceId = 'dispatch' | 'station-context' | 'outreach' | 'conditions';

export interface DraftSpan {
  text: string;
  sourceId: DraftSourceId;
}

/** The drafted paragraphs, each split into its spans. `draftPublicSummary`
 *  joins these with a single space to produce `body`, so span text is always
 *  a verbatim slice of the published paragraph. */
export function draftParagraphs(d: Dispatch, measurements: Measurement[]): DraftSpan[][] {
  const voice = ACTIVITY_VOICE[d.activity] ?? ACTIVITY_VOICE['Other'];
  const paragraphs: DraftSpan[][] = [];

  // Paragraph 1 — what happened, in one plain sentence, plus where.
  paragraphs.push([
    { text: describeObservation(d, measurements), sourceId: 'dispatch' },
    { text: STATION_CONTEXT[d.station] ?? STATION_CONTEXT['Other'], sourceId: 'station-context' },
  ]);

  // Paragraph 2 — why anyone should care.
  paragraphs.push([{ text: voice.why, sourceId: 'outreach' }]);

  // Paragraph 3 — the conditions it was done in, when they were notable.
  const hardship = describeConditions(d);
  if (hardship) paragraphs.push([{ text: hardship, sourceId: 'conditions' }]);

  return paragraphs;
}

/** How a paragraph's spans become the paragraph. Exported because the
 *  citation builder has to reproduce it exactly to check that published text
 *  still matches the spans attributed to it. */
export function joinSpans(spans: { text: string }[]): string {
  return spans.map((s) => s.text).join(' ');
}

/* ─────────────────────────────────────────────────── per-activity voice ──
 * Two things per activity: how to headline it for a general reader, and why a
 * general reader should care. The "why" lines are the actual outreach value —
 * they are what turns a measurement into a story about the planet.          */

const ACTIVITY_VOICE: Record<string, { headline: (station: string) => string; why: string }> = {
  'Ice / glaciology survey': {
    headline: (s) => `Measuring the ice at ${s}`,
    why: 'Ice thickness is one of the clearest signals we have of a warming planet. Every measurement taken here becomes a data point in a record stretching back decades, which is how scientists tell a bad season apart from a long-term trend.',
  },
  'Wildlife observation': {
    headline: (s) => `Counting wildlife near ${s}`,
    why: 'Antarctic wildlife populations respond quickly to changes in sea ice and food supply, which makes them an early warning system for the whole Southern Ocean. Counts like this one feed international databases that track how colonies are faring year on year.',
  },
  'Atmospheric / meteorology': {
    headline: (s) => `Reading the sky above ${s}`,
    why: 'Antarctica is where the ozone hole was discovered, and the atmosphere above it is still one of the cleanest places on Earth to measure what humans are putting into the air. Readings taken here set the baseline the rest of the world is compared against.',
  },
  'Oceanography / CTD': {
    headline: (s) => `Sampling the ocean off ${s}`,
    why: 'The cold, dense water that forms around Antarctica sinks and drives ocean currents across the entire planet. Measuring its temperature and saltiness here helps explain weather and sea levels thousands of kilometres away.',
  },
  'Equipment check / maintenance': {
    headline: (s) => `Keeping the instruments running at ${s}`,
    why: 'Long-term climate records are only trustworthy if the instruments behind them are looked after. Routine maintenance in −30 °C is unglamorous work, and it is the reason decades of Indian polar data hold up to scrutiny.',
  },
  'Base operations': {
    headline: (s) => `Life and logistics at ${s}`,
    why: 'Everything a research station does — fuel, food, cargo, power — has to be planned a year ahead and carried thousands of kilometres by ship. The science only happens because the logistics work.',
  },
  'Emergency / incident': {
    headline: (s) => `Safety report from ${s}`,
    why: 'Antarctic operations run on a strong safety culture, where near misses are recorded and learned from rather than quietly forgotten.',
  },
  'Other': {
    headline: (s) => `Field notes from ${s}`,
    why: 'Every expedition day adds to India’s continuous record of Antarctic research, maintained since the first expedition in 1981.',
  },
};

/** Station context a general reader won't know. */
const STATION_CONTEXT: Record<string, string> = {
  'Maitri': 'Maitri, India’s station in the Schirmacher Oasis, has been operating since 1989.',
  'Bharati': 'Bharati, built from 134 shipping containers in the Larsemann Hills, opened in 2012.',
  'Dakshin Gangotri': 'Dakshin Gangotri, India’s first Antarctic station, was abandoned to the ice in 1990 and now serves as a supply base.',
  'Other': 'The observation was made away from the permanent stations, in the field.',
};

/* ───────────────────────────────────────────────────────────────── chart ──
 * Only drawn when the numbers actually support one. Measurements are grouped
 * by unit and the largest same-unit group wins, because a bar chart that puts
 * centimetres and individual counts on one axis is worse than no chart at
 * all. A lone number is shown in the key-facts table instead — it is a fact,
 * not a comparison, and drawing one bar would dress it up as more than it is.
 */

export function deriveChart(measurements: Measurement[], activity: string): RecordChart | undefined {
  const byUnit = new Map<string, { label: string; value: number }[]>();

  for (const m of measurements) {
    const v = measurementValue(m);
    if (v === null) continue;                 // categorical (species, surface type)
    if (!m.unit) continue;                    // no unit, nothing to put on an axis
    const bucket = byUnit.get(m.unit) ?? [];
    bucket.push({ label: m.label, value: v });
    byUnit.set(m.unit, bucket);
  }

  let best: { unit: string; data: { label: string; value: number }[] } | null = null;
  for (const [unit, data] of byUnit) {
    if (data.length < 2) continue;            // one bar is not a chart
    if (!best || data.length > best.data.length) best = { unit, data };
  }
  if (!best) return undefined;

  return {
    kind: 'bar',
    title: activity === 'Ice / glaciology survey' ? 'Ice and snow at this site' : 'Measurements from this observation',
    unit: best.unit,
    caption: `Each bar is a single reading taken at the same spot, measured in ${unitWord(best.unit)}.`,
    data: best.data,
  };
}

function unitWord(unit: string): string {
  const words: Record<string, string> = {
    cm: 'centimetres', m: 'metres', km: 'kilometres',
    kt: 'knots', 'ind.': 'individuals counted', '°C': 'degrees Celsius',
  };
  return words[unit] ?? unit;
}

/* ──────────────────────────────────────────────────────────── key facts ── */

function keyFacts(d: Dispatch, measurements: Measurement[]): RecordFact[] {
  const facts: RecordFact[] = [];

  facts.push({ label: 'Station', value: d.station });
  facts.push({ label: 'Date', value: new Date(d.observedAt).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }) });

  if (d.lat !== null && d.lon !== null) {
    const ns = d.lat < 0 ? 'S' : 'N';
    const ew = d.lon < 0 ? 'W' : 'E';
    facts.push({ label: 'Position', value: `${Math.abs(d.lat).toFixed(4)}° ${ns}, ${Math.abs(d.lon).toFixed(4)}° ${ew}` });
  }

  const w = d.weather;
  if (w) {
    const bits: string[] = [];
    if (w.airTempC !== null && isPlausible('airTempC', w.airTempC)) bits.push(`${w.airTempC} °C`);
    if (w.present) bits.push(w.present.toLowerCase());
    if (w.windSpeedKt !== null && isPlausible('windSpeedKt', w.windSpeedKt)) {
      bits.push(w.windDir === 'Calm' ? 'calm' : `wind ${w.windDir} ${w.windSpeedKt} kt`);
    }
    if (bits.length) facts.push({ label: 'Conditions', value: bits.join(', ') });
  }

  for (const m of measurements) {
    facts.push({ label: m.label, value: m.unit ? `${m.value} ${m.unit}` : m.value });
  }

  return facts;
}

/* ───────────────────────────────────────────────────────────────── entry ── */

/**
 * Draft the public-facing version of a dispatch. Deterministic — the same
 * dispatch always produces the same draft, which is what lets it be tested.
 */
export function draftPublicSummary(d: Dispatch, measurements: Measurement[]): PublicSummary {
  const voice = ACTIVITY_VOICE[d.activity] ?? ACTIVITY_VOICE['Other'];

  return {
    title: voice.headline(d.station),
    body: draftParagraphs(d, measurements).map(joinSpans),
    table: keyFacts(d, measurements),
    chart: deriveChart(measurements, d.activity),
  };
}

/* ──────────────────────────────────────────────────────── report body ──
 * The abstract above answers "what is this". It is not a report, and a
 * published observation that stops there gives a reader no way to judge it:
 * they cannot see how the measurement was made, what the conditions were, or
 * what the numbers actually say.
 *
 * These sections are built from the dispatch at publish time rather than
 * stored on it, for the same reason the citations are: they are a
 * deterministic function of the field record, so they can never drift from
 * it, and a publisher editing the public wording cannot leave a methods
 * section describing something that no longer happened.
 *
 * Every section names the source it was written from, so the archive can
 * attribute it the way it attributes the abstract.
 */

/** How each activity's measurements were actually taken. Written for a
 *  reader who wants to know whether to trust the number. */
const METHOD_NOTE: Record<string, string> = {
  'Ice / glaciology survey':
    'Ice and snow measurements are made at a marked stake so that the same spot can be revisited season after season. Thickness is measured by drilling through to the water or the bed; snow depth and freeboard are probed and measured against the stake. The point of returning to a fixed site is that a single reading means very little while a series from the same stake means a great deal.',
  'Wildlife observation':
    'Counts follow the survey protocol recorded with the observation, and are logged with the species name, life stage and behaviour so that a count can be compared with counts made elsewhere. Terminology follows Darwin Core, which is what allows these records to be contributed to international biodiversity databases rather than staying in a national archive.',
  'Atmospheric / meteorology':
    'Atmospheric readings are taken with the instrument named in the record, at the standard height or column for that measurement, and are logged with the QC flag the observer assigned at the time. A reading whose instrument was known to be out of calibration is published with that stated rather than quietly dropped.',
  'Oceanography / CTD':
    'Casts are made from a station whose number and position are fixed in advance, lowering the instrument package to the recorded maximum depth and firing bottles at planned levels on the way back up. Depth, cast number and bottle count are logged together because a profile cannot be interpreted without knowing how it was collected.',
  'Equipment check / maintenance':
    'Instrument checks are logged against the asset identifier so that the maintenance history of a specific instrument can be reconstructed. This matters for the data as much as for the hardware: a long measurement series is only trustworthy if the state of the instrument behind it is known for every part of the record.',
  'Base operations':
    'Station operations are logged for the record, with the task and the number of people involved. Logistics are recorded to the same standard as science because the science depends on them.',
  'Other':
    'The observation was logged in the field with its position, time and conditions, following standard station reporting practice.',
};

/** What the reader should take from the numbers, per activity. */
const READING_NOTE: Record<string, string> = {
  'Ice / glaciology survey':
    'Read on its own, one set of ice measurements describes one site on one day. Its value comes from the series it joins: the same stake, measured season after season, is how a bad year is told apart from a trend.',
  'Wildlife observation':
    'A single count is a snapshot of a population that moves, breeds and moults on its own schedule. Counts become useful when repeated at the same colony across seasons, which is what turns them into a population trend rather than an anecdote.',
  'Atmospheric / meteorology':
    'Atmospheric measurements from Antarctica are baseline measurements — they describe air about as far from industrial sources as the planet offers. Their worth is as a reference the rest of the world is compared against.',
  'Oceanography / CTD':
    'A profile describes one column of water at one moment. Repeated across a station grid and across seasons, profiles like this one are how the formation and movement of Antarctic bottom water is tracked.',
  'Equipment check / maintenance':
    'Maintenance records are rarely read on their own. They are read when a measurement series looks strange, and they are what explains whether the instrument or the world changed.',
  'Base operations':
    'Operational records document what it takes to keep a station running through a season — the part of Antarctic work that makes the rest possible.',
  'Other':
    'The record is published so that the observation is available and citable, whatever later use is made of it.',
};

/**
 * The report sections for a published dispatch. Built from the dispatch, so
 * they describe what was actually done rather than what was written about it.
 */
export function draftSections(d: Dispatch, measurements: Measurement[]): ReportSection[] {
  const sections: ReportSection[] = [];
  const station = d.station;
  const when = new Date(d.observedAt).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });

  /* 1 — what was done. */
  const where = d.lat !== null && d.lon !== null
    ? `The position was fixed at ${Math.abs(d.lat).toFixed(4)}° ${d.lat < 0 ? 'S' : 'N'}, ${Math.abs(d.lon).toFixed(4)}° ${(d.lon ?? 0) < 0 ? 'W' : 'E'}${d.elevationM != null ? ` at ${d.elevationM} m elevation` : ''}, recorded on WGS84.`
    : 'The observation was made in the field, away from a surveyed position.';
  sections.push({
    id: 'the-observation',
    heading: 'The observation',
    paragraphs: [
      `This record covers a ${d.activity.toLowerCase().replace(' / ', ' and ')} carried out from ${station} on ${when}. It was filed from the field on the day it was made, reviewed, and published to this archive as an individual record rather than aggregated into a seasonal summary — so it can be cited on its own.`,
      where,
    ],
    sourceId: 'dispatch',
  });

  /* 2 — how it was done. */
  sections.push({
    id: 'method',
    heading: 'How the measurements were made',
    paragraphs: [METHOD_NOTE[d.activity] ?? METHOD_NOTE['Other']],
    sourceId: 'outreach',
  });

  /* 3 — the readings, with the chart as the section's figure when the
     numbers support one. A single reading is a fact, not a comparison. */
  if (measurements.length) {
    const chart = deriveChart(measurements, d.activity);
    sections.push({
      id: 'readings',
      heading: 'What was recorded',
      paragraphs: [
        `${measurements.length === 1 ? 'One reading was' : `${measurements.length} readings were`} logged at this site. Each is published with its units, exactly as it was entered in the field.`,
        READING_NOTE[d.activity] ?? READING_NOTE['Other'],
      ],
      figure: chart
        ? { kind: 'chart', caption: chart.caption, chart }
        : {
            kind: 'table',
            caption: 'The readings as logged in the field, with units.',
            rows: measurements.map((m) => ({
              label: m.label,
              value: m.unit ? `${m.value} ${m.unit}` : m.value,
            })),
          },
      sourceId: 'dispatch',
    });
  }

  /* 4 — the conditions they were made in. */
  const w = d.weather;
  if (w) {
    const bits: string[] = [];
    if (w.airTempC !== null && isPlausible('airTempC', w.airTempC)) bits.push(`air temperature ${w.airTempC} °C`);
    if (w.windSpeedKt !== null && isPlausible('windSpeedKt', w.windSpeedKt)) {
      bits.push(w.windDir === 'Calm' ? 'calm wind' : `wind ${w.windDir} at ${w.windSpeedKt} knots`);
    }
    if (w.visibilityKm !== null) bits.push(`visibility ${w.visibilityKm} km`);
    if (w.cloudOktas !== null) bits.push(`cloud cover ${w.cloudOktas}/8`);
    if (bits.length) {
      sections.push({
        id: 'conditions',
        heading: 'Conditions at the time',
        paragraphs: [
          `Present weather was recorded as ${w.present.toLowerCase()}, with ${joinWords(bits)}. Conditions are logged with every observation to WMO field practice — in oktas for cloud, knots for wind — because they are part of the measurement, not background colour.`,
          'Weather determines what can be measured and how well. A reading taken in blowing snow carries a different uncertainty from the same reading taken in still air, and publishing the conditions alongside the number is what lets a later user judge which they are looking at.',
        ],
        sourceId: 'conditions',
      });
    }
  }

  /* 5 — how to use it. */
  sections.push({
    id: 'using-this-record',
    heading: 'Using this record',
    paragraphs: [
      'This record is published under a Creative Commons Attribution licence and carries a stable identifier, listed with the citation metadata below. It may be reused for research, teaching and public communication provided NCPOR and the observer are credited.',
      'The archive is also readable as an API, so a record like this one can be pulled into an analysis directly rather than copied out of a web page by hand.',
    ],
    sourceId: 'outreach',
  });

  return sections;
}

/** One plain sentence describing what was actually measured. Uses the
 *  measurements when there are any, and stays vague rather than inventing
 *  detail when there aren't. */
function describeObservation(d: Dispatch, measurements: Measurement[]): string {
  const date = new Date(d.observedAt).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });

  const species = measurements.find((m) => m.fieldId === 'species')?.value;
  const count = measurements.find((m) => m.fieldId === 'count')?.value;
  if (species && count) {
    return `On ${date}, a field team counted ${count} ${species} near ${d.station}.`;
  }

  const iceThick = measurements.find((m) => m.fieldId === 'iceThickCm')?.value;
  if (iceThick) {
    return `On ${date}, a field team drilled through the ice near ${d.station} and measured it at ${iceThick} centimetres thick.`;
  }

  const depth = measurements.find((m) => m.fieldId === 'maxDepthM')?.value;
  if (depth) {
    return `On ${date}, researchers lowered instruments ${depth} metres into the ocean off ${d.station}.`;
  }

  return `On ${date}, a team from ${d.station} recorded a ${d.activity.toLowerCase().replace(' / ', ' and ')} observation.`;
}

/** Antarctic conditions are part of the story, but only when they're actually
 *  severe — saying "it was -2 °C and clear" adds nothing. */
function describeConditions(d: Dispatch): string | null {
  const w = d.weather;
  if (!w) return null;

  const cold = w.airTempC !== null && isPlausible('airTempC', w.airTempC) && w.airTempC <= -20;
  const windy = w.windSpeedKt !== null && isPlausible('windSpeedKt', w.windSpeedKt) && w.windSpeedKt >= 25;
  const rough = ['Blowing snow', 'Whiteout', 'Fog', 'Snow'].includes(w.present);
  if (!cold && !windy && !rough) return null;

  const bits: string[] = [];
  if (cold) bits.push(`${w.airTempC} °C`);
  if (windy) bits.push(`${w.windSpeedKt}-knot winds`);
  if (rough) bits.push(w.present.toLowerCase());

  return `This was recorded in ${joinWords(bits)} — a reminder that every number in the Indian Antarctic record was collected by someone standing outside in it.`;
}

function joinWords(bits: string[]): string {
  if (bits.length === 1) return bits[0];
  return `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}`;
}
