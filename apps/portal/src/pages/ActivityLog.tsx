/**
 * The right-hand column of the Access page: who did what, with which tool.
 *
 * Two views of the same `auditLog` entries (see audit/log.ts):
 *   - "Tools used" — one row per person, their role, and a chip for each tool
 *     they have touched with a count. Answers "what does this person actually
 *     do in the portal?" at a glance, which is the question an admin is
 *     usually asking before changing someone's access.
 *   - The timeline — every entry, newest first, with the itemised changes
 *     (for the site editor: which blocks were added, removed or edited).
 *
 * Name, email and role are shown as they were when the action happened, not
 * as they are now — the entry is a record of that moment.
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, type Timestamp } from 'firebase/firestore';
import { ChevronDown, History, ScrollText } from 'lucide-react';
import { db } from '../firebase';
import { AUDIT_COLLECTION, type AuditEntry, type AuditTool } from '../audit/log';
import './ActivityLog.css';

const ROLE_LABEL: Record<string, string> = {
  scientist: 'Scientist', publisher: 'Publisher', admin: 'Admin', site_manager: 'Site Manager', unknown: '—',
};

/** The Site section's tools, called out so "what did they change on the
 *  site" can be filtered to in one click. */
const SITE_TOOLS: AuditTool[] = ['Site editor', 'Maintenance mode', 'Site analytics', 'Q&A moderation'];

const MAX_ENTRIES = 300;

