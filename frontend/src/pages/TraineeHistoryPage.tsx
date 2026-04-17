"use client";

import { useEffect, useMemo, useState } from "react";
import { TreeView, type TreeDataItem } from "@/components/ui/tree-view";
import { Folder} from "lucide-react";
import { toast } from "sonner";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { SpinnerCustom } from "@/components/ui/spinner"


type TraineeRow = {
  id: number;
  name: string;
  post_applied_for: string | null;
  training_completion_date: string | null;
  joining_date: string | null;
  status: string | null;
  team_leader_assigned: string | null;
  team_leader_name: string | null;
};

type ProjectHistory = {
  project_name: string;
  employees: TraineeRow[];
};

export default function TraineeHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [rawData, setRawData] = useState<ProjectHistory[]>([]);

  // which project table to show
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  /* ===================== FETCH ===================== */
  useEffect(() => {
    setLoading(true);

    fetch("/api/trainee_history/", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed");
        return res.json();
      })
      .then((data) => {
        const list: ProjectHistory[] = Array.isArray(data) ? data : [];
        setRawData(list);

        // reset selection if project no longer exists
        setSelectedProject((prev) => {
          if (!prev) return null;
          const stillExists = list.some((p) => p.project_name === prev);
          return stillExists ? prev : null;
        });
      })
      .catch(() => toast.error("Failed to load trainee history"))
      .finally(() => setLoading(false));
  }, []);

  /* ===================== TREE ===================== */
  const treeData: TreeDataItem[] = useMemo(() => {
    const projects = rawData
      .filter((p) => p.employees?.length > 0)
      .map((p) => ({
        id: `project-${p.project_name}`,
        name: p.project_name,
        icon: Folder,
        // IMPORTANT: do NOT add onClick here because TreeView won't call it
        // TreeView selection is handled via onSelectChange below
      }));

    return [
      {
        id: "root-projects",
        name: "Projects",
        icon: Folder,
        children: projects,
      },
    ];
  }, [rawData]);

const hasProjects = (treeData[0]?.children?.length ?? 0) > 0;
  /* ===================== TABLE DATA ===================== */
  const selectedRows: TraineeRow[] = useMemo(() => {
    if (!selectedProject) return [];

    const found = rawData.find((p) => p.project_name === selectedProject);
    if (!found) return [];

    return [...(found.employees || [])].sort((a, b) => {
      const da = a.training_completion_date
        ? new Date(a.training_completion_date).getTime()
        : 0;
      const db = b.training_completion_date
        ? new Date(b.training_completion_date).getTime()
        : 0;
      return db - da;
    });
  }, [rawData, selectedProject]);

  /* ===================== COLUMNS ===================== */
  const columns: ColumnDef<TraineeRow>[] = [
    {
      accessorKey: "name",
      header: () => <div className="text-center">Name</div>,
      cell: ({ row }) => (
        <div className="text-center">{row.original.name || "—"}</div>
      ),
    },
    {
      accessorKey: "post_applied_for",
      header: () => <div className="text-center">Post</div>,
      cell: ({ row }) => (
        <div className="text-center">
          {row.original.post_applied_for || "—"}
        </div>
      ),
    },
    {
      accessorKey: "training_completion_date",
      header: () => (
        <div className="text-center">Completion/Rejection Date</div>
      ),
      cell: ({ row }) => (
        <div className="text-center">
          {row.original.training_completion_date
            ? new Date(row.original.training_completion_date).toLocaleDateString()
            : "—"}
        </div>
      ),
    },
    {
      accessorKey: "joining_date",
      header: () => <div className="text-center">Joining Date</div>,
      cell: ({ row }) => (
        <div className="text-center">
          {row.original.joining_date
            ? new Date(row.original.joining_date).toLocaleDateString()
            : "—"}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: () => <div className="text-center">Status</div>,
      cell: ({ row }) => (
        <div className="text-center">{row.original.status || "—"}</div>
      ),
    },
    {
      accessorKey: "team_leader_name",
      header: () => <div className="text-center">Team Leader</div>,
      cell: ({ row }) => (
        <div className="text-center">{row.original.team_leader_name || "—"}</div>
      ),
    },
  ];

  /* ===================== RENDER ===================== */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
<SpinnerCustom />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">History</h1>
        <p className="text-sm text-muted-foreground">
          Click a project to view history.
        </p>
      </div>

      {/* Layout */}
      <div className="grid grid-cols-12 gap-6">
        {/* LEFT: Tree */}
        <div className="col-span-12 md:col-span-4">
          <div className="rounded-xl border bg-background p-3">
            {!hasProjects ? (
              <div className="text-sm text-muted-foreground p-3">
                No trainee history found.
              </div>
            ) : (
              <TreeView
                data={treeData}
                className="w-full"
                onSelectChange={(item) => {
                  // item is the clicked node
                  if (!item?.id?.startsWith("project-")) return;

                  const projectName = item.name;

                  setSelectedProject((prev) =>
                    prev === projectName ? null : projectName
                  );
                }}
              />
            )}
          </div>
        </div>

        {/* RIGHT: Table */}
        <div className="col-span-12 md:col-span-8">
          {selectedProject && (
            <div className="rounded-xl border bg-background p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold">{selectedProject}</h2>
                <span className="text-xs text-muted-foreground">
                  Records: {selectedRows.length}
                </span>
              </div>

              <DataTable columns={columns} data={selectedRows} />
            </div>
          )}

          {/* Optional hint when nothing selected */}
          {!selectedProject && hasProjects && (
            <div className="rounded-xl border bg-background p-6 text-sm text-muted-foreground">
              Select a project from the left to view records.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
