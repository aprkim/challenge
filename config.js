// Firebase web config for the lihallc-challenge project.
// These are public identifiers, not secrets: access is controlled by firestore.rules.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDa7wl5-eQ9L2gc6-8H66lsJ0F7WUlEtWk',
  authDomain: 'lihallc-challenge.firebaseapp.com',
  projectId: 'lihallc-challenge',
  storageBucket: 'lihallc-challenge.firebasestorage.app',
  messagingSenderId: '911512678982',
  appId: '1:911512678982:web:36621b3157c9b2f79ad047',
};

// Local testing only: point at the Firebase emulators instead of production.
export const EMULATOR = null; // e.g. { firestore: 8085, auth: 9099 }
