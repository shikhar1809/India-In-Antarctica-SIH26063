import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// This config is not a secret — Firebase web app config is meant to be
// public (it just identifies which project to talk to); the actual
// security boundary is the Firestore/Storage rules deployed alongside this
// app, not hiding these values. Same project as the main game
// (indiainantartica), a separate Hosting SITE (iia-portal.web.app) within
// it — the portal and the game share one Firebase project/Auth/Firestore
// backend rather than needing an entirely separate project.
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
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);
