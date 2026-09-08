import { describe, it, expect, vi, afterEach } from 'vitest';

import { draftVariants, generateVariants, refineCopy, withSourceLink, describeRecordForBrief, recordUrl } from './copy';
import type { Brief } from './copy';
import { simpler, bolder, TEMPLATES, COMPLEXITY_ORDER, templateById } from './templates';
import { PLATFORM_SPECS, paletteById, PALETTES } from './brand';
import type { Dispatch } from '../types';
import type { Measurement } from '../repository/contract';
import { PLATFORM_LIMITS } from '../types';

/* Field-report vocabulary that must never survive into public copy: stake
 * identifiers, QC flags and instrument serials are internal shorthand, and a
 * reader outside the programme cannot parse any of them. */
const JARGON = {
  stake: 'MAI-S12',
  qc: 'QC: suspect',
  serial: 's/n 44821-B',
};

function dispatch(over: Partial<Dispatch> = {}): Dispatch {
  return {
    id: 'disp-1', authorUid: 'uid-1', authorName: 'Dr A. Rao',
    observedAt: Date.UTC(2026, 1, 14),
    station: 'Maitri', lat: -70.7659, lon: 11.7314, elevationM: 130,
    positionSource: 'GPS handheld',
    activity: 'Ice / glaciology survey', priority: 'notable',
    weather: { airTempC: -24, windSpeedKt: 30, windDir: 'NE', visibilityKm: 3, cloudOktas: 6, present: 'Blowing snow' },
    measurements: {},
    notes: `Measured twelve stakes across the shelf. Stake ${JARGON.stake} read high. ${JARGON.qc}. Logger ${JARGON.serial}.`,
    teamMembers: 'K. Nair', sampleIds: '', safetyFlag: false,
    voiceUrl: null, imageUrls: [], csvUrl: null, docUrls: [],
    caption: '', status: 'raw', publisherName: null, publisherUid: null,
    platformCaptions: null, coverImageIndex: null, sopChecklist: null,
    adminNotes: null, createdAt: Date.now(), updatedAt: Date.now(),
    ...over,
  } as Dispatch;
}

const MEASUREMENTS: Measurement[] = [
  { fieldId: 'iceThickCm', label: 'Ice thickness', value: '164', unit: 'cm' },
  { fieldId: 'stakeId', label: 'Stake', value: JARGON.stake, unit: null },
];

const BRIEF: Brief = { topic: '', audience: 'public', tone: 'plain' };

afterEach(() => vi.unstubAllGlobals());

/* ────────────────────────────────────────────────── the offline draft ── */

describe('draftVariants', () => {
  it('gives three genuinely different angles, not three re-rolls', () => {
    const vs = draftVariants(dispatch(), MEASUREMENTS, BRIEF);
    expect(vs).toHaveLength(3);
    expect(new Set(vs.map((v) => v.angle)).size).toBe(3);
    expect(new Set(vs.map((v) => v.copy.headline)).size).toBe(3);
  });

  it('strips stake ids, QC flags and serials out of the public wording', () => {
    const vs = draftVariants(dispatch(), MEASUREMENTS, BRIEF);
    const written = JSON.stringify(vs.map((v) => ({ ...v.copy, statLabel: null })));
    expect(written).not.toContain(JARGON.stake);
    expect(written).not.toContain('QC');
    expect(written).not.toContain('s/n');
  });

  it('keeps every caption inside its platform limit', () => {
    const long = 'A very long field note. '.repeat(300);
    const vs = draftVariants(dispatch({ notes: long }), MEASUREMENTS, { ...BRIEF, topic: long });
    for (const v of vs) {
      expect(v.copy.captions.x.length).toBeLessThanOrEqual(PLATFORM_LIMITS.x);
      expect(v.copy.captions.linkedin.length).toBeLessThanOrEqual(PLATFORM_LIMITS.linkedin);
      expect(v.copy.captions.instagram.length).toBeLessThanOrEqual(PLATFORM_LIMITS.instagram);
    }
  });

  it('pulls a numeric measurement out as the stat, ignoring categorical ones', () => {
    const [first] = draftVariants(dispatch(), MEASUREMENTS, BRIEF);
    expect(first.copy.stat).toBe('164 cm');
    expect(first.copy.statLabel).toBe('Ice thickness');
  });

  it('leaves the stat null when no measurement is numeric', () => {
    const categorical: Measurement[] = [{ fieldId: 'stakeId', label: 'Stake', value: 'MAI-S12', unit: null }];
    const [first] = draftVariants(dispatch(), categorical, BRIEF);
    expect(first.copy.stat).toBeNull();
  });

  it('still produces usable copy when the report has no notes at all', () => {
    const vs = draftVariants(dispatch({ notes: '' }), [], { ...BRIEF, topic: '' });
    expect(vs).toHaveLength(3);
    for (const v of vs) expect(v.copy.headline.trim().length).toBeGreaterThan(0);
  });
});

