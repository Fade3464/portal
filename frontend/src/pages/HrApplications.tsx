import { useEffect, useState, useCallback, useMemo } from "react";
import { useUserType } from "@/hooks/useUserType";
import TopLoadingBar from "@/components/ui/top-loading-bar";
import { DataTable } from "@/components/ui/data-table";
import useNotifications from "@/hooks/useNotifications";
import { EmpDetailsColumnDefsHR } from "@/components/ui/columns-empdetails-hr";
import HRInterviewModal from "@/components/layout/HRInterviewModal";
import { SpinnerCustom } from "@/components/ui/spinner";
import type { EmpDetailsType } from "@/lib/types";

export default function HRApplications() {
  const [userType, loadingUserType] = useUserType();
  useNotifications(userType || "");

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<EmpDetailsType[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      const res = await fetch("/api/empdetails/", {
        credentials: "include",
        cache: "no-store",
      });

      const json = await res.json();
      const rawData: EmpDetailsType[] = json.data || [];

      const sorted = [...rawData].sort((a, b) => {
        if (a.status === "proceeded" && b.status !== "proceeded") return -1;
        if (a.status !== "proceeded" && b.status === "proceeded") return 1;
        if (a.status === "proceeded" && b.status === "proceeded") {
          return (
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        }
        return 0;
      });

      setData(sorted);
      localStorage.setItem("hr_empdetails", JSON.stringify(sorted));
    } catch (error) {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = localStorage.getItem("hr_empdetails");

    if (cached) {
      try {
        setData(JSON.parse(cached));
      } catch {
        localStorage.removeItem("hr_empdetails");
      }
    }

    fetchData();
  }, [fetchData]);

  const handleInterviewClick = useCallback((entry: EmpDetailsType) => {
    setSelectedId(entry.id);
    setModalOpen(true);
  }, []);

  const statusOptions = useMemo(() => {
    return Array.from(
      new Set(
        data
          .map((x) => {
            let s = String(x.status || "").trim();

            if (s === "proceeded" && x.proceeded_for_final_interview) {
              s = "final_interview_scheduled";
            }

            return s.toLowerCase();
          })
          .filter(Boolean)
      )
    ).sort();
  }, [data]);

  const postOptions = useMemo(() => {
    return Array.from(
      new Set(
        data
          .map((x) => String(x.post_applied_for || "").trim())
          .filter(Boolean)
      )
    ).sort();
  }, [data]);

  const projectOptions = useMemo(() => {
    return Array.from(
      new Set(
        data
          .map((x) => String(x.project_applied_for || "").trim())
          .filter(Boolean)
      )
    ).sort();
  }, [data]);

  if (loadingUserType || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <SpinnerCustom />
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-8 py-6">
      <TopLoadingBar loading={loading} />
      <h1 className="text-2xl font-semibold mb-4">HR Applications</h1>

      <DataTable
        key={JSON.stringify(data.map((x) => [x.id, x.status, x.created_at]))}
        columns={EmpDetailsColumnDefsHR({
          onInterviewClick: handleInterviewClick,
        })}
        data={data}
        meta={{
          statusOptions,
          postOptions,
          projectOptions,
        }}
      />

      {selectedId !== null && (
        <HRInterviewModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          entryId={selectedId}
          onCompleted={() => {
            setModalOpen(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
}