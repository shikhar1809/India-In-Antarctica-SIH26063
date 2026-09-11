import { describe, expect, it } from 'vitest';
import { countRedactions, detect, isOpen, merge, partyNames, redactQuote, redactRange, TOKEN } from './detect';

const notes = 'Minor slip near the generator shed during whiteout conditions. First aid administered to Rao, resting now. '
  + 'Call Kumar on +91 98765 43210 or asha.rao@ncpor.res.in. Stake MAI-S12 read high.';

describe('detect', () => {
  const found = detect({ notes, teamMembers: 'Dr Asha Rao, R. Kumar (medic)' });
  const by = (category: string) => found.filter((f) => f.category === category);

  it('catches contact details', () => {
    expect(by('contact').map((f) => f.quote)).toEqual(expect.arrayContaining(['asha.rao@ncpor.res.in', '+91 98765 43210']));
  });

  it('catches the field party named in the notes', () => {
    expect(by('name').filter((f) => f.field === 'notes').map((f) => f.quote)).toEqual(expect.arrayContaining(['Rao', 'Kumar']));
  });

  it('quotes the whole sentence about an injury, and flags the incident', () => {
    expect(by('health')[0].quote).toBe('First aid administered to Rao, resting now.');
    expect(by('safety')[0].quote).toMatch(/^Minor slip near the generator shed/);
  });

  it('leaves ordinary science alone', () => {
    expect(detect({ notes: 'Stake MAI-S12 read 2.41 m. Wind 12 kt from the east.' })).toEqual([]);
  });

  it('offers the whole field party for review', () => {
    expect(found.find((f) => f.field === 'teamMembers')?.action).toBe('review');
  });
});

describe('partyNames', () => {
  it('drops titles and roles, and adds surnames', () => {
    expect(partyNames('Dr Asha Rao, R. Kumar (medic)')).toEqual(expect.arrayContaining(['Asha Rao', 'Rao', 'R. Kumar', 'Kumar']));
  });
});

describe('merge', () => {
  it('adds the model’s findings without duplicating the rules’', () => {
    const rules = detect({ notes });
    const merged = merge(rules, [
      { field: 'notes', quote: 'asha.rao@ncpor.res.in', category: 'contact', severity: 'high', reason: 'dup', action: 'redact' },
      { field: 'notes', quote: 'generator shed', category: 'security', severity: 'medium', reason: 'site detail', action: 'review' },
    ]);
    expect(merged.filter((f) => f.quote === 'asha.rao@ncpor.res.in')).toHaveLength(1);
    expect(merged.some((f) => f.source === 'model' && f.quote === 'generator shed')).toBe(true);
  });
});

describe('redaction', () => {
  it('replaces with a labelled placeholder and closes the finding', () => {
    const f = detect({ notes }).find((x) => x.category === 'contact')!;
    const next = redactQuote(notes, f.quote, f.category);
    expect(next).toContain(TOKEN.contact);
    expect(isOpen(f, { notes: next })).toBe(false);
    expect(countRedactions(next)).toBe(1);
  });

  it('redacts a selected range', () => {
    expect(redactRange('Hello Ravi there', 6, 10, 'name')).toBe('Hello [name withheld] there');
    expect(redactRange('abc', 2, 1)).toBe('abc');
  });
});
