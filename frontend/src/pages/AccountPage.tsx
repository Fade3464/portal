import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Fingerprint, Mail, Palette, Plus, ShieldCheck, Smartphone, Trash2, UserRound } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { SpinnerCustom } from "@/components/ui/spinner";
import {
  COLOR_SCHEME_OPTIONS,
  useTheme,
} from "@/context/ThemeProvider";
import { getCsrfToken } from "@/lib/csrf";
import { cn } from "@/lib/utils";

type AuthenticatorDevice = {
  id: number;
  name: string;
  created_at: string;
  last_used_at: string | null;
};

type AccountProfile = {
  first_name: string;
  last_name: string;
  display_name: string;
  username: string;
  email: string;
  client_name: string;
  recovery_authenticator_enabled: boolean;
  authenticator_devices: AuthenticatorDevice[];
};

type AccountResponse = {
  status_code: number;
  profile: AccountProfile;
  message?: string;
  error?: string;
};

type PasswordResponse = {
  status_code: number;
  message?: string;
  error?: string;
};

type AuthenticatorSetupResponse = {
  status_code: number;
  message?: string;
  device_id?: number;
  device_name?: string;
  setup_key?: string;
  otpauth_url?: string;
  error?: string;
};

type AuthenticatorMutationResponse = PasswordResponse & {
  profile?: AccountProfile;
};

const emptyProfile: AccountProfile = {
  first_name: "",
  last_name: "",
  display_name: "",
  username: "",
  email: "",
  client_name: "",
  recovery_authenticator_enabled: false,
  authenticator_devices: [],
};

function normalizeAccountProfile(profile: AccountProfile): AccountProfile {
  return {
    ...profile,
    authenticator_devices: profile.authenticator_devices || [],
  };
}

function getPasswordStrengthLabel(password: string) {
  if (!password) {
    return null;
  }

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) {
    return {
      label: "Weak",
      classes:
        "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300",
    };
  }

  if (score <= 4) {
    return {
      label: "Medium",
      classes:
        "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    };
  }

  return {
    label: "Strong",
    classes:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  };
}

