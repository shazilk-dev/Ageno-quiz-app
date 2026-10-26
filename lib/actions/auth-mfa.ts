/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/actions/auth-mfa.ts
// Enrolling a second factor (SMS with reCAPTCHA, or an authenticator app). Only the setup dialogs on the
// profile page import this, and they're loaded on demand, so no other page ships this code.
import { auth } from "@/firebase/client";
import {
  User,
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  TotpMultiFactorGenerator,
  TotpSecret,
} from "firebase/auth";
import { recordActivity } from "@/lib/actions/activity";
import { toAuthError, type AuthError } from "@/lib/actions/auth-core";

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
    return toAuthError(error);
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

    recordActivity("mfa_enabled", { type: "phone", phoneNumber: "redacted" });

    return true;
  } catch (error: any) {
    return toAuthError(error);
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
    return toAuthError(error);
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

    recordActivity("mfa_enabled", { type: "totp" });

    return true;
  } catch (error: any) {
    return toAuthError(error);
  }
};
