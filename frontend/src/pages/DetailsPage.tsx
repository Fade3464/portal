"use client";

import { useEffect, useMemo, useState } from "react";
import { TreeView, type TreeDataItem } from "@/components/ui/tree-view";
import { Folder, Users, User, Pencil, BarChart3, CalendarDays, Award } from "lucide-react";
import { toast } from "sonner";
import ModifyEmployeeModal from "@/components/layout/ModifyEmployeeModal";
import { SpinnerCustom } from "@/components/ui/spinner"

// ✅ ShadCN Select
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
type EmployeeItem = {
  id: number;
  name: string;
  status: string;

  team_leader_assigned: number | null;
  post_applied_for: string | null;
  joining_date: string | null;
};

type ApiResponse = {
  project_id: number;
  project_name: string;

  team_leaders: {
    id: number;
    team: string;
    leader_name: string;
    employees: EmployeeItem[];
  }[];

  // ✅ NEW: unassigned employees from backend
  unassigned_employees: EmployeeItem[];
}[];

export default function DetailsPage() {
  const [rawData, setRawData] = useState<ApiResponse>([]);
  const [treeData, setTreeData] = useState<TreeDataItem[]>([]);
  const [loading, setLoading] = useState(true);

  // ✅ Status filter
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  const [modifyOpen, setModifyOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(
    null
  );


  const getEmployeeNodeName = (emp: EmployeeItem, statusFilter: string) => {
  if (statusFilter === "all" && emp.status) {
    return `${emp.name} (${emp.status})`;
  }
  return emp.name;
};

  /* ---------------- FETCH DATA ---------------- */
  useEffect(() => {
    setLoading(true);

    fetch("/api/details-tree/", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data: ApiResponse) => {
        setRawData(data);
      })
      .catch(() => toast.error("Failed to load details"))
      .finally(() => setLoading(false));
  }, []);


  /*----------------------Reusable Fetch---------------------------------*/

  // ✅ add this function inside DetailsPage (above useEffect)
const fetchTree = async () => {
  setLoading(true);
  try {
    const res = await fetch("/api/details-tree/", { credentials: "include" });
    if (!res.ok) throw new Error("Failed to load");
    const data: ApiResponse = await res.json();
    setRawData(data);
  } catch {
    toast.error("Failed to load details");
  } finally {
    setLoading(false);
  }
};




  /* ---------------- BUILD STATUS OPTIONS ---------------- */
  const statusOptions = useMemo(() => {
    const statusSet = new Set<string>();

    rawData.forEach((project) => {
      // assigned employees
      project.team_leaders.forEach((tl) => {
        tl.employees?.forEach((emp) => {
          if (emp?.status) statusSet.add(emp.status);
        });
      });

      // unassigned employees
      project.unassigned_employees?.forEach((emp) => {
        if (emp?.status) statusSet.add(emp.status);
      });
    });

    return Array.from(statusSet).sort((a, b) => a.localeCompare(b));
  }, [rawData]);

  /* ---------------- HANDLERS ---------------- */
  const handleModify = (empId: number) => {
    setSelectedEmployeeId(empId);
    setModifyOpen(true);
  };

  const handlePerformance = (empId: number) => {
    console.log("📊 Performance for employee:", empId);
    toast.info(`Performance component in development, stay tuned!`);
  };

  /* ---------------- BUILD TREE ---------------- */
  const buildTree = (data: ApiResponse, statusFilter: string): TreeDataItem[] => {
    return data
      .map((project) => {
        // ---------------- TEAM LEADER EMPLOYEES (assigned) ----------------
        const filteredTeamLeaders = project.team_leaders
          .map((tl) => {
            const filteredEmployees = Array.isArray(tl.employees)
              ? tl.employees
                  .filter((emp) => emp && emp.id)
                  .filter((emp) => emp.team_leader_assigned !== null)
                  .filter((emp) => {
                    if (statusFilter === "all") return true;
                    return emp.status === statusFilter;
                  })
              : [];

            return {
              ...tl,
              employees: filteredEmployees,
            };
          })
          .filter((tl) => tl.employees.length > 0);

        // ---------------- UNASSIGNED EMPLOYEES (from backend) ----------------
        const unassignedEmployees = Array.isArray(project.unassigned_employees)
          ? project.unassigned_employees.filter((emp) => emp && emp.id)
          : [];

        const filteredUnassignedEmployees = unassignedEmployees.filter((emp) => {
          if (statusFilter === "all") return true;
          return emp.status === statusFilter;
        });

        // group unassigned by post_applied_for
        const postMap = new Map<string, EmployeeItem[]>();

        filteredUnassignedEmployees.forEach((emp) => {
          const post =
            (emp.post_applied_for || "Unknown Post").trim() || "Unknown Post";

          if (!postMap.has(post)) postMap.set(post, []);
          postMap.get(post)!.push(emp);
        });

        const unassignedPostBranches: TreeDataItem[] = Array.from(postMap.entries()).map(
          ([postName, employees]) => {
            const inTraining = employees.filter(
              (e) => (e.status || "").toLowerCase() === "in_training"
            );

            const notInTraining = employees.filter(
              (e) => (e.status || "").toLowerCase() !== "in_training"
            );

            // in_training -> group by joining_date
            const joiningDateMap = new Map<string, EmployeeItem[]>();

            inTraining.forEach((emp) => {
              const jd = emp.joining_date ? emp.joining_date : "No Joining Date";
              if (!joiningDateMap.has(jd)) joiningDateMap.set(jd, []);
              joiningDateMap.get(jd)!.push(emp);
            });

            const joiningDateBranches: TreeDataItem[] = Array.from(
            joiningDateMap.entries()
          ).map(([joiningDate, emps]) => ({
            id: `unassigned-${project.project_id}-${postName}-jd-${joiningDate}`,
            name: joiningDate,
            icon: CalendarDays,
            children: emps.map((emp) => ({
              id: `emp-${emp.id}`,
              name:
                statusFilter === "all" && emp.status
                  ? `${emp.name} (${emp.status})`
                  : emp.name,
              icon: User,
              children: [
                {
                  id: `emp-${emp.id}-modify`,
                  name: "Modify",
                  icon: Pencil,
                  onClick: () => handleModify(emp.id),
                },
                {
                  id: `emp-${emp.id}-performance`,
                  name: "Performance",
                  icon: BarChart3,
                  onClick: () => handlePerformance(emp.id),
                },
              ],
            })),
          }));
            // non in_training -> directly under post
            const nonTrainingEmployeeNodes: TreeDataItem[] = notInTraining.map((emp) => ({
              id: `emp-${emp.id}`,
              name: getEmployeeNodeName(emp, statusFilter),
              icon: User,
              children: [
                {
                  id: `emp-${emp.id}-modify`,
                  name: "Modify",
                  icon: Pencil,
                  onClick: () => handleModify(emp.id),
                },
                {
                  id: `emp-${emp.id}-performance`,
                  name: "Performance",
                  icon: BarChart3,
                  onClick: () => handlePerformance(emp.id),
                },
              ],
            }));
            return {
              id: `unassigned-post-${project.project_id}-${postName}`,
              name: postName.toUpperCase(),
              icon: Award,
              children: [...joiningDateBranches, ...nonTrainingEmployeeNodes],
            };
          }
        );

        // ---------------- BUILD PROJECT CHILDREN ----------------
        const projectChildren: TreeDataItem[] = [
          // team leaders
          ...filteredTeamLeaders.map((tl) => ({
            id: `tl-${tl.id}`,
            name: `${tl.team.toUpperCase()} — ${tl.leader_name}`,
            icon: Users,
            children: tl.employees.map((emp) => ({
              id: `emp-${emp.id}`,
              name: getEmployeeNodeName(emp, statusFilter),
              icon: User,
              children: [
                {
                  id: `emp-${emp.id}-modify`,
                  name: "Modify",
                  icon: Pencil,
                  onClick: () => handleModify(emp.id),
                },
                {
                  id: `emp-${emp.id}-performance`,
                  name: "Performance",
                  icon: BarChart3,
                  onClick: () => handlePerformance(emp.id),
                },
              ],
            })),
          })),

          // unassigned branch
          ...(unassignedPostBranches.length > 0
            ? [
                {
                  id: `project-${project.project_id}-unassigned`,
                  name: "UNASSIGNED",
                  icon: Users,
                  children: unassignedPostBranches,
                },
              ]
            : []),
        ];

        return {
          id: `project-${project.project_id}`,
          name: project.project_name,
          icon: Folder,
          children: projectChildren,
        };
      })
      .filter((proj) => Array.isArray(proj.children) && proj.children.length > 0);
  };

  /* ---------------- UPDATE TREE WHEN STATUS CHANGES ---------------- */
  useEffect(() => {
    setTreeData(buildTree(rawData, selectedStatus));
  }, [rawData, selectedStatus]);

  /* ---------------- RENDER ---------------- */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <SpinnerCustom />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header + Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <h1 className="text-2xl font-semibold">Details</h1>

        {/* ✅ Status Filter Select */}
        <div className="w-full sm:w-[240px]">
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select Status" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="all">All Employees</SelectItem>

              {statusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tree */}
      {treeData.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No employees found under any project.
        </div>
      ) : (
        <TreeView
          data={treeData}
          expandAll={false}
          defaultNodeIcon={Folder}
          defaultLeafIcon={User}
        />
      )}

      {/* Modify Modal */}
      <ModifyEmployeeModal
        open={modifyOpen}
        employeeId={selectedEmployeeId}
        onClose={() => setModifyOpen(false)}
        onSaved={() => {
          // optional: refresh after save
          // (if you want live updates, I can add refetch here)
             setModifyOpen(false);
            fetchTree();
        }}
      />
    </div>
  );
}
