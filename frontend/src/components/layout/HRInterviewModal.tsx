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
import { FileText, FileX  } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon,  X, Check } from "lucide-react";
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

interface HRInterviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryId: number;
  onCompleted: (updated: any) => void;
}

export default function HRInterviewModal({
  open,
  onOpenChange,
  entryId,
  onCompleted,
}: HRInterviewModalProps) {
  const [entry, setEntry] = useState<any>(null);
  const [hrReview, setHrReview] = useState("");
  const [hrBenchmark, setHrBenchmark] = useState<number | null>(null);
  const [finalInterviewDate, setFinalInterviewDate] = useState<Date | null>(null);
  const [finalInterview, setFinalInterview] = useState<boolean>(false);
  const [generalReview, setGeneralReview] = useState("");
  const [joiningDate, setJoiningDate] = useState<Date | null>(null);

  const [salary, setSalary] = useState("");
  const [punctuality, setPunctuality] = useState("");
  const [project, setProject] = useState("");
  const [projects, setProjects] = useState<string[]>([]);
  const [designation, setDesignation] = useState("");
  const [cnic, setCnic] = useState<string>("");
  const [photoOpen, setPhotoOpen] = useState(false);

  const [duplicateEntries, setDuplicateEntries] = useState<any[]>([]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  // ✅ Loader state (NEW)
  const [submitting, setSubmitting] = useState(false);

  const localKey = `hr_interview_entry_${entryId}`;
  const loadedKey = `hr_interview_loaded_${entryId}`;

  const defaultDesignations = [
    "Fronter",
    "Self Verifier",
    "Verifier",
    "Closer",
  ];


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

    return num.toLocaleString(); // fallback for big numbers
  };

  const salaryWords = salary ? numberToWords(parseInt(salary)) : "";
  const punctualityWords = punctuality ? numberToWords(parseInt(punctuality)) : "";

  /* ---------------------------- LOAD ENTRY ---------------------------- */
  useEffect(() => {
    const saved = localStorage.getItem(localKey);
    const navEntries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
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
/*------------LocalDateConversion-------------*/
  const toLocalYMD = (date: Date | null) => {
  if (!date) return null;

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
};


  /* ------------------------ VALIDATE FORM ------------------------ */
const validateForm = () => {
  const errors: string[] = [];

  // ✅ Hold or Reject should NOT require salary/punctuality/joining date
  const isHoldOrReject =
    pendingStatus === "hold" || pendingStatus === "rejected";

  // Post + Project still required always
  if (!designation.trim()) errors.push("Post Applied For is required.");
  if (!project.trim()) errors.push("Project Applied For is required.");

  // ✅ Salary + punctuality required ONLY if NOT hold/reject
  if (!isHoldOrReject) {
    if (!salary.trim()) errors.push("Salary is required.");
    if (!punctuality.trim()) errors.push("Punctuality is required.");
    if (!hrBenchmark) errors.push("HR Benchmark is required.");
  }

  // 🔥 Joining date + general review required only when saving interview normally
  const requiresJoiningAndReview =
    !finalInterview &&
    pendingStatus === "in_training" &&
    !isHoldOrReject;

  if (requiresJoiningAndReview && !joiningDate) {
    errors.push("Joining date is required.");
  }

  if (requiresJoiningAndReview && !generalReview.trim()) {
    errors.push("General review is required when saving interview.");
  }

  // Final Interview rules remain unchanged
  if (finalInterview && !finalInterviewDate) {
    errors.push("Final Interview Date is required.");
  }

  if (finalInterview && !hrReview.trim()) {
    errors.push("HR Review is required when scheduling final interview.");
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
      .catch((err) => console.error("❌ Live fetch failed:", err));
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
          console.error( err);
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
    setHrReview(data.hr_review ?? "");

    setCnic(newCnic);

    // Only trigger lookup if valid
    if (newCnic.length >= 5) {

      fetch(`/api/empdetails/lookup/?cnic=${newCnic}`, {
        credentials: "include",
      })
        .then((res) => res.json())
        .then((data) => {
          setDuplicateEntries(data);
        })
        .catch((err) => console.error("❌ Lookup error:", err));
    }

    const finalIntRaw = data.final_interview_date ?? "";
    const finalParsed = parseDate(finalIntRaw);
    if (finalParsed) setFinalInterviewDate(finalParsed);

    setHrBenchmark(data.hr_benchmark ?? null);
    setFinalInterview(data.proceeded_for_final_interview ?? false);
    setGeneralReview(data.general_review ?? "");
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

    const t = data.joining_date ?? "";
    const parsed = parseDate(t);
    if (parsed) setJoiningDate(parsed);
  };

  /* ------------------------- AUTO SAVE TO LOCAL ------------------------- */
  useEffect(() => {
    if (!entry) return;

    localStorage.setItem(
      localKey,
      JSON.stringify({
        ...entry,
        hr_benchmark: hrBenchmark,
        proceeded_for_final_interview: finalInterview,
        general_review: generalReview,
        joining_date: finalInterview ? null : toLocalYMD(joiningDate),
        final_interview_date: finalInterview ? toLocalYMD(finalInterviewDate) : null,
        salary,
        punctuality,
        project_applied_for: project,
        post_applied_for: designation,
        hr_review: hrReview,
        cnic,
      })
    );
  }, [
    entry,
    hrBenchmark,
    finalInterview,
    generalReview,
    joiningDate,
    finalInterviewDate,
    salary,
    punctuality,
    project,
    designation,
    hrReview,
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
const openCertificate = () => {
  if (!entry?.legal_clearance_certificate) return;

  const link = document.createElement("a");
  link.href = entry.legal_clearance_certificate;
  link.target = "_blank";
  link.download = "legal_clearance_certificate.pdf";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
  const benchmarkColor = (val: number) => {
    if (val <= 20) return "bg-red-600 text-white";
    if (val <= 40) return "bg-orange-500 text-white";
    if (val <= 60) return "bg-yellow-400 text-black";
    if (val <= 80) return "bg-green-500 text-white";
    return "bg-blue-600 text-white";
  };

  /* ---------------------------- CONFIRMATION ---------------------------- */
  const handleStatus = (status: string) => {
    setPendingStatus(status);
    setConfirmOpen(true);
  };

  const confirmSubmit = async () => {
    if (!pendingStatus) return;

    const errors = validateForm();
    if (errors.length > 0) {
      toast.error("Please fix the following:\n" + errors.join("\n"));
      return;
    }

    // ✅ Local timezone safe formatting
    const formattedDate =
  finalInterview || pendingStatus !== "in_training"
    ? null
    : toLocalYMD(joiningDate);

  const formattedFinalDate = finalInterview ? toLocalYMD(finalInterviewDate) : null;


    const finalStatus = finalInterview ? "proceeded" : pendingStatus;

    const payload = {
      hr_benchmark: hrBenchmark,
      proceeded_for_final_interview: finalInterview,
      general_review: generalReview,
      joining_date: formattedDate, // ✅ null if finalInterview checked
      final_interview_date: formattedFinalDate,
      hr_review: hrReview,
      salary,
      punctuality,
      project_applied_for: project,
      post_applied_for: designation,
      status: finalStatus,
      cnic,
    };


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
        toast.success("Interview updated successfully.");
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
              Submitting...
            </p>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">   
     <DialogHeader className="sticky top-0 z-20 bg-background border-b px-6 py-4">
  <div className="flex items-center justify-between">

    {/* LEFT SIDE */}
    <div className="flex items-center gap-4">

      {/* Profile Photo */}
      <div
        className="relative cursor-pointer"
        onClick={() => entry.employee_photo && setPhotoOpen(true)}
      >
        <div className="w-16 h-16 rounded-full overflow-hidden border bg-muted flex items-center justify-center hover:scale-105 transition">
          {entry.employee_photo ? (
            <img
              src={entry.employee_photo}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-xl text-muted-foreground">
              {entry.name?.charAt(0)}
            </span>
          )}
        </div>

        {entry.legal_clearance_certificate_exists && (
          <div className="absolute -bottom-1 -right-1 bg-green-500 text-white rounded-full p-1 shadow">
            <Check className="w-4 h-4" />
          </div>
        )}
      </div>

      <div className="flex flex-col">
        <DialogTitle>{entry.name}</DialogTitle>

        <DialogDescription className="flex items-center gap-2">
          Forwarded by
          <span className="font-semibold">{entry.receptionist_name}</span>

          <div className="flex items-center gap-2">

          <span className="px-2 py-1 rounded bg-muted text-xs font-semibold">
            Benchmark: {entry.reception_benchmark}
          </span>

          {entry.legal_clearance_certificate ? (
            <button
              onClick={openCertificate}
              className="flex items-center gap-1 px-2 py-1 rounded bg-blue-100 dark:bg-blue-900 text-xs font-semibold hover:opacity-80 transition"
            >
              <FileText className="w-3 h-3" />
              Open Clearance Certificate
            </button>
          ) : (
            <span className="flex items-center gap-1 px-2 py-1 rounded bg-muted text-xs text-muted-foreground">
              <FileX className="w-3 h-3" />
              No Clearance Certificate
            </span>
          )}

        </div>
        </DialogDescription>
      </div>
    </div>

    {/* RIGHT SIDE CLOSE BUTTON */}
    <button
      onClick={() => onOpenChange(false)}
      className="p-2 rounded-md hover:bg-muted transition"
    >
      <X className="w-5 h-5" />
    </button>

  </div>
</DialogHeader>
<div className="overflow-y-auto max-h-[calc(90vh-110px)] px-6 py-4">
          {filteredDuplicates.length > 0 ? (
            <div className="p-4 border rounded-md bg-muted mb-6">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold text-sm">
                  {filteredDuplicates.length} previous record
                  {filteredDuplicates.length > 1 ? "s" : ""} found
                </h3>
              </div>

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
            {/* STATIC FIELDS */}
            <div>
              <Label>CNIC</Label>
              <Input value={cnic} onChange={handleCnicChange} />
              <p className="text-xs text-muted-foreground mt-1">
                Only digits allowed (max 13).
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
          
            <div className="col-span-2">
              <Label>Reception Comments</Label>
              <Textarea value={entry.reception_comments} readOnly />
            </div>

            {/* PROJECT */}
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

            {/* POST */}
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

            {/* SALARY */}
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

            {/* PUNCTUALITY */}
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
            {/* Oh my yes*/}

            {/* FINAL INTERVIEW CHECK */}
            <div className="col-span-2 flex items-center gap-4 mt-2">
              <Checkbox
                id="final-interview"
                checked={finalInterview}
                onCheckedChange={(val) => {
                  const checked = !!val;
                  setFinalInterview(checked);

                  // ✅ UX: auto-clear joining date if final interview checked
                  if (checked) setJoiningDate(null);
                }}
              />
              <Label htmlFor="final-interview">Schedule Final Interview</Label>
            </div>

            {!finalInterview && (
              <div className="col-span-2">
                <Label>General Review</Label>
                <Textarea
                  value={generalReview}
                  onChange={(e) => setGeneralReview(e.target.value)}
                  placeholder="Add remarks..."
                />
              </div>
            )}

            <div className="col-span-2">
              <Label>How competent do you think the applicant is?</Label>
              <div className="flex gap-2 mt-1">
                {[20, 40, 60, 80, 100].map((val) => (
                  <Button
                    key={val}
                    type="button"
                    variant={hrBenchmark === val ? "default" : "outline"}
                    onClick={() => setHrBenchmark(val)}
                    className={hrBenchmark === val ? benchmarkColor(val) : ""}
                  >
                    {val}
                  </Button>
                ))}
              </div>
            </div>

            {!finalInterview && (
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
                    <PopoverContent className="w-auto p-0" align="end" sideOffset={10}>
                      <Calendar
                        mode="single"
                        selected={joiningDate ?? undefined}
                        onSelect={(date) => date && setJoiningDate(date)}
                        captionLayout="dropdown"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}

            {finalInterview && (
              <div>
                <Label>Final Interview Date</Label>
                <div className="relative flex gap-2">
                  <Input
                    id="final-interview-date"
                    value={
                      finalInterviewDate
                        ? finalInterviewDate.toLocaleDateString("en-US", {
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
                    <PopoverContent className="w-auto p-0" align="end" sideOffset={10}>
                      <Calendar
                        mode="single"
                        selected={finalInterviewDate ?? undefined}
                        onSelect={(date) => date && setFinalInterviewDate(date)}
                        captionLayout="dropdown"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}

            {finalInterview && (
              <div className="col-span-2">
                <Label>Your Review</Label>
                <Textarea
                  placeholder="Write your internal HR remarks here..."
                  value={hrReview}
                  onChange={(e) => setHrReview(e.target.value)}
                />
              </div>
            )}
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
            <Button
              disabled={submitting}
              onClick={() => handleStatus("in_training")}
            >
              Save Interview
            </Button>
          </div>
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
      {/* ---------------- PHOTO ZOOM MODAL ---------------- */}
    <Dialog open={photoOpen} onOpenChange={setPhotoOpen}>
      <DialogContent className="max-w-md p-6 flex items-center justify-center bg-transparent shadow-none border-none">

        {entry?.employee_photo && (
          <div className="rounded-full overflow-hidden border shadow-xl">
            <img
              src={entry.employee_photo}
              className="w-[320px] h-[320px] object-cover"
            />
          </div>
        )}

      </DialogContent>
    </Dialog>
    </>
  );
}