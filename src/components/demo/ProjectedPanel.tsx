import React, { useState } from "react";
import { RootComponents } from "../../shadcn-demo/components";
import { ShadcnPortalProvider } from "../../shadcn-demo/portal";
import { TooltipProvider } from "../../shadcn-demo/ui/tooltip";

export function ProjectedPanel({
  panelRef,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const setPanelNode = React.useCallback(
    (node: HTMLDivElement | null) => {
      (panelRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      setPortalContainer(node);
    },
    [panelRef],
  );

  return (
    <div ref={setPanelNode} className="demo-panel style-nova">
      <header className="shadcn-topbar">
        <div className="shadcn-mark" />
        <nav className="shadcn-nav">
          <span>Docs</span>
          <span>Components</span>
          <span>Blocks</span>
          <span>Charts</span>
          <span>Directory</span>
          <span>Create</span>
        </nav>
        <div className="shadcn-search">Search documentation...</div>
        <div className="shadcn-mini">
          <span>◕ 115k</span>
          <span>▯</span>
          <span>◐</span>
        </div>
        <button className="shadcn-new" type="button">＋ New</button>
      </header>
      <main className="shadcn-stage theme-container">
        <ShadcnPortalProvider container={portalContainer}>
          <TooltipProvider>
            <RootComponents />
          </TooltipProvider>
        </ShadcnPortalProvider>
      </main>
    </div>
  );
}
