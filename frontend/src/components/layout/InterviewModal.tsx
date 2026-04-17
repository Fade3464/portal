import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { Upload, X } from "lucide-react";

import {
  FileUpload,
  FileUploadItem,
  FileUploadItemDelete,
  FileUploadItemMetadata,
  FileUploadItemPreview,
  FileUploadList,
  FileUploadTrigger,
} from "@/components/ui/file-upload";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectItem,
  SelectContent,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";

interface InterviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: any;
  onCompleted: (updated: any) => void;
}

export default function InterviewModal({
  open,
  onOpenChange,
  entry,
  onCompleted,
}: InterviewModalProps) {
  const [experience, setExperience] = useState("");
  const [benchmark, setBenchmark] = useState<number | null>(null);
  const [post, setPost] = useState("");
  const [comments, setComments] = useState("");
  const [projects, setProjects] = useState<string[]>([]);
  

  const [project, setProject] = useState(entry.project_applied_for);
  const [cnic, setCnic] = useState<string>(String(entry.cnic || ""));
  const [email, setEmail] = useState(entry.email || "");
  const [duplicateEntries, setDuplicateEntries] = useState<any[]>([]);

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const [employeePhoto, setEmployeePhoto] = useState<File | null>(null);
const [photoPreview, setPhotoPreview] = useState<string | null>(null);
const [uploading, setUploading] = useState(false);
const [dragActive, setDragActive] = useState(false);

useEffect(() => {
  return () => {
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
  };
}, [photoPreview]);

  // Current logged in receptionist ID
  const [receptionistId, setReceptionistId] = useState<number | null>(null);

  // Confirmation modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
const [certificateFiles, setCertificateFiles] = useState<File[]>([]);
  const [pendingStatus, setPendingStatus] =
    useState<"proceeded" | "rejected" | null>(null);

  /* ------------------------------- FETCH USER ID ------------------------------- */
  useEffect(() => {
    fetch("/api/current-user/", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setReceptionistId(data.id));
  }, []);

  /* ------------------------------ FETCH PROJECTS ------------------------------ */
  useEffect(() => {
    fetch("/api/projects/", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProjects(data);
        else if (Array.isArray(data.projects)) setProjects(data.projects);
      })
      .catch(() => setProjects([]));
  }, []);

  /* --------------------------- AUTO RELEASE LOCK --------------------------- */
  useEffect(() => {
    const releaseLock = () => {
      fetch(`/api/empdetails/${entry.id}/unlock/`, {
        method: "POST",
        credentials: "include",
      });
    };
    window.addEventListener("beforeunload", releaseLock);
    return () => {
      window.removeEventListener("beforeunload", releaseLock);
      releaseLock();
    };
  }, [entry]);

  /* ---------------------------- CNIC VALIDATION ---------------------------- */
  const handleCnicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 13);
    setCnic(digits);
  };

  /* --------------------------- CNIC LOOKUP TABLE --------------------------- */
useEffect(() => {
  if (cnic.trim().length >= 5) {
    fetch(`/api/empdetails/lookup/?cnic=${cnic}`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        // Exclude current modal's entry
        const filtered = data.filter((item: any) => item.id !== entry.id);
        setDuplicateEntries(filtered);
      });
  }
}, [cnic, entry.id]);


/*-------------------------handle Photoupload-------------------------*/

const MAX_FILE_SIZE = 40 * 1024 * 1024; // 40MB

  /* ------------------------- PHOTO UPLOAD ------------------------- */

const validatePhoto = (file: File) => {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    toast.error("Only JPG, PNG, or WebP images are allowed.");
    return false;
  }

  if (file.size > MAX_FILE_SIZE) {
    toast.error("Photo must be smaller than 40MB.");
    return false;
  }

  return true;
};

const handlePhotoUpload = async (file: File) => {
  if (!validatePhoto(file)) return;

  setUploading(true);

  try {
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }

    const previewUrl = URL.createObjectURL(file);

    await new Promise((resolve) => setTimeout(resolve, 300));

    setEmployeePhoto(file);
    setPhotoPreview(previewUrl);
    toast.success("Photo selected successfully.");
  } catch {
    toast.error("Failed to load photo preview.");
  } finally {
    setUploading(false);
  }
};

const removePhoto = () => {
  if (photoPreview) {
    URL.revokeObjectURL(photoPreview);
  }

  setEmployeePhoto(null);
  setPhotoPreview(null);
};

const handlePhotoInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (file) {
    handlePhotoUpload(file);
  }

  e.target.value = "";
};

const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
  e.preventDefault();
  e.stopPropagation();
  setDragActive(false);

  const file = e.dataTransfer.files?.[0];
  if (file) {
    handlePhotoUpload(file);
  }
};

const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
  e.preventDefault();
  e.stopPropagation();
  setDragActive(true);
};

