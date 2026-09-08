// TEMPORARY verification harness — deleted after checking.
import { ApproveTab } from './Social';
import type { Dispatch } from '../types';

function base(over: Partial<Dispatch>): Dispatch {
  return {
    id: 'x', authorUid: 'u', authorName: 'Dr A. Rao',
    observedAt: Date.UTC(2026, 1, 14), station: 'Maitri',
    lat: -70.7659, lon: 11.7314, elevationM: 130, positionSource: 'GPS handheld',
    activity: 'Ice / glaciology survey', priority: 'notable',
    weather: { airTempC: -24, windSpeedKt: 30, windDir: 'NE', visibilityKm: 3, cloudOktas: 6, present: 'Blowing snow' },
    measurements: { iceThickCm: '112', snowDepthCm: '18', freeboardCm: '8', surface: 'Wind slab' },
    notes: 'Drilled three holes across the transect east of the station and logged ice thickness at each, with snow depth and freeboard alongside. Surface was wind slab throughout. Routine winter monitoring run.',
    teamMembers: 'S. Menon', sampleIds: 'ICE-2026-0031', safetyFlag: false,
    voiceUrl: null, imageUrls: ['/photos/maitri-aerial.jpg', '/photos/icebreaker.jpg'],
    csvUrl: null, docUrls: [],
    caption: 'Measuring how thick the sea ice is near Maitri this week.',
    status: 'drafted', publisherName: 'P. Publisher', publisherUid: 'p1',
    platformCaptions: { x: 'Ice thickness at Maitri: 112 cm.', linkedin: 'Routine winter ice monitoring at Maitri.', instagram: 'Ice thickness at Maitri.' },
    coverImageIndex: 0,
    sopChecklist: { facts: true, safety: true, photo: true, credit: true, hashtags: true },
    adminNotes: null,
    publicSummary: { title: 'Measuring the ice at Maitri', body: ['Researchers drilled through the sea ice east of Maitri and recorded a thickness of 112 centimetres.'], table: [], chart: null },
    createdAt: 0, updatedAt: 0,
    ...over,
  } as Dispatch;
}

const ITEMS: Dispatch[] = [
  base({ id: 'clean' }),
  base({ id: 'gaps', authorName: 'Dr M. Iyer', imageUrls: [], publicSummary: null,
         measurements: {}, notes: 'Short.', lat: null, lon: null,
         sopChecklist: { facts: true, safety: false, photo: false, credit: true, hashtags: true } }),
  base({ id: 'loud', authorName: 'Dr K. Bose', activity: 'Wildlife observation',
         caption: 'AMAZING first-ever discovery at MAI-S12! Great work by S. Menon! Incredible!',
         platformCaptions: { x: 'y'.repeat(300), linkedin: 'ok', instagram: 'ok' } }),
  base({ id: 'blocked', authorName: 'Shikhar Shahi', station: 'Dakshin Gangotri',
         activity: 'Emergency / incident', priority: 'urgent', safetyFlag: true,
         notes: 'Minor slip near the generator shed during whiteout conditions. First aid administered, team member resting, no evacuation needed.' }),
];

export function ApproveHarness() {
  return (
    <div className="ph-page" style={{ maxWidth: 1600 }}>
      <h1 style={{ marginBottom: 16 }}>Field reports</h1>
      <ApproveTab items={ITEMS} />
    </div>
  );
}
