"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import {
  updateUserProfile,
  updateUserEmail,
  updateUserPassword,
  sendVerificationEmail,
  startPhoneMfaEnrollment,
  completePhoneMfaEnrollment,
  getMfaStatus,
  generateTotpSecret,
  completeTotpMfaEnrollment,
  unenrollMfaFactor,
} from "@/lib/actions/auth.actions";
import { QRCodeSVG } from "qrcode.react";

type ActiveTab = "profile" | "email" | "password" | "security";

const ProfilePage = () => {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<ActiveTab>("profile");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Form states
  const [displayName, setDisplayName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // MFA states
  // Marking with any to avoid TypeScript issues with Firebase MultiFactorInfo type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [mfaFactors, setMfaFactors] = useState<Array<any>>([]);
  const [activeMfaSetup, setActiveMfaSetup] = useState<"phone" | "totp" | null>(
    null
  );
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [totpSecret, setTotpSecret] = useState<any>(null);
  const [totpQrCode, setTotpQrCode] = useState("");
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      router.push("/sign-in");
    }
  }, [loading, user, router]);

  // Initialize form values and MFA status
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || "");

      // Get MFA status
      try {
        const status = getMfaStatus(user);
        setMfaFactors(status.availableFactors || []);
      } catch (error) {
        console.error("Error getting MFA status:", error);
      }
    }
  }, [user]);

  // Handle profile update
  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return;

    try {
      setIsSubmitting(true);
      setMessage(null);

      const result = await updateUserProfile(user, { displayName });

      if (result === true) {
        setMessage({
          type: "success",
          text: "Profile updated successfully!",
        });
      } else {
        setMessage({
          type: "error",
          text:
            typeof result === "object" && result !== null && "message" in result
              ? result.message
              : "Failed to update profile. Please try again.",
        });
      }
    } catch (error) {
      console.error("Profile update error:", error);
      setMessage({
        type: "error",
        text: "An unexpected error occurred. Please try again later.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle email update
  const handleEmailUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return;

    // Validate email
    if (!newEmail || !newEmail.includes("@")) {
      setMessage({
        type: "error",
        text: "Please enter a valid email address.",
      });
      return;
    }

    // Validate password
    if (!emailPassword) {
      setMessage({
        type: "error",
        text: "Please enter your current password to confirm this change.",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      setMessage(null);

      const result = await updateUserEmail(user, newEmail, emailPassword);

      if (result === true) {
        setMessage({
          type: "success",
          text: "Email updated successfully! Please check your inbox to verify your new email address.",
        });
        setNewEmail("");
        setEmailPassword("");
      } else {
        setMessage({
          type: "error",
          text:
            typeof result === "object" && result !== null && "message" in result
              ? result.message
              : "Failed to update email. Please check your password and try again.",
        });
      }
    } catch (error) {
      console.error("Email update error:", error);
      setMessage({
        type: "error",
        text: "An unexpected error occurred. Please try again later.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle password update
  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return;

    // Validate password
    if (!currentPassword) {
      setMessage({
        type: "error",
        text: "Please enter your current password.",
      });
      return;
    }

    if (newPassword.length < 8) {
      setMessage({
        type: "error",
        text: "New password must be at least 8 characters long.",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({
        type: "error",
        text: "New passwords don't match.",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      setMessage(null);

      const result = await updateUserPassword(
        user,
        currentPassword,
        newPassword
      );

      if (result === true) {
        setMessage({
          type: "success",
          text: "Password updated successfully!",
        });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setMessage({
          type: "error",
          text:
            typeof result === "object" && result !== null && "message" in result
              ? result.message
              : "Failed to update password. Please check your current password and try again.",
        });
      }
    } catch (error) {
      console.error("Password update error:", error);
      setMessage({
        type: "error",
        text: "An unexpected error occurred. Please try again later.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle email verification
  const handleSendVerification = async () => {
    if (!user) return;

    try {
      setIsSubmitting(true);
      setMessage(null);

      const result = await sendVerificationEmail(user);

      if (result === true) {
        setMessage({
          type: "success",
          text: "Verification email sent successfully! Please check your inbox.",
        });
      } else {
        setMessage({
          type: "error",
          text:
            typeof result === "object" && result !== null && "message" in result
              ? result.message
              : "Failed to send verification email. Please try again.",
        });
      }
    } catch (error) {
      console.error("Verification email error:", error);
      setMessage({
        type: "error",
        text: "An unexpected error occurred. Please try again later.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle starting phone MFA enrollment
  const handleStartPhoneMfa = async () => {
    if (!user || !phoneNumber || !recaptchaContainerRef.current) return;

    try {
      setIsSubmitting(true);
      setMessage(null);

      const result = await startPhoneMfaEnrollment(
        user,
        phoneNumber,
        recaptchaContainerRef.current
      );

      if ("verificationId" in result) {
        setVerificationId(result.verificationId);
        setMessage({
          type: "success",
          text: "Verification code sent to your phone number. Please enter the code to complete setup.",
        });
      } else {
        setMessage({
          type: "error",
          text:
            typeof result === "object" && result !== null && "message" in result
              ? result.message
              : "Failed to start phone verification. Please try again.",
        });
      }
    } catch (error) {
      console.error("Phone MFA error:", error);
      setMessage({
        type: "error",
        text: "An unexpected error occurred. Please try again later.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle completing phone MFA enrollment
  const handleCompletePhoneMfa = async () => {
    if (!user || !verificationId || !verificationCode) return;

    try {
      setIsSubmitting(true);
      setMessage(null);

      const result = await completePhoneMfaEnrollment(
        user,
        verificationId,
        verificationCode,
        `Phone (${phoneNumber})`
      );

      if (result === true) {
        // Update MFA factors list
        const status = getMfaStatus(user);
        setMfaFactors(status.availableFactors);

        setMessage({
          type: "success",
          text: "Phone verification successfully set up as a second factor.",
        });

        // Reset form
        setActiveMfaSetup(null);
        setPhoneNumber("");
        setVerificationId("");
        setVerificationCode("");
      } else {
        setMessage({
          type: "error",
          text:
            typeof result === "object" && result !== null && "message" in result
              ? result.message
              : "Failed to complete phone verification. Please try again.",
        });
      }
    } catch (error) {
      console.error("Phone MFA completion error:", error);
      setMessage({
        type: "error",
        text: "An unexpected error occurred. Please try again later.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle starting TOTP MFA enrollment
  const handleStartTotpMfa = async () => {
    if (!user) return;

    try {
      setIsSubmitting(true);
      setMessage(null);

      const result = await generateTotpSecret(user);

      if ("secretKey" in result) {
        setTotpSecret(result);

        // Generate QR code URL for authenticator apps
        // Use the correct URI structure for TOTP
        const otpAuthUrl = `otpauth://totp/AgencyQuiz:${user.email}?secret=${result.secretKey}&issuer=AgencyQuiz`;
        setTotpQrCode(otpAuthUrl);

        setMessage({
          type: "success",
          text: "Scan the QR code with your authenticator app, then enter the verification code.",
        });
      } else {
        setMessage({
          type: "error",
          text:
            typeof result === "object" && result !== null && "message" in result
              ? result.message
              : "Failed to generate authenticator secret. Please try again.",
        });
      }
    } catch (error) {
      console.error("TOTP MFA error:", error);
      setMessage({
        type: "error",
        text: "An unexpected error occurred. Please try again later.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle completing TOTP MFA enrollment
  const handleCompleteTotpMfa = async () => {
    if (!user || !totpSecret || !verificationCode) return;

    try {
      setIsSubmitting(true);
      setMessage(null);

      const result = await completeTotpMfaEnrollment(
        user,
        totpSecret,
        verificationCode,
        "Authenticator App"
      );

      if (result === true) {
        // Update MFA factors list
        const status = getMfaStatus(user);
        setMfaFactors(status.availableFactors);

        setMessage({
          type: "success",
          text: "Authenticator app successfully set up as a second factor.",
        });

        // Reset form
        setActiveMfaSetup(null);
        setTotpSecret(null);
        setTotpQrCode("");
        setVerificationCode("");
      } else {
        setMessage({
          type: "error",
          text:
            typeof result === "object" && result !== null && "message" in result
              ? result.message
              : "Failed to verify authenticator code. Please try again.",
        });
      }
    } catch (error) {
      console.error("TOTP MFA completion error:", error);
      setMessage({
        type: "error",
        text: "An unexpected error occurred. Please try again later.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle removing an MFA factor
  const handleRemoveMfaFactor = async (factorUid: string) => {
    if (!user) return;

    try {
      setIsSubmitting(true);
      setMessage(null);

      const result = await unenrollMfaFactor(user, factorUid);

      if (result === true) {
        // Update MFA factors list
        const status = getMfaStatus(user);
        setMfaFactors(status.availableFactors);

        setMessage({
          type: "success",
          text: "Second factor removed successfully.",
        });
      } else {
        setMessage({
          type: "error",
          text:
            typeof result === "object" && result !== null && "message" in result
              ? result.message
              : "Failed to remove second factor. Please try again.",
        });
      }
    } catch (error) {
      console.error("MFA removal error:", error);
      setMessage({
        type: "error",
        text: "An unexpected error occurred. Please try again later.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render profile tab content
  const renderProfileTab = () => {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Profile Information</h1>
        <form onSubmit={handleProfileUpdate} className="space-y-6">
          <div>
            <label
              htmlFor="displayName"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Display Name
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              placeholder="Your display name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <div className="flex items-center">
              <input
                type="email"
                value={user?.email || ""}
                disabled
                className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
              />
              {user?.emailVerified ? (
                <div className="ml-2 text-green-500 text-sm flex items-center">
                  <svg
                    className="w-5 h-5 mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Verified
                </div>
              ) : (
                <div className="ml-2 text-amber-500 text-sm flex items-center">
                  <svg
                    className="w-5 h-5 mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  Not Verified
                </div>
              )}
            </div>
            {!user?.emailVerified && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={handleSendVerification}
                  disabled={isSubmitting}
                  className="text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  Resend verification email
                </button>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-blue-600 text-white font-medium py-2 px-6 rounded-lg hover:bg-blue-700 transition-all duration-300 flex items-center justify-center disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="flex items-center">
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Updating...
              </span>
            ) : (
              "Update Profile"
            )}
          </button>
        </form>
      </div>
    );
  };

  // Render email tab content
  const renderEmailTab = () => {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Change Email Address</h1>

        <div className="mb-6 bg-blue-50 p-4 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-blue-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                Changing your email requires verification. You&apos;ll need to
                verify your new email address before the change takes effect.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleEmailUpdate} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Current Email
            </label>
            <input
              type="email"
              value={user?.email || ""}
              disabled
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
            />
          </div>

          <div>
            <label
              htmlFor="newEmail"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              New Email Address
            </label>
            <input
              id="newEmail"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              placeholder="your-new-email@example.com"
              required
            />
          </div>

          <div>
            <label
              htmlFor="emailPassword"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Current Password (to confirm)
            </label>
            <input
              id="emailPassword"
              type="password"
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              placeholder="Enter your current password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-blue-600 text-white font-medium py-2 px-6 rounded-lg hover:bg-blue-700 transition-all duration-300 flex items-center justify-center disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="flex items-center">
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Updating...
              </span>
            ) : (
              "Update Email"
            )}
          </button>
        </form>
      </div>
    );
  };

  // Render password tab content
  const renderPasswordTab = () => {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Change Password</h1>

        <form onSubmit={handlePasswordUpdate} className="space-y-6">
          <div>
            <label
              htmlFor="currentPassword"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Current Password
            </label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              placeholder="Enter your current password"
              required
            />
          </div>

          <div>
            <label
              htmlFor="newPassword"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              New Password
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              placeholder="Enter your new password"
              required
              minLength={8}
            />
            <p className="mt-1 text-sm text-gray-500">
              Password must be at least 8 characters long
            </p>
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              placeholder="Confirm your new password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-blue-600 text-white font-medium py-2 px-6 rounded-lg hover:bg-blue-700 transition-all duration-300 flex items-center justify-center disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="flex items-center">
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Updating...
              </span>
            ) : (
              "Update Password"
            )}
          </button>
        </form>
      </div>
    );
  };

  // Render security tab content
  const renderSecurityTab = () => {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Account Security</h1>

        <div className="space-y-6">
          {/* Email Verification Section */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-medium">Email Verification</h3>
            </div>
            <div className="p-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-gray-600 text-sm mb-1">
                    Verify your email to protect your account
                  </p>
                  <div className="flex items-center">
                    <div
                      className={`h-2.5 w-2.5 rounded-full mr-2 ${
                        user?.emailVerified ? "bg-green-500" : "bg-amber-500"
                      }`}
                    ></div>
                    <span
                      className={`text-sm font-medium ${
                        user?.emailVerified
                          ? "text-green-600"
                          : "text-amber-600"
                      }`}
                    >
                      {user?.emailVerified ? "Verified" : "Not Verified"}
                    </span>
                  </div>
                </div>

                {!user?.emailVerified && (
                  <button
                    type="button"
                    onClick={handleSendVerification}
                    disabled={isSubmitting}
                    className="bg-blue-600 text-white text-sm py-1.5 px-4 rounded hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {isSubmitting ? "Sending..." : "Verify Email"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Two-factor Authentication Section */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-medium">Two-Factor Authentication (2FA)</h3>
            </div>
            <div className="p-4">
              <p className="text-gray-600 text-sm mb-4">
                Add a second layer of security to your account by requiring more
                than just a password to sign in.
              </p>

              {/* Current 2FA Status */}
              <div className="mb-4">
                <div className="flex items-center mb-2">
                  <div
                    className={`h-2.5 w-2.5 rounded-full mr-2 ${
                      mfaFactors.length > 0 ? "bg-green-500" : "bg-gray-300"
                    }`}
                  ></div>
                  <span
                    className={`text-sm font-medium ${
                      mfaFactors.length > 0 ? "text-green-600" : "text-gray-600"
                    }`}
                  >
                    {mfaFactors.length > 0 ? "Enabled" : "Not Enabled"}
                  </span>
                </div>

                {mfaFactors.length > 0 && (
                  <div className="bg-gray-50 rounded-md p-3 mb-4">
                    <p className="text-sm font-medium mb-2">
                      Enrolled Factors:
                    </p>
                    <ul className="space-y-2">
                      {mfaFactors.map((factor) => (
                        <li
                          key={factor.uid}
                          className="flex justify-between items-center"
                        >
                          <div className="flex items-center">
                            <span className="text-sm">
                              {factor.displayName || "Second Factor"}
                              <span className="text-xs text-gray-500 ml-1">
                                (
                                {factor.factorId === "phone"
                                  ? "SMS"
                                  : "Authenticator App"}
                                )
                              </span>
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveMfaFactor(factor.uid)}
                            disabled={isSubmitting}
                            className="text-sm text-red-500 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* 2FA Setup Options */}
              {activeMfaSetup === null ? (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setActiveMfaSetup("phone")}
                    className="w-full flex justify-between items-center p-3 border border-gray-300 rounded-md text-sm hover:bg-gray-50 transition"
                  >
                    <span className="flex items-center">
                      <svg
                        className="w-5 h-5 mr-2 text-gray-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                        />
                      </svg>
                      Set up phone authentication
                    </span>
                    <svg
                      className="w-5 h-5 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveMfaSetup("totp")}
                    className="w-full flex justify-between items-center p-3 border border-gray-300 rounded-md text-sm hover:bg-gray-50 transition"
                  >
                    <span className="flex items-center">
                      <svg
                        className="w-5 h-5 mr-2 text-gray-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      Set up authenticator app
                    </span>
                    <svg
                      className="w-5 h-5 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                </div>
              ) : activeMfaSetup === "phone" ? (
                <div className="border border-gray-200 rounded-md p-4">
                  <h4 className="font-medium mb-3">
                    Set up phone authentication
                  </h4>

                  {!verificationId ? (
                    <>
                      <div className="mb-4">
                        <label
                          htmlFor="phoneNumber"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Phone Number
                        </label>
                        <input
                          id="phoneNumber"
                          type="tel"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                          placeholder="+1 555 123 4567"
                          required
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          Enter your phone number with country code (e.g., +1
                          for US)
                        </p>
                      </div>

                      <div ref={recaptchaContainerRef} className="mb-4"></div>

                      <div className="flex space-x-3">
                        <button
                          type="button"
                          onClick={handleStartPhoneMfa}
                          disabled={isSubmitting || !phoneNumber}
                          className="bg-blue-600 text-white text-sm py-2 px-4 rounded hover:bg-blue-700 transition disabled:opacity-50"
                        >
                          {isSubmitting
                            ? "Sending..."
                            : "Send Verification Code"}
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveMfaSetup(null)}
                          className="text-gray-500 text-sm py-2 px-4 border border-gray-300 rounded hover:bg-gray-50 transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="mb-4">
                        <label
                          htmlFor="verificationCode"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Verification Code
                        </label>
                        <input
                          id="verificationCode"
                          type="text"
                          value={verificationCode}
                          onChange={(e) => setVerificationCode(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                          placeholder="123456"
                          required
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          Enter the verification code sent to your phone
                        </p>
                      </div>

                      <div className="flex space-x-3">
                        <button
                          type="button"
                          onClick={handleCompletePhoneMfa}
                          disabled={isSubmitting || !verificationCode}
                          className="bg-blue-600 text-white text-sm py-2 px-4 rounded hover:bg-blue-700 transition disabled:opacity-50"
                        >
                          {isSubmitting ? "Verifying..." : "Verify Code"}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setVerificationId("");
                            setVerificationCode("");
                          }}
                          className="text-gray-500 text-sm py-2 px-4 border border-gray-300 rounded hover:bg-gray-50 transition"
                        >
                          Back
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                activeMfaSetup === "totp" && (
                  <div className="border border-gray-200 rounded-md p-4">
                    <h4 className="font-medium mb-3">
                      Set up authenticator app
                    </h4>

                    {!totpQrCode ? (
                      <>
                        <p className="text-sm text-gray-600 mb-4">
                          Use an authenticator app like Google Authenticator,
                          Microsoft Authenticator, or Authy to generate
                          verification codes.
                        </p>

                        <div className="flex space-x-3">
                          <button
                            type="button"
                            onClick={handleStartTotpMfa}
                            disabled={isSubmitting}
                            className="bg-blue-600 text-white text-sm py-2 px-4 rounded hover:bg-blue-700 transition disabled:opacity-50"
                          >
                            {isSubmitting
                              ? "Generating..."
                              : "Generate QR Code"}
                          </button>

                          <button
                            type="button"
                            onClick={() => setActiveMfaSetup(null)}
                            className="text-gray-500 text-sm py-2 px-4 border border-gray-300 rounded hover:bg-gray-50 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex flex-col items-center mb-4">
                          <p className="text-sm text-gray-600 mb-3">
                            Scan this QR code with your authenticator app
                          </p>
                          <div className="bg-white p-2 rounded-md shadow-sm">
                            <QRCodeSVG value={totpQrCode} size={180} />
                          </div>
                          {totpSecret && (
                            <div className="mt-3 text-center">
                              <p className="text-xs text-gray-500 mb-1">
                                If you can&apos;t scan the QR code, enter this
                                code manually:
                              </p>
                              <p className="font-mono text-sm bg-gray-100 px-3 py-1 rounded">
                                {totpSecret.secretKey}
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="mb-4">
                          <label
                            htmlFor="totpCode"
                            className="block text-sm font-medium text-gray-700 mb-1"
                          >
                            Verification Code
                          </label>
                          <input
                            id="totpCode"
                            type="text"
                            value={verificationCode}
                            onChange={(e) =>
                              setVerificationCode(e.target.value)
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                            placeholder="123456"
                            required
                          />
                          <p className="mt-1 text-xs text-gray-500">
                            Enter the verification code shown in your
                            authenticator app
                          </p>
                        </div>

                        <div className="flex space-x-3">
                          <button
                            type="button"
                            onClick={handleCompleteTotpMfa}
                            disabled={isSubmitting || !verificationCode}
                            className="bg-blue-600 text-white text-sm py-2 px-4 rounded hover:bg-blue-700 transition disabled:opacity-50"
                          >
                            {isSubmitting ? "Verifying..." : "Verify Code"}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setTotpSecret(null);
                              setTotpQrCode("");
                              setVerificationCode("");
                            }}
                            className="text-gray-500 text-sm py-2 px-4 border border-gray-300 rounded hover:bg-gray-50 transition"
                          >
                            Back
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )
              )}
            </div>
          </div>

          {/* Account Data Section */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-medium">Account Data</h3>
            </div>
            <div className="p-4">
              <p className="text-gray-600 text-sm mb-4">
                You can request a copy of your personal data or delete your
                account permanently.
              </p>
              <div className="space-y-3">
                <button
                  type="button"
                  className="w-full flex justify-between items-center p-3 border border-gray-300 rounded-md text-sm hover:bg-gray-50 transition"
                >
                  <span>Request data export</span>
                  <svg
                    className="w-5 h-5 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>

                <button
                  type="button"
                  className="w-full flex justify-between items-center p-3 border border-red-200 rounded-md text-sm text-red-500 hover:bg-red-50 transition"
                >
                  <span>Delete account</span>
                  <svg
                    className="w-5 h-5 text-red-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Security Activity Log */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-medium">Recent Security Activity</h3>
            </div>
            <div className="p-4">
              <p className="text-gray-600 text-sm mb-4">
                Review recent security events for your account. This helps you
                identify any suspicious activity.
              </p>

              <div className="text-center py-6">
                <p className="text-sm text-gray-500">
                  Security activity log is coming soon.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Main render method with a single return statement
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-neutral-50">
        <div className="container mx-auto px-4 py-12 flex justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-purple-primary border-t-transparent rounded-full"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-neutral-50">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="md:flex">
            {/* Sidebar */}
            <div className="md:w-64 bg-gray-50 p-6 border-r border-gray-200">
              <div className="flex items-center mb-8">
                <div className="h-12 w-12 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold text-xl mr-4">
                  {user?.displayName?.[0]?.toUpperCase() ||
                    user?.email?.[0]?.toUpperCase() ||
                    "U"}
                </div>
                <div>
                  <h2 className="font-medium text-lg">
                    {user?.displayName || "User"}
                  </h2>
                  <p className="text-sm text-gray-500">{user?.email}</p>
                </div>
              </div>

              <nav className="space-y-1">
                <button
                  onClick={() => {
                    setActiveTab("profile");
                    setMessage(null);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md flex items-center space-x-3 ${
                    activeTab === "profile"
                      ? "bg-accent-primary/10 text-accent-primary"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                  <span>Profile</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab("email");
                    setMessage(null);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md flex items-center space-x-3 ${
                    activeTab === "email"
                      ? "bg-accent-primary/10 text-accent-primary"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  <span>Email</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab("password");
                    setMessage(null);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md flex items-center space-x-3 ${
                    activeTab === "password"
                      ? "bg-accent-primary/10 text-accent-primary"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                  <span>Password</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab("security");
                    setMessage(null);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md flex items-center space-x-3 ${
                    activeTab === "security"
                      ? "bg-accent-primary/10 text-accent-primary"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                  <span>Security</span>
                </button>
              </nav>
            </div>

            {/* Content */}
            <div className="p-6 md:p-8 flex-1">
              {message && (
                <div
                  className={`mb-6 py-3 px-4 rounded-md ${
                    message.type === "error"
                      ? "bg-red-50 text-red-500 border border-red-100"
                      : "bg-green-50 text-green-600 border border-green-100"
                  }`}
                >
                  {message.text}
                </div>
              )}

              {/* Render the appropriate tab content */}
              {activeTab === "profile" && renderProfileTab()}
              {activeTab === "email" && renderEmailTab()}
              {activeTab === "password" && renderPasswordTab()}
              {activeTab === "security" && renderSecurityTab()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
