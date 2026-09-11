/**
 * Screening a raw field report: what to flag, and how redaction works.
 *
 * Two sources of findings, merged: the rules here, which always run and
 * catch the things a pattern can (phone numbers, email addresses, ID
 * numbers, the field party's own names turning up in the notes, injury and
 * incident words), and the model (functions/screen.js), which catches what
 * a pattern cannot (a colleague criticised, a store of fuel described). A
 * model that is down or slow still leaves the admin with the rules' findings
 * — an unscreened report is never the fallback.
 *
 * Redaction replaces the words with a labelled placeholder — "[name
 * withheld]" — rather than deleting them, so the text still reads and
 * nobody downstream mistakes a gap for a typo. The working copy of each
 * field is the source of truth; findings are located in it by their quote,
 * so one that has been redacted simply stops being found.
 *
 * Pure: no I/O, so every rule is testable.
 */

export type ScreenField = 'notes' | 'teamMembers' | 'sampleIds' | 'conditions';
export type ScreenCategory = 'name' | 'contact' | 'id-number' | 'health' | 'safety' | 'security' | 'location' | 'opinion' | 'other';
export type ScreenSeverity = 'high' | 'medium' | 'low';

export interface Finding {
  id: string;
  field: ScreenField;
  quote: string;
  category: ScreenCategory;
  severity: ScreenSeverity;
  reason: string;
  /** 'redact' — should not leave the building; 'review' — a judgement call. */
  action: 'redact' | 'review';
  source: 'rules' | 'model';
}

export const FIELD_LABEL: Record<ScreenField, string> = {
  notes: 'Field notes',
  teamMembers: 'Field party',
  sampleIds: 'Sample identifiers',
  conditions: 'Conditions (legacy)',
};

export const CATEGORY_LABEL: Record<ScreenCategory, string> = {
  name: 'Personal name',
  contact: 'Contact details',
  'id-number': 'ID number',
  health: 'Health or injury',
  safety: 'Incident or safety',
  security: 'Security',
  location: 'Precise location',
  opinion: 'Opinion about people',
  other: 'Other',
};

/** What replaces redacted words, by category. */
export const TOKEN: Record<ScreenCategory, string> = {
  name: '[name withheld]',
  contact: '[contact withheld]',
  'id-number': '[ID number withheld]',
  health: '[medical detail withheld]',
  safety: '[incident detail withheld]',
  security: '[detail withheld]',
  location: '[location withheld]',
  opinion: '[remark withheld]',
  other: '[redacted]',
};

/** Any placeholder this module writes — to style them and to tell the
 *  writer never to reconstruct what they replaced. */
export const TOKEN_PATTERN = /\[(?:name|contact|ID number|medical detail|incident detail|detail|location|remark) withheld\]|\[redacted\]/g;

/* ═════════════════════════════════════════════════════════════ rules ══ */

const RULES: { category: ScreenCategory; severity: ScreenSeverity; action: 'redact' | 'review'; pattern: RegExp; reason: string }[] = [
  { category: 'contact', severity: 'high', action: 'redact', pattern: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, reason: 'An email address — contact details are never published.' },
  { category: 'contact', severity: 'high', action: 'redact', pattern: /(?:\+91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/g, reason: 'Looks like an Indian mobile number.' },
  { category: 'contact', severity: 'high', action: 'redact', pattern: /\+\d{1,3}[\s-]?\d[\d\s-]{7,}\d/g, reason: 'Looks like a phone number.' },
  { category: 'contact', severity: 'medium', action: 'review', pattern: /(?<![\w.])@[A-Za-z_][\w.]{2,}/g, reason: 'A social media handle — someone’s personal account.' },
  { category: 'id-number', severity: 'high', action: 'redact', pattern: /\b\d{4}\s\d{4}\s\d{4}\b/g, reason: 'Looks like an Aadhaar number.' },
  { category: 'id-number', severity: 'high', action: 'redact', pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/g, reason: 'Looks like a PAN.' },
  { category: 'id-number', severity: 'high', action: 'redact', pattern: /\b[A-PR-WY][1-9]\d{6}\b/g, reason: 'Looks like an Indian passport number.' },
  { category: 'location', severity: 'medium', action: 'review', pattern: /-?\d{1,3}\.\d{4,}\s*°?\s*[NSEW]?,?\s*-?\d{1,3}\.\d{4,}\s*°?\s*[NSEW]?/g, reason: 'Precise coordinates written into the text — the record’s own position is published separately, rounded.' },
];

/** Words that make a sentence about someone's body or an incident. The
 *  whole sentence is quoted, because "first aid administered" is only
 *  sensitive with the rest of the sentence around it. */
const HEALTH = /\b(injur\w*|fractur\w*|sprain\w*|bleed\w*|concussion|frostbite|hypotherm\w*|first aid|medic\w*|hospital\w*|doctor|nurse|medication|evacuat\w*|casualt\w*|unconscious|ill(ness)?|sick|stitches|wound\w*)\b/i;
const SAFETY = /\b(slip(ped)?|fell|fall|accident|incident|near[- ]miss|collision|crash\w*|fire|explosion|rescue\w*|lost contact|missing|emergency|mayday|SOS)\b/i;

function sentences(text: string): { s: string; at: number }[] {
  const out: { s: string; at: number }[] = [];
  const re = /[^.!?\n]+[.!?]?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const s = m[0].trim();
    if (s) out.push({ s, at: m.index + m[0].indexOf(s) });
  }
  return out;
}

