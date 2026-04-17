"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, children, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        // Base styling
        "relative z-50 rounded-md border border-border px-3 py-1.5 text-xs font-medium shadow-md",
        // Light mode
        "bg-white text-gray-900",
        // Dark mode
        "dark:bg-[#111] dark:text-gray-100 dark:border-gray-700",
        // Animation
        "animate-in fade-in-0 zoom-in-95 transition-all duration-150",
        className
      )}
      {...props}
    >
      {children}
      {/* Custom arrow */}
      <span
        className={cn(
          "absolute left-[-5px] top-1/2 -translate-y-1/2 w-2 h-2 rotate-45",
          "bg-white dark:bg-[#111] border-l border-t border-border dark:border-gray-700 shadow-sm"
        )}
      />
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
));

TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
