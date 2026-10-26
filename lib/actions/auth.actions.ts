/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/actions/auth.actions.ts
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
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateEmail,
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  MultiFactorInfo,
  // MultiFactorUser,
  TotpMultiFactorGenerator,
  TotpSecret,
} from "firebase/auth";
import { doc, updateDoc, serverTimestamp, arrayUnion } from "firebase/firestore";
import { db } from "@/firebase/client";

export interface AuthError {
  code: string;
  message: string;
}

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
    return {
      code: error.code || "unknown",
      message: error.message || "An unknown error occurred",
    };
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
    return {
      code: error.code || "unknown",
      message: error.message || "An unknown error occurred",
    };
  }
};

// Send email verification
export const sendVerificationEmail = async (
  user: User
): Promise<boolean | AuthError> => {
  try {
    await sendEmailVerification(user);

    void logActivityInUserDocument(user.uid, "verification_email_sent");

    return true;
  } catch (error: any) {
    return {
      code: error.code || "unknown",
      message: error.message || "An unknown error occurred",
    };
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
    return {
      code: error.code || "unknown",
      message: error.message || "An unknown error occurred",
    };
  }
};

// Update user profile
export const updateUserProfile = async (
  user: User,
  data: { displayName?: string; photoURL?: string }
): Promise<boolean | AuthError> => {
  try {
    await updateProfile(user, data);

    // Update in Firestore with the enhanced structure
    try {
      const updateData: Record<string, any> = {
        updatedAt: serverTimestamp(),
      };

      if (data.displayName) {
        updateData.displayName = data.displayName;
      }

      if (data.photoURL) {
        updateData.photoURL = data.photoURL;
      }

      await updateDoc(doc(db, "users", user.uid), updateData);

      // Log profile update
      void logActivityInUserDocument(user.uid, "profile_updated", {
        fields: Object.keys(data),
      });
    } catch (firestoreError) {
      console.warn("Failed to update profile in Firestore:", firestoreError);
      // Continue even if Firestore fails - auth update succeeded
    }

    return true;
  } catch (error: any) {
    return {
      code: error.code || "unknown",
      message: error.message || "An unknown error occurred",
    };
  }
};

// Update user email
export const updateUserEmail = async (
  user: User,
  newEmail: string,
  password: string
): Promise<boolean | AuthError> => {
  try {
    // Re-authenticate user before changing email
    const credential = EmailAuthProvider.credential(user.email || "", password);
    await reauthenticateWithCredential(user, credential);

    // Update email in Firebase Auth
    await updateEmail(user, newEmail);

    // Try to update in Firestore with enhanced structure
    try {
      await updateDoc(doc(db, "users", user.uid), {
        email: newEmail,
        emailVerified: false,
        updatedAt: serverTimestamp(),
      });

      // Log email update
      void logActivityInUserDocument(user.uid, "email_changed", {
        oldEmail: user.email,
        newEmail,
      });
    } catch (firestoreError) {
      console.warn("Failed to update email in Firestore:", firestoreError);
      // Continue even if Firestore fails - auth update succeeded
    }

    // Send verification email for new email
    await sendEmailVerification(user);

    return true;
  } catch (error: any) {
    return {
      code: error.code || "unknown",
      message: error.message || "An unknown error occurred",
    };
  }
};

