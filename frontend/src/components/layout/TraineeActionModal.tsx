"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { toast } from "sonner";

type ActionMode = "proceed" | "reject";

interface TraineeActionModalProps {
  open: boolean;
  mode: ActionMode;
  employeeId: number | null;
  onClose: () => void;
  onCompleted?: () => void;
}

export default function TraineeActionModal({
  open,
  mode,
  employeeId,
  onClose,
  onCompleted,
}: TraineeActionModalProps) {
  const [employeeName, setEmployeeName] = useState<string>("");
  const [remarks, setRemarks] = useState("");
  const [date, setDate] = useState<Date | null>(null);
  const [teamLeaders, setTeamLeaders] = useState<any[]>([]);
  const [selectedLeader, setSelectedLeader] = useState<string>("");
  const [rejectType, setRejectType] = useState<"reject" | "ghost">("reject");

  /* ---------------- Reset when opening ---------------- */
  useEffect(() => {
    if (!open) return;

    setRemarks("");
    setDate(null);
    setTeamLeaders([]);
    setSelectedLeader("");
    setEmployeeName("");
    setRejectType("reject");
  }, [open, employeeId]);



  const formatLocalDate = (d: Date) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
};


  /* ---------------- Fetch Employee Name ---------------- */
  useEffect(() => {
    if (!open || !employeeId) return;

    fetch(`/api/empdetails/${employeeId}/full/`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => setEmployeeName(data?.name ?? ""))
      .catch(() => setEmployeeName(""));
  }, [open, employeeId]);

  /* ---------------- Fetch Team Leaders (Proceed only) ---------------- */
  useEffect(() => {
    if (!open || mode !== "proceed" || !employeeId) return;

    fetch(`/api/employee/${employeeId}/team-leaders/`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => setTeamLeaders(Array.isArray(data) ? data : []))
      .catch(() => setTeamLeaders([]));
  }, [open, mode, employeeId]);

  /* ---------------- Submit ---------------- */
  const handleSubmit = async () => {
    if (!employeeId) return;

    if (!remarks.trim()) {
      toast.error("Remarks are required");
      return;
    }

    // Now ALL modes require date
    if (!date) {
      toast.error(
        mode === "proceed"
          ? "Training completion date is required"
          : "Date is required"
      );
      return;
    }

    if (mode === "proceed" && !selectedLeader) {
      toast.error("Please select a team leader");
      return;
    }

    const payload: any = {
      trainer_remarks: remarks,
      action:
        mode === "proceed"
          ? "proceed"
          : rejectType === "ghost"
          ? "ghost"
          : "reject",
      training_completion_date: formatLocalDate(date),
      team_leader_id: mode === "proceed" ? selectedLeader : null,
    };

    const res = await fetch(
      `/api/employee/${employeeId}/trainee-action/`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      }
    );

    if (res.ok) {
      toast.success(
        mode === "proceed"
          ? "Employee moved to probation"
          : rejectType === "ghost"
          ? "Employee marked as ghosted"
          : "Employee rejected"
      );
      onCompleted?.();
      onClose();
    } else {
      toast.error("Action failed");
    }
  };

  /* ---------------- Render ---------------- */

  const titleAction =
    mode === "proceed"
      ? "Proceed"
      : rejectType === "ghost"
      ? "Ghost"
      : "Reject";

  const titleName = employeeName?.trim() ? ` ${employeeName}` : "";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {titleAction}
            {titleName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          {/* Reject Type Selector */}
          {mode === "reject" && (
            <div>
              <Label>Action Type</Label>
              <Select
                value={rejectType}
                onValueChange={(v) =>
                  setRejectType(v as "reject" | "ghost")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reject">Reject</SelectItem>
                  <SelectItem value="ghost">Ghost</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Trainer Remarks */}
          <div>
            <Label>Trainer Remarks</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Enter remarks..."
            />
          </div>

          {/* Date Field (Now Always Visible for Reject + Ghost) */}
          {(mode === "proceed" || mode === "reject") && (
            <div>
              <Label>
                {mode === "proceed"
                  ? "Training Completion Date"
                  : "Action Date"}
              </Label>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left"
                  >
                    {date ? date.toLocaleDateString() : "Select date"}
                    <CalendarIcon className="ml-auto h-4 w-4" />
                  </Button>
                </PopoverTrigger>

                <PopoverContent className="p-0">
                  <Calendar
                    mode="single"
                    selected={date ?? undefined}
                    onSelect={(d) => d && setDate(d)}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Team Leader Select (Proceed Only) */}
          {mode === "proceed" && (
            <div>
              <Label>Assign Team Leader</Label>
              <Select
                value={selectedLeader}
                onValueChange={setSelectedLeader}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select leader" />
                </SelectTrigger>
                <SelectContent>
                  {teamLeaders.map((tl) => (
                    <SelectItem
                      key={tl.id}
                      value={String(tl.id)}
                    >
                      {tl.leader_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {teamLeaders.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  No team leaders found for this employee’s role.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={
              mode === "reject" && rejectType === "reject"
                ? "destructive"
                : "default"
            }
            onClick={handleSubmit}
          >
            Confirm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
