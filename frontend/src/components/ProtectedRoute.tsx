import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { SpinnerCustom } from "@/components/ui/spinner";

type Props = {
  children: React.ReactNode;
};

export default function ProtectedRoute({ children }: Props) {
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let active = true;

    async function checkAuth() {
      try {
        const res = await fetch("/api/check-auth/", {
          credentials: "include",
        });
        const data = await res.json();

        if (!active) {
          return;
        }

        if (!res.ok || !data?.is_authenticated) {
          throw new Error("Not authenticated");
        }

        setLoading(false);
      } catch {
        if (!active) {
          return;
        }

        navigate("/login", {
          replace: true,
          state: {
            authError: "You must log in to access that page.",
            from: location.pathname,
          },
        });
      }
    }

    checkAuth();

    return () => {
      active = false;
    };
  }, [navigate, location.pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <SpinnerCustom />
      </div>
    );
  }

  return <>{children}</>;
}
