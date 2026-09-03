import { useEffect, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

export interface Appearance {
  skin: number;
  parkaColor: number;
  parkaAccent: number;
  trouserColor: number;
  hairColor: number;
}

export const DEFAULT_APPEARANCE: Appearance = {
  skin: 0xc48a63,
  parkaColor: 0xdfe6ea,
  parkaAccent: 0x9fb0ba,
  trouserColor: 0x1c2530,
  hairColor: 0x2a1c12,
};

const DEFAULT_INTRO = "Hi, I'm here studying the ice — ask me what I'm working on.";

export function useProfile() {
  const { user } = useAuth();
  const [introMessage, setIntroMessage] = useState(DEFAULT_INTRO);
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const unsub = onSnapshot(
      doc(db, 'profiles', user.uid),
      (snap) => {
        const data = snap.data();
        if (data?.introMessage) setIntroMessage(data.introMessage);
        if (data?.appearance) {
          setAppearance({ ...DEFAULT_APPEARANCE, ...data.appearance });
        }
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [user]);

  const save = async (message: string, app?: Appearance) => {
    if (!user) return;
    setSaving(true); setError(null);
    try {
      await setDoc(
        doc(db, 'profiles', user.uid),
        {
          introMessage: message.trim().slice(0, 280),
          ...(app ? { appearance: app } : {}),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save — try again.');
    } finally {
      setSaving(false);
    }
  };

  return { introMessage, appearance, loading, saving, error, save };
}