export default function AccountPage() {
  const { colorScheme, setColorScheme } = useTheme();
  const [profile, setProfile] = useState<AccountProfile>(emptyProfile);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
  });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [passwordStep, setPasswordStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(true);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [verifyingCurrentPassword, setVerifyingCurrentPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [authenticatorOtpAuthUrl, setAuthenticatorOtpAuthUrl] = useState("");
  const [authenticatorQrCodeDataUrl, setAuthenticatorQrCodeDataUrl] = useState("");
  const [authenticatorOtp, setAuthenticatorOtp] = useState("");
  const [authenticatorDeviceId, setAuthenticatorDeviceId] = useState<number | null>(null);
  const [authenticatorDeviceName, setAuthenticatorDeviceName] = useState("");
  const [authenticatorCurrentPassword, setAuthenticatorCurrentPassword] = useState("");
  const [startingAuthenticatorSetup, setStartingAuthenticatorSetup] = useState(false);
  const [verifyingAuthenticator, setVerifyingAuthenticator] = useState(false);
  const [deviceToRemove, setDeviceToRemove] = useState<AuthenticatorDevice | null>(null);
  const [removeAuthenticatorPassword, setRemoveAuthenticatorPassword] = useState("");
  const [removingAuthenticator, setRemovingAuthenticator] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadAccount() {
      try {
        const res = await fetch("/api/account/", {
          credentials: "include",
        });
        const data: AccountResponse = await res.json();

        if (!active) {
          return;
        }

        if (!res.ok) {
          throw new Error(data.error || "Failed to load account details.");
        }

        setProfile(normalizeAccountProfile(data.profile));
        setForm({
          first_name: data.profile.first_name,
          last_name: data.profile.last_name,
          email: data.profile.email,
        });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to load account details."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadAccount();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function generateQrCode() {
      if (!authenticatorOtpAuthUrl) {
        setAuthenticatorQrCodeDataUrl("");
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(authenticatorOtpAuthUrl, {
          width: 220,
          margin: 1,
          errorCorrectionLevel: "M",
        });

        if (active) {
          setAuthenticatorQrCodeDataUrl(dataUrl);
        }
      } catch {
        if (active) {
          setAuthenticatorQrCodeDataUrl("");
          toast.error("Unable to render authenticator QR code.");
        }
      }
    }

    void generateQrCode();

    return () => {
      active = false;
    };
  }, [authenticatorOtpAuthUrl]);

  const passwordStrength = useMemo(
    () => getPasswordStrengthLabel(passwordForm.new_password),
    [passwordForm.new_password]
  );

  const handleProfileChange = (field: keyof typeof form, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handlePasswordChange = (
    field: keyof typeof passwordForm,
    value: string
  ) => {
    setPasswordForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleConfirmProfileSave = async () => {
    try {
      setSavingProfile(true);

      const res = await fetch("/api/account/", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken(),
        },
        credentials: "include",
        body: JSON.stringify({
          ...form,
          current_password: confirmPassword,
        }),
      });
      const data: AccountResponse = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update account details.");
      }

      setProfile(normalizeAccountProfile(data.profile));
      setForm({
        first_name: data.profile.first_name,
        last_name: data.profile.last_name,
        email: data.profile.email,
      });
      setConfirmPassword("");
      setSaveModalOpen(false);
      window.dispatchEvent(
        new CustomEvent("account-profile-updated", {
          detail: {
            display_name: data.profile.display_name,
            email: data.profile.email,
          },
        })
      );
      toast.success(data.message || "Account details updated.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update account details."
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleVerifyCurrentPassword = async () => {
    try {
      setVerifyingCurrentPassword(true);

      const res = await fetch("/api/account/password/verify/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken(),
        },
        credentials: "include",
        body: JSON.stringify({
          current_password: passwordForm.current_password,
        }),
      });
      const data: PasswordResponse = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Current password is incorrect.");
      }

      setPasswordStep(2);
      toast.success(data.message || "Current password verified.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Current password is incorrect."
      );
    } finally {
      setVerifyingCurrentPassword(false);
    }
  };

  const handleProceedToConfirmation = () => {
    if (!passwordForm.new_password) {
      toast.error("Enter a new password first.");
      return;
    }

    if (passwordForm.new_password.length < 8) {
      toast.error("New password must be at least 8 characters long.");
      return;
    }

    if (passwordForm.new_password === passwordForm.current_password) {
      toast.error("New password must be different from the current password.");
      return;
    }

    setPasswordStep(3);
  };

  const handleSavePassword = async () => {
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error("New password and confirmation do not match.");
      return;
    }

    try {
      setSavingPassword(true);

      const res = await fetch("/api/account/password/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken(),
        },
        credentials: "include",
        body: JSON.stringify(passwordForm),
      });
      const data: PasswordResponse = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update password.");
      }

      setPasswordForm({
        current_password: "",
        new_password: "",
        confirm_password: "",
      });
      setPasswordStep(1);
      toast.success(data.message || "Password updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update password.");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleStartAuthenticatorSetup = async () => {
    if (!authenticatorDeviceName.trim()) {
      toast.error("Enter a name for this authenticator.");
      return;
    }

    if (!authenticatorCurrentPassword) {
      toast.error("Enter your current password to continue.");
      return;
    }

    try {
      setStartingAuthenticatorSetup(true);

      const res = await fetch("/api/account/recovery-authenticator/setup/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken(),
        },
        credentials: "include",
        body: JSON.stringify({
          name: authenticatorDeviceName.trim(),
          current_password: authenticatorCurrentPassword,
        }),
      });
      const data: AuthenticatorSetupResponse = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to start authenticator setup.");
      }

      setAuthenticatorOtpAuthUrl(data.otpauth_url || "");
      setAuthenticatorDeviceId(data.device_id || null);
      setAuthenticatorOtp("");
      setAuthenticatorCurrentPassword("");
      toast.success(data.message || "Authenticator setup started.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start authenticator setup."
      );
    } finally {
      setStartingAuthenticatorSetup(false);
    }
  };

  const handleVerifyAuthenticator = async () => {
    try {
      setVerifyingAuthenticator(true);

      const res = await fetch("/api/account/recovery-authenticator/verify/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken(),
        },
        credentials: "include",
        body: JSON.stringify({
          device_id: authenticatorDeviceId,
          otp: authenticatorOtp,
        }),
      });
      const data: AuthenticatorMutationResponse = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to verify authenticator.");
      }

      if (data.profile) {
        setProfile(normalizeAccountProfile(data.profile));
      }
      setAuthenticatorOtpAuthUrl("");
      setAuthenticatorQrCodeDataUrl("");
      setAuthenticatorOtp("");
      setAuthenticatorDeviceId(null);
      setAuthenticatorDeviceName("");
      toast.success(data.message || "Authenticator added.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to verify authenticator."
      );
    } finally {
      setVerifyingAuthenticator(false);
    }
  };

  const handleCancelAuthenticatorSetup = () => {
    setAuthenticatorOtpAuthUrl("");
    setAuthenticatorQrCodeDataUrl("");
    setAuthenticatorOtp("");
    setAuthenticatorDeviceId(null);
  };

  const handleRemoveAuthenticator = async () => {
    if (!deviceToRemove || !removeAuthenticatorPassword) {
      return;
    }

    try {
      setRemovingAuthenticator(true);
      const res = await fetch(
        `/api/account/recovery-authenticator/devices/${deviceToRemove.id}/`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCsrfToken(),
          },
          credentials: "include",
          body: JSON.stringify({ current_password: removeAuthenticatorPassword }),
        }
      );
      const data: AuthenticatorMutationResponse = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to remove authenticator.");
      }

      if (data.profile) {
        setProfile(normalizeAccountProfile(data.profile));
      }
      setDeviceToRemove(null);
      setRemoveAuthenticatorPassword("");
      toast.success(data.message || "Authenticator removed.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to remove authenticator."
      );
    } finally {
      setRemovingAuthenticator(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
      <SpinnerCustom />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6 p-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 md:p-8">
        <Card className="overflow-hidden rounded-3xl border-border/45 bg-card/92 dark:border-white/8">
          <CardContent className="flex flex-col gap-6 p-6 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <UserRound className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">{profile.display_name}</h2>
                <p className="text-sm text-muted-foreground">{profile.email}</p>
              </div>
            </div>

            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3 dark:border-white/10">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <Fingerprint className="h-3.5 w-3.5 text-primary" />
                  Username
                </div>
                <p className="mt-1 font-medium">{profile.username}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3 dark:border-white/10">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 text-primary" />
                  Client
                </div>
                <p className="mt-1 font-medium">{profile.client_name}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/45 bg-card/92 dark:border-white/8">
          <CardHeader className="pb-4">
            <div className="flex items-start gap-3">
              <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Palette className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-xl">Personalize</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Choose a color scheme for both light and dark mode. Your selection is saved in this browser.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {COLOR_SCHEME_OPTIONS.map((option) => {
                const isSelected = colorScheme === option.id;

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setColorScheme(option.id)}
                    aria-pressed={isSelected}
                    className={cn(
                      "rounded-2xl border bg-background/65 p-4 text-left transition-colors hover:bg-accent/45 dark:border-white/10",
                      isSelected
                        ? "border-primary ring-2 ring-primary/15"
                        : "border-border/70"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{option.name}</span>
                      {isSelected ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      ) : null}
                    </div>
                    <div className="mt-4 flex items-center gap-2" aria-hidden="true">
                      {option.swatches.map((swatch) => (
                        <span
                          key={swatch}
                          className="h-6 flex-1 rounded-full border border-black/10 shadow-sm dark:border-white/10"
                          style={{ backgroundColor: swatch }}
                        />
                      ))}
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.9fr]">
          <Card className="rounded-3xl border-border/45 bg-card/92 dark:border-white/8">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="first-name">First Name</Label>
                  <Input
                    id="first-name"
                    value={form.first_name}
                    onChange={(event) =>
                      handleProfileChange("first_name", event.target.value)
                    }
                    placeholder="First name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last-name">Last Name</Label>
                  <Input
                    id="last-name"
                    value={form.last_name}
                    onChange={(event) =>
                      handleProfileChange("last_name", event.target.value)
                    }
                    placeholder="Last name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(event) => handleProfileChange("email", event.target.value)}
                  placeholder="name@example.com"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => setSaveModalOpen(true)}
                  disabled={savingProfile}
                  className="min-w-[144px]"
                >
                  {savingProfile ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-border/45 bg-card/92 dark:border-white/8">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <CardTitle className="text-xl">Security</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-2">
                {[1, 2, 3].map((step) => {
                  const isActive = step === passwordStep;
                  const isDone = step < passwordStep;

                  return (
                    <div key={step} className="flex flex-1 items-center gap-2">
                      <div
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                          isDone
                            ? "border-primary bg-primary text-primary-foreground"
                            : isActive
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border text-muted-foreground dark:border-white/10"
                        )}
                      >
                        {isDone ? <CheckCircle2 className="h-4 w-4" /> : step}
                      </div>
                      {step < 3 && (
                        <div className="h-px flex-1 bg-border" />
                      )}
                    </div>
                  );
                })}
              </div>

              {passwordStep === 1 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="current-password">Current Password</Label>
                    <PasswordInput
                      id="current-password"
                      value={passwordForm.current_password}
                      onChange={(event) =>
                        handlePasswordChange("current_password", event.target.value)
                      }
                      placeholder="Enter current password"
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={() => void handleVerifyCurrentPassword()}
                      disabled={
                        verifyingCurrentPassword || !passwordForm.current_password.trim()
                      }
                      className="min-w-[150px]"
                    >
                      {verifyingCurrentPassword ? "Checking..." : "Verify Password"}
                    </Button>
                  </div>
                </div>
              )}

              {passwordStep === 2 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <PasswordInput
                      id="new-password"
                      value={passwordForm.new_password}
                      onChange={(event) =>
                        handlePasswordChange("new_password", event.target.value)
                      }
                      placeholder="Choose a new password"
                    />
                  </div>

                  {passwordStrength ? (
                    <div
                      className={cn(
                        "inline-flex rounded-full border px-3 py-1 text-xs font-medium",
                        passwordStrength.classes
                      )}
                    >
                      {passwordStrength.label}
                    </div>
                  ) : null}

                  <div className="flex justify-between gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPasswordStep(1)}
                      className="dark:border-white/10"
                    >
                      Back
                    </Button>
                    <Button type="button" onClick={handleProceedToConfirmation}>
                      Continue
                    </Button>
                  </div>
                </div>
              )}

              {passwordStep === 3 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm New Password</Label>
                    <PasswordInput
                      id="confirm-password"
                      value={passwordForm.confirm_password}
                      onChange={(event) =>
                        handlePasswordChange("confirm_password", event.target.value)
                      }
                      placeholder="Re-enter new password"
                    />
                  </div>

                  <div className="flex justify-between gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPasswordStep(2)}
                      className="dark:border-white/10"
                    >
                      Back
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void handleSavePassword()}
                      disabled={savingPassword || !passwordForm.confirm_password.trim()}
                    >
                      {savingPassword ? "Updating..." : "Update Password"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-3xl border-border/45 bg-card/92 dark:border-white/8">
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-xl">Multi-factor Authentication</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add a separate authenticator for each authorized person or device.
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-sm text-muted-foreground">
                {profile.authenticator_devices.length}/10
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {profile.authenticator_devices.length > 0 ? (
              <div className="divide-y divide-border rounded-xl border border-border/70 dark:border-white/10">
                {profile.authenticator_devices.map((device) => (
                  <div
                    key={device.id}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{device.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {device.last_used_at
                          ? `Last used ${new Date(device.last_used_at).toLocaleString()}`
                          : `Added ${new Date(device.created_at).toLocaleDateString()}`}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeviceToRemove(device)}
                      aria-label={`Remove ${device.name}`}
                      title={`Remove ${device.name}`}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
                No authenticator devices are registered yet.
              </p>
            )}

            {!authenticatorOtpAuthUrl ? (
              <div className="grid gap-4 border-t border-border/60 pt-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="authenticator-device-name">Device name</Label>
                  <Input
                    id="authenticator-device-name"
                    value={authenticatorDeviceName}
                    onChange={(event) => setAuthenticatorDeviceName(event.target.value)}
                    placeholder="e.g. Operations phone"
                    maxLength={100}
                    disabled={startingAuthenticatorSetup}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="authenticator-current-password">Current Password</Label>
                  <PasswordInput
                    id="authenticator-current-password"
                    value={authenticatorCurrentPassword}
                    onChange={(event) => setAuthenticatorCurrentPassword(event.target.value)}
                    placeholder="Confirm your password"
                    autoComplete="current-password"
                    disabled={startingAuthenticatorSetup}
                  />
                </div>

                <div className="flex justify-end sm:col-span-2">
                  <Button
                    type="button"
                    onClick={() => void handleStartAuthenticatorSetup()}
                    disabled={
                      startingAuthenticatorSetup ||
                      !authenticatorDeviceName.trim() ||
                      !authenticatorCurrentPassword ||
                      profile.authenticator_devices.length >= 10
                    }
                  >
                    <Plus className="h-4 w-4" />
                    {startingAuthenticatorSetup ? "Preparing..." : "Add authenticator"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 rounded-2xl border border-border/70 bg-background/60 p-4 dark:border-white/10">
                <div className="flex justify-center">
                  <div className="rounded-2xl border border-border/70 bg-white p-4 shadow-sm dark:border-white/10">
                    {authenticatorQrCodeDataUrl ? (
                      <img
                        src={authenticatorQrCodeDataUrl}
                        alt="Google Authenticator setup QR code"
                        className="h-[220px] w-[220px]"
                      />
                    ) : (
                      <div className="flex h-[220px] w-[220px] items-center justify-center">
                        <SpinnerCustom />
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="authenticator-otp">
                    Enter the 6-digit code to finish setup
                  </Label>
                  <InputOTP
                    id="authenticator-otp"
                    maxLength={6}
                    value={authenticatorOtp}
                    onChange={(value) => setAuthenticatorOtp(value)}
                    pattern="^[0-9]+$"
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <div className="flex justify-between gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancelAuthenticatorSetup}
                    disabled={verifyingAuthenticator}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleVerifyAuthenticator()}
                    disabled={verifyingAuthenticator || authenticatorOtp.trim().length !== 6}
                  >
                    {verifyingAuthenticator ? "Verifying..." : "Verify and add"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={Boolean(deviceToRemove)}
        onOpenChange={(open) => {
          if (!open) {
            setDeviceToRemove(null);
            setRemoveAuthenticatorPassword("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove authenticator</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Confirm your password to remove {deviceToRemove?.name}.
          </p>
          <div className="space-y-2">
            <Label htmlFor="remove-authenticator-password">Current password</Label>
            <PasswordInput
              id="remove-authenticator-password"
              value={removeAuthenticatorPassword}
              onChange={(event) => setRemoveAuthenticatorPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeviceToRemove(null)}
              disabled={removingAuthenticator}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleRemoveAuthenticator()}
              disabled={removingAuthenticator || !removeAuthenticatorPassword}
            >
              {removingAuthenticator ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={saveModalOpen} onOpenChange={setSaveModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Changes</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="confirm-profile-password">Current Password</Label>
            <PasswordInput
              id="confirm-profile-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Current password"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSaveModalOpen(false);
                setConfirmPassword("");
              }}
              className="dark:border-white/10"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleConfirmProfileSave()}
              disabled={savingProfile || !confirmPassword.trim()}
              className="min-w-[150px]"
            >
              {savingProfile ? (
                <span className="inline-flex items-center gap-2">
                  Saving <ArrowRight className="h-4 w-4 animate-pulse" />
                </span>
              ) : (
                "Confirm & Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
