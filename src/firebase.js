import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';

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

const provider = new GoogleAuthProvider();

export function signInWithGoogle() {
  return signInWithPopup(auth, provider);
}

export function signOutUser() {
  return signOut(auth);
}
