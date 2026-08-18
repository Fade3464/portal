import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme } from "@/context/ThemeProvider";

type HeaderProps = {
  collapsed: boolean;
  title?: string;
};

export default function Header({ collapsed, title = "Dashboard" }: HeaderProps) {
  const { resolvedTheme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <header
      className={cn(
        "fixed top-0 z-30 flex h-14 w-full items-center justify-between border-border bg-background/80 pr-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:pr-6",
        "transition-[padding-left] duration-300 ease-in-out will-change-[padding-left]",
        collapsed ? "pl-[80px]" : "pl-[260px]"
      )}
    >
      <div className="ml-4">
        <h1 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {title}
        </h1>
      </div>

      <Button
        size="icon"
        variant="outline"
        onClick={toggleTheme}
        className="rounded-full border-border bg-background/80 text-foreground shadow"
      >
        {resolvedTheme === "dark" ? (
          <Sun className="h-5 w-5 text-primary" />
        ) : (
          <Moon className="h-5 w-5 text-primary" />
        )}
      </Button>
    </header>
  );
}
