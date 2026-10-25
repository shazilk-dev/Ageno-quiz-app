"use client";

import { useState } from "react";
// import { useRouter } from "next/navigation";
import Link from "next/link";
import { resetPassword } from "@/lib/actions/auth.actions";

const ResetPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setMessage({
        type: "error",
        text: "Please enter your email address.",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      setMessage(null);

      const result = await resetPassword(email.trim());

      if (result === true) {
        setMessage({
          type: "success",
          text: "Password reset email sent. Check your inbox for further instructions.",
        });
        setEmail("");
      } else {
        setMessage({
          type: "error",
          text:
            typeof result === "object" && result.message
              ? result.message
              : "Failed to send reset email. Please check your email and try again.",
        });
      }
    } catch (error) {
      console.error("Password reset error:", error);
      setMessage({
        type: "error",
        text: "An unexpected error occurred. Please try again later.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-neutral-50">

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-md mx-auto">
          <div className="bg-white p-8 rounded-xl shadow-sm">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">Reset Your Password</h1>
              <p className="text-gray-600">
                Enter your email address and we&apos;ll send you a link to reset
                your password.
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

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary shadow-sm"
                  placeholder="your@email.com"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-gradient-to-r from-purple-primary to-tech-blue-light text-white font-medium py-3 px-4 rounded-lg hover:shadow-md hover:shadow-purple-primary/20 transition-all duration-300 transform hover:-translate-y-1 flex items-center justify-center disabled:opacity-50 disabled:transform-none disabled:hover:shadow-none"
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
                ) : (
                  "Send Reset Link"
                )}
              </button>

              <div className="text-center">
                <p className="text-sm text-gray-600">
                  Remember your password?{" "}
                  <Link
                    href="/sign-in"
                    className="text-accent-primary hover:text-accent-primary/80 font-medium transition"
                  >
                    Sign In
                  </Link>
                </p>
              </div>
            </form>
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm text-gray-600">
              Don&apos;t have an account?{" "}
              <Link
                href="/sign-up"
                className="text-accent-primary hover:text-accent-primary/80 font-medium transition"
              >
                Sign Up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