/* ─────────────────────────────────────────── the generated path merge ── */

describe('generateVariants', () => {
  it('falls back to the offline draft when the generator is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const res = await generateVariants(dispatch(), MEASUREMENTS, BRIEF);
    expect(res.generated).toBe(false);
    expect(res.variants).toHaveLength(3);
    expect(res.reason).toMatch(/unreachable/i);
  });

  it('falls back when the generator has no key configured (503)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const res = await generateVariants(dispatch(), MEASUREMENTS, BRIEF);
    expect(res.generated).toBe(false);
    expect(res.variants).toHaveLength(3);
  });

  /* The security-relevant one. The model is asked for language, but it can
   * still return a confidently wrong station or a fabricated figure. The
   * kicker and the stat are re-attached from the dispatch after it returns,
   * so what a reader sees on the graphic traces to the field report. */
  it('keeps the factual kicker and stat even when the model invents its own', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        variants: [{
          angle: 'Made up',
          headline: 'Breakthrough at Casey Station',
          standfirst: 'Scientists recorded 900 cm of ice, a world record.',
          captions: { x: 'x', linkedin: 'li', instagram: 'ig' },
        }],
      }),
    }));

    const res = await generateVariants(dispatch(), MEASUREMENTS, BRIEF);
    expect(res.generated).toBe(true);
    // Its words came through…
    expect(res.variants[0].copy.headline).toBe('Breakthrough at Casey Station');
    // …but the facts did not come from it.
    expect(res.variants[0].copy.kicker).toContain('MAITRI');
    expect(res.variants[0].copy.kicker).not.toContain('CASEY');
    expect(res.variants[0].copy.stat).toBe('164 cm');
  });

  it('clamps an over-long generated caption to the platform limit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        variants: [{ headline: 'h', standfirst: 's', captions: { x: 'y'.repeat(900) } }],
      }),
    }));
    const res = await generateVariants(dispatch(), MEASUREMENTS, BRIEF);
    expect(res.variants[0].copy.captions.x.length).toBeLessThanOrEqual(PLATFORM_LIMITS.x);
  });

  it('falls back when the generator returns a shape it should not', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ nope: true }) }));
    const res = await generateVariants(dispatch(), MEASUREMENTS, BRIEF);
    expect(res.generated).toBe(false);
    expect(res.variants).toHaveLength(3);
  });
});

/* ────────────────────────────────────────────────────────── refinement ── */

describe('refineCopy', () => {
  const base = draftVariants(dispatch(), MEASUREMENTS, BRIEF)[0].copy;

  it('shortens without emptying', () => {
    const out = refineCopy(base, 'shorter');
    expect(out.headline.length).toBeLessThanOrEqual(base.headline.length);
    expect(out.headline.trim().length).toBeGreaterThan(0);
  });

  it('adds detail rather than replacing it', () => {
    const out = refineCopy(base, 'longer');
    expect(out.standfirst.length).toBeGreaterThan(base.standfirst.length);
    expect(out.standfirst).not.toMatch(/\.\./);
  });

  it('leaves the kicker and stat untouched — those are facts, not style', () => {
    for (const op of ['shorter', 'longer', 'formal', 'excited'] as const) {
      const out = refineCopy(base, op);
      expect(out.kicker).toBe(base.kicker);
      expect(out.stat).toBe(base.stat);
    }
  });
});

/* ──────────────────────────────────────────────── templates & brand ──── */

