import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Moon, ShieldCheck, Sun } from "lucide-react";

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
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-background text-foreground transition-colors duration-500">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(15,118,110,0.12),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(37,99,235,0.12),transparent_32%)]" />
      <div className="absolute top-6 right-6">
        <Button
          variant="outline"
          size="icon"
          onClick={toggleTheme}
          className="rounded-full border shadow-md transition-all"
        >
          {resolvedTheme === "dark" ? (
            <Sun className="h-5 w-5 transition-transform duration-300" />
          ) : (
            <Moon className="h-5 w-5 transition-transform duration-300" />
          )}
        </Button>
      </div>

      <div className="relative w-[92%] max-w-[440px] overflow-hidden rounded-3xl border border-border/40 bg-card/95 text-card-foreground shadow-2xl backdrop-blur-md transition-all motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-500 dark:border-white/10">
        {authError && (
          <Alert variant="destructive" className="absolute top-6 left-6 right-6 z-10 pr-10 md:right-auto md:w-[360px]">
            <AlertTitle>Unauthorized</AlertTitle>
            <AlertDescription>{authError}</AlertDescription>

            <button
              onClick={() => setAuthError(null)}
              className="absolute top-2 right-2 text-muted-foreground transition hover:text-red-500"
              aria-label="Dismiss alert"
            >
              x
            </button>
          </Alert>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,rgba(15,118,110,0.14),transparent_68%)] dark:bg-[radial-gradient(circle_at_top,rgba(45,212,191,0.12),transparent_68%)]" />

        <div className="flex min-h-[460px] w-full flex-col justify-center p-8 sm:p-9">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-background/80 shadow-sm dark:border-white/10 dark:bg-white/5">
              <ShieldCheck className="h-6 w-6 text-teal-600 dark:text-teal-400" />
            </div>
            <h2 className="text-3xl font-semibold tracking-tight">Sign in</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Welcome Back!
            </p>
          </div>

          <UserAuthForm />
        </div>
      </div>
    </div>
  );
}
