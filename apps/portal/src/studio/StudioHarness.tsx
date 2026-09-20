/**
 * Dev-only harness for the whole studio flow, at /__studio.
 *
 * The studio sits behind Google auth inside the publisher queue, so the
 * five-step flow — brief, generate, pick, refine, submit — could only ever
 * be exercised by signing in and finding a raw dispatch. That is enough
 * friction that the flow was shipping tested only in pieces: the renderer
 * on its own, the copy layer on its own, and nothing joining them.
 *
 * This mounts the real `Studio` component against a realistic dispatch, so
 * the generate call goes to the real Cloud Function and the canvas renders
 * from the real templates. Only `submit` is inert, because writing to
 * Firestore genuinely does need a signed-in publisher.
 *
 * Excluded from production by the `import.meta.env.DEV` guard in App.tsx.
 */

import { Studio } from './Studio';
import type { Dispatch } from '../types';

/* A dispatch as the field app actually sends one: real Indian station, an
 * activity from the portal's vocabulary, weather in WMO terms, and notes
 * carrying the stake ids and QC flags that must not reach public copy. */
const MOCK: Dispatch = {
  // The admin's hand-off note, so the studio can be checked with one.
  adminBrief: 'A new discovery post is to be made for this. Lead on the ice thickness figure; leave the team names out.',
  id: '__harness__',
  authorUid: 'harness-uid',
  authorName: 'Dr A. Rao',
  observedAt: Date.UTC(2026, 1, 14),
  station: 'Maitri',
  lat: -70.7659,
  lon: 11.7314,
  elevationM: 130,
  positionSource: 'GPS handheld',
  activity: 'Ice / glaciology survey',
  priority: 'notable',
  weather: {
    airTempC: -24,
    windSpeedKt: 30,
    windDir: 'NE',
    visibilityKm: 3,
    cloudOktas: 6,
    present: 'Blowing snow',
  },
  measurements: { iceThickCm: '164', stakeId: 'MAI-S12' },
  notes:
    'Completed the first full transect of the season across the Schirmacher shelf. ' +
    'Twelve stakes measured against last season’s marks. Stake MAI-S12 read high. ' +
    'QC: suspect on stake 7, logger may have iced over. Conditions were blowing snow ' +
    'with visibility down to 3 km for most of the afternoon.',
  teamMembers: 'K. Nair, D. Rao',
  sampleIds: '',
  safetyFlag: false,
  voiceUrl: null,
  imageUrls: [],
  csvUrl: null,
  docUrls: [],
  caption: '',
  status: 'raw',
  publisherName: null,
  publisherUid: null,
  platformCaptions: null,
  coverImageIndex: null,
  sopChecklist: null,
  adminNotes: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
} as Dispatch;

export function StudioHarness() {
  return (
    <div style={{ padding: 24, minHeight: '100vh' }}>
      <div
        style={{
          marginBottom: 18,
          padding: '10px 14px',
          border: '1px dashed rgba(255,207,92,0.5)',
          borderRadius: 8,
          background: 'rgba(255,207,92,0.07)',
          color: '#ffcf5c',
          font: '500 12px/1.5 Inter, sans-serif',
        }}
      >
        Dev harness — the real Studio against a mock dispatch. Generation hits the live
        Cloud Function; Submit is inert because it needs a signed-in publisher.
      </div>
      {/* ?request=1 shows the studio as a publisher sees an admin's post request. */}
      <Studio
        dispatch={new URLSearchParams(window.location.search).get('request') ? {
          ...MOCK,
          id: '__harness_request__',
          notes: 'Mark World Ozone Day on 16 September with the Maitri surface ozone record and why it matters.',
          priority: 'notable',
          request: {
            kind: 'post-request', goal: 'Announce', platforms: ['instagram', 'x', 'linkedin'],
            audience: 'students', tone: 'warm', deadline: Date.UTC(2026, 8, 15, 18, 29),
            recordId: 'historical-d1', recordIdentifier: 'IIA-1999-9004', recordTitle: 'Total Column Ozone at Maitri, 1999–2006',
            instructions: 'Keep it hopeful — the ozone layer is recovering. Use a Maitri photo if there is one.',
            requestedBy: 'harness-admin', requestedByName: 'Harness Admin',
            basics: {
              goal: 'announce', kb: 'about', dataStatus: 'verified', imageSource: 'agent', credit: 'institution', language: 'en',
              links: ['https://www.ncpor.res.in'], references: [], audienceChosen: true, toneChosen: true,
            },
          },
        } : MOCK}
        onSubmitted={() => console.log('[harness] onSubmitted fired')}
      />
    </div>
  );
}
