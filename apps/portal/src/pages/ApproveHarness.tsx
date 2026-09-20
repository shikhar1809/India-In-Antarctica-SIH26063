/**
 * Dev harness: the admin's Review & approve queue against fixtures — two
 * unscreened reports straight from the field app (one an incident) above one
 * drafted post awaiting approval. Nothing here writes.
 */

import type { Dispatch } from '../types';
import { ApproveTab } from './Social';
import './Social.css';
import './ApproveDesk.css';

const NOW = Date.now();
const base = {
  authorUid: 'u', lat: -70.766, lon: 11.7333, elevationM: 117, positionSource: 'Station fix',
  weather: { airTempC: -14, windSpeedKt: 6, windDir: 'S', visibilityKm: 25, cloudOktas: 1, present: 'Clear' },
  teamMembers: 'A. Sharma', sampleIds: '', safetyFlag: false, voiceUrl: null, imageUrls: [], csvUrl: null, docUrls: [],
  caption: '', publisherName: null, publisherUid: null, platformCaptions: null, coverImageIndex: null, sopChecklist: null, adminNotes: null,
};
const d = (id: string, over: Record<string, unknown>) => ({ ...base, id, createdAt: NOW - 3_600_000, updatedAt: NOW, observedAt: NOW - 7_200_000, ...over }) as unknown as Dispatch;

const INCOMING = [
  d('in1', { status: 'raw', authorName: 'K. Nair', station: 'Dakshin Gangotri', activity: 'Emergency / incident', priority: 'urgent', safetyFlag: true, notes: 'Minor slip near the generator shed during whiteout conditions.' }),
  d('in2', { status: 'raw', authorName: 'Dr Asha Rao', station: 'Maitri', activity: 'Ice / glaciology survey', priority: 'notable', notes: 'Stake transect at MAI-S12.' }),
];
const DRAFTED = [
  d('dr1', {
    status: 'drafted', authorName: 'R. Iyer', station: 'Bharati', activity: 'Wildlife observation', priority: 'notable',
    measurements: { species: 'Pygoscelis adeliae', count: '340' },
    notes: 'Adélie colony near the Larsemann Hills field camp, first count of the season.',
    caption: 'First Adélie count of the season at Bharati: 340 birds.', publisherName: 'Publisher',
    platformCaptions: { x: 'First Adélie count of the season at Bharati: 340 birds.', linkedin: 'Our first Adélie count of the season.', instagram: '' },
    publicSummary: { title: 'Adélie penguins counted near Bharati', body: ['A first count of the season found 340 Adélie penguins.'], table: [], chart: null },
  }),
  d('dr2', {
    status: 'drafted', revision: 1, authorName: 'Dr Asha Rao', station: 'Maitri', activity: 'Ice / glaciology survey', priority: 'routine',
    notes: 'Stake transect at MAI-S12, second pass.', caption: 'Ice at Maitri is 182 cm thick this week.', publisherName: 'Publisher',
    publicSummary: { title: 'Sea ice at Maitri measured at 182 cm', body: ['Stake readings along the MAI-S12 transect.'], table: [], chart: null },
  }),
];
INCOMING.push(d('rq1', { status: 'raw', authorName: 'Admin', activity: 'Outreach', notes: 'A post for Antarctica Day on the Maitri winter crew.',
  request: { kind: 'post-request', goal: 'awareness', platforms: ['instagram'], audience: 'public', tone: 'warm', deadline: null, recordId: null, recordIdentifier: null, recordTitle: null, instructions: null, requestedBy: 'a', requestedByName: 'Admin' } }));

export function ApproveHarness() {
  return (
    <div className="fld-page fld-page-compact">
      <div className="fld-center fld-center--wide">
        <p style={{ fontSize: 12, color: 'var(--warn)', border: '1px dashed var(--warn)', borderRadius: 8, padding: '8px 12px', margin: '0 0 12px' }}>
          Dev harness — the admin’s Review &amp; approve queue against fixtures. Nothing is written.
        </p>
        <ApproveTab items={DRAFTED} incoming={INCOMING} />
      </div>
    </div>
  );
}
