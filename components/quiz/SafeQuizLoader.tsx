"use client";

import React, { useState, useEffect } from 'react';
import AuthStateHandler from '../AuthStateHandler';
import { LobbySkeleton } from './lobby/LobbyStates';

interface SafeQuizLoaderProps {
  children: React.ReactNode;
}

/**
 * A special wrapper for quiz routes that ensures quizzes can load
 * even on mobile devices or when auth is taking too long
 */
export default function SafeQuizLoader({ children }: SafeQuizLoaderProps) {
  const [isMobileBrowser, setIsMobileBrowser] = useState(false);
  
  // Detect mobile browsers for special handling
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
      setIsMobileBrowser(isMobile);
      
      // Add to debug logs
      
      // Cache this info for cross-component usage
      try {
        sessionStorage.setItem('is_mobile_browser', isMobile ? 'true' : 'false');
      } catch (e) {
        console.error('Error saving mobile browser detection to sessionStorage:', e);
      }
    }
  }, []);

  return (
    <AuthStateHandler 
      maxWaitTime={isMobileBrowser ? 800 : 1500}
      skipAuthCheck={isMobileBrowser}
      fallback={<LobbySkeleton />}
    >
      {children}
    </AuthStateHandler>
  );
}
