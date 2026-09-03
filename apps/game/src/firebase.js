import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Same Firebase project as the IIA Research Portal (indiainantartica) — the
// game only uses it for the pause menu's "Report a bug" form (Firestore +
// Storage), so it deliberately skips Auth entirely; bug reports are
// anonymous writes, gated by firestore.rules/storage.rules instead of a
// signed-in user. This config is not a secret, see the portal's firebase.ts
// for the same note.
const firebaseConfig = {
  apiKey: 'AIzaSyDWQBa6t_8isKi3pKOddTYp3fUrDm5lD-0',
  authDomain: 'indiainantartica.firebaseapp.com',
  projectId: 'indiainantartica',
  storageBucket: 'indiainantartica.firebasestorage.app',
  messagingSenderId: '977628698409',
  appId: '1:977628698409:web:e76a92a9adfca5452f8938',
  measurementId: 'G-RJBKT52X1B'
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
