"use client";

import { createContext, useContext, useState } from "react";
import { isTimberNavigation } from "@/lib/frota/navigationProfile";
import { modulePathAllowed, TIMBER_MODULE_IDS } from "@/lib/frota/companyModules";

const NavigationContext = createContext<{ compact: boolean; canExpand: boolean; expanded: boolean; allows: (path: string) => boolean; toggle: () => void }>({ compact: false, canExpand: false, expanded: false, allows: () => true, toggle: () => {} });

/** Presentation only: membership and API authorization remain server-side. */
export function FrotaNavigationProvider({ companyId, canExpand, enabledModules, children }: { companyId: string; canExpand: boolean; enabledModules: string[] | null; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const personalized = enabledModules !== null || isTimberNavigation(companyId);
  const effectiveModules = enabledModules ?? (isTimberNavigation(companyId) ? TIMBER_MODULE_IDS : null);
  return <NavigationContext.Provider value={{ compact: personalized && !expanded, canExpand: personalized && canExpand, expanded, allows: path => canExpand && expanded || modulePathAllowed(effectiveModules, path), toggle: () => setExpanded(value => !value) }}>{children}</NavigationContext.Provider>;
}

export const useFrotaNavigation = () => useContext(NavigationContext);
