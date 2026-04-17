import { useEffect, useMemo, useState } from "react";
import { useUserType } from "@/hooks/useUserType";
import TopLoadingBar from "@/components/ui/top-loading-bar";
import { DataTable } from "@/components/ui/data-table";
import { EmpDetailsColumnDefs } from "@/components/ui/columns-empdetails";
import useNotifications from "@/hooks/useNotifications";
import InterviewModal from "@/components/layout/InterviewModal";

import { toast } from "sonner";
import { SpinnerCustom } from "@/components/ui/spinner";
import type { EmpDetailsType } from "@/lib/types";

export default function IncomingApplications() {
  const [userType, loadingUserType] = useUserType();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<EmpDetailsType[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<EmpDetailsType | null>(null);
  const [showInterviewModal, setShowInterviewModal] = useState(false);

  useNotifications(userType || "");

  const fetchData = async () => {
    try {
      setLoading(true);

      const res = await fetch("/api/empdetails/", {
        credentials: "include",
        cache: "no-store",
      });

      const json = await res.json();
      const rawData: EmpDetailsType[] = json.data || [];

      const sorted = [...rawData].sort((a, b) => {
        if (a.status === "staged" && b.status !== "staged") return -1;
        if (a.status !== "staged" && b.status === "staged") return 1;
        if (a.status === "staged" && b.status === "staged") {
          return (
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        }
        return 0;
      });

      setData(sorted);
      localStorage.setItem("empdetails", JSON.stringify(sorted));
    } catch (error) {
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const cached = localStorage.getItem("empdetails");

    if (cached) {
      try {
        setData(JSON.parse(cached));
      } catch {
        localStorage.removeItem("empdetails");
      }
    }

    fetchData();
  }, []);

  const statusOptions = useMemo(() => {
    const statuses = Array.from(
      new Set(
        data
          .map((x) => String(x.status || "").trim().toLowerCase())
          .filter(Boolean)
      )
    );

    statuses.sort((a, b) => {
      if (a === "staged") return -1;
      if (b === "staged") return 1;
      return a.localeCompare(b);
    });

    return statuses;
  }, [data]);

  const handleInterviewClick = async (entry: EmpDetailsType) => {
    try {
      const userRes = await fetch("/api/current-user/", {
        credentials: "include",
        cache: "no-store",
      });
      const userData = await userRes.json();
      const currentUserId = userData.id;

      const entryRes = await fetch(`/api/empdetails/${entry.id}/live/`, {
        credentials: "include",
        cache: "no-store",
      });

      if (!entryRes.ok) {
        throw new Error("Failed to fetch live entry from DB");
      }

      const liveEntry = await entryRes.json();

      if (
        liveEntry.receptionist_id === null ||
        liveEntry.receptionist_id === currentUserId
      ) {
        await fetch(`/api/empdetails/${entry.id}/claim/`, {
          method: "POST",
          credentials: "include",
        });

        setSelectedEntry(liveEntry);
        setShowInterviewModal(true);
      } else {
        toast.error(
          `This interview is currently in progress with ${liveEntry.receptionist_name}. Try the next one.`
        );
      }
    } catch (err) {
      toast.error("Error preparing interview.");
    }
  };

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
      <h1 className="text-2xl font-semibold mb-4">Incoming Applications</h1>

      <div className="overflow-visible w-full">
        <DataTable
          key={JSON.stringify(data.map((x) => [x.id, x.status, x.created_at]))}
          columns={EmpDetailsColumnDefs(handleInterviewClick)}
          data={data}
          meta={{ statusOptions }}
        />
      </div>

      {selectedEntry && (
        <InterviewModal
          open={showInterviewModal}
          entry={selectedEntry}
          onOpenChange={(open) => {
            setShowInterviewModal(open);
            if (!open && selectedEntry) {
              fetch(`/api/empdetails/${selectedEntry.id}/unclaim/`, {
                method: "POST",
                credentials: "include",
              });
              setSelectedEntry(null);
            }
          }}
          onCompleted={() => {
            fetchData();
            setShowInterviewModal(false);
            setSelectedEntry(null);
          }}
        />
      )}
    </div>
  );
}