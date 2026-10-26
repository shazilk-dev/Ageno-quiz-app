/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Test component for validating the useAuth hook implementation
 */
export default function UseAuthTest() {
  const [testResults, setTestResults] = useState<
    {
      name: string;
      status: "passed" | "failed" | "pending";
      message?: string;
    }[]
  >([
    { name: "Auth context initialization", status: "pending" },
    { name: "Session data retrieval", status: "pending" },
    { name: "User data access", status: "pending" },
    { name: "Authentication method availability", status: "pending" },
  ]);

  const auth = useAuth();

  // Run tests when the component mounts
  useEffect(() => {
    const runTests = async () => {
      const results = [...testResults];

      // Test 1: Auth context initialization
      try {
        if (auth) {
          results[0] = {
            name: "Auth context initialization",
            status: "passed",
            message: "useAuth hook initialized successfully",
          };
        } else {
          results[0] = {
            name: "Auth context initialization",
            status: "failed",
            message: "useAuth hook returned undefined",
          };
        }
      } catch (error: any) {
        results[0] = {
          name: "Auth context initialization",
          status: "failed",
          message: `Error: ${error.message}`,
        };
      }

      // Test 2: Session data retrieval
      try {
        if (auth.session && typeof auth.session.isAuthenticated === "boolean") {
          results[1] = {
            name: "Session data retrieval",
            status: "passed",
            message: `Session authenticated: ${auth.session.isAuthenticated}`,
          };
        } else {
          results[1] = {
            name: "Session data retrieval",
            status: "failed",
            message: "Session data is not properly structured",
          };
        }
      } catch (error: any) {
        results[1] = {
          name: "Session data retrieval",
          status: "failed",
          message: `Error: ${error.message}`,
        };
      }

      // Test 3: User data access
      try {
        if (auth.user !== undefined) {
          results[2] = {
            name: "User data access",
            status: "passed",
            message: auth.user
              ? `User authenticated: ${auth.user.email}`
              : "User not authenticated",
          };
        } else {
          results[2] = {
            name: "User data access",
            status: "failed",
            message: "User property is undefined",
          };
        }
      } catch (error: any) {
        results[2] = {
          name: "User data access",
          status: "failed",
          message: `Error: ${error.message}`,
        };
      }

      // Test 4: Authentication method availability
      try {
        if (
          typeof auth.login === "function" &&
          typeof auth.logout === "function" &&
          typeof auth.signUp === "function"
        ) {
          results[3] = {
            name: "Authentication method availability",
            status: "passed",
            message: "All authentication methods are available",
          };
        } else {
          results[3] = {
            name: "Authentication method availability",
            status: "failed",
            message: "One or more authentication methods are not functions",
          };
        }
      } catch (error: any) {
        results[3] = {
          name: "Authentication method availability",
          status: "failed",
          message: `Error: ${error.message}`,
        };
      }

      setTestResults(results);
    };

    runTests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth]);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">useAuth Hook Test</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Test results */}
        <div className="border rounded-md p-4 bg-surface">
          <h2 className="text-lg font-semibold mb-4">Test Results</h2>
          <div className="space-y-3">
            {testResults.map((test, index) => (
              <div key={index} className="p-3 rounded-md bg-surface">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text">{test.name}</span>
                  <span
                    className={`text-sm px-2 py-1 rounded-full ${
                      test.status === "passed"
                        ? "bg-surface-raised text-success"
                        : test.status === "failed"
                        ? "bg-surface-raised text-error"
                        : "bg-surface-raised text-text"
                    }`}
                  >
                    {test.status === "pending" ? "Running..." : test.status}
                  </span>
                </div>
                {test.message && (
                  <p className="text-sm text-text-muted mt-1">{test.message}</p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 text-sm text-text-muted">
            <p>
              These tests validate that the useAuth hook is properly initialized
              and has access to all the required functionality from the auth
              context.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 p-4 bg-surface rounded-md text-sm">
        <h3 className="font-medium mb-2">Next Steps:</h3>
        <ol className="list-decimal list-inside space-y-1">
          <li>
            Update components that use the auth context to use the new useAuth
            hook
          </li>
          <li>Test all authentication flows with the new hook</li>
          <li>Monitor performance improvements from SWR caching</li>
        </ol>
      </div>
    </div>
  );
}
