import React from "react";

const ShadcnPortalContext = React.createContext<HTMLElement | null>(null);

export function ShadcnPortalProvider({
  container,
  children,
}: {
  container: HTMLElement | null;
  children: React.ReactNode;
}) {
  return <ShadcnPortalContext.Provider value={container}>{children}</ShadcnPortalContext.Provider>;
}

export function useShadcnPortalContainer() {
  return React.useContext(ShadcnPortalContext);
}
