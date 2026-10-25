"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { sendVerificationEmail } from "@/lib/actions/auth.actions";

// Component that uses searchParams (should be wrapped in Suspense)
function VerifyEmailContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode");
  const oobCode = searchParams.get("oobCode");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [verificationCountdown, setVerificationCountdown] = useState(0);

  // Check if user is already verified
  useEffect(() => {
    if (!loading && user?.emailVerified) {
      setMessage({
        type: "success",
        text: "Your email has already been verified! You can now use all features of the application.",
      });
    }
  }, [user, loading]);

  // Handle countdown for verification email
  useEffect(() => {
    if (verificationCountdown > 0) {
      const timer = setTimeout(
        () => setVerificationCountdown(verificationCountdown - 1),
        1000
      );
      return () => clearTimeout(timer);
    }
  }, [verificationCountdown]);

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      router.push("/sign-in");
    }
  }, [loading, user, router]);

  const handleResendVerification = async () => {
    if (!user) return;

    try {
      setIsSubmitting(true);
      setMessage(null);

      const result = await sendVerificationEmail(user);

      if (result === true) {
        setMessage({
          type: "success",
          text: "Verification email sent successfully. Please check your inbox and spam folder.",
        });
        setVerificationCountdown(60);
      } else {
        setMessage({
          type: "error",
          text:
            (typeof result === "object" && result.message) ||
            "Failed to send verification email. Please try again.",
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

  // Handle verification from email link
  useEffect(() => {
    if (mode === "verifyEmail" && oobCode) {
      // The actual verification is handled by Firebase automatically
      // We just need to refresh the page to update the UI
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    }
  }, [mode, oobCode]);

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
        <div className="max-w-md mx-auto">
          <div className="bg-white p-8 rounded-xl shadow-sm">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">Verify Your Email</h1>
              <p className="text-gray-600">
                {user?.emailVerified
                  ? "Your email has been verified successfully!"
                  : "Please verify your email address to access all features."}
              </p>
            </div>

            {message && (
              <div
                className={`mb-6 py-3 px-4 rounded-md ${
                  message.type === "error"
                    ? "bg-red-50 text-red-500"
                    : "bg-green-50 text-green-600"
                }`}
              >
                {message.text}
              </div>
            )}

            {/* If verification link is clicked */}
            {mode === "verifyEmail" && oobCode && (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-green-500"
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
                </div>
                <h2 className="text-xl font-semibold mb-2">
                  Email Verification Successful
                </h2>
                <p className="text-gray-600 mb-6">
                  Your email has been verified successfully. You can now use all
                  features of our platform.
                </p>
                <Link
                  href="/profile"
                  className="inline-block bg-gradient-to-r from-purple-primary to-tech-blue-light text-white font-medium py-2 px-6 rounded-lg hover:shadow-md transition-all"
                >
                  Go to Profile
                </Link>
              </div>
            )}

            {/* If user is not verified */}
            {!user?.emailVerified && mode !== "verifyEmail" && (
              <div className="space-y-6">
                <div className="bg-blue-50 p-4 rounded-md">
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
                        We&apos;ve sent a verification email to{" "}
                        <strong>{user?.email}</strong>. Please check your inbox
                        and spam folder.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="text-center py-4">
                  <p className="text-gray-600 mb-4">
                    Didn&apos;t receive the verification email? You can request
                    a new one.
                  </p>

                  <button
                    onClick={handleResendVerification}
                    disabled={isSubmitting || verificationCountdown > 0}
                    className="bg-gradient-to-r from-purple-primary to-tech-blue-light text-white font-medium py-2 px-6 rounded-lg hover:shadow-md hover:shadow-purple-primary/20 transition-all duration-300 flex items-center justify-center mx-auto disabled:opacity-50"
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
                        Sending...
                      </span>
                    ) : verificationCountdown > 0 ? (
                      `Resend in ${verificationCountdown}s`
                    ) : (
                      "Resend Verification Email"
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* If user is already verified */}
            {user?.emailVerified && mode !== "verifyEmail" && (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-green-500"
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
                </div>
                <h2 className="text-xl font-semibold mb-2">
                  Email Already Verified
                </h2>
                <p className="text-gray-600 mb-6">
                  Your email has already been verified. You can now use all
                  features of our platform.
                </p>
                <div className="flex gap-4 justify-center">
                  <Link
                    href="/"
                    className="inline-block bg-gradient-to-r from-purple-primary to-tech-blue-light text-white font-medium py-2 px-6 rounded-lg hover:shadow-md transition-all"
                  >
                    Go to Home
                  </Link>
                  <Link
                    href="/profile"
                    className="inline-block border border-accent-primary text-accent-primary font-medium py-2 px-6 rounded-lg hover:bg-accent-primary/5 transition-all"
                  >
                    View Profile
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Main component that wraps the content in a Suspense boundary
const VerifyEmailPage = () => {
  return (
    <Suspense fallback={<div className="flex justify-center p-8">Loading verification details...</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
};

export default VerifyEmailPage;
