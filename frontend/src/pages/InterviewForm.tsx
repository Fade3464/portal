import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormControl,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CalendarIcon, Sun, Moon, LogOut, CheckCircle2 } from "lucide-react";
import { UserRoundPlusIcon } from "@/components/ui/user-round-plus";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

// 🧾 Schema (unchanged except DOB required + empty by default)
const formSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .regex(/^[A-Za-z\s]+$/, "Only alphabets allowed"),

  // ✅ DOB is REQUIRED but starts EMPTY
  dob: z
  .date({ required_error: "Date of Birth is required" })
  .nullable()
  .refine((val) => val !== null, {
    message: "Date of Birth is required",
  }),

  education_background: z.enum([
    "Middle",
    "Matric",
    "Intermediate",
    "Undergraduate",
    "Graduate",
  ]),
  education_details: z.string().min(1, "Education details are required"),
  email: z.string().email("Enter a valid email"),
  cnic: z.string().regex(/^\d{13}$/, "CNIC must be 13 digits"),
  father_name: z
    .string()
    .min(1, "Father's name is required")
    .regex(/^[A-Za-z\s]+$/, "Only alphabets allowed"),
  father_occupation: z.string().min(1, "Occupation is required"),
  residential_address: z.string().min(1, "Residential address required"),
  permanent_address: z.string().min(1, "Permanent address required"),
  contact_no: z.string().regex(/^\d{11}$/, "Contact number must be 11 digits"),
  emergency_contact_no: z
    .string()
    .regex(/^\d{11}$/, "Emergency contact must be 11 digits"),
  emergency_contact_name: z
    .string()
    .min(1, "Emergency contact name required")
    .regex(/^[A-Za-z\s]+$/, "Only alphabets allowed"),
  project_applied: z.string().min(1, "Project selection required"),
});

type FormData = z.input<typeof formSchema>;
type StepKey = "personal" | "contact" | "address" | "apply";

