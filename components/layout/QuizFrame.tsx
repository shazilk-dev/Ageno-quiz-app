"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import SiteFrame from "./SiteFrame";

const ExamModeContext = createContext<(active: boolean) => void>(() => {});

/**
 * Shell for the quiz routes. While an attempt is running the site header is removed from the page
 * (not just covered), so nothing outside the exam can be tabbed to or clicked by mistake.
 */
export function QuizFrame({ children }: { children: ReactNode }) {
  const [examMode, setExamMode] = useState(false);
  return (
    <ExamModeContext.Provider value={setExamMode}>
      {/* No footer: the lobby and the exam need the full height. */}
      <SiteFrame footer={false} header={!examMode}>
        {children}
      </SiteFrame>
    </ExamModeContext.Provider>
  );
}

/** Hides the site header while `active` is true and on unmount restores it. */
export function useExamMode(active: boolean) {
  const setExamMode = useContext(ExamModeContext);
  useEffect(() => {
    setExamMode(active);
    return () => setExamMode(false);
  }, [active, setExamMode]);
}
