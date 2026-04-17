"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Pencil} from "lucide-react";
import { SpinnerCustom } from "@/components/ui/spinner"

import { toast } from "sonner";

/* ===================== TYPES ===================== */

type UserType = "hr" | "receptionist" | "manager";

interface ModifyEmployeeDetailProps {
  open: boolean;
  employeeId: number | null;
  onClose: () => void;
  onSaved?: () => void;
}

type TeamLeaderOption = {
  id: number;
  team: string;
  leader_name: string;
};

const EDUCATION_LEVELS = [
  "Middle",
  "Matric",
  "Intermediate",
  "Undergraduate",
  "Graduate",
];

const DESIGNATIONS = ["Fronter", "Self Verifier", "Verifier", "Closer"];

// ⚠️ Full list exists, but status-change modal only allows limited options
const STATUS_CHANGE_OPTIONS = [
  "appointed",
  "resigned",
  "terminated",
  "ghosted",
  "in_training",
  "hold",
  "in_probation",
];

/* ===================== COMPONENT ===================== */

export default function ModifyEmployeeDetail({
  open,
  employeeId,
  onClose,
  onSaved,
}: ModifyEmployeeDetailProps) {
  /* ---------- LOADER CONTROL ---------- */
  const [loading, setLoading] = useState(false);
  const [readyToOpen, setReadyToOpen] = useState(false);

  /* ---------- CORE ---------- */
  const [userType, setUserType] = useState<UserType>("receptionist");
  const isReceptionist = userType === "receptionist";

  const [name, setName] = useState("");
  const [cnic, setCnic] = useState("");
  const [email, setEmail] = useState("");
  const [contactNumber, setContactNumber] = useState("");

  const [fatherName, setFatherName] = useState("");
  const [fatherOccupation, setFatherOccupation] = useState("");

  const [educationBackground, setEducationBackground] = useState("");
  const [educationDetails, setEducationDetails] = useState("");

  const [residentialAddress, setResidentialAddress] = useState("");
  const [permanentAddress, setPermanentAddress] = useState("");

  const [emergencyContact, setEmergencyContact] = useState("");
  const [emergencyContactHolder, setEmergencyContactHolder] = useState("");

  const [project, setProject] = useState("");
  const [projects, setProjects] = useState<string[]>([]);
  const [designation, setDesignation] = useState("");
  const [receptionistName, setReceptionistName] = useState("");

  const [salary, setSalary] = useState("");
  const [punctuality, setPunctuality] = useState("");

  const [experience, setExperience] = useState("");
  const [references, setReferences] = useState("");

  const [generalReview, setGeneralReview] = useState("");
  const [hrReview, setHrReview] = useState("");
  const [trainerRemarks, setTrainerRemarks] = useState("");

  const [status, setStatus] = useState("");
  const [proceededForFinal, setProceededForFinal] = useState(false);

  /* ---------- BENCHMARKS ---------- */
  const [receptionBenchmark, setReceptionBenchmark] = useState<number | null>(
    null
  );
  const [hrBenchmark, setHrBenchmark] = useState<number | null>(null);

  /* ---------- DATES ---------- */
  const [startDate, setStartDate] = useState<any>(null); // created_at string usually
  const [dob, setDob] = useState<Date | null>(null);
  const [joiningDate, setJoiningDate] = useState<Date | null>(null);
  const [appointmentDate, setAppointmentDate] = useState<Date | null>(null);
  const [finalInterviewDate, setFinalInterviewDate] = useState<Date | null>(
    null
  );
  const [trainingCompletionDate, setTrainingCompletionDate] =
    useState<Date | null>(null);
  const [serviceEndDate, setServiceEndDate] = useState<Date | null>(null);

  /* ===================== TEAM LEADER STATE ===================== */

  const [teamLeaderAssignedId, setTeamLeaderAssignedId] = useState<number | null>(
    null
  );

  // This will store only team leaders for same project + designation
  const [teamLeaders, setTeamLeaders] = useState<TeamLeaderOption[]>([]);

  /* ===================== STATUS SUB MODAL ===================== */

  const [statusModalOpen, setStatusModalOpen] = useState(false);

  // Temporary state inside status modal (only applied when user clicks Submit)
  const [tempStatus, setTempStatus] = useState<string>("");

  const [tempAppointmentDate, setTempAppointmentDate] = useState<Date | null>(
    null
  );

  const [tempTeamLeaderAssignedId, setTempTeamLeaderAssignedId] = useState<
    number | null
  >(null);

  // temp joining date (for in_training + in_probation)
  const [tempJoiningDate, setTempJoiningDate] = useState<Date | null>(null);

  // temp training completion date (for in_probation)
  const [tempTrainingCompletionDate, setTempTrainingCompletionDate] =
    useState<Date | null>(null);

  // temp service end date (for resigned/terminated/ghosted)
  const [tempServiceEndDate, setTempServiceEndDate] = useState<Date | null>(null);
/* ---------- FILES ---------- */

const [employeePhoto, setEmployeePhoto] = useState<string | null>(null);
const [certificateExists, setCertificateExists] = useState(false);

/* file replacements (pending upload) */
const [newPhotoFile, setNewPhotoFile] = useState<File | null>(null);
const [newCertificateFile, setNewCertificateFile] = useState<File | null>(null);

/* modals */
const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);
  const isTempAppointed = tempStatus === "appointed";
  const isTempInTraining = tempStatus === "in_training";
  const isTempHold = tempStatus === "hold";
  const isTempProbation = tempStatus === "in_probation";

  const isTempEnded =
    tempStatus === "resigned" ||
    tempStatus === "terminated" ||
    tempStatus === "ghosted";

  /* ===================== FETCH FULL DATA ===================== */

  useEffect(() => {
    if (!open || !employeeId) return;

    let isMounted = true;

    setLoading(true);
    setReadyToOpen(false);

    fetch(`/api/empdetails/${employeeId}/full/`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        populateForm(data);
        setReadyToOpen(true);
      })
      .catch(() => toast.error("Failed to load employee"))
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open, employeeId]);

  useEffect(() => {
    fetch("/api/projects/", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setProjects(data.projects || []))
      .catch(() => setProjects([]));
  }, []);

  /* fetch user type */
  useEffect(() => {
    if (!open) return;

    fetch("/api/check-auth/", { credentials: "include" })
      .then((res) => res.json())
      .then((d) => {
        const t = (d.user_type || "receptionist") as UserType;
        setUserType(t);
      })
      .catch(() => setUserType("receptionist"));
  }, [open]);

  /* ===================== FETCH TEAM LEADERS (filtered) ===================== */
  useEffect(() => {
    // Only fetch if we have project + designation
    if (!open) return;
    if (!project || !designation) {
      setTeamLeaders([]);
      return;
    }

    fetch(
      `/api/teamleaders/filtered/?project=${encodeURIComponent(
        project
      )}&designation=${encodeURIComponent(designation)}`,
      { credentials: "include" }
    )
      .then((res) => res.json())
      .then((data) => {
        setTeamLeaders(data.team_leaders || []);
      })
      .catch(() => setTeamLeaders([]));
  }, [open, project, designation]);

  /* ===================== POPULATE ===================== */

  const populateForm = (d: any) => {
    setName(d.name ?? "");
    setCnic(d.cnic ?? "");
    setEmail(d.email ?? "");
    setContactNumber(d.contact_number ?? "");

    setFatherName(d.father_name ?? "");
    setFatherOccupation(d.father_occupation ?? "");

    setEducationBackground(d.education_background ?? "");
    setEducationDetails(d.education_details ?? "");

    setResidentialAddress(d.residential_address ?? "");
    setPermanentAddress(d.permanent_address ?? "");

    setEmergencyContact(d.emergency_contact ?? "");
    setEmergencyContactHolder(d.emergency_contact_holder ?? "");
    setReceptionistName(d.receptionist_name ?? "");
    setProject(d.project_applied_for ?? "");
    setDesignation(d.post_applied_for ?? "");

    setSalary(d.salary ? String(d.salary) : "");
    setPunctuality(d.punctuality ? String(d.punctuality) : "");

    setExperience(d.experience ?? "");
    setReferences(d.references ?? "");

    setGeneralReview(d.general_review ?? "");
    setHrReview(d.hr_review ?? "");
    setTrainerRemarks(d.trainer_remarks ?? "");

    setStatus(d.status ?? "");
    setProceededForFinal(!!d.proceeded_for_final_interview);
    setReceptionBenchmark(d.reception_benchmark ?? null);
    setHrBenchmark(d.hr_benchmark ?? null);

    setStartDate(d.start_date ?? "");
    setDob(d.dob ? new Date(d.dob) : null);
    setJoiningDate(d.joining_date ? new Date(d.joining_date) : null);
    setAppointmentDate(d.appointment_date ? new Date(d.appointment_date) : null);
    setFinalInterviewDate(
      d.final_interview_date ? new Date(d.final_interview_date) : null
    );
    setTrainingCompletionDate(
      d.training_completion_date ? new Date(d.training_completion_date) : null
    );
    setServiceEndDate(d.service_end_date ? new Date(d.service_end_date) : null);

    // team leader assigned
    setTeamLeaderAssignedId(d.team_leader_assigned ?? null);
        setEmployeePhoto(d.employee_photo ?? null);
    setCertificateExists(!!d.legal_clearance_certificate_exists);
  };
