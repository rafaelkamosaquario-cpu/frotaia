"use client";

import { createContext, useContext, useState } from "react";
import { isTimberNavigation } from "@/lib/frota/navigationProfile";

const NavigationContext = createContext({ compact: false, canExpand: false, expanded: false, toggle: () => {} });

/** Presentation only: membership and API authorization remain server-side. */
export function FrotaNavigationProvider({ companyId, canExpand, children }: { companyId: string; canExpand: boolean; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return <NavigationContext.Provider value={{ compact: isTimberNavigation(companyId) && !expanded, canExpand: isTimberNavigation(companyId) && canExpand, expanded, toggle: () => setExpanded(value => !value) }}>{children}</NavigationContext.Provider>;
}

export const useFrotaNavigation = () => useContext(NavigationContext);
