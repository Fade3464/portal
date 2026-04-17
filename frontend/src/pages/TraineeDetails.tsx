"use client";

import { useEffect, useState } from "react";
import { TreeView} from "@/components/ui/tree-view";
import type { TreeDataItem } from "@/components/ui/tree-view";
import { Folder, CalendarDays, User, Award, GraduationCap, BriefcaseBusiness, FileBadge, Check, Ban } from "lucide-react";
import { SpinnerCustom } from "@/components/ui/spinner"
import TraineeActionModal from "@/components/layout/TraineeActionModal";
import EmployeeHoverPhoto from "@/components/EmployeeHoverPhoto";

import { toast } from "sonner";

export default function TraineeDetails() {
    const [loading, setLoading] = useState(true);
  const [treeData, setTreeData] = useState<TreeDataItem[]>([]);
  const [actionOpen, setActionOpen] = useState(false);
    const [actionType, setActionType] = useState<"proceed" | "reject" | null>(null);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);

  /* ===================== FETCH ===================== */

const fetchTree = () => {
    setLoading(true);
  fetch("/api/trainee-details-tree/", { credentials: "include" })
    .then((res) => res.json())
    .then((data) => setTreeData(transformToTree(data)))
    .catch(() => toast.error("Failed to load trainee details"))
    .finally(() => setLoading(false));
};

useEffect(() => {
  fetchTree();
}, []);


  /* ===================== TRANSFORM ===================== */

  const transformToTree = (data: any[]): TreeDataItem[] => {
  return data.map((project: any) => {
    const monthGroups: Record<string, any[]> = {};

    // group joining_dates by month
    project.joining_groups.forEach((group: any) => {
      const date = new Date(group.joining_date);
      const monthKey = date.toLocaleString("default", {
        month: "long",
        year: "numeric",
      });

      if (!monthGroups[monthKey]) {
        monthGroups[monthKey] = [];
      }

      monthGroups[monthKey].push(group);
    });

    return {
      id: `project-${project.project_name}`,
      name: project.project_name,
      icon: Folder,

      children: Object.entries(monthGroups).map(([month, groups]) => ({
        id: `month-${project.project_name}-${month}`,
        name: month,
        icon: CalendarDays,

        children: groups.map((group: any) => ({
          id: `joining-${project.project_name}-${group.joining_date}`,
          name: group.joining_date,
          icon: CalendarDays,

          children: group.posts.map((post: any) => ({
            id: `post-${project.project_name}-${group.joining_date}-${post.post_applied_for}`,
            name: post.post_applied_for || "Unknown Post",
            icon: Award,

            children: post.employees.map((emp: any) => ({
              id: `emp-${emp.id}`,
              name: (
                <EmployeeHoverPhoto employeeId={emp.id}>
                  <span className="text-sm cursor-pointer hover:underline">
                    {emp.name}
                  </span>
                </EmployeeHoverPhoto>
              ),
              icon: User,

              children: [
                {
                  id: `edu-bg-${emp.id}`,
                  name: `Education: ${emp.education_background || "—"}`,
                  icon: GraduationCap,
                },
                {
                  id: `edu-details-${emp.id}`,
                  name: `Education Details: ${emp.education_details || "—"}`,
                  icon: FileBadge,
                },
                {
                  id: `exp-${emp.id}`,
                  name: `Experience: ${emp.experience || "—"}`,
                  icon: BriefcaseBusiness,
                },
                {
                  id: `actions-${emp.id}`,
                  name: "Actions",
                  children: [
                    {
                      id: `proceed-${emp.id}`,
                      name: "Proceed",
                      icon: Check,
                      onClick: () => {
                        setSelectedEmployeeId(emp.id);
                        setActionType("proceed");
                        setActionOpen(true);
                      },
                    },
                    {
                      id: `reject-${emp.id}`,
                      name: "Reject",
                      icon: Ban,
                      onClick: () => {
                        setSelectedEmployeeId(emp.id);
                        setActionType("reject");
                        setActionOpen(true);
                      },
                    },
                  ],
                },
              ],
            })),
          })),
        })),
      })),
    };
  });
};
if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <SpinnerCustom />
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Trainee Details</h1>

      {treeData.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No trainees currently in training.
        </div>
      ) : (
        <TreeView
          data={treeData}
          expandAll
        />
      )}
    <TraineeActionModal
    open={actionOpen}
    onClose={() => setActionOpen(false)}
    employeeId={selectedEmployeeId}
    mode={actionType!}   // ✅ FIX HERE
    onCompleted={() => {
        setActionOpen(false);
        fetchTree();
    }}
    />
    </div>
  );
}