/** Names from the field-party list: "Asha Rao, R. Kumar (medic)" → the
 *  full names and their surnames, so "Rao said…" in the notes is caught. */
export function partyNames(teamMembers: string): string[] {
  const names = new Set<string>();
  for (const raw of teamMembers.split(/[,;\n]| and /)) {
    const name = raw.replace(/\(.*?\)/g, '').replace(/\b(Dr|Mr|Ms|Mrs|Prof)\.?\s+/gi, '').trim();
    if (name.length < 3 || !/[A-Za-z]/.test(name)) continue;
    names.add(name);
    const words = name.split(/\s+/);
    const surname = words[words.length - 1];
    if (words.length > 1 && surname.length >= 3 && /^[A-Z]/.test(surname)) names.add(surname);
  }
  return [...names].sort((a, b) => b.length - a.length);
}

export function detect(fields: Partial<Record<ScreenField, string>>): Finding[] {
  const found: Finding[] = [];
  let n = 0;
  const push = (f: Omit<Finding, 'id' | 'source'>) => {
    if (found.some((x) => x.field === f.field && (x.quote.includes(f.quote) || f.quote.includes(x.quote)) && x.category === f.category)) return;
    found.push({ ...f, id: `r${n++}`, source: 'rules' });
  };

  for (const field of Object.keys(fields) as ScreenField[]) {
    const text = fields[field] ?? '';
    if (!text.trim()) continue;

    for (const rule of RULES) {
      for (const m of text.matchAll(rule.pattern)) {
        push({ field, quote: m[0].trim(), category: rule.category, severity: rule.severity, action: rule.action, reason: rule.reason });
      }
    }

    if (field !== 'teamMembers') {
      for (const name of partyNames(fields.teamMembers ?? '')) {
        const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
        if (re.test(text)) push({ field, quote: name, category: 'name', severity: 'high', action: 'redact', reason: 'A member of the field party, named in the text.' });
      }
      for (const { s } of sentences(text)) {
        if (HEALTH.test(s)) push({ field, quote: s, category: 'health', severity: 'high', action: 'redact', reason: 'Describes someone’s health or an injury.' });
        else if (SAFETY.test(s)) push({ field, quote: s, category: 'safety', severity: 'high', action: 'review', reason: 'Describes an incident — incidents are internal records.' });
      }
    }
  }

  if (fields.teamMembers?.trim()) {
    push({
      field: 'teamMembers', quote: fields.teamMembers.trim(), category: 'name', severity: 'medium', action: 'review',
      reason: 'The names of everyone present. Never published publicly; withhold it from the publishers too unless they need it for credit.',
    });
  }
  return found;
}

/** The model's findings added to the rules', without duplicates. */
export function merge(rules: Finding[], model: Omit<Finding, 'id' | 'source'>[]): Finding[] {
  const out = [...rules];
  model.forEach((f, i) => {
    // Overlapping words with the same concern are one finding; a different
    // concern about the same words is a second one.
    const dup = out.find((x) => x.field === f.field && x.category === f.category && (x.quote.includes(f.quote) || f.quote.includes(x.quote)));
    if (dup) {
      // Agreement between the two raises confidence; keep the stronger reading.
      if (dup.source === 'rules' && f.action === 'redact') dup.action = 'redact';
      return;
    }
    out.push({ ...f, id: `m${i}`, source: 'model' });
  });
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/* ═════════════════════════════════════════════════════════ redaction ══ */

/** Replaces text[start, end) with the category's placeholder. */
export function redactRange(text: string, start: number, end: number, category: ScreenCategory = 'other'): string {
  if (start < 0 || end <= start || end > text.length) return text;
  return text.slice(0, start) + TOKEN[category] + text.slice(end);
}

/** Replaces every occurrence of a finding's quote. */
export function redactQuote(text: string, quote: string, category: ScreenCategory): string {
  if (!quote) return text;
  return text.split(quote).join(TOKEN[category]);
}

/** Whether a finding is still present in the working text. */
export const isOpen = (f: Finding, working: Partial<Record<ScreenField, string>>): boolean =>
  (working[f.field] ?? '').includes(f.quote);

/** How many placeholders a text carries. */
export const countRedactions = (text: string): number => (text.match(TOKEN_PATTERN) ?? []).length;