const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
  e.preventDefault();
  e.stopPropagation();
  setDragActive(false);
};


  /* ---------------------- SUBMIT (TRIGGER CONFIRMATION) ---------------------- */
  const handleSubmit = (status: "proceeded" | "rejected") => {
    setPendingStatus(status);
    setConfirmOpen(true);
  };

  /* ---------------------- FINAL SUBMISSION TO BACKEND ---------------------- */
  const confirmSubmit = async () => {
  if (
    !receptionistId ||
    !experience ||
    !benchmark ||
    !post ||
    !comments ||
    !project ||
    !email ||
    !cnic
  ) {
    toast.error("Please fill all fields.");
    setConfirmOpen(false);
    return;
  }



  const formData = new FormData();

  formData.append("experience", experience);
  formData.append("reception_benchmark", String(benchmark));
  formData.append("post_applied_for", post);
  formData.append("reception_comments", comments);
  formData.append("project_applied_for", project);
  formData.append("cnic", cnic);
  formData.append("email", email);
  formData.append("status", String(pendingStatus));

  if (employeePhoto) {
    formData.append("employee_photo", employeePhoto);
  }

  if (certificateFiles.length > 0) {
  formData.append(
    "legal_clearance_certificate",
    certificateFiles[0]
  );
}


  const res = await fetch(`/api/empdetails/${entry.id}/update/`, {
    method: "POST",
    credentials: "include",
    body: formData,   // 🚨 IMPORTANT — NO JSON.stringify
  });


  const responseData = await res.json();

  setConfirmOpen(false);

  if (res.ok) {
    onCompleted(responseData);
    toast.success(`${entry.name} for ${project} has been saved to the system.`);
  } else {
    toast.error("Failed to submit interview.");
  }
};
  /* ----------------------- BENCHMARK COLOR HELPER ----------------------- */
  const benchmarkColor = (val: number) => {
    if (val <= 20) return "bg-red-600 text-white";
    if (val <= 40) return "bg-orange-500 text-white";
    if (val <= 60) return "bg-yellow-400 text-black";
    if (val <= 80) return "bg-green-500 text-white";
    return "bg-blue-600 text-white";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
 
  <DialogContent className="max-w-4xl h-[90vh] p-0 overflow-hidden">

  {/* HEADER */}
  <DialogHeader className="sticky top-0 z-20 bg-background border-b px-6 py-4">

    <div className="flex items-center justify-between">

      <div className="flex items-center gap-4">
  <div className="relative">
    <input
      id="employee-photo-upload"
      type="file"
      accept="image/png,image/jpeg,image/webp"
      className="hidden"
      onChange={handlePhotoInputChange}
    />

    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`relative w-24 h-24 rounded-full border-2 overflow-hidden transition-all ${
        dragActive
          ? "border-primary ring-4 ring-primary/20 bg-muted"
          : "border-dashed border-muted-foreground/30 bg-muted"
      }`}
    >
      {photoPreview ? (
        <>
          <img
            src={photoPreview}
            alt="Employee preview"
            className="w-full h-full object-cover"
          />
<div className="absolute inset-0 bg-black/45 opacity-0 hover:opacity-100 transition flex items-center justify-center gap-2">
  <label
    htmlFor="employee-photo-upload"
    className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-black shadow-md hover:bg-gray-100"
    title="Replace photo"
  >
    <Upload className="h-4 w-4" />
  </label>

  <button
    type="button"
    onClick={removePhoto}
    className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white shadow-md hover:bg-red-700"
    title="Remove photo"
  >
    <X className="h-4 w-4" />
  </button>
</div>
        </>
      ) : (
        <label
          htmlFor="employee-photo-upload"
          className="w-full h-full flex flex-col items-center justify-center cursor-pointer text-center px-2"
        >
          {uploading ? (
            <div className="text-xs text-muted-foreground animate-pulse">
              Processing...
            </div>
          ) : (
            <>
              <Upload className="size-5 mb-1 text-muted-foreground" />
              <span className="text-[10px] leading-tight text-muted-foreground">
                Upload photo
              </span>
            </>
          )}
        </label>
      )}
    </div>
  </div>

  <div>
    <DialogTitle>Interview for {entry.name}</DialogTitle>
    <DialogDescription>
      Review and update applicant’s information.
    </DialogDescription>
  </div>
