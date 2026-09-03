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
import type { Measurement, RecordChart, RecordFact } from './contract';
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
  const body: string[] = [];

  // Paragraph 1 — what happened, in one plain sentence, plus where.
  const opening = describeObservation(d, measurements);
  const context = STATION_CONTEXT[d.station] ?? STATION_CONTEXT['Other'];
  body.push(`${opening} ${context}`);

  // Paragraph 2 — why anyone should care.
  body.push(voice.why);

  // Paragraph 3 — the conditions it was done in, when they were notable.
  const hardship = describeConditions(d);
  if (hardship) body.push(hardship);

  return {
    title: voice.headline(d.station),
    body,
    table: keyFacts(d, measurements),
    chart: deriveChart(measurements, d.activity),
  };
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
