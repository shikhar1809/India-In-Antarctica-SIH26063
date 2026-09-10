/**
 * Dev-only harness for the sign-in security check, at /__securitycheck.
 * The real check needs a signed-in Google account and the access function;
 * this runs the same component and sequence with no network.
 *
 *   ?status=granted | unassigned | revoked      (default granted)
 *
 * The address is from the documentation range (RFC 5737), not a real one.
 * Excluded from production by the `import.meta.env.DEV` guard in App.tsx.
 */

import { useState } from 'react';
import { SecurityCheck } from './SecurityCheck';
import type { AccessStatus } from '../security/accessCheck';

export function SecurityCheckHarness() {
  const status = (new URLSearchParams(window.location.search).get('status') ?? 'granted') as AccessStatus;
  const [done, setDone] = useState<string | null>(null);

  if (done) {
    return <p style={{ padding: 40, color: '#9fbdd6' }}>Harness: {done}. Reload to run again.</p>;
  }

  return (
    <SecurityCheck
      role="admin"
      assigned={status !== 'unassigned'}
      revoked={status === 'revoked'}
      onPass={() => setDone('passed — the portal would open now')}
      onSignOut={() => setDone('signed out')}
      simulate={{
        status,
        email: status === 'granted' ? 'harness.admin@example.test' : 'stranger@example.test',
        ip: '203.0.113.42',
        role: status === 'granted' ? 'admin' : null,
        location: {
          source: 'gps', permission: 'granted', lat: 15.4909, lon: 73.8278, accuracyM: 24,
          city: 'Vasco da Gama', region: 'Goa', country: 'India',
        },
      }}
    />
  );
}
