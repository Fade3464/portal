"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded-md",

      // 🔲 Unchecked state — Light Mode
      "bg-gray-100 border border-gray-400", // ← light gray bg + exact input border

      // 🌑 Unchecked — Dark Mode
      "dark:bg-input/30 dark:border-gray-400",

      // ✅ Checked state
      "data-[state=checked]:bg-black",
      "dark:data-[state=checked]:bg-white",
      "data-[state=checked]:text-white",
      "dark:data-[state=checked]:text-black",
      "data-[state=checked]:border-black",
      "dark:data-[state=checked]:border-white",

      // 🎯 Focus ring
      "focus-visible:outline-none focus-visible:ring-[3px]",
      "focus-visible:ring-ring/50 focus-visible:border-ring",
      "ring-offset-background",

      "transition-colors",

      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      <Check className="h-3 w-3" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));

Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
