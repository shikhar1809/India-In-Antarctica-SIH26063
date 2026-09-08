/* Visual harness for the scheduling flow — same idea as StudioHarness and
 * RecordEditorHarness: render the diagram on its own, with no Firestore and
 * no auth, so the layout can be checked without walking the whole pipeline.
 * Not routed in the app; mount it from main.tsx when working on the flow. */

import { Archive, Clock, ListChecks, Send, Type } from 'lucide-react';
import { CircuitBoard } from '@/components/ui/circuit-board';

function Row({ title, states }: {
  title: string;
  states: Array<'active' | 'inactive' | 'processing' | 'error'>;
}) {
  const [record, caption, time, queue, platform] = states;
  return (
    <div style={{ marginBottom: 40 }}>
      <p style={{ font: '600 13px system-ui', opacity: 0.7, marginBottom: 4 }}>{title}</p>
      <CircuitBoard
        variant="dark"
        width={560}
        height={150}
        nodes={[
          { id: 'record',   x: 55,  y: 60, label: 'Record',   icon: <Archive className="w-4 h-4" />,    status: record },
          { id: 'caption',  x: 180, y: 60, label: 'Caption',  icon: <Type className="w-4 h-4" />,       status: caption },
          { id: 'when',     x: 305, y: 60, label: 'Time',     icon: <Clock className="w-4 h-4" />,      status: time },
          { id: 'queue',    x: 430, y: 60, label: 'Queue',    icon: <ListChecks className="w-4 h-4" />, status: queue },
          { id: 'platform', x: 525, y: 60, label: 'X',        icon: <Send className="w-4 h-4" />,       status: platform, size: 'sm' },
        ]}
        connections={[
          { from: 'record',  to: 'caption',  animated: record === 'active' },
          { from: 'caption', to: 'when',     animated: caption === 'active' },
          { from: 'when',    to: 'queue',    animated: time === 'active' },
          { from: 'queue',   to: 'platform', animated: queue === 'processing' },
        ]}
      />
    </div>
  );
}

export function FlowHarness() {
  return (
    <div style={{ background: '#0d1420', color: '#dbe7f3', minHeight: '100vh', padding: 32 }}>
      <h1 style={{ font: '600 18px system-ui', marginBottom: 28 }}>Scheduling flow — states</h1>
      <Row title="1. Nothing chosen yet" states={['inactive', 'inactive', 'inactive', 'inactive', 'inactive']} />
      <Row title="2. Record chosen, caption still empty" states={['active', 'inactive', 'active', 'inactive', 'inactive']} />
      <Row title="3. Caption too long for the platform" states={['active', 'error', 'active', 'inactive', 'inactive']} />
      <Row title="4. Ready to queue" states={['active', 'active', 'active', 'processing', 'active']} />
    </div>
  );
}
