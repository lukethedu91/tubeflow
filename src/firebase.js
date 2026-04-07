import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBbOUHqaMFKKnZijZv9q_LjZZjI6Wkj98o",
  authDomain: "tubeflow-12775.firebaseapp.com",
  projectId: "tubeflow-12775",
  storageBucket: "tubeflow-12775.firebasestorage.app",
  messagingSenderId: "580952961870",
  appId: "1:580952961870:web:bfefddce84812dff00241f"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export async function loadUserKeys(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : {};
}

export async function saveUserKeys(uid, keys) {
  await setDoc(doc(db, "users", uid), keys, { merge: true });
}

export async function loadUserData(uid) {
  const snap = await getDoc(doc(db, 'users', uid, 'appdata', 'main'));
  return snap.exists() ? snap.data() : null;
}

export async function saveUserProjects(uid, projects) {
  await setDoc(doc(db, 'users', uid, 'appdata', 'main'), { projects, projectsSavedAt: serverTimestamp() }, { merge: true });
}

export async function saveUserIdeas(uid, ideas) {
  await setDoc(doc(db, 'users', uid, 'appdata', 'main'), { ideas }, { merge: true });
}

export async function saveUserPresets(uid, presets) {
  await setDoc(doc(db, 'users', uid, 'appdata', 'main'), { presets }, { merge: true });
}

export async function saveAllUserData(uid, data) {
  await setDoc(doc(db, 'users', uid, 'appdata', 'main'), data, { merge: true });
}

const provider = new GoogleAuthProvider();

export function signInWithGoogle() {
  return signInWithPopup(auth, provider);
}

export function signOutUser() {
  return signOut(auth);
}
