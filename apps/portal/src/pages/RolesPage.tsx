/**
 * Access — its own page, not a tab buried inside the review desk.
 *
 * This used to be the fourth tab on the approve desk, alongside Approve,
 * Published content and Dissemination — reasonable when it was a one-UID
 * lookup box, harder to justify once it became a real roster with an
 * email-invite flow (RolesTable.tsx). Team management isn't part of
 * reviewing today's dispatches; it doesn't belong on the same screen as
 * the thing an admin opens twenty times a day to do a different job. It
 * has its own URL (`/roles`) and its own entry in the topbar instead.
 */

import { useAuth } from '../context/AuthContext';
import { useRole } from '../hooks/useRole';
import { RolesTable } from './RolesTable';
import './RolesPage.css';

export function RolesPage() {
  const { user } = useAuth();
  const { role, loading } = useRole();

  if (!user || (!loading && role !== 'admin')) {
    return (
      <main className="ph-page">
        <p className="fld-empty">Team roles are managed by admins.</p>
      </main>
    );
  }

  return (
    <main className="ph-page rp-page">
      <header className="rp-head">
        <h1>Access</h1>
        <p>Who has access, and what they can do with it.</p>
      </header>

      {/* Roles are keyed by UID, and the one UID an admin can always supply
          without hunting for it is their own — shown here because it is
          also what seeds the very first admin, out of band:
          `npm run role -- <uid> admin` (or the email form below, once one
          admin already exists). Everyone else is granted by email — nobody
          else's UID needs to be found. */}
      {user && (
        <div className="fld-own-uid">
          <span className="fld-field-label">Your own UID</span>
          <code title={user.uid}>{user.uid}</code>
          <button
            className="ph-btn ghost"
            onClick={() => { void navigator.clipboard?.writeText(user.uid); }}
          >Copy</button>
        </div>
      )}

      <RolesTable />
    </main>
  );
}
