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
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp,
  arrayUnion,
} from "firebase/firestore";
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
      console.warn(
        "Failed to register user with API, falling back to client-side registration"
      );
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

    // Try to register user with the API first
    const apiSuccess = await registerUserWithApi(userCredential.user);

    // If API registration fails, fall back to client-side Firestore
    if (!apiSuccess) {
      try {
        // Create a user document in Firestore with enhanced structure
        await setDoc(doc(db, "users", userCredential.user.uid), {
          email,
          displayName,
          role: "user", // Default role
          emailVerified: false,
          photoURL: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
          activityLogs: [],
          customClaims: {
            role: "user",
          },
        });
      } catch (firestoreError) {
        console.error("Firestore error during signup:", firestoreError);
        // Continue even if Firestore fails - auth still succeeded
      }
    }

    // Send email verification regardless of registration method
    await sendEmailVerification(userCredential.user);

    // Log the user activity
    await logActivityInUserDocument(
      userCredential.user.uid,
      "account_created",
      {
        method: "email",
      }
    );

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
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    // Log the signin activity
    await logActivityInUserDocument(userCredential.user.uid, "login", {
      method: "email",
    });

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

    await logActivityInUserDocument(user.uid, "verification_email_sent");

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
      await logActivityInUserDocument(user.uid, "profile_updated", {
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
      await logActivityInUserDocument(user.uid, "email_changed", {
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
    await logActivityInUserDocument(user.uid, "password_changed");

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
    const provider = new GoogleAuthProvider();
    const userCredential = await signInWithPopup(auth, provider, browserPopupRedirectResolver);

    // Try to register user with API first
    const apiSuccess = await registerUserWithApi(userCredential.user);

    // If API registration fails, fall back to client-side Firestore check
    if (!apiSuccess) {
      try {
        // Check if this is a new user and create a document if needed
        const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));

        if (!userDoc.exists()) {
          // Create user document with enhanced structure
          await setDoc(doc(db, "users", userCredential.user.uid), {
            email: userCredential.user.email,
            displayName: userCredential.user.displayName,
            role: "user", // Default role
            emailVerified: userCredential.user.emailVerified,
            photoURL: userCredential.user.photoURL,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastLoginAt: serverTimestamp(),
            activityLogs: [],
            customClaims: {
              role: "user",
            },
          });

          // Log account creation
          await logActivityInUserDocument(
            userCredential.user.uid,
            "account_created",
            {
              method: "google",
            }
          );
        } else {
          // Update login timestamp for existing user
          await updateDoc(doc(db, "users", userCredential.user.uid), {
            lastLoginAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          // Log login
          await logActivityInUserDocument(userCredential.user.uid, "login", {
            method: "google",
          });
        }
      } catch (firestoreError) {
        console.error("Firestore error during Google sign-in:", firestoreError);
        // Continue even if Firestore fails - auth still succeeded
      }
    }

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
    // Log signout for the current user before signing out
    const user = auth.currentUser;
    if (user) {
      await logActivityInUserDocument(user.uid, "logout");
    }

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

// Log activity in userActivities collection (legacy method)
export const logUserActivity = async (
  userId: string,
  activityType:
    | "login"
    | "logout"
    | "password_change"
    | "email_change"
    | "profile_update"
    | "mfa_enabled"
    | "mfa_disabled",
  details?: Record<string, any>
): Promise<void> => {
  try {
    await addDoc(collection(db, "userActivities"), {
      userId,
      activityType,
      details: details || {},
      timestamp: serverTimestamp(),
      ipAddress: "client-side", // Will be replaced by a Cloud Function
      userAgent: navigator.userAgent,
    });
  } catch (error) {
    console.error("Error logging user activity:", error);
  }
};

// Log activity directly in user document (new method)
export const logActivityInUserDocument = async (
  userId: string,
  activityType: string,
  details?: Record<string, any>
): Promise<void> => {
  try {
    // Get the current user document
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      // Prepare the activity log entry
      const activityLog = {
        type: activityType,
        timestamp: new Date(),
        details: details || {},
        userAgent: navigator.userAgent,
      };

      // Update the activityLogs array
      await updateDoc(userRef, {
        activityLogs: arrayUnion(activityLog),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.error("Failed to log user activity:", error);
    // Don't throw - this is a non-critical operation
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
    await logActivityInUserDocument(user.uid, "mfa_enabled", {
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
    await logActivityInUserDocument(user.uid, "mfa_enabled", {
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
    await logActivityInUserDocument(user.uid, "mfa_disabled", {
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
