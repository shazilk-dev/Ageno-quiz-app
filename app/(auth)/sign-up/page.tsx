"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { signOut } from "@/lib/actions/auth.actions";

const SignUp = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const router = useRouter();
  const { signUp, loginWithGoogle } = useAuth(); // This extra useEffect helps prevent potential race conditions in navigation

  // Set a flag when first navigating to the sign-up page
  useEffect(() => {
    // No longer automatically clearing session cookies - this causes race conditions
    // The auth context handles session synchronization properly now
    
    // Just show the sign-up form without any session checks
    setCheckingSession(false);
    
    // Set a flag to help with navigation flow
    sessionStorage.setItem("justArrivedAtSignUp", "true");
  }, []);

  useEffect(() => {
    // Set a flag in sessionStorage to indicate we're on the sign-up page
    // This helps prevent unwanted redirects
    sessionStorage.setItem("onSignUpPage", "true");

    return () => {
      // Clean up when component unmounts
      sessionStorage.removeItem("onSignUpPage");
    };
  }, []);

  // No automatic session check when arriving at the sign-up page
  useEffect(() => {
    setCheckingSession(false);
  }, []);

  // Check password strength
  useEffect(() => {
    if (!password) {
      setPasswordStrength("");
      return;
    }

    let strength = "";

    // Length check
    if (password.length < 6) {
      strength = "weak";
    } else if (password.length < 10) {
      strength = "medium";
    } else {
      strength = "strong";
    }

    // Complexity check
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    const complexity = [
      hasUpperCase,
      hasLowerCase,
      hasNumbers,
      hasSpecialChars,
    ].filter(Boolean).length;

    // Downgrade strength based on complexity
    if (complexity < 2) {
      strength = "weak";
    } else if (complexity < 3 && strength === "strong") {
      strength = "medium";
    }

    setPasswordStrength(strength);
  }, [password]);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password || !displayName) {
      setError("Please fill in all fields");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    try {
      setIsLoading(true);
      setError("");

      const result = await signUp(email, password, displayName);
      if (result.success) {
        // Sign out any existing user to ensure they need to sign in again
        await signOut();

        // Show success message
        setSignupSuccess(true);
        // After 3 seconds, redirect to sign-in page
        setTimeout(() => {
          router.push("/sign-in");
        }, 3000);
      } else {
        // Handle specific sign-up errors
        if (result.error?.includes("auth/email-already-in-use")) {
          setError("This email is already registered. Please sign in instead.");
        } else if (result.error?.includes("auth/invalid-email")) {
          setError("Please provide a valid email address.");
        } else if (result.error?.includes("auth/weak-password")) {
          setError(
            "Your password is too weak. Please choose a stronger password."
          );
        } else if (result.error?.includes("auth/network-request-failed")) {
          setError(
            "Network connection error. Please check your internet connection and try again."
          );
        } else {
          // For any other Firebase errors, provide a user-friendly message instead of raw error
          setError("Failed to create account. Please try again later.");
        }
      }
    } catch (err) {
      console.error("Sign up error:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    try {
      setIsLoading(true);
      setError("");

      const result = await loginWithGoogle();

      if (result.success) {
        router.push("/");
      } else {
        // Handle specific Google sign-up errors
        if (result.error?.includes("popup-closed-by-user")) {
          setError("Sign-up was cancelled. Please try again.");
        } else if (
          result.error?.includes("account-exists-with-different-credential")
        ) {
          setError(
            "An account already exists with the same email address but different sign-in credentials."
          );
        } else {
          setError(
            result.error || "Failed to sign up with Google. Please try again."
          );
        }
      }
    } catch (err) {
      console.error("Google sign up error:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-neutral-50">
      
      {/* Background decorative elements */}
      <div className="fixed inset-0 overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-1/4 right-[15%] w-72 h-72 rounded-full bg-gradient-to-br from-purple-600/15 to-blue-500/15 blur-3xl animate-pulse-slow"></div>
        <div className="absolute bottom-1/3 left-[10%] w-96 h-96 rounded-full bg-gradient-to-tr from-purple-200/15 to-blue-500/10 blur-3xl animate-float-slow"></div>
        <div className="absolute top-2/3 left-[50%] w-64 h-64 rounded-full bg-gradient-to-bl from-purple-300/5 to-indigo-400/10 blur-3xl animate-float-slow-reverse"></div>
      </div>
      
      <div className="container mx-auto px-4 py-12 relative z-10">
        <div className="max-w-md mx-auto">
          <div className="p-8 rounded-2xl shadow-lg border border-gray-100 backdrop-blur-sm bg-white/95">
            {checkingSession ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 mb-6"></div>
                <p className="text-gray-600 text-lg">
                  Checking authentication status...
                </p>
                <p className="text-gray-500 text-sm mt-2">
                  Please wait a moment...
                </p>
              </div>
            ) : (
              <>
                {signupSuccess ? (
                  <div className="text-center py-10">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg
                        className="w-8 h-8 text-green-600"
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
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">
                      Sign Up Successful!
                    </h2>
                    <p className="text-gray-600 mb-2">
                      Your account has been created successfully.
                    </p>
                    <p className="text-gray-600 mb-6">
                      Please sign in with your new credentials.
                    </p>
                    <p className="text-gray-500 text-sm">
                      Redirecting to login page...
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="text-center mb-8">
                      <h1 className="text-3xl font-bold mb-2">
                        Create Account
                      </h1>
                      <p className="text-gray-600">
                        Join Agenoverse Quiz Platform
                      </p>
                    </div>
                    <form onSubmit={handleSignUp}>
                      <div className="mb-5">
                        <label
                          htmlFor="displayName"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Full Name
                        </label>
                        <input
                          type="text"
                          id="displayName"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent shadow-sm transition-all duration-300 hover:border-gray-400"
                          placeholder="John Doe"
                          required
                        />
                      </div>

                      <div className="mb-5">
                        <label
                          htmlFor="email"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Email
                        </label>
                        <input
                          type="email"
                          id="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent shadow-sm transition-all duration-300 hover:border-gray-400"
                          placeholder="you@example.com"
                          required
                        />
                      </div>

                      <div className="mb-5">
                        <label
                          htmlFor="password"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Password
                        </label>
                        <input
                          type="password"
                          id="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent shadow-sm transition-all duration-300 hover:border-gray-400"
                          placeholder="••••••••"
                          required
                        />
                        {passwordStrength && (
                          <div className="mt-1 flex items-center">
                            <div
                              className={`h-1.5 flex-grow rounded-full ${
                                passwordStrength === "weak"
                                  ? "bg-red-400"
                                  : passwordStrength === "medium"
                                  ? "bg-yellow-400"
                                  : "bg-green-500"
                              }`}
                            ></div>
                            <span className="ml-2 text-xs text-gray-500 capitalize">
                              {passwordStrength}
                            </span>
                          </div>
                        )}
                        {password && (
                          <p className="mt-1 text-xs text-gray-500">
                            Strong passwords include uppercase, lowercase,
                            numbers, and special characters.
                          </p>
                        )}
                      </div>

                      <div className="mb-6">
                        <label
                          htmlFor="confirmPassword"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Confirm Password
                        </label>
                        <input
                          type="password"
                          id="confirmPassword"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent shadow-sm transition-all duration-300 hover:border-gray-400 ${
                            confirmPassword && password !== confirmPassword
                              ? "border-red-300"
                              : "border-gray-300"
                          }`}
                          placeholder="••••••••"
                          required
                        />
                        {confirmPassword && password !== confirmPassword && (
                          <p className="mt-1 text-xs text-red-500">
                            Passwords do not match
                          </p>
                        )}
                      </div>

                      {error && (
                        <div className="mb-4 py-2 px-3 bg-red-50 text-red-500 text-sm rounded-md">
                          {error}
                        </div>
                      )}

                      <button
                        type="submit"
                        className="w-full bg-gradient-to-r from-purple-600 via-purple-500 to-blue-500 text-white font-medium py-3.5 px-8 rounded-full shadow-md hover:shadow-xl hover:from-purple-500 hover:to-blue-600 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-purple-300 active:translate-y-0 transform transition-all duration-300 flex items-center justify-center"
                        disabled={isLoading}
                      >
                        {isLoading ? (
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
                            Creating account...
                          </span>
                        ) : (
                          <span className="flex items-center">
                            <svg
                              className="w-5 h-5 mr-2"
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M12 15V3M12 15L8 11M12 15L16 11M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            Sign Up
                          </span>
                        )}
                      </button>
                    </form>
                    <div className="my-6 flex items-center">
                      <div className="flex-grow border-t border-gray-200"></div>
                      <span className="mx-4 text-gray-500 text-sm">OR</span>
                      <div className="flex-grow border-t border-gray-200"></div>
                    </div>
                    <button
                      onClick={handleGoogleSignUp}
                      className="w-full flex items-center justify-center bg-white border border-gray-300 rounded-full px-6 py-3.5 text-sm font-medium text-gray-800 hover:text-gray-900 hover:border-gray-400 hover:bg-gray-50 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-gray-300 active:bg-gray-100 hover:-translate-y-0.5 transform transition-all duration-300 mb-4"
                      disabled={isLoading}
                    >
                      <svg
                        className="h-5 w-5 mr-2"
                        viewBox="0 0 24 24"
                        width="24"
                        height="24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                          <path
                            fill="#4285F4"
                            d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"
                          />
                          <path
                            fill="#34A853"
                            d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"
                          />
                          <path
                            fill="#EA4335"
                            d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"
                          />
                        </g>
                      </svg>
                      Continue with Google
                    </button>{" "}
                    <div className="mt-6 text-center">
                      <p className="text-gray-600">
                        Already have an account?{" "}
                        <Link
                          href="/sign-in"
                          className="text-purple-600 hover:text-purple-800 font-medium transition-colors relative inline-block group focus:outline-none focus:ring-2 focus:ring-purple-300 focus:ring-offset-1 rounded px-1"
                        >
                          <span>Sign In</span>
                          <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-purple-600 group-hover:w-full transition-all duration-300"></span>
                        </Link>
                      </p>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
