import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Moon, Sun } from "lucide-react";

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
    <div className="relative flex h-screen w-screen items-center justify-center bg-background text-foreground transition-colors duration-500">
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

      <div className="flex w-[90%] flex-col items-center justify-center rounded-2xl border bg-card p-8 text-card-foreground shadow-2xl backdrop-blur-md transition-all sm:w-[400px]">
        {authError && (
          <Alert variant="destructive" className="relative mb-4 w-full pr-10">
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

        <div className="mb-6 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Welcome Back</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to access your dashboard
          </p>
        </div>

        <UserAuthForm />
      </div>
    </div>
  );
}
