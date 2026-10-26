/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/actions/auth-account.ts
// Account changes on the profile page: name, email, password, and the list of second factors.
// Enrolling a second factor is in auth-mfa.ts, loaded only when someone starts it.
import {
  User,
  sendEmailVerification,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateEmail,
  multiFactor,
  MultiFactorInfo,
} from "firebase/auth";
import { recordActivity } from "@/lib/actions/activity";
import { toAuthError, type AuthError } from "@/lib/actions/auth-core";
import { apiRequest } from "@/lib/api-client";

/**
 * Copies the Firebase account's name and email into the person's profile (`users/{uid}`), through the
 * server. Firebase Auth already has the change, so a failure here is logged, not reported.
 */
const syncProfile = async (body: { displayName?: string; photoURL?: string }) => {
  try {
    await apiRequest("/api/account/profile", { method: "PATCH", body });
  } catch (error) {
    console.warn("Failed to update the profile:", error);
  }
};

// Update user profile
export const updateUserProfile = async (
  user: User,
  data: { displayName?: string; photoURL?: string }
): Promise<boolean | AuthError> => {
  try {
    await updateProfile(user, data);
    // The server logs `profile_updated`.
    await syncProfile(data);
    return true;
  } catch (error: any) {
    return toAuthError(error);
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
    const oldEmail = user.email;
    await reauthenticateWithCredential(user, credential);

    // Update email in Firebase Auth. This also refreshes the ID token, so the server reads the new
    // address (not yet verified) from it.
    await updateEmail(user, newEmail);
    await syncProfile({});
    recordActivity("email_changed", { oldEmail, newEmail });

    // Send verification email for new email
    await sendEmailVerification(user);

    return true;
  } catch (error: any) {
    return toAuthError(error);
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

    recordActivity("password_changed");

    return true;
  } catch (error: any) {
    return toAuthError(error);
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

// Unenroll a multi-factor auth method
export const unenrollMfaFactor = async (
  user: User,
  factorUid: string
): Promise<boolean | AuthError> => {
  try {
    const multiFactorUser = multiFactor(user);
    await multiFactorUser.unenroll(factorUid);

    recordActivity("mfa_disabled", { factorUid });

    return true;
  } catch (error: any) {
    return toAuthError(error);
  }
};
