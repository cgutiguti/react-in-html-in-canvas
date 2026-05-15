import * as React from "react";
import { cn } from "../lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-cyan-300/35 bg-cyan-300/12 px-2 py-0.5 text-xs font-medium text-cyan-100",
        className,
      )}
      {...props}
    />
  );
}
