"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

const STORAGE_KEY = "mirotaract.superadmin-view-mode";

export type SuperadminViewMode = "ADMIN" | "CLUB";

type SuperadminModeValue = {
  mode: SuperadminViewMode;
  setMode: (mode: SuperadminViewMode) => void;
  isSuperadmin: boolean;
};

const SuperadminModeContext = createContext<SuperadminModeValue | null>(null);

function readMode(): SuperadminViewMode {
  if (typeof window === "undefined") return "ADMIN";
  return window.localStorage.getItem(STORAGE_KEY) === "CLUB" ? "CLUB" : "ADMIN";
}

/**
 * A presentation/context selector, never an authorization override. Kernel
 * permissions remain unchanged; this only lets a SUPERADMIN use the same
 * club-oriented experience as an ordinary member when desired.
 */
export function useSuperadminMode(isSuperadmin: boolean): SuperadminModeValue {
  // Keep the server and the first client render identical. The persisted
  // preference is restored after hydration.
  const [mode, setModeState] = useState<SuperadminViewMode>("ADMIN");

  useEffect(() => {
    setModeState(isSuperadmin ? readMode() : "CLUB");
  }, [isSuperadmin]);

  function setMode(nextMode: SuperadminViewMode) {
    const resolved = isSuperadmin ? nextMode : "CLUB";
    setModeState(resolved);
    window.localStorage.setItem(STORAGE_KEY, resolved);
  }

  return { mode: isSuperadmin ? mode : "CLUB", setMode, isSuperadmin };
}

export function SuperadminModeProvider({
  value,
  children,
}: {
  value: SuperadminModeValue;
  children: ReactNode;
}) {
  return (
    <SuperadminModeContext.Provider value={value}>
      {children}
    </SuperadminModeContext.Provider>
  );
}

export function useSuperadminModeContext(): SuperadminModeValue {
  const context = useContext(SuperadminModeContext);
  if (!context) {
    throw new Error(
      "useSuperadminModeContext must be used within DashboardShell",
    );
  }
  return context;
}
