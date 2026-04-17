import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

/* ---------------- Base Progress ---------------- */

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    value?: number
  }
>(({ className, value = 0, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "relative h-4 w-full overflow-hidden rounded-full bg-secondary",
      className
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-primary transition-all"
      style={{ transform: `translateX(-${100 - value}%)` }}
    />
  </ProgressPrimitive.Root>
))

Progress.displayName = "Progress"

/* ---------------- Label ---------------- */

const ProgressLabel = ({
  children,
  className,
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("text-sm font-medium mb-1", className)}>
    {children}
  </div>
)

/* ---------------- Value ---------------- */

const ProgressValue = ({
  value,
  className,
}: {
  value?: number
  className?: string
}) => (
  <div
    className={cn(
      "text-xs text-muted-foreground mt-1 text-right",
      className
    )}
  >
    {value ?? 0}%
  </div>
)

/* ---------------- Combined Component ---------------- */

function ProgressWithLabel({ value }: { value: number }) {
  return (
    <div className="w-full max-w-sm">
      <ProgressLabel>Upload progress</ProgressLabel>
      <Progress value={value} />
      <ProgressValue value={value} />
    </div>
  )
}

export { Progress, ProgressLabel, ProgressValue, ProgressWithLabel }