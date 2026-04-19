import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { Toaster } from "sonner";

import SidebarLayout from "./components/layout/SidebarLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import { SpinnerCustom } from "./components/ui/spinner";
import { ThemeProvider } from "./context/ThemeProvider";
import AuthPage from "./pages/AuthPage";
import AccountPage from "./pages/AccountPage";
import Dashboard from "./pages/Dashboard";

function RootRedirect() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

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

        navigate(data?.is_authenticated ? "/dashboard" : "/login", {
          replace: true,
        });
      } catch {
        if (active) {
          navigate("/login", { replace: true });
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    checkAuth();

    return () => {
      active = false;
    };
  }, [navigate]);

  if (!loading) {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <SpinnerCustom />
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<AuthPage />} />
      <Route
        element={
          <ProtectedRoute>
            <SidebarLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/account" element={<AccountPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <Toaster theme="system" richColors position="top-right" />
      <AppRoutes />
    </ThemeProvider>
  );
}
