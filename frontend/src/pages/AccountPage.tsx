import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Fingerprint, Mail, ShieldCheck, Smartphone, UserRound } from "lucide-react";
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
import { getCsrfToken } from "@/lib/csrf";
import { cn } from "@/lib/utils";

type AccountProfile = {
  first_name: string;
  last_name: string;
  display_name: string;
  username: string;
  email: string;
  client_name: string;
  recovery_authenticator_enabled: boolean;
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
  setup_key?: string;
  otpauth_url?: string;
  error?: string;
};

const emptyProfile: AccountProfile = {
  first_name: "",
  last_name: "",
  display_name: "",
  username: "",
  email: "",
  client_name: "",
  recovery_authenticator_enabled: false,
};

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
  const [startingAuthenticatorSetup, setStartingAuthenticatorSetup] = useState(false);
  const [verifyingAuthenticator, setVerifyingAuthenticator] = useState(false);

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

        setProfile(data.profile);
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

      setProfile(data.profile);
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
    try {
      setStartingAuthenticatorSetup(true);

      const res = await fetch("/api/account/recovery-authenticator/setup/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken(),
        },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data: AuthenticatorSetupResponse = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to start authenticator setup.");
      }

      setAuthenticatorOtpAuthUrl(data.otpauth_url || "");
      setAuthenticatorOtp("");
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
          otp: authenticatorOtp,
        }),
      });
      const data: PasswordResponse = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to verify authenticator.");
      }

      setProfile((current) => ({
        ...current,
        recovery_authenticator_enabled: true,
      }));
      setAuthenticatorOtpAuthUrl("");
      setAuthenticatorQrCodeDataUrl("");
      setAuthenticatorOtp("");
      toast.success(data.message || "Recovery authenticator enabled.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to verify authenticator."
      );
    } finally {
      setVerifyingAuthenticator(false);
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
                  <Fingerprint className="h-3.5 w-3.5" />
                  Username
                </div>
                <p className="mt-1 font-medium">{profile.username}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3 dark:border-white/10">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  Client
                </div>
                <p className="mt-1 font-medium">{profile.client_name}</p>
              </div>
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
                        <div className="h-px flex-1 bg-border dark:bg-white/10" />
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
            <div className="flex items-center gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Smartphone className="h-5 w-5" />
              </div>
              <CardTitle className="text-xl">Recovery Authenticator</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {profile.recovery_authenticator_enabled ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.08] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] dark:bg-black">
                <div className="flex items-center gap-4">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-700 dark:bg-white/8 dark:text-white">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div className="space-y-3">
                    <p className="text-2xl font-semibold tracking-tight text-foreground dark:text-white">
                      Recovery Authenticator
                    </p>
                    <div className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      Enabled
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                    Not enabled
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleStartAuthenticatorSetup()}
                    disabled={startingAuthenticatorSetup}
                    className="dark:border-white/10"
                  >
                    {startingAuthenticatorSetup ? "Preparing..." : "Set Up Authenticator"}
                  </Button>
                </div>

                {authenticatorOtpAuthUrl ? (
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

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3 dark:border-white/10">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Method
                    </p>
                    <p className="mt-2 font-medium">Google Authenticator</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3 dark:border-white/10">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Code
                    </p>
                    <p className="mt-2 font-medium">6 digits</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="authenticator-otp">Authenticator Code</Label>
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

                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={() => void handleVerifyAuthenticator()}
                    disabled={verifyingAuthenticator || authenticatorOtp.trim().length !== 6}
                  >
                    {verifyingAuthenticator ? "Verifying..." : "Verify & Enable"}
                  </Button>
                </div>
              </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>

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