// Update user password
export const updateUserPassword = async (
  user: User,
  currentPassword: string,
  newPassword: string
): Promise<boolean | AuthError> => {
  try {
    // Re-authenticate user before changing password
    const credential = EmailAuthProvider.credential(
      user.email || "",
      currentPassword
    );
    await reauthenticateWithCredential(user, credential);

    // Update password
    await updatePassword(user, newPassword);

    // Log password change
    void logActivityInUserDocument(user.uid, "password_changed");

    return true;
  } catch (error: any) {
    return {
      code: error.code || "unknown",
      message: error.message || "An unknown error occurred",
    };
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
    return {
      code: error.code || "unknown",
      message: error.message || "An unknown error occurred",
    };
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

// Log activity directly in the user document. Callers don't wait for it: it's a record, not part of the action.
// (Sign-in, sign-up and sign-out are logged by the server instead.)
export const logActivityInUserDocument = async (
  userId: string,
  activityType: string,
  details?: Record<string, any>
): Promise<void> => {
  try {
    // Fails harmlessly when there is no profile yet; no read first, which would be another round trip.
    await updateDoc(doc(db, "users", userId), {
      activityLogs: arrayUnion({
        type: activityType,
        timestamp: new Date(),
        details: details || {},
        userAgent: navigator.userAgent,
      }),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Failed to log user activity:", error);
  }
};

// Get user's MFA enrollment status
export const getMfaStatus = (
  user: User
): {
  enrolled: boolean;
  availableFactors: MultiFactorInfo[];
} => {
  try {
    const multiFactorUser = multiFactor(user);
    const enrolledFactors = multiFactorUser.enrolledFactors;

    return {
      enrolled: enrolledFactors.length > 0,
      availableFactors: enrolledFactors,
    };
  } catch (error) {
    console.error("Error getting MFA status:", error);
    return {
      enrolled: false,
      availableFactors: [],
    };
  }
};

// Start phone MFA enrollment process
export const startPhoneMfaEnrollment = async (
  user: User,
  phoneNumber: string,
  recaptchaContainer: HTMLElement
): Promise<{ verificationId: string } | AuthError> => {
  try {
    // Create a new RecaptchaVerifier instance
    const recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaContainer, {
      size: "normal",
      callback: () => {
        // reCAPTCHA solved, proceed with enrollment
      },
    });

    // Get multi-factor session
    const multiFactorUser = multiFactor(user);
    const multiFactorSession = await multiFactorUser.getSession();

    // Set up phone auth provider
    const phoneProvider = new PhoneAuthProvider(auth);

    // Send verification code to user's phone
    const verificationId = await phoneProvider.verifyPhoneNumber(
      {
        phoneNumber,
        session: multiFactorSession,
      },
      recaptchaVerifier
    );

    return { verificationId };
  } catch (error: any) {
    return {
      code: error.code || "unknown",
      message: error.message || "An unknown error occurred",
    };
  }
};

// Complete phone MFA enrollment
export const completePhoneMfaEnrollment = async (
  user: User,
  verificationId: string,
  verificationCode: string,
  displayName?: string
): Promise<boolean | AuthError> => {
  try {
    // Set up credential with verification ID and code
    const credential = PhoneAuthProvider.credential(
      verificationId,
      verificationCode
    );

    // Create the Phone multi-factor assertion
    const multiFactorAssertion =
      PhoneMultiFactorGenerator.assertion(credential);

    // Enroll the second factor
    const multiFactorUser = multiFactor(user);
    await multiFactorUser.enroll(
      multiFactorAssertion,
      displayName || "My Phone"
    );

    // Log the MFA enrollment in user document
    void logActivityInUserDocument(user.uid, "mfa_enabled", {
      type: "phone",
      phoneNumber: "redacted",
    });

    return true;
  } catch (error: any) {
    return {
      code: error.code || "unknown",
      message: error.message || "An unknown error occurred",
    };
  }
};

// Generate TOTP (Time-based One-Time Password) secret for MFA
export const generateTotpSecret = async (
  user: User
): Promise<TotpSecret | AuthError> => {
  try {
    const multiFactorUser = multiFactor(user);
    const multiFactorSession = await multiFactorUser.getSession();

    // Generate a TOTP secret
    const totpSecret = await TotpMultiFactorGenerator.generateSecret(
      multiFactorSession
    );

    return totpSecret;
  } catch (error: any) {
    return {
      code: error.code || "unknown",
      message: error.message || "An unknown error occurred",
    };
  }
};

// Complete TOTP MFA enrollment
export const completeTotpMfaEnrollment = async (
  user: User,
  totpSecret: TotpSecret,
  verificationCode: string,
  displayName?: string
): Promise<boolean | AuthError> => {
  try {
    const multiFactorAssertion =
      TotpMultiFactorGenerator.assertionForEnrollment(
        totpSecret,
        verificationCode
      );

    // Enroll the TOTP factor
    const multiFactorUser = multiFactor(user);
    await multiFactorUser.enroll(
      multiFactorAssertion,
      displayName || "Authenticator App"
    );

    // Log the MFA enrollment in user document
    void logActivityInUserDocument(user.uid, "mfa_enabled", {
      type: "totp",
    });

    return true;
  } catch (error: any) {
    return {
      code: error.code || "unknown",
      message: error.message || "An unknown error occurred",
    };
  }
};

// Unenroll a multi-factor auth method
export const unenrollMfaFactor = async (
  user: User,
  factorUid: string
): Promise<boolean | AuthError> => {
  try {
    const multiFactorUser = multiFactor(user);
    await multiFactorUser.unenroll(factorUid);

    // Log the MFA removal in user document
    void logActivityInUserDocument(user.uid, "mfa_disabled", {
      factorUid,
    });

    return true;
  } catch (error: any) {
    return {
      code: error.code || "unknown",
      message: error.message || "An unknown error occurred",
    };
  }
};
