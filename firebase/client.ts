// Import the functions you need from the SDKs you need
import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const firebaseConfig = {
  apiKey: "AIzaSyCjxaxK8WcMcuCBSw-A4tRzvQ7QkE6m36w",
  authDomain: "ageno-quiz-af3ff.firebaseapp.com",
  projectId: "ageno-quiz-af3ff",
  storageBucket: "ageno-quiz-af3ff.appspot.com", // Fixed storage bucket URL
  messagingSenderId: "1007620282652",
  appId: "1:1007620282652:web:aec978610e1c01334102d9",
  measurementId: "G-8WYX4Y66NY",
};

// Initialize Firebase properly
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db = getFirestore(app);

/**
 * `getAuth()` also sets up the popup and redirect machinery, which loads Google's `gapi` script and a hidden
 * iframe (about 100 kB and a long task) on every page, signed in or not. Only Google sign-in needs it, so
 * Auth is started without it, with the same persistence `getAuth()` would use, and `signInWithGoogle`
 * passes `browserPopupRedirectResolver` itself.
 */
function createAuth(): Auth {
  if (typeof window === "undefined") return getAuth(app);
  try {
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
    });
  } catch {
    // Already initialised (hot reload): reuse it.
    return getAuth(app);
  }
}

export const auth = createAuth();