const downloadCertificate = () => {
  if (!employeeId) return;

  const link = document.createElement("a");
  link.href = `/api/empdetails/${employeeId}/download-certificate/`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
  /* ===================== OPEN STATUS MODAL ===================== */

  const openStatusModal = () => {
    // preload current values into temp states
    setTempStatus(status || "");
    setTempAppointmentDate(appointmentDate);
    setTempTeamLeaderAssignedId(teamLeaderAssignedId);

    setTempJoiningDate(joiningDate);
    setTempTrainingCompletionDate(trainingCompletionDate);
    setTempServiceEndDate(serviceEndDate);

    setStatusModalOpen(true);
  };

  const toLocalYMD = (date: Date | null) => {
    if (!date) return null;

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");

    return `${y}-${m}-${d}`;
  };

  /* ===================== SUBMIT STATUS MODAL ===================== */

  const handleStatusModalSubmit = () => {
    if (!tempStatus) {
      toast.error("Please select a status.");
      return;
    }

    // appointed requires team leader + appointment date
    if (tempStatus === "appointed") {
      if (!tempTeamLeaderAssignedId) {
        toast.error("Assign Team Leader is required for Appointed status.");
        return;
      }
      if (!tempAppointmentDate) {
        toast.error("Appointment Date is required for Appointed status.");
        return;
      }
    }

    // in_probation requires team leader + joining date + training completion date
    if (tempStatus === "in_probation") {
      if (!tempTeamLeaderAssignedId) {
        toast.error("Assign Team Leader is required for In Probation status.");
        return;
      }
      if (!tempJoiningDate) {
        toast.error("Joining Date is required for In Probation status.");
        return;
      }
      if (!tempTrainingCompletionDate) {
        toast.error("Training Completion Date is required for In Probation status.");
        return;
      }
    }

    // in_training requires joining date
    if (tempStatus === "in_training") {
      if (!tempJoiningDate) {
        toast.error("Joining Date is required for In Training status.");
        return;
      }
    }

    // resigned/terminated/ghosted requires service end date
    if (isTempEnded && !tempServiceEndDate) {
      toast.error("Service End Date is required for this status.");
      return;
    }

    // apply changes to main modal state
    setStatus(tempStatus);

    if (tempStatus === "appointed") {
      setTeamLeaderAssignedId(tempTeamLeaderAssignedId);
      setAppointmentDate(tempAppointmentDate);
    }

    if (tempStatus === "in_probation") {
      setTeamLeaderAssignedId(tempTeamLeaderAssignedId);
      setJoiningDate(tempJoiningDate);
      setTrainingCompletionDate(tempTrainingCompletionDate);
    }

    if (tempStatus === "in_training") {
      setJoiningDate(tempJoiningDate);
    }

    if (isTempEnded) {
      setServiceEndDate(tempServiceEndDate);
    }

    setStatusModalOpen(false);
    toast.success("Status changes applied. Now Save Changes to confirm.");
  };

  /* ===================== SAVE PRIMARY MODAL ===================== */

  const handleSave = async () => {
    if (!employeeId) return;

    // appointed status must have appointment_date + team_leader_assigned
    if (status === "appointed") {
      if (!appointmentDate) {
        toast.error("Appointment Date is required when status is Appointed.");
        return;
      }
      if (!teamLeaderAssignedId) {
        toast.error("Team Leader is required when status is Appointed.");
        return;
      }
    }

    // resigned/terminated/ghosted requires service end date
    if (
      status === "resigned" ||
      status === "terminated" ||
      status === "ghosted"
    ) {
      if (!serviceEndDate) {
        toast.error("Service End Date is required for this status.");
        return;
      }
    }

    // in_probation must have team leader + joining date + training completion date
    if (status === "in_probation") {
      if (!teamLeaderAssignedId) {
        toast.error("Team Leader is required when status is In Probation.");
        return;
      }
      if (!joiningDate) {
        toast.error("Joining Date is required when status is In Probation.");
        return;
      }
      if (!trainingCompletionDate) {
        toast.error(
          "Training Completion Date is required when status is In Probation."
        );
        return;
      }
    }

    // in_training must have joining date
    if (status === "in_training" && !joiningDate) {
      toast.error("Joining Date is required when status is In Training.");
      return;
    }

    if (!confirm("Are you sure you want to save all changes?")) return;

    const payload = {
      name,
      cnic,
      email,
      contact_number: contactNumber,
      father_name: fatherName,
      father_occupation: fatherOccupation,
      education_background: educationBackground,
      education_details: educationDetails,
      receptionist_name: receptionistName,
      residential_address: residentialAddress,
      permanent_address: permanentAddress,
      emergency_contact: emergencyContact,
      emergency_contact_holder: emergencyContactHolder,
      project_applied_for: project,
      post_applied_for: designation,
      salary,
      punctuality,
      experience,
      references,
      general_review: generalReview,
      hr_review: hrReview,
      trainer_remarks: trainerRemarks,
      proceeded_for_final_interview: proceededForFinal,
      reception_benchmark: receptionBenchmark,
      hr_benchmark: hrBenchmark,

      status,
      team_leader_assigned: teamLeaderAssignedId,

      dob: toLocalYMD(dob),
      joining_date: toLocalYMD(joiningDate),
      appointment_date: toLocalYMD(appointmentDate),
      final_interview_date: toLocalYMD(finalInterviewDate),
      training_completion_date: toLocalYMD(trainingCompletionDate),
      service_end_date: toLocalYMD(serviceEndDate),
    };

    const formData = new FormData();

    /* append all normal fields */
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        formData.append(key, String(value));
      }
    });

    /* append photo if user selected new one */
    if (newPhotoFile) {
      formData.append("employee_photo", newPhotoFile);
    }

    /* append certificate if user uploaded one */
    if (newCertificateFile) {
      formData.append("legal_clearance_certificate", newCertificateFile);
    }

    const res = await fetch(`/api/empdetails/${employeeId}/full-update/`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    if (res.ok) {
      toast.success("Employee updated successfully");
      onSaved?.();
      onClose();
    } else {
      toast.error("Failed to save changes");
    }
  };

  /* ===================== HELPERS ===================== */

  const currentTeamLeaderName = useMemo(() => {
    if (!teamLeaderAssignedId) return "Not Assigned";
    const tl = teamLeaders.find((x) => x.id === teamLeaderAssignedId);
    if (!tl) return "Assigned (Not in list)";
    return `${tl.team.toUpperCase()} — ${tl.leader_name}`;
  }, [teamLeaderAssignedId, teamLeaders]);

  /* ===================== RENDER ===================== */

  return (
    <>
      {/* ===================== LOADER OVERLAY ===================== */}
      {open && loading && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-xl bg-background px-6 py-4 shadow-lg">
            <SpinnerCustom/>
            <p className="text-sm font-medium">Loading employee...</p>
          </div>
        </div>
      )}

      {/* ===================== MAIN MODAL ===================== */}
      <Dialog open={open && readyToOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4 text-muted-foreground" />
              Modify
            </DialogTitle>
          </DialogHeader>

         
          {/* Receptionist cannot edit main fields */}
          <fieldset disabled={isReceptionist} className="contents">
            <div className="grid grid-cols-2 gap-4">
           {/* ================= PROFILE HEADER ================= */}

<div className="col-span-2 flex items-start gap-6 border-b pb-6 mb-4">

  {/* PHOTO */}
  <div className="flex flex-col items-center gap-2">

  <div
className={`relative w-28 h-28 rounded-full overflow-hidden shadow-sm
${newPhotoFile ? "ring-2 ring-green-500" : "border"}`}
    onClick={() => employeePhoto && setPhotoPreviewOpen(true)}
  >
    {employeePhoto ? (
      <img
        src={newPhotoFile ? URL.createObjectURL(newPhotoFile) : employeePhoto}
        className="w-full h-full object-cover"
      />
    ) : (
      <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
        No Photo
      </div>
    )}

    {/* Hover Overlay */}
    <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition">
      Preview
    </div>
  </div>

  <Button
    variant="ghost"
    size="sm"
    onClick={() => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";

      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (file) setNewPhotoFile(file);
      };

      input.click();
    }}
  >
    Change Photo
  </Button>
  {!employeePhoto && !newPhotoFile && (
  <p className="text-xs text-muted-foreground">
    No photo uploaded
  </p>
)}

