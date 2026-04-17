"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon} from "lucide-react";
import { SpinnerCustom } from "@/components/ui/spinner"

import { parseDate } from "chrono-node";
import { toast } from "sonner";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

interface FinalInterviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryId: number;
  onCompleted: (updated: any) => void;
}

export default function FinalInterviewModal({
  open,
  onOpenChange,
  entryId,
  onCompleted,
}: FinalInterviewModalProps) {
  const [entry, setEntry] = useState<any>(null);

  const [hrReview, setHrReview] = useState("");
  const [generalReview, setGeneralReview] = useState("");
const [joiningDate, setJoiningDate] = useState<Date | undefined>(undefined);
  const [salary, setSalary] = useState("");
  const [punctuality, setPunctuality] = useState("");
  const [project, setProject] = useState("");
  const [projects, setProjects] = useState<string[]>([]);
  const [designation, setDesignation] = useState("");
  const [cnic, setCnic] = useState<string>("");

  const [duplicateEntries, setDuplicateEntries] = useState<any[]>([]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  // ✅ Loader state (new)
  const [submitting, setSubmitting] = useState(false);

  const localKey = `final_interview_entry_${entryId}`;
  const loadedKey = `final_interview_loaded_${entryId}`;

  const defaultDesignations = [
    "Fronter",
    "Self Verifier",
    "Verifier",
    "Closer",
  ];

  /* ---------------------------- LOCAL DATE HELPER ---------------------------- */
  const toLocalISODate = (d: Date | string | null | undefined) => {
    if (!d) return null;
    const dateObj = d instanceof Date ? d : new Date(d);

    return new Date(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000)
      .toISOString()
      .split("T")[0];
  };

  /* ---------------------------- NUMBER TO WORDS ---------------------------- */
  const numberToWords = (num: number) => {
    if (!num || isNaN(num)) return "";

    const ones = [
      "",
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
      "Eight",
      "Nine",
      "Ten",
      "Eleven",
      "Twelve",
      "Thirteen",
      "Fourteen",
      "Fifteen",
      "Sixteen",
      "Seventeen",
      "Eighteen",
      "Nineteen",
    ];

    const tens = [
      "",
      "",
      "Twenty",
      "Thirty",
      "Forty",
      "Fifty",
      "Sixty",
      "Seventy",
      "Eighty",
      "Ninety",
    ];

    const convertBelowThousand = (n: number) => {
      let str = "";

      if (n >= 100) {
        str += ones[Math.floor(n / 100)] + " Hundred ";
        n = n % 100;
      }

      if (n >= 20) {
        str += tens[Math.floor(n / 10)] + " ";
        n = n % 10;
      }

      if (n > 0) {
        str += ones[n] + " ";
      }

      return str.trim();
    };

    if (num < 1000) return convertBelowThousand(num);

    if (num < 1000000) {
      const thousands = Math.floor(num / 1000);
      const rest = num % 1000;
      return (
        convertBelowThousand(thousands) +
        " Thousand" +
        (rest ? " " + convertBelowThousand(rest) : "")
      ).trim();
    }

    return num.toLocaleString();
  };

  const salaryWords = salary ? numberToWords(parseInt(salary)) : "";
  const punctualityWords = punctuality
    ? numberToWords(parseInt(punctuality))
    : "";

  /* ---------------------------- LOAD ENTRY ---------------------------- */
  useEffect(() => {
    const saved = localStorage.getItem(localKey);
    const navEntries = performance.getEntriesByType(
      "navigation"
    ) as PerformanceNavigationTiming[];
    const isHardReload = navEntries?.[0]?.type === "reload";
    const isFreshTab = !sessionStorage.getItem(loadedKey) || isHardReload;

    if (isFreshTab) {
      localStorage.removeItem(localKey);
      fetchFromAPI();
      sessionStorage.setItem(loadedKey, "1");
      return;
    }

    if (saved) {
      const parsed = JSON.parse(saved);
      const missingCriticalFields =
        !parsed.post_applied_for || !parsed.cnic || parsed.cnic.length < 5;

      if (missingCriticalFields) {
        console.warn("⚠️ Critical fields missing in saved data. Re-fetching...");
        fetchFromAPI();
      } else {
        populateForm(parsed);
      }
    } else {
      fetchFromAPI();
    }
  }, [entryId]);

  /*------------------------validate form------------------------*/
  const validateForm = () => {
    const errors: string[] = [];

    if (!designation.trim()) errors.push("Post Applied For is required.");
    if (!project.trim()) errors.push("Project Applied For is required.");

    if (!hrReview.trim()) errors.push("HR Review is required.");
    if (!generalReview.trim()) errors.push("General Review is required.");

    // only required when saving interview
    if (pendingStatus === "in_training") {
      if (!salary.trim()) errors.push("Salary is required.");
      if (!punctuality.trim()) errors.push("Punctuality is required.");
      if (!joiningDate) errors.push("Joining date is required.");
    }

    return errors;
  };

  /* ----------------------------- FETCH LIVE ---------------------------- */
  const fetchFromAPI = () => {
    fetch(`/api/empdetails/${entryId}/live/`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        populateForm(data);
        localStorage.setItem(localKey, JSON.stringify(data));
      })
      .catch((err) => console.error( err));
  };

  /* --------------------------- CNIC HANDLER --------------------------- */
  const handleCnicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 13);
    setCnic(digits);
  };

  /* --------------------------- CNIC LOOKUP TABLE --------------------------- */
  useEffect(() => {
    if (typeof cnic === "string" && cnic.trim().length >= 5) {
      fetch(`/api/empdetails/lookup/?cnic=${cnic}`, {
        credentials: "include",
      })
        .then((res) => res.json())
        .then((data) => {
          setDuplicateEntries(data);
        })
        .catch((err) => {
          console.error(err);
        });
    }
  }, [cnic]);

  /* ---------------------------- LOAD PROJECTS ---------------------------- */
  useEffect(() => {
    fetch("/api/projects/", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.projects || [];
        setProjects(list);
      })
      .catch(() => setProjects([]));
  }, []);

  /* ----------------------------- POPULATE FORM ---------------------------- */
  const populateForm = (data: any) => {
    setEntry(data);

    const rawCnic = data.cnic;
    const newCnic = rawCnic != null ? String(rawCnic) : "";

    setCnic(newCnic);

    // Initial lookup
    if (newCnic.length >= 5) {
      fetch(`/api/empdetails/lookup/?cnic=${newCnic}`, {
        credentials: "include",
      })
        .then((res) => res.json())
        .then((lookup) => setDuplicateEntries(lookup))
        .catch((err) => console.error(err));
    }

    setSalary(data.salary != null ? String(data.salary) : "");
    setPunctuality(data.punctuality != null ? String(data.punctuality) : "");
    setProject(data.project_applied_for ?? "");

    const normalized = data.post_applied_for
      ? data.post_applied_for
          .split(" ")
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(" ")
      : "";
    setDesignation(normalized);

    setHrReview(data.hr_review ?? "");
    setGeneralReview(data.general_review ?? "");

    const t = data.joining_date ?? "";
    const parsed = parseDate(t);
    if (parsed) setJoiningDate(parsed as Date);
  };

  /* ------------------------- AUTO SAVE TO LOCAL ------------------------- */
  useEffect(() => {
    if (!entry) return;

    localStorage.setItem(
      localKey,
      JSON.stringify({
        ...entry,
        joining_date: toLocalISODate(joiningDate),
        salary,
        punctuality,
        project_applied_for: project,
        post_applied_for: designation,
        hr_review: hrReview,
        general_review: generalReview,
        cnic,
      })
    );
  }, [
    entry,
    joiningDate,
    salary,
    punctuality,
    project,
    designation,
    hrReview,
    generalReview,
    cnic,
  ]);

  /* ---------------------------- HELPERS ---------------------------- */
  const calculateAge = (dob: string) => {
    if (!dob) return "";
    const birth = new Date(dob);
    const now = new Date();
    const age = now.getFullYear() - birth.getFullYear();
    const hadBirthday =
      now.getMonth() > birth.getMonth() ||
      (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
    return hadBirthday ? age : age - 1;
  };

  /* ---------------------------- CONFIRMATION ---------------------------- */
  const handleStatus = (status: string) => {
    setPendingStatus(status);
    setConfirmOpen(true);
  };

  const confirmSubmit = async () => {
    if (!pendingStatus) return;

    const isRejectOrHold = pendingStatus === "rejected" || pendingStatus === "hold";

    // ✅ only validate when saving interview
    if (!isRejectOrHold) {
      const errors = validateForm();
      if (errors.length > 0) {
        toast.error("Please fix the following:\n" + errors.join("\n"));
        return;
      }
    }

    let payload: any;

    if (isRejectOrHold) {
      // ✅ FULL NULL PAYLOAD (force backend overwrite)
      payload = {
        salary: null,
        punctuality: null,
        joining_date: null,
        hr_review: null,
        general_review: null,
        project_applied_for: null,
        post_applied_for: null,
        status: pendingStatus,
        cnic: cnic || null,
      };
    } else {
      // ✅ Normal save payload
      payload = {
        salary,
        punctuality,
        project_applied_for: project,
        post_applied_for: designation,
        hr_review: hrReview,
        general_review: generalReview,
        joining_date: toLocalISODate(joiningDate),
        status: pendingStatus,
        cnic,
      };
    }


    try {
      setSubmitting(true); // ✅ SHOW LOADER

      const res = await fetch(`/api/empdetails/${entryId}/hr_update/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      setConfirmOpen(false);

      if (res.ok) {
        const updated = await res.json();
        toast.success("Final interview updated successfully.");
        localStorage.removeItem(localKey);
        onCompleted(updated);
        onOpenChange(false);
      } else {
        toast.error("Failed to submit.");
      }
    } catch (err) {
      toast.error("Backend is not responding. Please try again.");
    } finally {
      setSubmitting(false); // ✅ HIDE LOADER
    }
  };

  /* ---------------------------- ENTRY CHECK ---------------------------- */
  if (!entry) return null;

  const filteredDuplicates = duplicateEntries.filter((item) => item.id !== entryId);

  /* ---------------------------- RENDER ---------------------------- */
  return (
    <>
      {/* ✅ LOADER OVERLAY (NEW) */}
      {submitting && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-background rounded-xl shadow-lg p-6 flex flex-col items-center gap-3 w-[360px]">
            <SpinnerCustom/>
            <p className="text-sm font-semibold text-center">
              Please wait, submitting details and mailing the letter...
            </p>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{entry.name}</DialogTitle>
            <DialogDescription>
              Forwarded by:{" "}
              <span className="font-semibold">{entry.receptionist_name}</span>
              <span className="ml-2 px-2 py-1 rounded bg-muted text-sm font-semibold">
                Benchmark: {entry.hr_benchmark}
              </span>
            </DialogDescription>
          </DialogHeader>

          {filteredDuplicates.length > 0 ? (
            <div className="p-4 border rounded-md bg-muted mb-6">
              <h3 className="font-semibold text-sm mb-2">
                {filteredDuplicates.length} previous record
                {filteredDuplicates.length > 1 ? "s" : ""} found
              </h3>

              <div className="rounded-md border bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {filteredDuplicates.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.name}</TableCell>
                        <TableCell>{item.email}</TableCell>
                        <TableCell>{item.project_applied_for}</TableCell>
                        <TableCell className="capitalize">{item.status}</TableCell>
                        <TableCell>
                          {new Date(item.created_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="text-center text-sm text-muted-foreground bg-green-100 dark:bg-green-900 border rounded-md py-3 px-4">
              No previous records found.
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>CNIC</Label>
              <Input value={cnic} onChange={handleCnicChange} />
              <p className="text-xs text-muted-foreground mt-1">
                Digits only (max 13).
              </p>
            </div>

            <div>
              <Label>Age</Label>
              <Input value={`${calculateAge(entry.dob)} Years old`} readOnly />
            </div>

            <div>
              <Label>Education Background</Label>
              <Input value={entry.education_background} readOnly />
            </div>

            <div className="col-span-2">
              <Label>Education Details</Label>
              <Textarea value={entry.education_details} readOnly />
            </div>

            <div>
              <Label>Father's Name</Label>
              <Input value={entry.father_name} readOnly />
            </div>

            <div>
              <Label>Father's Occupation</Label>
              <Input value={entry.father_occupation} readOnly />
            </div>

            <div className="col-span-2">
              <Label>Residential Address</Label>
              <Textarea value={entry.residential_address} readOnly />
            </div>

            <div className="col-span-2">
              <Label>Permanent Address</Label>
              <Textarea value={entry.permanent_address} readOnly />
            </div>

            <div className="col-span-2">
              <Label>Experience</Label>
              <Textarea value={entry.experience} readOnly />
            </div>

            <div className="col-span-2">
              <Label>References</Label>
              <Textarea value={entry.references} readOnly />
            </div>

            <div>
              <Label>Project Applied For</Label>
              <Select onValueChange={setProject} value={project}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Post Applied For</Label>
              <Select onValueChange={setDesignation} value={designation}>
                <SelectTrigger>
                  <SelectValue placeholder="Select post" />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([...defaultDesignations, designation])]
                    .filter(Boolean)
                    .map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Salary */}
            <div>
              <Label>Salary</Label>
              <Input
                value={salary}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setSalary(value);
                }}
                placeholder="Enter salary (digits only)"
              />
              {salaryWords && (
                <p className="text-xs text-muted-foreground mt-1">
                  {salaryWords} Only
                </p>
              )}
            </div>

            {/* Punctuality */}
            <div>
              <Label>Punctuality</Label>
              <Input
                value={punctuality}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "").slice(0, 5);
                  setPunctuality(value);
                }}
                placeholder="Enter punctuality score"
              />
              {punctualityWords && (
                <p className="text-xs text-muted-foreground mt-1">
                  {punctualityWords}
                </p>
              )}
            </div>

            <div className="col-span-2">
              <Label>HR Review</Label>
              <Textarea
                placeholder="Write your internal HR remarks here..."
                value={hrReview}
                onChange={(e) => setHrReview(e.target.value)}
                readOnly
              />
            </div>

            <div className="col-span-2">
              <Label>General Review</Label>
              <Textarea
                placeholder="Write general final interview feedback..."
                value={generalReview}
                onChange={(e) => setGeneralReview(e.target.value)}
              />
            </div>

            <div>
              <Label>Joining Date</Label>
              <div className="relative flex gap-2">
                <Input
                  id="joining-date"
                  value={
                    joiningDate
                      ? joiningDate.toLocaleDateString("en-US", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })
                      : ""
                  }
                  readOnly
                  placeholder="Select date"
                  className="bg-background pr-10 cursor-pointer"
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      type="button"
                      className="absolute top-1/2 right-2 -translate-y-1/2 p-2 rounded-full bg-transparent hover:scale-105"
                    >
                      <CalendarIcon className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-auto p-0"
                    align="end"
                    sideOffset={10}
                  >
                    <Calendar
                      mode="single"
                      selected={joiningDate}
                      onSelect={(date) => date && setJoiningDate(date)}
                      captionLayout="dropdown"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button
              variant="destructive"
              disabled={submitting}
              onClick={() => handleStatus("rejected")}
            >
              Reject
            </Button>
            <Button
              variant="secondary"
              disabled={submitting}
              onClick={() => handleStatus("hold")}
            >
              Hold
            </Button>
            <Button disabled={submitting} onClick={() => handleStatus("in_training")}>
              Save Interview
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ------------------------- CONFIRMATION DIALOG ------------------------- */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmation</DialogTitle>
            <DialogDescription>
              {pendingStatus === "rejected"
                ? "Are you sure you want to reject this interview?"
                : pendingStatus === "hold"
                ? "Are you sure you want to put this interview on hold?"
                : "Are you sure you want to save this interview?"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="ghost"
              disabled={submitting}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>

            <Button
              onClick={confirmSubmit}
              disabled={submitting}
              variant={pendingStatus === "rejected" ? "destructive" : "default"}
            >
              {submitting
                ? "Submitting..."
                : pendingStatus === "rejected"
                ? "Reject"
                : pendingStatus === "hold"
                ? "Hold"
                : "Submit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