export default function InterviewForm() {
  const [projects, setProjects] = useState<string[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [showSuccess, setShowSuccess] = useState(false);
  const navigate = useNavigate();

  // ✅ NEW: track if user touched DOB year dropdown
  const [dobYearTouched, setDobYearTouched] = useState(false);

  // Reference states (logic unchanged)
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [friendName, setFriendName] = useState("");
  const [forumName, setForumName] = useState("");

  // Wizard state (UX)
  const [step, setStep] = useState<number>(0);
  const [shake, setShake] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const steps = useMemo(
    () => [
      { key: "personal" as StepKey, title: "Personal", subtitle: "Basic details" },
      { key: "contact" as StepKey, title: "Contact", subtitle: "Phone & family" },
      { key: "address" as StepKey, title: "Address", subtitle: "Current & permanent" },
      { key: "apply" as StepKey, title: "Apply", subtitle: "Campaign & reference" },
    ],
    []
  );

  // Refs for auto focus/scroll UX
  const refs = {
    name: useRef<HTMLInputElement | null>(null),
    dob: useRef<HTMLInputElement | null>(null),
    education_details: useRef<HTMLTextAreaElement | null>(null),
    email: useRef<HTMLInputElement | null>(null),
    cnic: useRef<HTMLInputElement | null>(null),
    father_name: useRef<HTMLInputElement | null>(null),
    father_occupation: useRef<HTMLInputElement | null>(null),
    contact_no: useRef<HTMLInputElement | null>(null),
    emergency_contact_no: useRef<HTMLInputElement | null>(null),
    emergency_contact_name: useRef<HTMLInputElement | null>(null),
    residential_address: useRef<HTMLInputElement | null>(null),
    permanent_address: useRef<HTMLInputElement | null>(null),
  };

  // Form (logic unchanged)
  const form = useForm<FormData>({
  resolver: zodResolver(formSchema),
  mode: "onChange",
  reValidateMode: "onChange",
  defaultValues: {
    name: "",
    dob: null,
    education_background: "Intermediate",
    education_details: "",
    email: "",
    cnic: "",
    father_name: "",
    father_occupation: "",
    residential_address: "",
    permanent_address: "",
    contact_no: "",
    emergency_contact_no: "",
    emergency_contact_name: "",
    project_applied: "",
  },
});

  // ✅ IMPORTANT FIX: watch values so Review Summary updates live
  const watchedValues = form.watch();

  // 🌗 Theme toggle (unchanged)
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const applied = saved === "dark" ? "dark" : "light";
    setTheme(applied);
    document.documentElement.classList.toggle("dark", applied === "dark");
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  // 🎯 Fetch projects (unchanged)
  useEffect(() => {
    fetch("/api/projects/", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setProjects(data.projects || []))
      .catch(() => toast.error("Failed to load projects"));
  }, []);

  // 🚪 Logout handler (unchanged)
  const handleLogout = async () => {
    try {
      const res = await fetch("/api/logout/", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Logged out successfully!");
        navigate("/login");
      } else {
        toast.error("Failed to log out. Try again.");
      }
    } catch {
      toast.error("Network error during logout.");
    }
  };

  // 🔐 Auth check (unchanged)
  useEffect(() => {
    fetch("/api/check-auth/", { credentials: "include" })
      .then((res) => {
        if (!res.ok) {
          navigate("/login", {
            state: { authError: "You need to login to do that" },
            replace: true,
          });
        }
      })
      .catch(() => {
        navigate("/login", {
          state: { authError: "You need to login to do that" },
          replace: true,
        });
      });
  }, []);

  // ✨ Helper: title case (same as your submit)
  const toTitleCase = (str = "") =>
    str
      .trim()
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");

  // 🎯 Auto focus first invalid field
  const focusFirstError = () => {
    const errors = form.formState.errors;

    const order: (keyof typeof refs)[] = [
      "name",
      "dob",
      "education_details",
      "email",
      "cnic",
      "father_name",
      "father_occupation",
      "contact_no",
      "emergency_contact_no",
      "emergency_contact_name",
      "residential_address",
      "permanent_address",
    ];

    for (const key of order) {
      if (errors[key as keyof FormData]) {
        const el = refs[key].current;
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(() => el.focus(), 250);
        }
        return;
      }
    }
  };

  // Step validation mapping (UX)
  const stepFields: Record<number, (keyof FormData)[]> = {
    0: ["name", "dob", "education_background", "education_details"],
    1: [
      "email",
      "cnic",
      "father_name",
      "father_occupation",
      "contact_no",
      "emergency_contact_no",
      "emergency_contact_name",
    ],
    2: ["residential_address", "permanent_address"],
    3: ["project_applied"],
  };

  const shakeStep = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleNext = async () => {
    const fields = stepFields[step];
    const ok = await form.trigger(fields, { shouldFocus: false });

    if (!ok) {
      toast.error("Please fix the highlighted fields before continuing.");
      shakeStep();
      focusFirstError();
      return;
    }

    // ✅ NEW RULE: user must touch/select the year dropdown at least once
    if (step === 0) {
      const dob = form.getValues("dob");
      if (dob && !dobYearTouched) {
        form.setError("dob", {
          type: "manual",
          message: "Please select your birth-year from the year dropdown by pressing the calendar.",
        });
        toast.error("Please select your birth-year from the year dropdown");
        shakeStep();
        focusFirstError();
        return;
      }
    }

    setStep((prev) => Math.min(prev + 1, steps.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = () => {
    setStep((prev) => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // 🚀 Submit confirm (logic unchanged)
  async function handleSubmitConfirm() {
    const data = form.getValues();

    const formattedName = toTitleCase(data.name);
    const formattedFatherName = toTitleCase(data.father_name);

    let referenceValue = "";
    if (selectedOption === "friend") referenceValue = friendName.trim();
    else if (selectedOption === "social") referenceValue = "Social Media";
    else if (selectedOption === "forum") referenceValue = forumName.trim();
    else if (selectedOption === "none") referenceValue = "None";

    // @ts-ignore
    data.references = referenceValue;

    try {
      setIsSubmitting(true);

      const res = await fetch("/api/interview/submit/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: formattedName,
          dob: data.dob
            ? new Date(data.dob.getTime() - data.dob.getTimezoneOffset() * 60000)
                .toISOString()
                .split("T")[0]
            : null,
          education_background: data.education_background,
          education_details: data.education_details,
          email: data.email,
          cnic: data.cnic,
          father_name: formattedFatherName,
          father_occupation: data.father_occupation,
          residential_address: data.residential_address,
          permanent_address: data.permanent_address,
          contact_no: data.contact_no,
          emergency_contact_no: data.emergency_contact_no,
          emergency_contact_name: data.emergency_contact_name,
          project_applied: data.project_applied,
          // @ts-ignore
          references: data.references,
        }),
      });

      const result = await res.json();

      if (res.ok) {
        toast.success("Interviewee added successfully!");
        form.reset();
        setDobYearTouched(false); // ✅ reset year touched state
        setSelectedOption(null);
        setFriendName("");
        setForumName("");
        setShowConfirm(false);
        setShowSuccess(true);
        setStep(0);

        setTimeout(() => setShowSuccess(false), 8000);
      } else toast.error(result.error || "Submission failed");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Progress percent
  const progress = useMemo(() => {
    const pct = ((step + 1) / steps.length) * 100;
    return Math.min(100, Math.max(0, pct));
  }, [step, steps.length]);

  // ✅ FIXED REVIEW SUMMARY (now updates live)
  const review = useMemo(() => {
    const v = watchedValues;

    const dobStr = v.dob
      ? v.dob.toLocaleDateString("en-US", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : "-";

    let referenceValue = "-";
    if (selectedOption === "friend") referenceValue = friendName.trim() || "-";
    else if (selectedOption === "social") referenceValue = "Social Media";
    else if (selectedOption === "forum") referenceValue = forumName.trim() || "-";
    else if (selectedOption === "none") referenceValue = "None";

    return {
      name: toTitleCase(v.name || "-"),
      dob: dobStr,
      education_background: v.education_background,
      education_details: v.education_details || "-",
      email: v.email || "-",
      cnic: v.cnic || "-",
      father_name: toTitleCase(v.father_name || "-"),
      father_occupation: v.father_occupation || "-",
      residential_address: v.residential_address || "-",
      permanent_address: v.permanent_address || "-",
      contact_no: v.contact_no || "-",
      emergency_contact_no: v.emergency_contact_no || "-",
      emergency_contact_name: v.emergency_contact_name || "-",
      project_applied: v.project_applied || "-",
      references: referenceValue,
    };
  }, [watchedValues, selectedOption, friendName, forumName]);

  return (
    <div
      className={cn(
        "min-h-screen w-screen flex items-center justify-center px-4 py-12 transition-colors duration-500 relative",
        theme === "dark"
          ? "bg-[#000500] text-white"
          : "bg-gray-100 text-gray-900"
      )}
    >
      {/* 🌙 Theme Toggle + 🚪 Logout */}
      <div className="fixed top-6 right-6 flex items-center gap-3 z-50">
        <Button
          size="icon"
          variant="outline"
          onClick={toggleTheme}
          className="rounded-full shadow border dark:border-gray-700 bg-white/70 dark:bg-black/40 backdrop-blur-md"
        >
          {theme === "dark" ? (
            <Sun className="h-5 w-5 text-yellow-300" />
          ) : (
            <Moon className="h-5 w-5 text-gray-700" />
          )}
        </Button>

        <Button
          variant="destructive"
          onClick={handleLogout}
          className="rounded-full shadow flex items-center gap-2 px-4"
        >
          <LogOut className="h-4 w-4" />
          <span>Logout</span>
        </Button>
      </div>

      {/* ✅ Success Overlay */}
      {showSuccess && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-md z-40 transition-opacity duration-1000">
          <div className="max-w-2xl px-6 text-center">
            <h1 className="text-3xl md:text-4xl font-bold text-green-400 animate-fadeOut leading-snug">
              Please be seated! You will be called shortly at the reception desk.
            </h1>
            <p className="mt-3 text-white/80 text-sm">
              Thank you for submitting your application.
            </p>
          </div>
        </div>
      )}

      {/* 🪶 Form Card */}
      <div
        className={cn(
          "w-full max-w-5xl mx-auto bg-white dark:bg-[#010a01] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 p-6 md:p-10 transition-opacity duration-700",
          showSuccess ? "opacity-0 pointer-events-none" : "opacity-100"
        )}
      >
        {/* Header */}
        <div className="flex flex-col items-center justify-center gap-3 mb-8">
          <div className="flex items-center justify-center gap-3">
            <UserRoundPlusIcon
              className="text-black dark:text-white transition-transform duration-300 hover:scale-110"
              size={32}
            />
            <h2 className="text-3xl font-semibold tracking-tight">
              Interview Form
            </h2>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 text-center max-w-2xl">
            Complete all steps to submit your application.
          </p>

          {/* Progress Bar */}
          <div className="w-full max-w-2xl mt-3">
            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-2">
              <span>
                Step {step + 1} of {steps.length}
              </span>
              <span>{Math.round(progress)}%</span>
            </div>

            <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-black dark:bg-white transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Step pills */}
            <div className="grid grid-cols-4 gap-2 mt-4">
              {steps.map((s, idx) => {
                const active = idx === step;
                const done = idx < step;
                return (
                  <div
                    key={s.key}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-center text-xs transition-all",
                      active
                        ? "border-black dark:border-white bg-black/5 dark:bg-white/10"
                        : "border-gray-200 dark:border-gray-800",
                      done ? "opacity-90" : "opacity-70"
                    )}
                  >
                    <div className="flex items-center justify-center gap-1 font-medium">
                      {done ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px]">
                          {idx + 1}
                        </span>
                      )}
                      <span>{s.title}</span>
                    </div>
                    <div className="text-[10px] mt-1">{s.subtitle}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <Form {...form}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();

              // if not last step -> go next
              if (step < steps.length - 1) {
                handleNext();
                return;
              }

              // ✅ last step -> validate step 4 then open confirm
              const ok = await form.trigger(stepFields[step], {
                shouldFocus: false,
              });

              if (!ok) {
                toast.error("Please fix errors in Step 4 before submitting.");
                shakeStep();
                focusFirstError();
                return;
              }

              // ✅ enforce year dropdown touched before final submit too
              const dob = form.getValues("dob");
              if (dob && !dobYearTouched) {
                form.setError("dob", {
                  type: "manual",
                  message: "Please select the year from the year dropdown before submitting.",
                });
                toast.error("Please select the year from the year dropdown.");
                setStep(0);
                window.scrollTo({ top: 0, behavior: "smooth" });
                return;
              }

              setShowConfirm(true);
            }}
            className={cn("space-y-8 transition-all", shake ? "animate-shake" : "")}
          >
            {/* STEP 1 */}
            {step === 0 && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-5 md:p-6">
                <h3 className="text-lg font-semibold mb-1">Personal Details</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  Basic information to register your interview.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            ref={(el) => {
                              refs.name.current = el;
                            }}
                            placeholder="e.g. Muhammad Ali"
                            onChange={(e) =>
                              field.onChange(
                                e.target.value.replace(/[^A-Za-z\s]/g, "")
                              )
                            }
                            className={cn(
                              fieldState.error
                                ? "border-red-500 focus-visible:ring-red-500"
                                : ""
                            )}
                            required
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="dob"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel>Date of Birth</FormLabel>
                        <div className="relative flex gap-2">
                          <Input
                            id="dob"
                            ref={(el) => {
                              refs.dob.current = el;
                            }}
                            value={
                              field.value
                                ? field.value.toLocaleDateString("en-US", {
                                    day: "2-digit",
                                    month: "long",
                                    year: "numeric",
                                  })
                                : ""
                            }
                            readOnly
                            placeholder="Select date"
                            className={cn(
                              "bg-background pr-10 cursor-pointer",
                              fieldState.error
                                ? "border-red-500 focus-visible:ring-red-500"
                                : ""
                            )}
                            required
                          />
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                type="button"
                                className="absolute top-1/2 right-2 -translate-y-1/2 p-2 rounded-full hover:scale-105 focus:scale-105 bg-transparent"
                              >
                                <CalendarIcon className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-auto overflow-hidden p-0"
                              align="end"
                              sideOffset={10}
                            >
                              {/* ✅ NEW: detect year dropdown interaction */}
                              <div
                                onChange={(e) => {
                                  const el = e.target as HTMLElement;
                                  if (el?.tagName === "SELECT") {
                                    setDobYearTouched(true);
                                  }
                                }}
                                >
                              <Calendar
                                mode="single"
                                selected={field.value ?? undefined}
                                captionLayout="dropdown"
                                fromYear={1950}
                                toYear={2012}
                                onSelect={(date) => field.onChange(date ?? null)}
                                disabled={(date) => date > new Date()}
                              />
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="education_background"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Education Level</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select education level" />
                          </SelectTrigger>
                          <SelectContent>
                            {[
                              "Middle",
                              "Matric",
                              "Intermediate",
                              "Undergraduate",
                              "Graduate",
                            ].map((lvl) => (
                              <SelectItem key={lvl} value={lvl}>
                                {lvl}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="education_details"
                    render={({ field, fieldState }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Education Details</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            ref={(el) => {
                              refs.education_details.current = el;
                            }}
                            rows={4}
                            placeholder="Example: Matric (2019), Intermediate (2021), Bachelors (in progress)..."
                            className={cn(
                              fieldState.error
                                ? "border-red-500 focus-visible:ring-red-500"
                                : ""
                            )}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {/* STEP 2 */}
            {step === 1 && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-5 md:p-6">
                <h3 className="text-lg font-semibold mb-1">Contact & Family</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  Make sure your phone numbers are correct.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            ref={(el) => {
                              refs.email.current = el;
                            }}
                            type="email"
                            placeholder="e.g. example@gmail.com"
                            className={cn(
                              fieldState.error
                                ? "border-red-500 focus-visible:ring-red-500"
                                : ""
                            )}
                            required
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cnic"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel>CNIC</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            ref={(el) => {
                              refs.cnic.current = el;
                            }}
                            inputMode="numeric"
                            maxLength={13}
                            placeholder="13 digit CNIC (without dashes)"
                            onChange={(e) =>
                              field.onChange(e.target.value.replace(/\D/g, ""))
                            }
                            className={cn(
                              fieldState.error
                                ? "border-red-500 focus-visible:ring-red-500"
                                : ""
                            )}
                            required
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="father_name"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel>Father's Name</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            ref={(el) => {
                              refs.father_name.current = el;
                            }}
                            placeholder="Enter father's name"
                            onChange={(e) =>
                              field.onChange(
                                e.target.value.replace(/[^A-Za-z\s]/g, "")
                              )
                            }
                            className={cn(
                              fieldState.error
                                ? "border-red-500 focus-visible:ring-red-500"
                                : ""
                            )}
                            required
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="father_occupation"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel>Father's Occupation</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            ref={(el) => {
                              refs.father_occupation.current = el;
                            }}
                            placeholder="e.g. Business / Job / Retired"
                            className={cn(
                              fieldState.error
                                ? "border-red-500 focus-visible:ring-red-500"
                                : ""
                            )}
                            required
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contact_no"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel>Contact No</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            ref={(el) => {
                              refs.contact_no.current = el;
                            }}
                            inputMode="numeric"
                            maxLength={11}
                            placeholder="03XXXXXXXXX"
                            onChange={(e) =>
                              field.onChange(e.target.value.replace(/\D/g, ""))
                            }
                            className={cn(
                              fieldState.error
                                ? "border-red-500 focus-visible:ring-red-500"
                                : ""
                            )}
                            required
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="emergency_contact_no"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel>Emergency Contact No</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            ref={(el) => {
                              refs.emergency_contact_no.current = el;
                            }}
                            inputMode="numeric"
                            maxLength={11}
                            placeholder="03XXXXXXXXX"
                            onChange={(e) =>
                              field.onChange(e.target.value.replace(/\D/g, ""))
                            }
                            className={cn(
                              fieldState.error
                                ? "border-red-500 focus-visible:ring-red-500"
                                : ""
                            )}
                            required
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="emergency_contact_name"
                    render={({ field, fieldState }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Emergency Contact Name</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            ref={(el) => {
                              refs.emergency_contact_name.current = el;
                            }}
                            placeholder="Enter emergency contact name"
                            onChange={(e) =>
                              field.onChange(
                                e.target.value.replace(/[^A-Za-z\s]/g, "")
                              )
                            }
                            className={cn(
                              fieldState.error
                                ? "border-red-500 focus-visible:ring-red-500"
                                : ""
                            )}
                            required
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {/* STEP 3 */}
            {step === 2 && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-5 md:p-6">
                <h3 className="text-lg font-semibold mb-1">Address</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  Provide your current and permanent address.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="residential_address"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel>Residential Address</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            ref={(el) => {
                              refs.residential_address.current = el;
                            }}
                            placeholder="Enter residential address"
                            className={cn(
                              fieldState.error
                                ? "border-red-500 focus-visible:ring-red-500"
                                : ""
                            )}
                            required
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="permanent_address"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel>Permanent Address</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            ref={(el) => {
                              refs.permanent_address.current = el;
                            }}
                            placeholder="Enter permanent address"
                            className={cn(
                              fieldState.error
                                ? "border-red-500 focus-visible:ring-red-500"
                                : ""
                            )}
                            required
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {/* STEP 4 */}
            {step === 3 && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-5 md:p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-1">Application</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Select the campaign and tell us how you found us.
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="project_applied"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campaign Applied For</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Campaign" />
                        </SelectTrigger>
                        <SelectContent>
                          {projects.map((p) => (
                            <SelectItem key={p} value={p}>
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* References */}
                <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
                  <FormField
                    control={form.control}
                    // @ts-ignore
                    name="references"
                    render={() => (
                      <FormItem>
                        <FormLabel className="text-lg font-semibold">
                          How did you hear about us?
                        </FormLabel>

                        <div className="mt-4 space-y-4">
                          {/* Friend */}
                          <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                            <div className="flex items-center gap-3">
                              <Checkbox
                                id="hear-friend"
                                checked={selectedOption === "friend"}
                                onCheckedChange={() =>
                                  setSelectedOption(
                                    selectedOption === "friend" ? null : "friend"
                                  )
                                }
                              />
                              <Label
                                htmlFor="hear-friend"
                                className="font-medium"
                              >
                                From a working Friend
                              </Label>
                            </div>

                            {selectedOption === "friend" && (
                              <div className="mt-3">
                                <Input
                                  placeholder="Mention full name and designation of your friend..."
                                  value={friendName}
                                  onChange={(e) => setFriendName(e.target.value)}
                                  required
                                />
                              </div>
                            )}
                          </div>

                          {/* Social */}
                          <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                            <div className="flex items-center gap-3">
                              <Checkbox
                                id="hear-social"
                                checked={selectedOption === "social"}
                                onCheckedChange={() =>
                                  setSelectedOption(
                                    selectedOption === "social" ? null : "social"
                                  )
                                }
                              />
                              <Label
                                htmlFor="hear-social"
                                className="font-medium"
                              >
                                Social Media
                              </Label>
                            </div>
                          </div>

                          {/* Forum */}
                          <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                            <div className="flex items-center gap-3">
                              <Checkbox
                                id="hear-forum"
                                checked={selectedOption === "forum"}
                                onCheckedChange={() =>
                                  setSelectedOption(
                                    selectedOption === "forum" ? null : "forum"
                                  )
                                }
                              />
                              <Label
                                htmlFor="hear-forum"
                                className="font-medium"
                              >
                                Job Application Forum
                              </Label>
                            </div>

                            {selectedOption === "forum" && (
                              <div className="mt-3">
                                <Input
                                  placeholder="Mention the name of website"
                                  value={forumName}
                                  onChange={(e) => setForumName(e.target.value)}
                                  required
                                />
                              </div>
                            )}
                          </div>

                          {/* None */}
                          <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                            <div className="flex items-center gap-3">
                              <Checkbox
                                id="hear-none"
                                checked={selectedOption === "none"}
                                onCheckedChange={() =>
                                  setSelectedOption(
                                    selectedOption === "none" ? null : "none"
                                  )
                                }
                              />
                              <Label
                                htmlFor="hear-none"
                                className="font-medium"
                              >
                                None of the above
                              </Label>
                            </div>
                          </div>
                        </div>

                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Review Summary */}
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-5 bg-gray-50 dark:bg-white/5">
                  <h4 className="font-semibold mb-3">Review Summary</h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    {[
                      ["Name", review.name],
                      ["DOB", review.dob],
                      ["Education", review.education_background],
                      ["Email", review.email],
                      ["CNIC", review.cnic],
                      ["Father Name", review.father_name],
                      ["Occupation", review.father_occupation],
                      ["Contact", review.contact_no],
                      ["Emergency Contact", review.emergency_contact_no],
                      ["Emergency Name", review.emergency_contact_name],
                      ["Residential", review.residential_address],
                      ["Permanent", review.permanent_address],
                      ["Campaign", review.project_applied],
                      ["Reference", review.references],
                    ].map(([k, v]) => (
                      <div
                        key={k}
                        className="flex items-start justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-2"
                      >
                        <span className="text-gray-600 dark:text-gray-400">
                          {k}
                        </span>
                        <span className="font-medium text-right">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Sticky Action Bar */}
            <div className="sticky bottom-0 pt-4 pb-2 bg-white/80 dark:bg-[#010a01]/80 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 rounded-xl">
              <div className="flex flex-col md:flex-row items-center justify-between gap-3 px-2">
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  {step < 3 ? (
                    <span>
                      Tip: Press <b>Enter</b> to continue to next step.
                    </span>
                  ) : (
                    <span>
                      You’re ready to submit. Please review before confirming.
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBack}
                    disabled={step === 0}
                    className="w-full md:w-32"
                  >
                    Back
                  </Button>

                  {step < steps.length - 1 ? (
                    <Button
                      type="button"
                      className="w-full md:w-44"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleNext();
                      }}
                    >
                      Next
                    </Button>
                  ) : (
                    <Button type="submit" className="w-full md:w-44">
                      Submit
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </form>
        </Form>
      </div>

      {/* 🧾 Confirmation Modal */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Submission</DialogTitle>
            <DialogDescription>
              Double-check your information before submitting.
            </DialogDescription>
          </DialogHeader>

        <div className="flex items-center justify-between gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowConfirm(false)}
              className="w-full"
              disabled={isSubmitting}
            >
              Cancel
            </Button>

            <Button
              onClick={handleSubmitConfirm}
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Confirm & Submit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ✨ Animations */}
      <style>{`
        @keyframes fadeOut {
          0% { opacity: 1; transform: scale(1); }
          85% { opacity: 1; }
          100% { opacity: 0; transform: scale(0.97); }
        }
        .animate-fadeOut {
          animation: fadeOut 8s ease-in-out forwards;
        }

        @keyframes shake {
          0% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
          100% { transform: translateX(0); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}</style>
    </div>
  );
}
