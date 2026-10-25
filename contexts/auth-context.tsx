/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { User } from "firebase/auth";
import { ROLES, Role } from "@/constants/role";
import {
  onAuthChange,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  signUpWithEmail,
} from "@/lib/actions/auth.actions";
import {
  createSession,
  clearSession,
  checkSession,
  refreshSession,
} from "@/lib/actions/session.actions";
import { clearSessionData, storeUserData } from "@/lib/services/session.service";

interface UserWithRole extends User {
  role?: Role;
}

interface AuthContextType {
  user: UserWithRole | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;
  login: (
    email: string,
    password: string
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;
  loginWithGoogle: () => Promise<{
    success: boolean;
    error?: string;
  }>;
  logout: () => Promise<boolean>;
  isAdmin: boolean;
  verifySession: () => Promise<boolean>;
  refreshUserSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<UserWithRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sessionRefreshInProgress = useRef<boolean>(false);
  
  // Verify session with the server
  const verifySession = async (): Promise<boolean> => {
    try {
      // Make a call to the session check endpoint
      const response = await fetch("/api/auth/session/check", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate"
        },
        credentials: "include", // Include cookies in the request
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.isAuthenticated === true;
    } catch (error) {
      console.error("Session verification error:", error);
      return false;
    }
  };

  // Refresh the user session
  const refreshUserSession = useCallback(async (): Promise<boolean> => {
    if (!user || sessionRefreshInProgress.current) return false;
    
    try {
      sessionRefreshInProgress.current = true;
      const result = await refreshSession(user);
      return result.success;
    } catch (error) {
      console.error("Error refreshing session:", error);
      return false;
    } finally {
      sessionRefreshInProgress.current = false;
    }
  }, [user]);

  // Set up token refresh interval
  useEffect(() => {
    // Clear any existing timer
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    
    // Only set up refresh timer if we have a user
    if (user) {
      // Refresh every 30 minutes
      const REFRESH_INTERVAL = 30 * 60 * 1000;
      refreshTimerRef.current = setInterval(async () => {
        await refreshUserSession();
      }, REFRESH_INTERVAL);
    }
    
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [user, refreshUserSession]);

  // Initialize auth and listen for changes
  useEffect(() => {
    setLoading(true);
    
    // Set up Firebase auth state listener
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in
        try {
          // Get role from token claims
          const token = await firebaseUser.getIdTokenResult();
          const userWithRole = firebaseUser as UserWithRole;
          userWithRole.role = (token?.claims?.role as Role) || "user";
          
          // Update state
          setUser(userWithRole);
          setIsAdmin(userWithRole.role === ROLES.ADMIN);
          
          // Store user data for quick access
          storeUserData(userWithRole);
        } catch (error) {
          console.error("Error processing auth state change:", error);
        }
      } else {
        // User is signed out in Firebase, clear state
        setUser(null);
        setIsAdmin(false);
        
        // Double-check server session status to catch edge cases
        try {
          const response = await checkSession();
          if (response.isAuthenticated) {
            // Server thinks we're still logged in but Firebase doesn't
            // Clear session to be safe
            await clearSession(true);
          } else if (response.reason === 'token_revoked') {
            clearSessionData();
          }
        } catch (error) {
          console.warn("Session verification error during signout:", error);
          // Still try to clear the session on error just to be safe
          clearSessionData();
        }
      }
      
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, []);

  // Sign up with email and password
  const signUp = async (
    email: string,
    password: string,
    displayName: string
  ) => {
    try {
      const result = await signUpWithEmail(email, password, displayName);
      if ("uid" in result) {
        // Don't create a session for new user - they need to sign in separately
        return { success: true };
      } else {
        return { success: false, error: result.message };
      }
    } catch (error: any) {
      console.error("Sign up error:", error);
      return { success: false, error: error.message };
    }
  };

  // Log in with email and password
  const login = async (email: string, password: string) => {
    try {
      const result = await signInWithEmail(email, password);
      if ("uid" in result) {
        try {
          // Create session after successful login
          const sessionResult = await createSession(result);
          if (!sessionResult.success) {
            console.error("Session creation failed:", sessionResult.error);
            return {
              success: false,
              error: "Failed to create session. Please try again.",
            };
          }
        } catch (sessionError: any) {
          console.error("Session error:", sessionError);
          return {
            success: false,
            error: sessionError.message || "Error creating session",
          };
        }

        return { success: true };
      } else {
        return { success: false, error: result.message };
      }
    } catch (error: any) {
      console.error("Login error:", error);
      return { success: false, error: error.message };
    }
  };

  // Log in with Google
  const loginWithGoogle = async () => {
    try {
      const result = await signInWithGoogle();
      if ("uid" in result) {
        try {
          // Create session after successful Google login
          const sessionResult = await createSession(result);
          if (!sessionResult.success) {
            console.error("Session creation failed:", sessionResult.error);
            return {
              success: false,
              error: "Failed to create session. Please try again.",
            };
          }
        } catch (sessionError: any) {
          console.error("Session error:", sessionError);
          return {
            success: false,
            error: sessionError.message || "Error creating session",
          };
        }

        return { success: true };
      } else {
        return { success: false, error: result.message };
      }
    } catch (error: any) {
      console.error("Google login error:", error);
      return { success: false, error: error.message };
    }
  };
  
  // Log out
  const logout = async (): Promise<boolean> => {
    try {
      // Mark this as user-initiated logout for safety checks
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('user_initiated_logout', 'true');
      }
      
      // First clear the server-side session
      await clearSession(true).catch(err => console.warn("Error clearing session:", err));

      // Then sign out from Firebase
      await signOut();
      
      // Clear local state
      setUser(null);
      setIsAdmin(false);
      
      // Cancel refresh timer
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      
      // Clear client-side storage
      clearSessionData();
      
      return true;
    } catch (error) {
      console.error("Error during logout:", error);
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signUp,
        login,
        loginWithGoogle,
        logout,
        isAdmin,
        verifySession,
        refreshUserSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
