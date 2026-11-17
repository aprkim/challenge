// Firebase web config for the shared tiny-wins25 project (same values as tiny-do).
// These are public identifiers, not secrets: access is controlled by Firestore rules,
// which live in tiny-do/firestore.rules (see firestore.rules in this repo).
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBycFP3HfMF7tyshQixvwzoaAE3Df8Fz_8',
  authDomain: 'tiny-wins25.firebaseapp.com',
  projectId: 'tiny-wins25',
  storageBucket: 'tiny-wins25.firebasestorage.app',
  messagingSenderId: '497477643272',
  appId: '1:497477643272:web:9f8e43fbffd18003e5f5bd',
};

// Local testing only: point at the Firebase emulators instead of production.
export const EMULATOR = null; // e.g. { firestore: 8085, auth: 9099 }
