/**
 * Dev harness: the admin's screening page against a raw report written to
 * trip every kind of finding — an incident, first aid, the field party named
 * in the notes, a phone number and an email address. Preview mode: the
 * screening model needs an admin sign-in, so only the rules run, and
 * nothing is ever written.
 */

import type { Dispatch } from '../types';
import { ScreenReport } from './ScreenReport';

const NOW = Date.now();

const REPORT = {
  id: '__harness_screen__',
  authorUid: 'scientist-1', authorName: 'Dr Asha Rao',
  observedAt: NOW - 3 * 3_600_000, createdAt: NOW - 2 * 3_600_000, updatedAt: NOW - 2 * 3_600_000,
  station: 'Maitri', lat: -70.766, lon: 11.7333, elevationM: 117, positionSource: 'Station fix',
  activity: 'Ice / glaciology survey', priority: 'notable',
  weather: { airTempC: -19, windSpeedKt: 28, windDir: 'E', visibilityKm: 2, cloudOktas: 8, present: 'Blowing snow' },
  measurements: { siteId: 'MAI-S12', iceThickCm: '182', snowDepthCm: '34', freeboardCm: '9', surface: 'Wind slab' },
  notes: 'Completed the stake transect at MAI-S12 despite blowing snow; ice thickness 182 cm, consistent with last quarter.\n\n'
    + 'Minor slip near the generator shed during the whiteout. First aid administered to Kumar, who is resting and fine. '
    + 'Nair wants the logistics team to explain why the fuel store door was left unlocked again.\n\n'
    + 'For the data files contact Kumar on +91 98765 43210 or asha.rao@ncpor.res.in.',
  teamMembers: 'Dr Asha Rao, R. Kumar (medic), K. Nair',
  sampleIds: 'ICE-2609-A, ICE-2609-B',
  safetyFlag: false, voiceUrl: null,
  imageUrls: [
    'https://images.unsplash.com/photo-1517783999520-f068d7431a60?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1551986782-d0169b3f8fa7?w=800&h=600&fit=crop',
  ],
  csvUrl: null, docUrls: [], caption: '', status: 'raw', publisherName: null, publisherUid: null,
  platformCaptions: null, coverImageIndex: null, sopChecklist: null, adminNotes: null,
} as unknown as Dispatch;

export function ScreenHarness() {
  return (
    <div>
      <p style={{ margin: '12px 24px 0', fontSize: 12, color: 'var(--warn)', border: '1px dashed var(--warn)', borderRadius: 8, padding: '8px 12px' }}>
        Dev harness — screening a mock raw report. Rules only (the model needs an admin sign-in); nothing is saved.
      </p>
      <ScreenReport dispatch={REPORT} preview />
    </div>
  );
}
