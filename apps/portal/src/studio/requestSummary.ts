/**
 * An admin's post request, as rows a person reads — the admin's own review
 * before sending, and the publisher's "Requirements as per admin" drawer.
 * One function, so the two always list the same requirements in the same
 * words. Row ids match the alignment check's (studio/alignment.ts), so the
 * drawer can mark each row met or missed once the agent has checked.
 */

import type { PostRequest } from '../types';
import { AUDIENCES, TONES } from './copy';
import { PLATFORM_SPECS, type PlatformId } from './brand';
import { CREDITS, DATA_STATUSES, GOALS, KB_RELATIONS, LANGUAGES, cleanLinks } from './basics';

export interface RequestRow { id: string; label: string; value: string }

const AGENT = 'Agent decides';

export function describeRequest(
  req: PostRequest,
  extra: { brief?: string; priority?: string; imageCount?: number } = {},
): RequestRow[] {
  const b = req.basics ?? {};
  const rows: (RequestRow | null)[] = [
    extra.brief ? { id: 'brief', label: 'Brief', value: extra.brief } : null,
    { id: 'goal', label: 'Kind of post', value: b.goal ? GOALS.find((g) => g.id === b.goal)!.label : req.basics ? AGENT : req.goal },
    {
      id: 'record', label: 'Knowledge base',
      value: req.recordIdentifier
        ? `${b.kb === 'cites' ? 'Cites' : 'About'} ${req.recordIdentifier} — ${req.recordTitle ?? ''}`.trim()
        : b.kb === 'none' ? KB_RELATIONS[0].label : AGENT,
    },
    b.dataStatus ? { id: 'data', label: 'Data', value: DATA_STATUSES.find((x) => x.id === b.dataStatus)!.label } : null,
    extra.imageCount
      ? { id: 'images', label: 'Images', value: `${extra.imageCount} attached` }
      : b.imageSource === 'agent' ? { id: 'images', label: 'Images', value: 'The agent finds an openly licensed photo' } : null,
    b.references?.length ? { id: 'references', label: 'Reference posts', value: b.references.map((r) => r.label).join(', ') } : null,
    cleanLinks(b.links).length ? { id: 'links', label: 'Links', value: cleanLinks(b.links).join('\n') } : null,
    b.credit ? { id: 'credit', label: 'Credit', value: CREDITS.find((x) => x.id === b.credit)!.label } : null,
    { id: 'audience', label: 'Audience', value: b.audienceChosen === false ? AGENT : AUDIENCES.find((a) => a.id === req.audience)?.label ?? req.audience },
    { id: 'tone', label: 'Tone', value: b.toneChosen === false ? AGENT : TONES.find((t) => t.id === req.tone)?.label ?? req.tone },
    b.language ? { id: 'language', label: 'Language', value: LANGUAGES.find((l) => l.id === b.language)!.label } : null,
    { id: 'platforms', label: 'Platforms', value: req.platforms.map((p) => PLATFORM_SPECS[p as PlatformId]?.label ?? p).join(', ') },
    {
      id: 'deadline', label: 'Needed by',
      value: req.deadline ? new Date(req.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'No deadline',
    },
    extra.priority ? { id: 'priority', label: 'Priority', value: extra.priority } : null,
    req.instructions ? { id: 'notes', label: 'Notes', value: req.instructions } : null,
  ];
  return rows.filter((r): r is RequestRow => !!r);
}
