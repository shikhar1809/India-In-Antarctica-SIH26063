/**
 * The security check every visit to the portal passes through before
 * anything else renders.
 *
 *   1. Login credentials — a fresh ID token, not a cached one
 *   2. Consent — the person is told IP and location are recorded, and asked
 *   3. IP address — as the server saw it (functions/access.js)
 *   4. Location — from the device if allowed, else approximate from network
 *   5. Access — the server's decision, and a log entry either way
 *
 * Then either "Signed in as <role>", or — for an account nobody has granted
 * access to, or one an admin revoked — a formal warning, a record of what
 * was logged, and a sign-out after five seconds.
 *
 * ── Presentation ────────────────────────────────────────────────────────
 * Deliberately plain: this is the sign-in page of a government system, and
 * should read like one. A four-step progress indicator, a table of what was
 * verified, the statutory notice at the foot. The only motion is a small
 * spinner on the step in progress and results fading in as they arrive.
 *
 * Steps are paced (STEP_MS each) so the sequence is about five seconds end
 * to end; the consent step waits for an answer and isn't counted. Runs once
 * per sign-in session — see Gate in App.tsx.
 *
 * If the server can't be reached the decision falls back to what the portal
 * already knows (the roles doc, via useRole) and the entry is written from
 * the browser instead, marked as such. Failing closed on a network blip
 * would lock every admin out of the portal whenever the function is cold.
 */

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, LogOut, ShieldAlert, X } from 'lucide-react';
import {
  describeDevice, describePlace, fetchIp, fetchLocation, recordCheck, verifyCredentials,
  type AccessStatus, type CheckLocation,
} from '../security/accessCheck';
import { logActivity } from '../audit/log';
import './SecurityCheck.css';

const STEP_MS = 1000;
const SIGN_OUT_AFTER_S = 5;

const ROLE_LABEL: Record<string, string> = {
  scientist: 'Scientist', publisher: 'Publisher', admin: 'Admin', site_manager: 'Site Manager',
};

type StepId = 'credentials' | 'ip' | 'location' | 'access';
type StepState = 'pending' | 'running' | 'done' | 'warn' | 'fail';