describe('template controls', () => {
  it('walks toward simpler layouts and stops at the end', () => {
    let id = COMPLEXITY_ORDER[COMPLEXITY_ORDER.length - 1];
    for (let i = 0; i < 10; i++) id = simpler(id);
    expect(id).toBe(COMPLEXITY_ORDER[0]);
  });

  it('walks toward bolder layouts and stops at the end', () => {
    let id = COMPLEXITY_ORDER[0];
    for (let i = 0; i < 10; i++) id = bolder(id);
    expect(id).toBe(COMPLEXITY_ORDER[COMPLEXITY_ORDER.length - 1]);
  });

  it('covers every template in the complexity ordering', () => {
    expect([...COMPLEXITY_ORDER].sort()).toEqual(TEMPLATES.map((t) => t.id).sort());
  });

  /* A template whose photo band and text band disagree renders the headline
   * over the photograph — the bug this pairing exists to prevent. */
  it('gives every banded template a photo height and a reduced type scale', () => {
    for (const t of TEMPLATES) {
      expect(t.textScale).toBeGreaterThan(0);
      expect(t.textScale).toBeLessThanOrEqual(1);
      if (t.photo === 'top-band' || t.photo === 'inset') {
        expect(t.photoHeight, `${t.id} needs an explicit photoHeight`).toBeDefined();
        expect(t.textScale, `${t.id} has less room, so should scale type down`).toBeLessThan(1);
      }
    }
  });

  it('falls back to a real template and palette for unknown ids', () => {
    expect(templateById('does-not-exist')).toBe(TEMPLATES[0]);
    expect(paletteById('does-not-exist')).toBe(PALETTES[0]);
  });

  it('keeps every platform frame inside a sane aspect range', () => {
    for (const spec of Object.values(PLATFORM_SPECS)) {
      const ratio = spec.w / spec.h;
      expect(ratio).toBeGreaterThan(0.5);
      expect(ratio).toBeLessThan(2.0);
      expect(spec.safe).toBeGreaterThan(0);
      expect(spec.safe).toBeLessThan(Math.min(spec.w, spec.h) / 4);
    }
  });
});


describe('building a post on an archive record', () => {
  const source = { identifier: 'IIA-1998-0007', title: 'Total column ozone at Maitri', url: 'https://iia-public.web.app/archive/IIA-1998-0007' };
  const variant = (captions: { x: string; linkedin: string; instagram: string }) =>
    ({ copy: { kicker: '', headline: '', standfirst: '', stat: null, statLabel: null, captions } });

  it('addresses a record by its citable identifier', () => {
    expect(recordUrl('IIA-1998-0007')).toBe('https://iia-public.web.app/archive/IIA-1998-0007');
  });

  it('appends the link to every caption', () => {
    const [v] = withSourceLink([variant({ x: 'Ozone over Maitri.', linkedin: 'Ozone.', instagram: 'Ozone.' })], source);
    expect(v.copy.captions.x).toContain(source.url);
    expect(v.copy.captions.linkedin).toContain(source.url);
    expect(v.copy.captions.instagram).toContain(source.url);
  });

  it('leaves a caption alone when the link would push it over the limit', () => {
    const long = 'a'.repeat(270);
    const [v] = withSourceLink([variant({ x: long, linkedin: 'ok', instagram: 'ok' })], source);
    // Better a post with no link than a truncated one that reads as broken.
    expect(v.copy.captions.x).toBe(long);
    expect(v.copy.captions.linkedin).toContain(source.url);
  });

  it('does not add the link twice', () => {
    const once = withSourceLink([variant({ x: 'Ozone.', linkedin: 'x', instagram: 'y' })], source);
    const twice = withSourceLink(once, source);
    expect(twice[0].copy.captions.x.match(/archive/g)).toHaveLength(1);
  });

  it('is a no-op with no source', () => {
    const v = variant({ x: 'Ozone.', linkedin: 'x', instagram: 'y' });
    expect(withSourceLink([v], undefined)[0]).toBe(v);
  });

  it('hands the generator the record facts rather than trusting recall', () => {
    const material = describeRecordForBrief({
      title: 'Total column ozone at Maitri',
      body: ['Measured by the India Meteorological Department.'],
      year: '1998',
      station: 'Maitri',
      kind: 'Dataset',
      measurements: [{ label: 'Minimum', value: 108, unit: 'DU' }],
    });
    expect(material).toContain('Total column ozone at Maitri');
    expect(material).toContain('Maitri');
    expect(material).toContain('1998');
    expect(material).toContain('108 DU');
  });
});