{!employeePhoto && newPhotoFile && (
  <p className="text-xs text-green-600 font-medium">
    ✓ New photo selected
  </p>
)}

</div>
  {/* PROFILE META */}
  <div className="flex flex-col gap-3 flex-1">

    <div>
      <h2 className="text-lg font-semibold">{name || "Employee"}</h2>
      <p className="text-sm text-muted-foreground">
        {designation || "No designation"} — {project || "No project"}
      </p>
    </div>

    {/* CERTIFICATE ACTIONS */}

<div className="flex items-center gap-4 mt-2">

  <div className="flex items-center gap-2 text-sm">
    <span className="font-medium">Legal Clearance:</span>

    {certificateExists ? (
      <span className="text-green-600 font-medium">Uploaded</span>
    ) : (
      <span className="text-muted-foreground">Not Uploaded</span>
    )}
  </div>

{certificateExists && (
  <Button
    variant="secondary"
    size="sm"
    onClick={downloadCertificate}
  >
    Download
  </Button>
)}

  <Button
    variant="outline"
    size="sm"
    onClick={() => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/pdf";

      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (file) setNewCertificateFile(file);
      };

      input.click();
    }}
  >
    {certificateExists ? "Replace" : "Upload"}
  </Button>
  {!certificateExists && !newCertificateFile && (
  <p className="text-xs text-muted-foreground">
    No certificate uploaded
  </p>
)}

