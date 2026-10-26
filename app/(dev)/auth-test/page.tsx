"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { checkSession } from "@/lib/actions/session.actions";
import { User } from "firebase/auth";

interface TestResult {
  name: string;
  status: "success" | "error" | "info";
  message: string;
  timestamp: string;
}

interface UserWithRole extends User {
  role?: string;
}

export default function AuthFlowTest() {
  const { user, loading, login, logout } = useAuth();
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [testEmail, setTestEmail] = useState("");
  const [testPassword, setTestPassword] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  
  // Function to add a test result
  const addResult = (name: string, status: "success" | "error" | "info", message: string) => {
    setTestResults(prev => [...prev, { name, status, message, timestamp: new Date().toISOString() }]);
  };
  
  // Clear test results
  const clearResults = () => {
    setTestResults([]);
  };
  
  // Test 1: Check current authentication state
  const testAuthState = async () => {
    addResult("Auth State Check", "info", "Checking current authentication state...");
    
    if (loading) {
      addResult("Auth State Check", "info", "Authentication state is still loading...");
      return;
    }
    
    if (user) {
      addResult(
        "Auth State Check", 
        "success", 
        `User is authenticated. Email: ${user.email}, Role: ${(user as UserWithRole).role || 'unknown'}`
      );
    } else {
      addResult("Auth State Check", "info", "User is not authenticated");
    }
  };
  
  // Test 2: Test server-side session check
  const testSessionCheck = async () => {
    addResult("Session Check", "info", "Checking session with server...");
    
    try {
      const result = await checkSession();
      
      if (result.isAuthenticated) {
        addResult(
          "Session Check", 
          "success", 
          `Session is valid. User: ${result.user?.email}, Role: ${result.user?.role || 'unknown'}`
        );
      } else {
        addResult(
          "Session Check", 
          "info", 
          `Session is invalid. Reason: ${result.reason || 'unknown'}`
        );
      }
    } catch (error) {
      addResult("Session Check", "error", `Error checking session: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  // Test 3: Login test
  const testLogin = async () => {
    if (!testEmail || !testPassword) {
      addResult("Login Test", "error", "Please provide test email and password");
      return;
    }
    
    addResult("Login Test", "info", `Attempting login with ${testEmail}...`);
    
    try {
      const result = await login(testEmail, testPassword);
      
      if (result.success) {
        addResult("Login Test", "success", "Login successful");
      } else {
        addResult("Login Test", "error", `Login failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      addResult("Login Test", "error", `Login exception: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  // Test 4: Logout test
  const testLogout = async () => {
    addResult("Logout Test", "info", "Attempting logout...");
    
    try {
      const result = await logout();
      
      if (result) {
        addResult("Logout Test", "success", "Logout successful");
      } else {
        addResult("Logout Test", "error", "Logout returned false");
      }
    } catch (error) {
      addResult("Logout Test", "error", `Logout exception: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  // Run all tests in sequence
  const runAllTests = async () => {
    setIsRunning(true);
    clearResults();
    
    // Initial state check
    await testAuthState();
    await testSessionCheck();
    
    // If not logged in, attempt login
    if (!user) {
      if (testEmail && testPassword) {
        await testLogin();
        
        // Wait for auth state to update
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if login worked
        await testAuthState();
        await testSessionCheck();
      } else {
        addResult("Test Suite", "info", "Skipping login test (no credentials provided)");
      }
    } else {
      // If logged in, test logout
      await testLogout();
      
      // Wait for auth state to update
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Verify logout worked
      await testAuthState();
      await testSessionCheck();
    }
    
    addResult("Test Suite", "info", "All tests completed");
    setIsRunning(false);
  };
  
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Authentication Flow Test Suite</h1>
      
      <div className="mb-6 p-4 bg-surface rounded-lg">
        <h2 className="text-lg font-semibold mb-3">Test Credentials</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Test Email</label>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="test@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Test Password</label>
            <input
              type="password"
              value={testPassword}
              onChange={(e) => setTestPassword(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="Password"
            />
          </div>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => testAuthState()}
          className="px-4 py-2 bg-teal text-ink rounded hover:brightness-110 disabled:opacity-50"
          disabled={isRunning}
        >
          Test Auth State
        </button>
        <button
          onClick={() => testSessionCheck()}
          className="px-4 py-2 bg-teal text-ink rounded hover:brightness-110 disabled:opacity-50"
          disabled={isRunning}
        >
          Test Session Check
        </button>
        <button
          onClick={() => testLogin()}
          className="px-4 py-2 bg-success text-ink rounded hover:brightness-110 disabled:opacity-50"
          disabled={isRunning || !testEmail || !testPassword}
        >
          Test Login
        </button>
        <button
          onClick={() => testLogout()}
          className="px-4 py-2 bg-error text-ink rounded hover:brightness-110 disabled:opacity-50"
          disabled={isRunning || !user}
        >
          Test Logout
        </button>
        <button
          onClick={() => runAllTests()}
          className="px-4 py-2 bg-teal text-ink rounded hover:brightness-110 disabled:opacity-50"
          disabled={isRunning}
        >
          Run All Tests
        </button>
        <button
          onClick={() => clearResults()}
          className="px-4 py-2 border border-border-strong text-text rounded hover:bg-surface disabled:opacity-50"
          disabled={isRunning || testResults.length === 0}
        >
          Clear Results
        </button>
      </div>
      
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-surface-raised p-3 font-medium border-b">
          Test Results
          {isRunning && (
            <span className="ml-2 inline-block animate-pulse text-accent">Running tests...</span>
          )}
        </div>
        <div className="max-h-[400px] overflow-y-auto p-2">
          {testResults.length === 0 ? (
            <p className="text-text-muted p-4 text-center">No test results yet</p>
          ) : (
            <div className="space-y-2">
              {testResults.map((result, index) => (
                <div 
                  key={index} 
                  className={`p-3 rounded-lg ${
                    result.status === 'success' ? 'bg-surface border border-success' : 
                    result.status === 'error' ? 'bg-surface border border-error' : 
                    'bg-surface border border-border'
                  }`}
                >
                  <div className="flex justify-between">
                    <span className="font-medium">{result.name}</span>
                    <span className="text-xs text-text-muted">{new Date(result.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className={`mt-1 text-sm ${
                    result.status === 'success' ? 'text-success' : 
                    result.status === 'error' ? 'text-error' : 
                    'text-link'
                  }`}>
                    {result.message}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      <div className="mt-6 text-sm text-text-muted">
        <p>Current authentication state: {loading ? 'Loading...' : user ? 'Authenticated' : 'Not authenticated'}</p>
        {user && (
          <div className="mt-2">
            <p>User email: {user.email}</p>
            <p>User role: {(user as UserWithRole).role || 'unknown'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