function relative(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function initials(name: string | null, email: string | null): string {
  const label = name || email || '?';
  return label.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || '?';
}

function Entry({ e, now }: { e: AuditEntry; now: number }) {
  const [open, setOpen] = useState(false);
  const changes = e.changes ?? [];
  const exact = new Date(e.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <li className={'al-entry' + (e.alert ? ' is-alert' : '')}>
      <span className="al-avatar" aria-hidden>{initials(e.actorName, e.actorEmail)}</span>
      <div className="al-body">
        <div className="al-line">
          <strong className="al-name">{e.actorName || e.actorEmail || 'Unknown'}</strong>
          <span className={`al-role role-${e.actorRole}`}>{ROLE_LABEL[e.actorRole] ?? e.actorRole}</span>
          <time className="al-time" dateTime={new Date(e.at).toISOString()} title={exact}>{relative(e.at, now)}</time>
        </div>
        {e.actorEmail && e.actorName && <div className="al-email">{e.actorEmail}</div>}
        <div className="al-action">
          <span className={'al-tool' + (SITE_TOOLS.includes(e.tool) ? ' is-site' : '') + (e.tool === 'Sign-in check' ? ' is-security' : '') + (e.alert ? ' is-alert' : '')}>{e.tool}</span>
          <span>{e.action}</span>
          {e.target && <span className="al-target">· {e.target}</span>}
        </div>
        {changes.length > 0 && (
          changes.length <= 2 || e.tool === 'Sign-in check' ? (
            <ul className="al-changes">{changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
          ) : (
            <>
              <button type="button" className="al-more" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
                <ChevronDown size={12} className={open ? 'is-open' : undefined} />
                {open ? 'Hide' : 'Show'} {changes.length} changes
              </button>
              {open && <ul className="al-changes">{changes.map((c, i) => <li key={i}>{c}</li>)}</ul>}
            </>
          )
        )}
      </div>
    </li>
  );
}

/** `fixture` replaces the live subscription — for the dev harness only. */
export function ActivityLog({ fixture }: { fixture?: AuditEntry[] } = {}) {
  const [entries, setEntries] = useState<AuditEntry[]>(fixture ?? []);
  const [loading, setLoading] = useState(!fixture);
  const [error, setError] = useState<string | null>(null);
  const [person, setPerson] = useState<string>('all');
  const [tool, setTool] = useState<string>('all');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (fixture) return;
    const q = query(collection(db, AUDIT_COLLECTION), orderBy('at', 'desc'), limit(MAX_ENTRIES));
    return onSnapshot(
      q,
      (snap) => {
        setEntries(snap.docs.map((d) => {
          const data = d.data();
          // A just-written entry has no server time yet; it is "now".
          const at = (data.at as Timestamp | null)?.toMillis?.() ?? Date.now();
          return { id: d.id, ...data, at } as AuditEntry;
        }));
        setNow(Date.now());
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.code === 'permission-denied' ? 'The activity log is visible to admins only.' : err.message);
        setLoading(false);
      },
    );
  }, [fixture]);

  // Relative times ("3 min ago") refresh once a minute rather than per render.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const people = useMemo(() => {
    const byUid = new Map<string, { uid: string; name: string; email: string | null; role: string; tools: Map<string, number>; last: number }>();
    for (const e of entries) {
      let p = byUid.get(e.actorUid);
      if (!p) {
        // Entries are newest first, so the first one seen carries the
        // person's most recent name and role.
        p = { uid: e.actorUid, name: e.actorName || e.actorEmail || 'Unknown', email: e.actorEmail, role: e.actorRole, tools: new Map(), last: e.at };
        byUid.set(e.actorUid, p);
      }
      p.tools.set(e.tool, (p.tools.get(e.tool) ?? 0) + 1);
    }
    return [...byUid.values()];
  }, [entries]);

  const tools = useMemo(() => [...new Set(entries.map((e) => e.tool))].sort(), [entries]);
  const alerts = entries.filter((e) => e.alert).length;

  const shown = entries.filter((e) =>
    (person === 'all' || e.actorUid === person)
    && (tool === 'all'
      || (tool === '__site' ? SITE_TOOLS.includes(e.tool)
        : tool === '__alerts' ? e.alert === true
          : e.tool === tool)));

  return (
    <aside className="al-panel" aria-labelledby="al-title">
      <header className="al-head">
        <h2 id="al-title"><ScrollText size={16} /> Logs</h2>
        <span className="al-count">
          {alerts > 0 && (
            <button type="button" className="al-alert-count" onClick={() => setTool('__alerts')} title="Show security alerts">
              {alerts} alert{alerts === 1 ? '' : 's'}
            </button>
          )}
          {loading ? '…' : `${entries.length}${entries.length === MAX_ENTRIES ? '+' : ''} entries`}
        </span>
      </header>
      <p className="al-sub">Who changed what, with which tool. Entries can’t be edited or deleted — by anyone.</p>

      {error && <p className="fld-error">{error}</p>}

      {!error && !loading && entries.length === 0 && (
        <p className="al-empty">
          <History size={16} />
          Nothing logged yet. Actions in the Site editor, moderation, the approve desk, the social queue and on
          this page will appear here as they happen.
        </p>
      )}

      {people.length > 0 && (
        <section className="al-people" aria-label="Tools used by each person">
          <h3>Tools used</h3>
          <ul>
            {people.map((p) => (
              <li key={p.uid}>
                <button
                  type="button"
                  className={'al-person' + (person === p.uid ? ' is-active' : '')}
                  onClick={() => setPerson(person === p.uid ? 'all' : p.uid)}
                  title={person === p.uid ? 'Show everyone' : `Show only ${p.name}`}
                >
                  <span className="al-avatar sm" aria-hidden>{initials(p.name, p.email)}</span>
                  <span className="al-person-text">
                    <span className="al-person-name">{p.name}</span>
                    {p.email && <span className="al-person-email">{p.email}</span>}
                  </span>
                  <span className={`al-role role-${p.role}`}>{ROLE_LABEL[p.role] ?? p.role}</span>
                </button>
                <div className="al-tool-chips">
                  {[...p.tools.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                    <span key={t} className={'al-tool' + (SITE_TOOLS.includes(t as AuditTool) ? ' is-site' : '')}>
                      {t} <b>{n}</b>
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {entries.length > 0 && (
        <>
          <div className="al-filters">
            <select value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Filter by person">
              <option value="all">Everyone</option>
              {people.map((p) => <option key={p.uid} value={p.uid}>{p.name}</option>)}
            </select>
            <select value={tool} onChange={(e) => setTool(e.target.value)} aria-label="Filter by tool">
              <option value="all">All tools</option>
              <option value="__site">Site changes only</option>
              <option value="__alerts">Security alerts only</option>
              {tools.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {shown.length === 0 ? (
            <p className="al-empty">Nothing matches these filters.</p>
          ) : (
            <ol className="al-list">
              {shown.map((e) => <Entry key={e.id} e={e} now={now} />)}
            </ol>
          )}
        </>
      )}
    </aside>
  );
}
