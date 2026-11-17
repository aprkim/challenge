// Data layer: challenge config from /challenges.json, participants and check-ins in
// Firestore (lihallc-challenge), signed in anonymously.
//
// Firestore layout:
//   challenges/{category-slug}/participants/{lowercased name}
//     { name, createdAt, dates: ['2026-11-20', ...] }
// The document id is the lowercased name, so names are unique per challenge (case-insensitive)
// and the rules can enforce it. Check-ins are an array updated with arrayUnion/arrayRemove,
// which are idempotent and safe across devices.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth, signInAnonymously, onAuthStateChanged, connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  getFirestore, connectFirestoreEmulator, collection, doc, onSnapshot, runTransaction,
  updateDoc, arrayUnion, arrayRemove, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { FIREBASE_CONFIG, EMULATOR } from '/config.js';

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);
if (EMULATOR) {
  connectAuthEmulator(auth, `http://${location.hostname}:${EMULATOR.auth}`, { disableWarnings: true });
  connectFirestoreEmulator(db, location.hostname, EMULATOR.firestore);
}

let signedIn;
function ready() {
  signedIn ??= new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, (user) => {
      stop();
      if (user) resolve(user);
      else signInAnonymously(auth).then((c) => resolve(c.user), reject);
    }, reject);
  });
  signedIn.catch(() => { signedIn = undefined; }); // allow a retry after a failure
  return signedIn;
}

export async function listChallenges() {
  const res = await fetch('/challenges.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`challenges.json ${res.status}`);
  return res.json();
}

export const challengeKey = (c) => `${c.category}-${c.slug}`;
const participantsRef = (key) => collection(db, 'challenges', key, 'participants');

/** Names Firestore can't use as document ids. */
export function invalidName(name) {
  return name.includes('/') || name === '.' || name === '..' || /^__.*__$/.test(name);
}

/**
 * Live participant list, in join order. Local writes show up immediately
 * (Firestore latency compensation) and are reverted by the SDK if the server rejects them.
 */
export async function subscribe(key, onData, onError) {
  await ready();
  return onSnapshot(participantsRef(key), (snap) => {
    const list = snap.docs.map((d) => {
      const x = d.data({ serverTimestamps: 'estimate' });
      return { id: d.id, name: x.name, createdAt: x.createdAt?.toMillis?.() ?? Date.now(), dates: new Set(x.dates || []) };
    });
    list.sort((a, b) => a.createdAt - b.createdAt);
    onData(list);
  }, onError);
}

/** Creates the participant, or returns the existing one with the same name. */
export async function join(key, name) {
  await ready();
  const ref = doc(participantsRef(key), name.toLowerCase());
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) return { id: ref.id, name: snap.data().name };
    tx.set(ref, { name, createdAt: serverTimestamp(), dates: [] });
    return { id: ref.id, name };
  });
}

export async function setCheckin(key, participantId, date, checked) {
  await ready();
  return updateDoc(doc(participantsRef(key), participantId), {
    dates: checked ? arrayUnion(date) : arrayRemove(date),
  });
}
