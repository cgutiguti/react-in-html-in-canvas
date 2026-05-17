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
      <main className="demo-stage theme-container">
        <ShadcnPortalProvider container={portalContainer}>
          <TooltipProvider>
            <RootComponents />
          </TooltipProvider>
        </ShadcnPortalProvider>
      </main>
    </div>
  );
}
