import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Activity, Headphones, Moon, ShieldCheck, Sun, X } from "lucide-react";

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
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground transition-colors duration-500">
      <div className="app-scheme-atmosphere pointer-events-none absolute inset-0" />

      <header className="relative z-20 flex h-20 items-center justify-between px-5 sm:px-8 lg:px-12">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-card/80 p-2 shadow-sm backdrop-blur">
            <img src="/vite.svg?v=pulsar-1" alt="" className="h-full w-full" />
          </div>
          <div className="leading-none">
            <p className="text-sm font-semibold tracking-tight">Pulsar Portal</p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Operations Console
            </p>
          </div>
        </div>

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
      </header>

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

      <main className="relative z-10 flex min-h-[calc(100vh-8rem)] items-center px-4 pb-12 sm:px-8 lg:px-12">
        <div className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-[1.75rem] border border-border/60 bg-card/90 text-card-foreground shadow-[0_28px_90px_-42px_hsl(var(--foreground)/0.35)] backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 dark:border-white/10 lg:grid-cols-[1.08fr_0.92fr]">
          <section className="relative hidden min-h-[640px] overflow-hidden border-r border-border/60 bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
            <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(hsl(var(--primary-foreground)/0.15)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--primary-foreground)/0.15)_1px,transparent_1px)] [background-size:44px_44px]" />
            <div className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full border border-primary-foreground/15" />
            <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full border border-primary-foreground/15" />

            <div className="relative max-w-md">
              <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]">
                <Activity className="h-3.5 w-3.5" />
                Live operations
              </div>
              <h1 className="text-4xl font-semibold leading-[1.12] tracking-[-0.035em] xl:text-5xl">
                Call operations, clearly under control.
              </h1>
              <p className="mt-6 max-w-sm text-sm leading-6 text-primary-foreground/70">
                Monitor live traffic, review outcomes, and understand routing performance from one secure workspace.
              </p>
            </div>

            <div className="relative grid gap-3">
              <div className="flex items-start gap-4 border-t border-primary-foreground/20 pt-5">
                <Headphones className="mt-0.5 h-5 w-5 text-primary-foreground/80" />
                <div>
                  <p className="text-sm font-semibold">Operational visibility</p>
                  <p className="mt-1 text-xs leading-5 text-primary-foreground/65">
                    Live statuses, playback samples, and batch performance in context.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 border-t border-primary-foreground/20 pt-5">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-primary-foreground/80" />
                <div>
                  <p className="text-sm font-semibold">Protected access</p>
                  <p className="mt-1 text-xs leading-5 text-primary-foreground/65">
                    Password-first authentication with optional authenticator verification.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="relative flex min-h-[570px] items-center p-6 sm:p-10 lg:min-h-[640px] lg:p-12 xl:p-16">
            <div className="app-scheme-accent-glow pointer-events-none absolute inset-x-0 top-0 h-36 opacity-60" />
            <div className="relative mx-auto w-full max-w-[390px]">
              <div className="mb-8">
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-background/80 p-2.5 shadow-sm lg:hidden">
                  <img src="/vite.svg?v=pulsar-1" alt="" className="h-full w-full" />
                </div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                  Secure access
                </p>
                <h2 className="text-3xl font-semibold tracking-[-0.025em]">Welcome back</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Sign in with your authorized account to continue.
                </p>
              </div>

              <UserAuthForm />

              <div className="mt-8 flex items-center gap-2 border-t border-border/60 pt-5 text-[11px] leading-5 text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                <span>Authorized users only. Authentication activity is monitored.</span>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="relative z-10 flex h-12 items-center justify-center px-5 pb-4 text-center text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        Pulsar Portal &middot; Secure Operations Environment
      </footer>
    </div>
  );
}
