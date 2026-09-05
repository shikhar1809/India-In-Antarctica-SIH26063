/**
 * Layout templates — the shapes a post can take.
 *
 * A template is data, not a picture: it says which text slots are used, how
 * the photograph is framed, and where the identity block sits. `PostCanvas`
 * turns one of these plus a photo plus some words into pixels. Because the
 * arrangement is fixed here rather than generated, "make it simpler" is a
 * swap between two entries in this list — instant, free, and it changes
 * only the thing the publisher asked to change.
 *
 * Adding a template is the supported way to give the studio a new look.
 */

export type TemplateId = 'photo-led' | 'banded' | 'stat' | 'statement' | 'minimal';

export interface Template {
  id: TemplateId;
  label: string;
  /** One line, written for a publisher who is not a designer. */
  hint: string;
  /** How much of the frame the photograph occupies. */
  photo: 'full-bleed' | 'top-band' | 'inset' | 'none';
  /** Text slots this template renders. Copy for unused slots is kept but
   *  not drawn, so switching templates never loses the publisher's words. */
  slots: { kicker: boolean; headline: boolean; standfirst: boolean; stat: boolean };
  /** Where the text block sits within the frame. */
  align: 'bottom-left' | 'centre' | 'bottom-band';
  /** Text sits on the photo (needs a scrim) or on the flat ground colour. */
  textOn: 'photo' | 'ground';
  /** Roughly how many words the headline can take before it looks wrong. */
  headlineWords: number;
  /** Multiplier on the shared type scale. Templates that give text less
   *  vertical room — a band rather than the whole frame — need to come down
   *  or a long headline climbs out of its area and over the photograph. */
  textScale: number;
  /** Fraction of the frame height the photograph occupies, for the
   *  templates that do not fill it. Kept next to `textScale` because the
   *  two have to agree: the text block starts where the photo stops. */
  photoHeight?: number;
}

export const TEMPLATES: Template[] = [
  {
    id: 'photo-led',
    label: 'Photo led',
    hint: 'The photograph fills the frame, words sit across the bottom. Best when the picture is the story.',
    photo: 'full-bleed',
    slots: { kicker: true, headline: true, standfirst: true, stat: false },
    align: 'bottom-left',
    textOn: 'photo',
    headlineWords: 12,
    textScale: 1,
  },
  {
    id: 'banded',
    label: 'Banded',
    hint: 'Photograph on top, a solid colour band underneath for the text. The most readable option.',
    photo: 'top-band',
    slots: { kicker: true, headline: true, standfirst: true, stat: false },
    align: 'bottom-band',
    textOn: 'ground',
    headlineWords: 9,
    textScale: 0.76,
    photoHeight: 0.5,
  },
  {
    id: 'stat',
    label: 'One number',
    hint: 'Pulls a single measurement out at full size. Use when one figure is the point.',
    photo: 'full-bleed',
    slots: { kicker: true, headline: false, standfirst: true, stat: true },
    align: 'centre',
    textOn: 'photo',
    headlineWords: 0,
    textScale: 1,
  },
  {
    id: 'statement',
    label: 'Statement',
    hint: 'Centred headline over a darkened photograph. Fewest words, most weight.',
    photo: 'full-bleed',
    slots: { kicker: true, headline: true, standfirst: false, stat: false },
    align: 'centre',
    textOn: 'photo',
    headlineWords: 9,
    textScale: 0.92,
  },
  {
    id: 'minimal',
    label: 'Simple',
    hint: 'Mostly type on a flat colour, with a small photograph. Works when there is no strong picture.',
    photo: 'inset',
    slots: { kicker: true, headline: true, standfirst: true, stat: false },
    align: 'bottom-left',
    textOn: 'ground',
    headlineWords: 11,
    textScale: 0.84,
    photoHeight: 0.36,
  },
];

export const DEFAULT_TEMPLATE = TEMPLATES[0];

export function templateById(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? DEFAULT_TEMPLATE;
}

/** "Make it simpler" walks toward the plainer end of the list; "make it
 *  bolder" walks the other way. Ordered by how much the layout asks of the
 *  reader, not by preference. */
export const COMPLEXITY_ORDER: TemplateId[] = ['minimal', 'banded', 'photo-led', 'statement', 'stat'];

export function simpler(id: TemplateId): TemplateId {
  const i = COMPLEXITY_ORDER.indexOf(id);
  return COMPLEXITY_ORDER[Math.max(0, i - 1)];
}

export function bolder(id: TemplateId): TemplateId {
  const i = COMPLEXITY_ORDER.indexOf(id);
  return COMPLEXITY_ORDER[Math.min(COMPLEXITY_ORDER.length - 1, i + 1)];
}
