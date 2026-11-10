"use client";

import { createContext, useContext, type ReactNode } from "react";

/** True inside DashboardShell, whose top bar carries the page's back button. */
const InShell = createContext(false);
export const useInShell = () => useContext(InShell);
export default function ShellBack({ children }: { children: ReactNode }) {
  return <InShell.Provider value>{children}</InShell.Provider>;
}
