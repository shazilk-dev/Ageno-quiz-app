"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { safeRedirectPath } from "@/lib/navigation";

// Separate component that uses searchParams to avoid direct usage in the main component
function SignInContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, loginWithGoogle, user } = useAuth();

  // Check if user is already authenticated and redirect if they are
  useEffect(() => {
    // If we have a user, redirect away from the sign-in page
    if (user) {
      const redirectTo = searchParams.get("redirectTo");
      router.replace(safeRedirectPath(redirectTo));
    } else {
      // Only show the sign-in form if there's no authenticated user
      setCheckingSession(false);
    }
  }, [user, router, searchParams]);

  // This useEffect manages auth session state check on the sign-in page
  useEffect(() => {
    // Set a flag in sessionStorage to indicate we're on the sign-in page
    // This helps prevent unwanted redirects in middleware and other components
    sessionStorage.setItem("onSignInPage", "true");
    
    // Explicitly verify session once on sign-in page load
    // This ensures auth context and session state are synchronized
    const verifyAuthSession = async () => {
      try {
        await user?.getIdToken(true); // Force token refresh if user exists
      } catch (error) {
        console.error("Error refreshing token:", error);
      } finally {
        // Allow the form to be shown after a short delay
        setTimeout(() => {
          setCheckingSession(false);
        }, 500);
      }
    };
    
    verifyAuthSession();
    
    return () => {
      // Clean up when component unmounts
      sessionStorage.removeItem("onSignInPage");
    };
  }, [user]);

  // Check for redirect URL or success messages
  useEffect(() => {
    const successMsg = searchParams.get("success");

    if (successMsg) {
      if (successMsg === "verification") {
        setSuccess("Email verified! You can now sign in.");
      } else if (successMsg === "password_reset") {
        setSuccess(
          "Password has been reset successfully. Please sign in with your new password."
        );
      }
    }
  }, [searchParams]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      setError("Please enter both email and password");
      return;
    }

    try {
      setIsLoading(true);
      setError("");
      setSuccess("");
      const result = await login(email, password);

      if (result.success) {
        // Don't redirect here - the useEffect watching the user state will handle it
        // Just set loading and success state
        setSuccess("Login successful!");
      } else {
        // Handle specific error codes
        if (
          result.error?.includes("auth/user-not-found") ||
          result.error?.includes("auth/wrong-password") ||
          result.error?.includes("auth/invalid-credential")
        ) {
          setError("Invalid email or password. Please try again.");
        } else if (result.error?.includes("auth/user-disabled")) {
          setError("This account has been disabled. Please contact support.");
        } else if (result.error?.includes("auth/too-many-requests")) {
          setError(
            "Too many failed login attempts. Please try again later or reset your password."
          );
        } else if (result.error?.includes("auth/network-request-failed")) {
          setError(
            "Network connection error. Please check your internet connection and try again."
          );
        } else {
          // For any other Firebase errors, provide a user-friendly message instead of raw error
          setError(
            "Sign in failed. Please check your credentials and try again."
          );
        }
      }
    } catch (err) {
      console.error("Sign in error:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError("");
      setSuccess("");
      const result = await loginWithGoogle();

      if (result.success) {
        // Don't redirect here - the useEffect watching the user state will handle it
        // Just set loading and success state
        setSuccess("Login with Google successful!");
      } else {
        // Handle specific Google sign-in errors
        if (result.error?.includes("popup-closed-by-user")) {
          setError("Sign-in was cancelled. Please try again.");
        } else if (
          result.error?.includes("account-exists-with-different-credential")
        ) {
          setError(
            "An account already exists with the same email address but different sign-in credentials."
          );
        } else {
          setError(
            result.error || "Failed to sign in with Google. Please try again."
          );
        }
      }
    } catch (err) {
      console.error("Google sign in error:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    router.push(`/reset-password?email=${encodeURIComponent(email)}`);
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
            {" "}
            {checkingSession ? (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mb-4"></div>
                <p className="text-gray-600">Checking authentication...</p>
              </div>
            ) : isLoading ? (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mb-4"></div>
                <p className="text-gray-600">Signing you in...</p>
                {success && <p className="text-green-600 mt-2">{success}</p>}
              </div>
            ) : (
              <>
                <div className="text-center mb-8">
                  <h1 className="text-3xl font-bold mb-2">Welcome Back</h1>
                  <p className="text-gray-600">
                    Sign in to your Agenoverse account
                  </p>
                </div>
                {success && (
                  <div className="mb-4 py-2 px-3 bg-green-50 text-green-600 text-sm rounded-md">
                    {success}
                  </div>
                )}
                {error && (
                  <div className="mb-4 py-2 px-3 bg-red-50 text-red-600 text-sm rounded-md">
                    {error}
                  </div>
                )}
                <form onSubmit={handleSignIn}>
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

                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-1">
                      <label
                        htmlFor="password"
                        className="block text-sm font-medium text-gray-700"
                      >
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        className="text-sm text-purple-600 hover:text-purple-800 transition-colors relative inline-block group focus:outline-none focus:ring-2 focus:ring-purple-300 focus:ring-offset-1 rounded"
                      >
                        <span>Forgot password?</span>
                        <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-purple-600 group-hover:w-full transition-all duration-300"></span>
                      </button>
                    </div>
                    <input
                      type="password"
                      id="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent shadow-sm transition-all duration-300 hover:border-gray-400"
                      placeholder="••••••••"
                      required
                    />{" "}
                  </div>

                  {/* No duplicate error message here as we display it at the top */}

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
                        Signing in...
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
                            d="M15 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H15"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M10 17L15 12L10 7"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M15 12H3"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        Sign In
                      </span>
                    )}
                  </button>
                </form>
                <div className="my-6 flex items-center">
                  <div className="flex-grow border-t border-gray-200"></div>
                  <span className="mx-4 text-gray-500 text-sm">OR</span>
                  <div className="flex-grow border-t border-gray-200"></div>
                </div>{" "}
                <button
                  onClick={handleGoogleSignIn}
                  className="w-full flex items-center justify-center bg-white border border-gray-300 rounded-full px-6 py-3.5 text-sm font-medium text-gray-800 hover:text-gray-900 hover:border-gray-400 hover:bg-gray-50 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-gray-300 active:bg-gray-100 hover:-translate-y-0.5 transform transition-all duration-300 mb-4"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center">
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-700"
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
                      Signing in...
                    </span>
                  ) : (
                    <>
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
                    </>
                  )}
                </button>
                <div className="mt-8 text-center">
                  <p className="text-gray-600">
                    Don&apos;t have an account?{" "}
                    <Link
                      href="/sign-up"
                      className="text-purple-600 hover:text-purple-800 font-medium transition-colors relative inline-block group focus:outline-none focus:ring-2 focus:ring-purple-300 focus:ring-offset-1 rounded px-1"
                    >
                      <span>Sign Up</span>
                      <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-purple-600 group-hover:w-full transition-all duration-300"></span>
                    </Link>
                  </p>{" "}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Main page component that wraps the content in a Suspense boundary
const SignIn = () => {
  return (
    <Suspense fallback={<div className="flex justify-center p-8">Loading...</div>}>
      <SignInContent />
    </Suspense>
  );
};

export default SignIn;