const STEPS: { id: StepId; label: string; row: string }[] = [
  { id: 'credentials', label: 'Credentials', row: 'Account' },
  { id: 'ip', label: 'IP address', row: 'IP address' },
  { id: 'location', label: 'Location', row: 'Location' },
  { id: 'access', label: 'Access', row: 'Access' },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Runs `work` but takes at least STEP_MS, so a fast step is still seen. */
async function paced<T>(work: Promise<T>): Promise<T> {
  const [v] = await Promise.all([work, sleep(STEP_MS)]);
  return v;
}

function coords(l: CheckLocation): string {
  if (l.lat === null || l.lon === null) return '';
  const ns = `${Math.abs(l.lat).toFixed(4)}°${l.lat >= 0 ? 'N' : 'S'}`;
  const ew = `${Math.abs(l.lon).toFixed(4)}°${l.lon >= 0 ? 'E' : 'W'}`;
  return `${ns}, ${ew}`;
}

export interface SimulatedCheck {
  status: AccessStatus;
  email: string;
  ip: string;
  location: CheckLocation;
  role: string | null;
}

/** The header every screen of the check shares: emblem, ministry, portal. */
function Masthead() {
  return (
    <header className="sc-mast">
      <img src="/logo.png" alt="" className="sc-logo" />
      <div>
        <span className="sc-mast-gov">Government of India · Ministry of Earth Sciences</span>
        <span className="sc-mast-org">National Centre for Polar and Ocean Research</span>
        <span className="sc-mast-portal">Outreach Portal</span>
      </div>
    </header>
  );
}

const STATUTORY =
  'Unauthorised access to this system is prohibited and may be punishable under the Information Technology Act, 2000.';

export function SecurityCheck({
  role, assigned, revoked, onPass, onSignOut, simulate,
}: {
  role: string;
  /** A roles doc exists for this person. */
  assigned: boolean;
  revoked: boolean;
  onPass: () => void;
  onSignOut: () => void;
  /** Dev harness only: no network, same sequence. */
  simulate?: SimulatedCheck;
}) {
  const [states, setStates] = useState<Record<StepId, StepState>>({
    credentials: 'pending', ip: 'pending', location: 'pending', access: 'pending',
  });
  const [results, setResults] = useState<Partial<Record<StepId, string>>>({});
  const [phase, setPhase] = useState<'running' | 'consent' | 'granted' | 'denied'>('running');
  const [outcome, setOutcome] = useState<{ status: AccessStatus; role: string | null; email: string | null; ip: string; place: string; device: string } | null>(null);
  const [countdown, setCountdown] = useState(SIGN_OUT_AFTER_S);
  const consent = useRef<(() => void) | null>(null);
  const started = useRef(false);

  /** Moves a step to a new state; a settled state records its result. */
  const set = (id: StepId, s: StepState, result?: string) => {
    setStates((prev) => ({ ...prev, [id]: s }));
    if (result !== undefined) setResults((prev) => ({ ...prev, [id]: result }));
  };

  useEffect(() => {
    // StrictMode runs effects twice in dev; the check must run once.
    if (started.current) return;
    started.current = true;

    (async () => {
      const device = describeDevice();

      // 1 — credentials
      set('credentials', 'running');
      let email: string | null = null;
      try {
        email = simulate ? simulate.email : (await paced(verifyCredentials())).email;
        if (simulate) await sleep(STEP_MS);
        set('credentials', 'done', email ?? 'Google account');
      } catch {
        set('credentials', 'fail', 'Sign-in could not be verified');
        await sleep(STEP_MS);
        onSignOut();
        return;
      }

      // Consent — waits for the person, outside the paced five seconds.
      setPhase('consent');
      await new Promise<void>((resolve) => { consent.current = resolve; });
      setPhase('running');

      // 2 — IP
      set('ip', 'running');
      let ip = 'unavailable';
      try {
        ip = simulate ? (await sleep(STEP_MS), simulate.ip) : await paced(fetchIp());
        set('ip', 'done', ip);
      } catch {
        set('ip', 'warn', 'Could not be confirmed');
      }

      // 3 — location
      set('location', 'running');
      const location = simulate ? (await sleep(STEP_MS), simulate.location) : await paced(fetchLocation());
      const place = describePlace(location);
      const where = [place, coords(location)].filter(Boolean).join(' · ');
      set('location', location.source === 'gps' ? 'done' : 'warn',
        location.source === 'gps' ? where
          : location.permission === 'denied' ? `Permission declined · ${place}` : place);

      // 4 — access decision
      set('access', 'running');
      let status: AccessStatus;
      let grantedRole: string | null = role;
      try {
        if (simulate) {
          await sleep(STEP_MS);
          status = simulate.status;
          grantedRole = simulate.role;
        } else {
          const r = await paced(recordCheck(location, device));
          status = r.status;
          grantedRole = r.role;
          if (ip === 'unavailable') ip = r.ip;
        }
      } catch {
        // Server unreachable: decide from what useRole already read, and
        // log from the browser so the visit is still on record.
        status = revoked ? 'revoked' : assigned ? 'granted' : 'unassigned';
        void logActivity({
          tool: 'Sign-in check',
          action: status === 'granted' ? `Signed in as ${ROLE_LABEL[role] ?? role}` : 'Unauthorised access attempt — no role granted',
          changes: [`IP address: ${ip}`, `Location: ${place}`, `Location permission: ${location.permission}`,
            `Device: ${device}`, 'Recorded by the browser — the check service was unreachable'],
        });
      }

      setOutcome({ status, role: grantedRole, email, ip, place, device });
      if (status === 'granted') {
        set('access', 'done', `Granted — ${ROLE_LABEL[grantedRole ?? ''] ?? grantedRole}`);
        setPhase('granted');
        await sleep(1200);
        onPass();
      } else {
        set('access', 'fail', status === 'revoked' ? 'Revoked by an administrator' : 'Not granted');
        // A moment on the result before the warning replaces the screen.
        await sleep(800);
        setPhase('denied');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The five-second hold on the warning, then sign-out.
  useEffect(() => {
    if (phase !== 'denied') return;
    if (countdown <= 0) { onSignOut(); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown, onSignOut]);

  /* ── The warning ──────────────────────────────────────────────────────── */

  if (phase === 'denied' && outcome) {
    const isRevoked = outcome.status === 'revoked';
    return (
      <div className="sc-screen" role="alertdialog" aria-labelledby="sc-denied-title" aria-describedby="sc-denied-body">
        <div className="sc-card is-denied">
          <div className="sc-tricolour" aria-hidden><i /><i /><i /></div>
          <Masthead />

          <div className="sc-warning-band">
            <ShieldAlert size={18} aria-hidden />
            <span>Warning — unauthorised access</span>
          </div>

          <div className="sc-body">
            <h1 id="sc-denied-title">This is a Government of India facility</h1>
            <p id="sc-denied-body" className="sc-lede">
              {isRevoked
                ? <>Access for <strong>{outcome.email}</strong> to this portal has been revoked by an administrator.</>
                : <>The account <strong>{outcome.email}</strong> has not been granted access to this portal.</>}
              {' '}This system belongs to the Ministry of Earth Sciences and is restricted to authorised personnel.
              Accessing or attempting to access it without authorisation may be treated as a breach of
              security and an offence under the Information Technology Act, 2000.
            </p>

            <table className="sc-details">
              <caption>This attempt has been recorded</caption>
              <tbody>
                <tr><th scope="row">Account</th><td>{outcome.email ?? '—'}</td></tr>
                <tr><th scope="row">IP address</th><td>{outcome.ip}</td></tr>
                <tr><th scope="row">Location</th><td>{outcome.place}</td></tr>
                <tr><th scope="row">Device</th><td>{outcome.device}</td></tr>
                <tr><th scope="row">Time</th><td>{new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'medium' })}</td></tr>
              </tbody>
            </table>

            <p className="sc-note">If you believe you should have access, contact the portal administrator.</p>

            <div className="sc-actions sc-actions-split">
              <div className="sc-countdown" aria-live="polite">
                <span>You will be signed out in {countdown} second{countdown === 1 ? '' : 's'}.</span>
                <span className="sc-countdown-bar"><span style={{ animationDuration: `${SIGN_OUT_AFTER_S}s` }} /></span>
              </div>
              <button type="button" className="sc-btn danger" onClick={onSignOut}><LogOut size={14} /> Sign out now</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── The check ────────────────────────────────────────────────────────── */

  const doneCount = STEPS.filter((s) => ['done', 'warn', 'fail'].includes(states[s.id])).length;

  return (
    <div className="sc-screen">
      <div className="sc-card">
        <div className="sc-tricolour" aria-hidden><i /><i /><i /></div>
        <Masthead />

        <div className="sc-body">
          <h1>{phase === 'granted' ? 'Access verified' : 'Verifying your access'}</h1>
          <p className="sc-lede">
            {phase === 'granted'
              ? 'Your sign-in has been verified and recorded.'
              : 'Please wait while your sign-in is verified. This takes a few seconds.'}
          </p>

          {/* Progress: four numbered steps joined by a line that fills as
              each one completes. */}
          <ol className="sc-steps" aria-label={`Verification progress: ${doneCount} of ${STEPS.length} complete`}>
            {STEPS.map((step, i) => {
              const s = states[step.id];
              return (
                <li key={step.id} className={`sc-step is-${s}`}>
                  <span className="sc-step-mark" aria-hidden>
                    {s === 'done' ? <Check size={14} strokeWidth={3} />
                      : s === 'warn' ? <AlertTriangle size={13} strokeWidth={2.5} />
                        : s === 'fail' ? <X size={14} strokeWidth={3} />
                          : i + 1}
                  </span>
                  <span className="sc-step-label">{step.label}</span>
                </li>
              );
            })}
          </ol>

          <table className="sc-details">
            <caption>Verification details</caption>
            <tbody>
              {STEPS.map((step) => {
                const s = states[step.id];
                const value = results[step.id];
                return (
                  <tr key={step.id} className={`is-${s}`}>
                    <th scope="row">{step.row}</th>
                    <td>
                      {value
                        ? <span className="sc-value">{value}</span>
                        : s === 'running'
                          ? <span className="sc-pending"><span className="sc-spinner" aria-hidden /> Checking…</span>
                          : <span className="sc-pending">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {phase === 'consent' && (
            <div className="sc-consent" role="dialog" aria-labelledby="sc-consent-title">
              <strong id="sc-consent-title">Consent to record access details</strong>
              <p>
                Each sign-in to this portal is recorded with the IP address and location it was made from.
                Your browser will ask for permission to share your location; if you decline, an approximate
                location based on your network is recorded instead.
              </p>
              <div className="sc-actions">
                <button type="button" className="sc-btn primary" onClick={() => consent.current?.()}>I agree, continue</button>
                <button type="button" className="sc-btn" onClick={onSignOut}>Sign out</button>
              </div>
            </div>
          )}

          {phase === 'granted' && outcome && (
            <p className="sc-granted" role="status">
              <Check size={16} strokeWidth={3} aria-hidden />
              Signed in as <strong>{ROLE_LABEL[outcome.role ?? ''] ?? outcome.role}</strong>
            </p>
          )}
        </div>

        <footer className="sc-foot">{STATUTORY}</footer>
      </div>
    </div>
  );
}
