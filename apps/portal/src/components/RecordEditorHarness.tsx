/**
 * Dev-only harness for RecordEditor, at /__recordeditor.
 *
 * RecordEditor lives behind admin auth inside Repository.tsx's published
 * list, and Save writes to the real `publicArchive` collection — not
 * something to poke at with a fake account just to check the layout. This
 * mounts it against a mock RepositoryRecord instead, with the raw-source
 * lookup pointed at a sourceId that genuinely does not exist, which
 * exercises the "no longer exists" empty state honestly rather than faking
 * it separately.
 *
 * Excluded from production by the `import.meta.env.DEV` guard in App.tsx.
 */

import { RecordEditor } from './RecordEditor';
import type { RepositoryRecord } from '../repository/contract';

const MOCK: RepositoryRecord = {
  id: 'harness-record',
  cat: 'dataset',
  kind: 'Dataset',
  title: 'Southern Ocean Krill Biomass Survey',
  station: 'bharati',
  year: '2013',
  pills: ['Biological Oceanography', 'CCAMLR'],
  body: [
    'Acoustic and net-sampling survey of Euphausia superba biomass in the waters off the Larsemann Hills.',
    'Krill density estimates feed directly into the regional stock assessments used to set the Southern Ocean\'s precautionary catch limits.',
  ],
  table: [
    { label: 'Station', value: 'Bharati' },
    { label: 'Recorded', value: '3 February 2013' },
    { label: 'Instrument / method', value: 'Acoustic net survey' },
  ],
  credit: 'Submitted by Dr M. Iyer',
  photoUrls: [],
  videoUrl: null,
  measurements: [],
  metadata: {
    identifier: 'IIA-2013-0009',
    creators: [{ name: 'Dr M. Iyer', affiliation: 'NCPOR' }],
    publisher: 'NCPOR',
    publicationYear: 2013,
    resourceType: 'Dataset',
    station: 'Bharati',
    spatial: { lat: -69.4, lon: 76.2, elevationM: null, datum: 'WGS84', accuracyM: null },
    temporal: { observedAt: Date.UTC(2013, 1, 3) },
    license: 'CC BY 4.0',
    rights: 'Creative Commons Attribution',
    instrument: 'Acoustic net survey',
    method: null,
    // No real document behind this id — exercises RawPanel's "no longer
    // exists" state, which is the honest thing to show here anyway.
    // (Firestore reserves ids starting/ending with "__" — a normal-shaped
    // id is what a genuinely deleted document's id would have looked like.)
    provenance: { sourceType: 'document', sourceId: 'harness-missing-source', approvedBy: 'harness', approvedAt: Date.now() },
  },
  publishedAt: Date.now(),
};

export function RecordEditorHarness() {
  return (
    <div style={{ minHeight: '100vh', background: '#061019' }}>
      <RecordEditor
        record={MOCK}
        onClose={() => console.log('[harness] onClose fired')}
        onSaved={() => console.log('[harness] onSaved fired')}
      />
    </div>
  );
}
