import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  signingIn: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Firebase auth errors are opaque codes ("auth/unauthorized-domain") that
// mean nothing to a scientist trying to log in — translate the ones that
// are actually likely to happen here into plain language, so a broken
// sign-in is a message on screen instead of a button that quietly does
// nothing (which is exactly what "it just flashes and nothing happens"
// was: signInWithPopup was rejecting and nobody ever caught the promise).
function describeAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/unauthorized-domain':
      return "This domain isn't authorised for sign-in yet — add it under Firebase Console → Authentication → Settings → Authorized domains.";
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup. Trying a full-page redirect instead…';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was closed before it finished — try again.';
    case 'auth/operation-not-allowed':
      return 'Google sign-in isn\'t enabled for this project yet — enable it under Firebase Console → Authentication → Sign-in method.';
    case 'auth/network-request-failed':
      return 'Network error while signing in — check your connection and try again.';
    default:
      return err instanceof Error ? err.message : 'Sign-in failed — try again.';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });

    // Completes a signInWithRedirect() that happened on the PREVIOUS page
    // load (the browser navigated away to Google and back) — without this,
    // a redirect-based sign-in silently loses the result on return.
    getRedirectResult(auth).catch((err) => setError(describeAuthError(err)));

    return unsub;
  }, []);

  const signIn = async () => {
    setError(null);
    setSigningIn(true);
    try {
      // A popup that opens but never resolves — most commonly the browser
      // silently blocking window.open, or a Cross-Origin-Opener-Policy that
      // stops the popup relaying its result back to this page — is
      // indistinguishable from "still working" without a timeout. This is
      // the actual "it just flashes and nothing happens" symptom: no
      // rejection ever fires, so nothing was ever there to catch. Racing
      // it against a timeout turns a silent hang into a fallback redirect
      // (a full page navigation, which has none of the popup's failure
      // modes) instead of leaving the button looking dead forever.
      await Promise.race([
        signInWithPopup(auth, googleProvider),
        new Promise((_, reject) => setTimeout(() => reject({ code: 'auth/popup-timeout' }), 300000))
      ]);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      const shouldFallBackToRedirect =
        code === 'auth/popup-blocked' ||
        code === 'auth/cancelled-popup-request' ||
        code === 'auth/popup-timeout';
      if (shouldFallBackToRedirect) {
        setError(
          code === 'auth/popup-timeout'
            ? 'Sign-in is taking too long — switching to a full-page redirect…'
            : describeAuthError(err)
        );
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      setError(describeAuthError(err));
    } finally {
      setSigningIn(false);
    }
  };

  const signOut = async () => {
    setError(null);
    try {
      await firebaseSignOut(auth);
    } catch (err) {
      setError(describeAuthError(err));
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, signingIn, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
