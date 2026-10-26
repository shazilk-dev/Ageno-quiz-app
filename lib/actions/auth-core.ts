/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/actions/auth-core.ts
// What every page may need: sign in, sign up, sign out, password reset. It's imported by the root
// layout's AuthProvider, so keep it small: account changes and two-factor live in auth-account.ts and
// auth-mfa.ts, which only the profile page loads.
import { auth } from "@/firebase/client";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  browserPopupRedirectResolver,
  signInWithPopup,
  User,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";
import { recordActivity } from "@/lib/actions/activity";

export interface AuthError {
  code: string;
  message: string;
}

export const toAuthError = (error: any): AuthError => ({
  code: error?.code || "unknown",
  message: error?.message || "An unknown error occurred",
});

// Register user with the server-side API
const registerUserWithApi = async (user: User, role: string = "user") => {
  try {
    const idToken = await user.getIdToken();

    const response = await fetch("/api/auth/user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        role,
        photoURL: user.photoURL,
        emailVerified: user.emailVerified,
      }),
    });

    if (!response.ok) {
      console.warn("Failed to register user with API; the first sign-in will create the profile");
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error registering user with API:", error);
    return false;
  }
};

// Sign up with email and password
export const signUpWithEmail = async (
  email: string,
  password: string,
  displayName: string
): Promise<User | AuthError> => {
  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    // Update profile with display name
    await updateProfile(userCredential.user, { displayName });

    // The profile (made by the server, which also logs `account_created`) and the verification email don't
    // depend on each other. If the profile call fails, the first sign-in creates the profile instead.
    await Promise.all([
      registerUserWithApi(userCredential.user),
      sendEmailVerification(userCredential.user),
    ]);

    return userCredential.user;
  } catch (error: any) {
    return toAuthError(error);
  }
};

// Sign in with email and password
export const signInWithEmail = async (
  email: string,
  password: string
): Promise<User | AuthError> => {
  try {
    // The server logs the sign-in when it creates the session.
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    return userCredential.user;
  } catch (error: any) {
    return toAuthError(error);
  }
};

// Send email verification
export const sendVerificationEmail = async (
  user: User
): Promise<boolean | AuthError> => {
  try {
    await sendEmailVerification(user);

    recordActivity("verification_email_sent");

    return true;
  } catch (error: any) {
    return toAuthError(error);
  }
};

// Send password reset email
export const resetPassword = async (
  email: string
): Promise<boolean | AuthError> => {
  try {
    await sendPasswordResetEmail(auth, email);
    return true;
  } catch (error: any) {
    return toAuthError(error);
  }
};

// Sign in with Google
export const signInWithGoogle = async (): Promise<User | AuthError> => {
  try {
    // The session route that runs next creates a new person's profile and logs the sign-in.
    const provider = new GoogleAuthProvider();
    const userCredential = await signInWithPopup(auth, provider, browserPopupRedirectResolver);

    return userCredential.user;
  } catch (error: any) {
    return toAuthError(error);
  }
};

// Sign out
export const signOut = async (): Promise<boolean> => {
  try {
    // The server logs the sign-out when it clears the session.
    await firebaseSignOut(auth);
    return true;
  } catch (error) {
    console.error("Error signing out:", error);
    return false;
  }
};

// Get current user
export const getCurrentUser = (): User | null => {
  return auth.currentUser;
};

// Listen to auth state changes
export const onAuthChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};
