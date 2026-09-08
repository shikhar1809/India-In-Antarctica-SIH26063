/* Visual harness for ImageAnnotator — same idea as StudioHarness: mount it
 * standalone with no Firestore and no auth, so drawing tools can be checked
 * without walking the whole approve-desk flow. Not routed in the app; mount
 * from main.tsx when working on the annotator. */

import { useState } from 'react';
import { ImageAnnotator } from './ImageAnnotator';
import type { Annotation } from './annotations';

const SAMPLE_IMAGE =
  'https://upload.wikimedia.org/wikipedia/commons/4/4d/An_aerial_view_of_the_Indian_Station_Maitri%2C_Antarctica_on_February_2%2C_2005.jpg';

export function AnnotatorHarness() {
  const [open, setOpen] = useState(true);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [saved, setSaved] = useState<Annotation[] | null>(null);

  return (
    <div style={{ background: '#0d1420', color: '#dbe7f3', minHeight: '100vh', padding: 32 }}>
      <h1 style={{ font: '600 18px system-ui', marginBottom: 12 }}>ImageAnnotator harness</h1>
      <p style={{ opacity: 0.7, marginBottom: 16 }}>
        {saved ? `Saved ${saved.length} annotation(s).` : 'Not saved yet.'}
      </p>
      <button
        onClick={() => setOpen(true)}
        style={{ padding: '8px 14px', borderRadius: 8, background: '#2f9fc9', color: '#000', border: 0, cursor: 'pointer' }}
      >
        Open annotator
      </button>

      {open && (
        <ImageAnnotator
          imageUrl={SAMPLE_IMAGE}
          annotations={annotations}
          authorName="Test Admin"
          onChange={setAnnotations}
          onSave={() => { setSaved(annotations); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
