import { useEffect, useState } from "react";

export function useUserType(): [string | null, boolean] {
  const [userType, setUserType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/check-auth/", { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (active && data?.is_authenticated && data?.user_type) {
          setUserType(data.user_type);
        }
      })
      .catch(() => setUserType(null))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return [userType, loading];
}
