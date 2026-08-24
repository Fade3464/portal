import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Moon, Sun, X } from "lucide-react";

import { UserAuthForm } from "@/components/UserAuthForm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/ThemeProvider";

export default function AuthPage() {
  const [mounted, setMounted] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const { resolvedTheme, setTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let active = true;

    async function checkAuth() {
      try {
        const res = await fetch("/api/check-auth/", {
          credentials: "include",
        });
        const data = await res.json();

        if (active && res.ok && data?.is_authenticated) {
          navigate("/dashboard", { replace: true });
        }
      } catch {
        // Keep the login page visible when auth check fails.
      }
    }

    checkAuth();

    return () => {
      active = false;
    };
  }, [navigate]);

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  useEffect(() => {
    const fromState = (location.state as { authError?: string } | null)
      ?.authError;
    const fromQuery = searchParams.get("authError");
    const nextError = fromState ?? fromQuery;

    if (!nextError) {
      return;
    }

    setAuthError(nextError);

    if (fromState) {
      navigate(location.pathname + location.search, {
        replace: true,
        state: null,
      });
    }

    if (fromQuery) {
      const url = new URL(window.location.href);
      url.searchParams.delete("authError");
      window.history.replaceState({}, "", url.toString());
    }
  }, [location.state, location.pathname, location.search, navigate, searchParams]);

  useEffect(() => {
    if (!authError) {
      return;
    }

    const timer = setTimeout(() => setAuthError(null), 10000);
    return () => clearTimeout(timer);
  }, [authError]);

  if (!mounted) {
    return <div className="h-screen w-screen bg-background" />;
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-16 text-foreground transition-colors duration-500">
      <div className="app-scheme-atmosphere pointer-events-none absolute inset-0" />

      <div className="absolute right-5 top-5 z-20 sm:right-8 sm:top-8">
        <Button
          variant="outline"
          size="icon"
          onClick={toggleTheme}
          className="rounded-full border-border/70 bg-card/70 shadow-sm backdrop-blur transition-colors"
          aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
          title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
        >
          {resolvedTheme === "dark" ? (
            <Sun className="h-5 w-5 transition-transform duration-300" />
          ) : (
            <Moon className="h-5 w-5 transition-transform duration-300" />
          )}
        </Button>
      </div>

      {authError && (
        <Alert
          variant="destructive"
          className="fixed left-1/2 top-5 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 bg-card pr-11 shadow-xl"
          role="alert"
        >
          <AlertTitle>Access required</AlertTitle>
          <AlertDescription>{authError}</AlertDescription>

          <button
            type="button"
            onClick={() => setAuthError(null)}
            className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Dismiss alert"
          >
            <X className="h-4 w-4" />
          </button>
        </Alert>
      )}

      <main className="relative z-10 w-full max-w-[440px] rounded-2xl border border-border/60 bg-card/95 p-7 text-card-foreground shadow-xl backdrop-blur-md motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300 sm:p-9 dark:border-white/10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-border/70 bg-background p-2.5 shadow-sm">
            <img
              src="/vite.svg?v=pulsar-1"
              alt="Pulsar Portal"
              className="h-full w-full"
            />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to Pulsar</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your account details to continue.
          </p>
        </div>

        <UserAuthForm />
      </main>
    </div>
  );
}
