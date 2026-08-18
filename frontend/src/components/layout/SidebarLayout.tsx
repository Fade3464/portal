import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { ElasticScroll } from "@/components/ElasticScroll";
import Sidebar from "@/components/layout/Sidebar";
import { SpinnerCustom } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import Header from "./Header";

export default function SidebarLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarReady, setSidebarReady] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    setCollapsed(saved === "true");
    setSidebarReady(true);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const res = await fetch("/api/check-auth/", { credentials: "include" });
        const data = await res.json();

        if (!active) {
          return;
        }

        if (!res.ok || !data?.is_authenticated) {
          throw new Error("Unauthorized");
        }

        setUsername(data?.user?.display_name || data?.user?.username || null);
        setEmail(data?.user?.email || null);
      } catch {
        if (!active) {
          return;
        }

        navigate("/login", {
          state: { authError: "You need to login to continue" },
          replace: true,
        });
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadSession();

    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    const handleAccountUpdated = (
      event: Event
    ) => {
      const detail = (event as CustomEvent<{
        display_name?: string;
        email?: string;
      }>).detail;

      if (detail?.display_name) {
        setUsername(detail.display_name);
      }
      if (detail?.email) {
        setEmail(detail.email);
      }
    };

    window.addEventListener("account-profile-updated", handleAccountUpdated);
    return () => {
      window.removeEventListener("account-profile-updated", handleAccountUpdated);
    };
  }, []);

  const headerTitle = useMemo(() => {
    if (location.pathname.startsWith("/account")) {
      return "Account";
    }
    if (location.pathname.startsWith("/call-lookup")) {
      return "Call Lookup";
    }

    return "Dashboard";
  }, [location.pathname]);

  if (loading || !sidebarReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <SpinnerCustom />
      </div>
    );
  }

  const handleSetCollapsed = (value: boolean) => {
    localStorage.setItem("sidebarCollapsed", String(value));
    setCollapsed(value);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar
        collapsed={collapsed}
        setCollapsed={handleSetCollapsed}
        username={username}
        email={email}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header collapsed={collapsed} title={headerTitle} />

        <div
          className={cn(
            "flex-1 pt-14 transition-[padding-left] duration-300 ease-in-out will-change-[padding-left]",
            collapsed ? "pl-[80px]" : "pl-[260px]"
          )}
        >
          <ElasticScroll className="h-full">
            <Outlet />
          </ElasticScroll>
        </div>
      </div>
    </div>
  );
}
