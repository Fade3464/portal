"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { SpinnerCustom } from "@/components/ui/spinner"

// ✅ import your modal
import FinalInterviewModal from "@/components/layout/FinalInterviewModal";

type FinalInterviewRow = {
  id: number;
  name: string | null;
  cnic: string | null;
  email: string | null;
  project_applied_for: string | null;
  status: string | null;
};

export default function FinalInterviewPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FinalInterviewRow[]>([]);

  // ✅ modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const fetchRows = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/final-interview-list/", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load final interview list");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
  }, []);

  const columns: ColumnDef<FinalInterviewRow>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: () => <div className="text-center">Name</div>,
        cell: ({ row }) => (
          <div className="text-center">{row.original.name || "—"}</div>
        ),
      },
      {
        accessorKey: "cnic",
        header: () => <div className="text-center">CNIC</div>,
        cell: ({ row }) => (
          <div className="text-center">{row.original.cnic || "—"}</div>
        ),
      },
      {
        accessorKey: "email",
        header: () => <div className="text-center">Email</div>,
        cell: ({ row }) => (
          <div className="text-center">{row.original.email || "—"}</div>
        ),
      },
      {
        accessorKey: "project_applied_for",
        header: () => <div className="text-center">Project</div>,
        cell: ({ row }) => (
          <div className="text-center">
            {row.original.project_applied_for || "—"}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: () => <div className="text-center">Status</div>,
        cell: ({ row }) => (
          <div className="text-center capitalize">
            {row.original.status || "—"}
          </div>
        ),
      },
      {
        id: "actions",
        header: () => <div className="text-center">Action</div>,
        cell: ({ row }) => (
          <div className="flex justify-center">
            <Button
              size="sm"
              onClick={() => {
                setSelectedId(row.original.id);
                setModalOpen(true);
              }}
            >
              Interview
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
<SpinnerCustom/>      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Final Interview</h1>

      <DataTable columns={columns} data={rows} />

      {/* ✅ Modal Mounted Here */}
      {selectedId !== null && (
        <FinalInterviewModal
          open={modalOpen}
          onOpenChange={(open) => {
            setModalOpen(open);
            if (!open) setSelectedId(null);
          }}
          entryId={selectedId}
          onCompleted={(updated: any) => {
            // ✅ update row instantly without re-fetch
            setRows((prev) =>
              prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r))
            );

            toast.success("Final interview saved!");
          }}
        />
      )}
    </div>
  );
}