</div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onOpenChange(false)}
      >
        ✕
      </Button>

    </div>

    {uploading && (
  <div className="mt-3 text-sm text-muted-foreground animate-pulse">
    Preparing photo preview...
  </div>
)}

  </DialogHeader>
    <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">

        {/* ------------------------- CNIC Lookup Table ------------------------- */}
{cnic.length >= 5 && (
  <div className="p-4 border rounded-md bg-muted mb-6">
    <div className="flex flex-col gap-3">
      {duplicateEntries.filter((item) => item.id !== entry.id).length > 0 ? (
        <>
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-sm">
              {duplicateEntries.filter((item) => item.id !== entry.id).length} previous record
              {duplicateEntries.filter((item) => item.id !== entry.id).length > 1 ? "s" : ""} found
            </h3>
          </div>

          <div className="rounded-md border bg-background overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-3 py-2">Name</TableHead>
                  <TableHead className="px-3 py-2">Email</TableHead>
                  <TableHead className="px-3 py-2">Project</TableHead>
                  <TableHead className="px-3 py-2">Status</TableHead>
                  <TableHead className="px-3 py-2">Date</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {duplicateEntries
                  .filter((item) => item.id !== entry.id)
                  .map((item) => (
                    <TableRow key={item.id} className="hover:bg-muted/50">
                      <TableCell className="px-3 py-2">{item.name}</TableCell>
                      <TableCell className="px-3 py-2">{item.email}</TableCell>
                      <TableCell className="px-3 py-2">{item.project_applied_for}</TableCell>
                      <TableCell className="px-3 py-2 capitalize">{item.status}</TableCell>
                      <TableCell className="px-3 py-2">
                        {new Date(item.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </>
      ) : (
        <div className="text-center text-sm text-muted-foreground bg-green-100 dark:bg-green-900 border rounded-md py-3 px-4">
          No previous records found.
        </div>
      )}
    </div>
  </div>
)}

        {/* ---------------------------- FORM FIELDS ---------------------------- */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Name</Label>
            <Input value={entry.name} readOnly />
          </div>

          <div>
            <Label>CNIC</Label>
            <Input value={cnic} onChange={handleCnicChange} />
          </div>

          <div>
            <Label>Email</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <Label>Education</Label>
            <Input value={entry.education_background} readOnly />
          </div>

          <div>
            <Label>Residential Address</Label>
            <Input value={entry.residential_address} readOnly />
          </div>

          <div>
            <Label>Project Applied</Label>
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

          {/* Experience */}
          <div className="col-span-2">
            <Label>Experience</Label>
            <Textarea
              placeholder="Describe experience in detail.."
              rows={4}
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
            />
          </div>
          {/* Post applied for */}
          <div className="col-span-2">
            <Label>Post Applied For</Label>
            <Select onValueChange={setPost} value={post}>
              <SelectTrigger>
                <SelectValue placeholder="Select post" />
              </SelectTrigger>
              <SelectContent>
                {["Fronter", "Self Verifier", "Verifier", "Closer"].map(
                  (role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Benchmark */}
          <div className="col-span-2">
            <Label>Benchmark</Label>
            <div className="flex gap-2 mt-1">
              {[20, 40, 60, 80, 100].map((val) => (
                <Button
                  key={val}
                  type="button"
                  variant={benchmark === val ? "default" : "outline"}
                  onClick={() => setBenchmark(val)}
                  className={benchmark === val ? benchmarkColor(val) : ""}
                >
                  {val}
                </Button>
              ))}
            </div>
          </div>

          {/* Comments */}
          <div className="col-span-2">
            <Label>Comments</Label>
            <Textarea
              placeholder="Enter remarks..."
              rows={4}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
          </div>
        {/* Legal Clearance Certificate Upload */}
        <div className="col-span-2">
          <div className="col-span-2 space-y-2">
  <Label>Legal Clearance Certificate</Label>

  <FileUpload
  value={certificateFiles}
  onValueChange={setCertificateFiles}
  maxFiles={1}
  maxSize={10 * 1024 * 1024}
  accept={{
    "application/pdf": [".pdf"],
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
  }}
>
    <FileUploadTrigger asChild>
      <Button variant="secondary" className="w-full">
        <Upload className="mr-2 size-4" />
        Select Certificate
      </Button>
    </FileUploadTrigger>

    <FileUploadList>
      {certificateFiles.map((file, index) => (
        <FileUploadItem key={index} value={file}>
          <FileUploadItemPreview />
          <FileUploadItemMetadata />
          <FileUploadItemDelete asChild>
            <Button variant="ghost" size="icon" className="size-7">
              <X className="size-4" />
            </Button>
          </FileUploadItemDelete>
        </FileUploadItem>
      ))}
    </FileUploadList>
  </FileUpload>

</div>
        </div>

        </div>


        {/* ----------------------------- Action Buttons ----------------------------- */}
        <div className="flex justify-end mt-4 gap-3">
          <Button variant="destructive" onClick={() => handleSubmit("rejected")}>
            Reject
          </Button>
          <Button onClick={() => handleSubmit("proceeded")}>
            Submit Interview
          </Button>
        </div>
                </div>

      </DialogContent>
    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmation</DialogTitle>
          <DialogDescription>
            Are you sure you want to proceed this interview to HR?
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button onClick={confirmSubmit}>Submit</Button>
        </div>
      </DialogContent>
    </Dialog>


    </Dialog>
    
  );
}
