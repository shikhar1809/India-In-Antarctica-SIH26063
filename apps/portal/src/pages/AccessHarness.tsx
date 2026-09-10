/**
 * Dev-only harness for the Access page's activity log and revoke control,
 * at /__access. The real page needs an admin sign-in and reads the live
 * roster and log; this renders the same components against fixtures.
 * Names and emails are obviously synthetic. Excluded from production by the
 * `import.meta.env.DEV` guard in App.tsx.
 */

import { ActivityLog } from './ActivityLog';
import { PermissionsEditor } from './RolesTable';
import type { AuditEntry } from '../audit/log';
import type { RosterEntry } from '../hooks/useRoleRoster';
import './RolesPage.css';
import './RolesTable.css';

const NOW = Date.now();
const MIN = 60_000;

const e = (id: string, minsAgo: number, who: 'asha' | 'ravi' | 'admin', rest: Pick<AuditEntry, 'tool' | 'action'> & Partial<AuditEntry>): AuditEntry => ({
  id, at: NOW - minsAgo * MIN,
  ...(who === 'asha'
    ? { actorUid: 'u-asha', actorName: 'Asha Site', actorEmail: 'asha.site@example.test', actorRole: 'site_manager' as const }
    : who === 'ravi'
      ? { actorUid: 'u-ravi', actorName: 'Ravi Publisher', actorEmail: 'ravi.pub@example.test', actorRole: 'publisher' as const }
      : { actorUid: 'u-admin', actorName: 'Harness Admin', actorEmail: 'admin@example.test', actorRole: 'admin' as const }),
  ...rest,
});

const LOG: AuditEntry[] = [
  e('1', 2, 'admin', { tool: 'Access', action: 'Revoked access', target: 'Ravi Publisher', changes: ['Role: Publisher → Scientist', 'Archive: Everything → Nothing', 'Analytics dashboard: on → off'] }),
  e('2', 14, 'asha', { tool: 'Site editor', action: 'Published site changes', target: 'Public site homepage', changes: ['Edited Hero “Welcome to India in Antarctica”: heading, body', 'Added Gallery “Maitri, winter 2026”', 'Removed Banner “Experience the Expedition”', 'Reordered blocks'] }),
  e('3', 31, 'asha', { tool: 'Maintenance mode', action: 'Brought the public site back online', target: 'Public site', changes: ['Maintenance mode: on → off'] }),
  e('4', 58, 'asha', { tool: 'Q&A moderation', action: 'Approved a student question', target: 'from Meera', changes: ['“How cold does it get at Maitri in July?” sent to scientists'] }),
  e('5', 120, 'ravi', { tool: 'Social queue', action: 'Posted to Instagram', target: 'IIA-2026-0009', changes: ['https://example.invalid/p/abc'] }),
  e('6', 190, 'ravi', { tool: 'Approve desk', action: 'Approved and published a field record', target: 'IIA-2026-0013', changes: ['“Sea-ice extent off Bharati” is now in the public archive'] }),
  e('7', 60 * 26, 'admin', { tool: 'Access', action: 'Changed role', target: 'Asha Site', changes: ['Role: Scientist → Site Manager'] }),
];

const PERSON: RosterEntry = { uid: 'u-ravi', role: 'publisher', displayName: 'Ravi Publisher', email: 'ravi.pub@example.test' };

export function AccessHarness() {
  return (
    <main className="ph-page rp-page">
      <header className="rp-head">
        <h1>Access</h1>
        <p>Harness — fixtures only. Buttons here would write to the real database; don’t click them.</p>
      </header>
      <div className="rp-grid">
        <div className="rt-pane">
          <div className="rt-table-wrap">
            <table className="rt-table">
              <tbody>
                <tr className="rt-perms-row-wrap">
                  <td><PermissionsEditor entry={PERSON} isSelf={false} /></td>
                </tr>
                <tr className="rt-perms-row-wrap">
                  <td><PermissionsEditor entry={{ ...PERSON, uid: 'u-me', displayName: 'You (self)' }} isSelf /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <ActivityLog fixture={LOG} />
      </div>
    </main>
  );
}