{!certificateExists && newCertificateFile && (
  <p className="text-xs text-green-600 font-medium">
    ✓ {newCertificateFile.name} selected
  </p>
)}

</div>
  </div>

</div>
              <Field label="Name" value={name} setValue={setName} />
              <Field label="CNIC" value={cnic} setValue={setCnic} numeric />
              <Field label="Email" value={email} setValue={setEmail} />

              <Field
                label="Contact Number"
                value={contactNumber}
                setValue={setContactNumber}
                numeric
              />

              <Field
                label="Emergency Contact Number"
                value={emergencyContact}
                setValue={setEmergencyContact}
                numeric
              />
              <Field
                label="Emergency Contact Holder"
                value={emergencyContactHolder}
                setValue={setEmergencyContactHolder}
              />
              <Field label="Proceeded by" value={receptionistName} readOnly />

              <Field label="Interview Date" value={startDate} readOnly />

              <DatePickerField
                label="Date of Birth"
                value={dob}
                setValue={setDob}
              />

              <SelectField
                label="Education Background"
                value={educationBackground}
                onChange={setEducationBackground}
                options={EDUCATION_LEVELS}
              />

              <TextareaField
                label="Education Details"
                value={educationDetails}
                setValue={setEducationDetails}
                colSpan
              />

              <SelectField
                label="Project"
                value={project}
                onChange={setProject}
                options={projects}
              />
              <SelectField
                label="Post Applied For"
                value={designation}
                onChange={setDesignation}
                options={DESIGNATIONS}
              />

              <Field label="Salary" value={salary} setValue={setSalary} numeric />
              <Field
                label="Punctuality"
                value={punctuality}
                setValue={setPunctuality}
                numeric
              />

              <TextareaField
                label="Experience"
                value={experience}
                setValue={setExperience}
                colSpan
              />
              <TextareaField
                label="References"
                value={references}
                setValue={setReferences}
                colSpan
              />

              <TextareaField
                label="General Review"
                value={generalReview}
                setValue={setGeneralReview}
                colSpan
              />

              <DatePickerField
                label="Joining Date"
                value={joiningDate}
                setValue={setJoiningDate}
              />

              <DatePickerField
                label="Training Completion Date"
                value={trainingCompletionDate}
                setValue={setTrainingCompletionDate}
              />

              <DatePickerField
                label="Service End Date"
                value={serviceEndDate}
                setValue={setServiceEndDate}
              />

              <TextareaField
                label="Trainer Remarks"
                value={trainerRemarks}
                setValue={setTrainerRemarks}
                colSpan
              />

              {/* Status summary display */}
              <div className="col-span-2 rounded-lg border p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Current Status</p>
                  <p className="text-sm text-muted-foreground">
                    {status || "Not set"}
                  </p>

                  {status === "appointed" && (
                    <p className="text-xs text-muted-foreground">
                      Team Leader: {currentTeamLeaderName}{" "}
                      {appointmentDate ? (
                        <> | Appointment Date: {appointmentDate.toDateString()}</>
                      ) : (
                        <> | Appointment Date: Not Set</>
                      )}
                    </p>
                  )}

                  {(status === "resigned" ||
                    status === "terminated" ||
                    status === "ghosted") && (
                    <p className="text-xs text-muted-foreground">
                      Service End Date:{" "}
                      {serviceEndDate ? serviceEndDate.toDateString() : "Not Set"}
                    </p>
                  )}
                </div>

                <Button type="button" variant="outline" onClick={openStatusModal}>
                  Change Status
                </Button>
              </div>

              {proceededForFinal && (
                <>
                  <DatePickerField
                    label="Final Interview Date"
                    value={finalInterviewDate}
                    setValue={setFinalInterviewDate}
                  />

                  <TextareaField
                    label="HR Review"
                    value={hrReview}
                    setValue={setHrReview}
                    colSpan
                  />
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave}>Save Changes</Button>
            </div>
          </fieldset>
        </DialogContent>
      </Dialog>

      {/* ===================== STATUS SUB MODAL ===================== */}
      <Dialog open={statusModalOpen} onOpenChange={setStatusModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Change Status</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Status select */}
            <div>
              <Label>Status</Label>
              <Select value={tempStatus} onValueChange={setTempStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_CHANGE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* appointed -> team leader + appointment date */}
            {isTempAppointed && (
              <>
                <div>
                  <Label>Assign Team Leader</Label>
                  <Select
                    value={tempTeamLeaderAssignedId?.toString() || ""}
                    onValueChange={(v) =>
                      setTempTeamLeaderAssignedId(v ? Number(v) : null)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select team leader" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamLeaders.length === 0 ? (
                        <SelectItem value="no-tl" disabled>
                          No team leaders found for this Project + Designation
                        </SelectItem>
                      ) : (
                        teamLeaders.map((tl) => (
                          <SelectItem key={tl.id} value={String(tl.id)}>
                            {tl.team.toUpperCase()} — {tl.leader_name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <DatePickerField
                  label="Appointment Date"
                  value={tempAppointmentDate}
                  setValue={setTempAppointmentDate}
                />
              </>
            )}

            {/* in_probation -> team leader + joining date + training completion date + general review */}
            {isTempProbation && (
              <>
                <div>
                  <Label>Assign Team Leader</Label>
                  <Select
                    value={tempTeamLeaderAssignedId?.toString() || ""}
                    onValueChange={(v) =>
                      setTempTeamLeaderAssignedId(v ? Number(v) : null)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select team leader" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamLeaders.length === 0 ? (
                        <SelectItem value="no-tl" disabled>
                          No team leaders found for this Project + Designation
                        </SelectItem>
                      ) : (
                        teamLeaders.map((tl) => (
                          <SelectItem key={tl.id} value={String(tl.id)}>
                            {tl.team.toUpperCase()} — {tl.leader_name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <DatePickerField
                  label="Joining Date"
                  value={tempJoiningDate}
                  setValue={setTempJoiningDate}
                />

                <DatePickerField
                  label="Training Completion Date"
                  value={tempTrainingCompletionDate}
                  setValue={setTempTrainingCompletionDate}
                />

                <TextareaField
                  label="General Review"
                  value={generalReview}
                  setValue={setGeneralReview}
                  colSpan
                />
              </>
            )}

            {/* in_training -> joining date + general review side by side */}
            {isTempInTraining && (
              <div className="grid grid-cols-2 gap-3">
                <DatePickerField
                  label="Joining Date"
                  value={tempJoiningDate}
                  setValue={setTempJoiningDate}
                />

                <TextareaField
                  label="General Review"
                  value={generalReview}
                  setValue={setGeneralReview}
                />
              </div>
            )}

            {/* hold -> general review only */}
            {isTempHold && (
              <TextareaField
                label="General Review"
                value={generalReview}
                setValue={setGeneralReview}
                colSpan
              />
            )}

            {/* resigned/terminated/ghosted -> general review + service end date */}
            {isTempEnded && (
              <>
                <TextareaField
                  label="General Review"
                  value={generalReview}
                  setValue={setGeneralReview}
                  colSpan
                />

                <DatePickerField
                  label="Service End Date"
                  value={tempServiceEndDate}
                  setValue={setTempServiceEndDate}
                />
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                type="button"
                onClick={() => setStatusModalOpen(false)}
              >
                Cancel
              </Button>

              <Button type="button" onClick={handleStatusModalSubmit}>
                Submit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={photoPreviewOpen} onOpenChange={setPhotoPreviewOpen}>
      <DialogContent className="flex justify-center items-center bg-transparent border-none shadow-none">

        <div className="w-[420px] h-[420px] rounded-full overflow-hidden border-4 border-white shadow-xl bg-black flex items-center justify-center">

          {employeePhoto && (
            <img
              src={employeePhoto}
              className="w-full h-full object-cover scale-110"
            />
          )}

        </div>

      </DialogContent>
    </Dialog>
    </>
  );
}

/* ===================== HELPERS ===================== */

function Field({
  label,
  value,
  setValue,
  numeric = false,
  readOnly = false,
}: any) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        value={value ?? ""}
        readOnly={readOnly}
        onChange={(e) => {
          if (readOnly) return;
          const v = numeric ? e.target.value.replace(/\D/g, "") : e.target.value;
          setValue(v);
        }}
      />
    </div>
  );
}

function TextareaField({ label, value, setValue, colSpan = false }: any) {
  return (
    <div className={colSpan ? "col-span-2" : ""}>
      <Label>{label}</Label>
      <Textarea value={value ?? ""} onChange={(e) => setValue(e.target.value)} />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: any) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt: string) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DatePickerField({ label, value, setValue }: any) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="relative flex gap-2">
        <Input
          value={
            value
              ? value.toLocaleDateString("en-US", {
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
              selected={value ?? undefined}
              captionLayout="dropdown"
              onSelect={(date) => date && setValue(date)}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
