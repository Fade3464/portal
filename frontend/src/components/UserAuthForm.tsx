import * as React from "react";
import { ArrowLeft, ArrowRight, KeyRound, LogIn, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
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

type LoginOptionsResponse = {
  status_code: number;
  email?: string;
  authenticator_enabled?: boolean;
  password_fallback_enabled?: boolean;
  error?: string;
};

type LoginResponse = {
  status_code: number;
  message?: string;
  login_method?: "otp" | "password";
  user?: {
    recovery_authenticator_enabled?: boolean;
  };
  error?: string;
};

type ForgotPasswordResponse = {
  status_code: number;
  message?: string;
  reset_token?: string;
  error?: string;
};

type LoginStep = "email" | "otp" | "password";

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
    return { label: "Weak", classes: "text-red-500" };
  }

  if (score <= 4) {
    return { label: "Medium", classes: "text-amber-500" };
  }

  return { label: "Strong", classes: "text-emerald-500" };
}

export function UserAuthForm({
  className,
  ...props
}: React.HTMLAttributes<HTMLFormElement>) {
  const [step, setStep] = React.useState<LoginStep>("email");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = React.useState(false);
  const [forgotPasswordStep, setForgotPasswordStep] = React.useState<1 | 2 | 3>(1);
  const [forgotPasswordLoading, setForgotPasswordLoading] = React.useState(false);
  const [forgotEmail, setForgotEmail] = React.useState("");
  const [forgotOtp, setForgotOtp] = React.useState("");
  const [resetToken, setResetToken] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmNewPassword, setConfirmNewPassword] = React.useState("");
  const navigate = useNavigate();

  const passwordStrength = React.useMemo(
    () => getPasswordStrengthLabel(newPassword),
    [newPassword]
  );

  async function ensureCsrf() {
    let csrfToken = getCsrfToken();

    if (!csrfToken) {
      await fetch("/api/csrf/", {
        credentials: "include",
      });
      csrfToken = getCsrfToken();
    }

    return csrfToken;
  }

  const resetLoginState = React.useCallback(() => {
    setStep("email");
    setPassword("");
    setOtp("");
    setErrorMessage(null);
  }, []);

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isLoading) {
      return;
    }

    if (step === "email") {
      await handleContinueWithEmail();
      return;
    }

    if (step === "otp" && otp.trim().length === 6) {
      await handleLogin("otp");
      return;
    }

    if (step === "password" && password.trim()) {
      await handleLogin("password");
    }
  };

  const handleContinueWithEmail = async () => {
    if (!email.trim()) {
      setErrorMessage("Please enter your email.");
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage(null);
      const csrfToken = await ensureCsrf();

      const res = await fetch("/api/login/options/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({
          email,
        }),
      });
      const result: LoginOptionsResponse = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Unable to continue.");
      }

      if (result.authenticator_enabled) {
        setStep("otp");
        setOtp("");
      } else {
        setStep("password");
        setPassword("");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to continue.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (method: "otp" | "password") => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const csrfToken = await ensureCsrf();

      const payload =
        method === "otp"
          ? {
              email,
              otp,
            }
          : {
              email,
              password,
            };

      const res = await fetch("/api/login/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const result: LoginResponse = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Login failed.");
      }

      if (
        method === "password" &&
        result.user?.recovery_authenticator_enabled === false
      ) {
        toast.info(
          "Enable Google Authenticator in Account to unlock faster sign-in and stronger recovery."
        );
      }

      toast.success(result.message || "Login successful!");
      navigate("/dashboard");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const resetForgotPasswordState = React.useCallback(() => {
    setForgotPasswordStep(1);
    setForgotPasswordLoading(false);
    setForgotEmail("");
    setForgotOtp("");
    setResetToken("");
    setNewPassword("");
    setConfirmNewPassword("");
  }, []);

  const handleForgotPasswordOpenChange = (nextOpen: boolean) => {
    setForgotPasswordOpen(nextOpen);
    if (!nextOpen) {
      resetForgotPasswordState();
    }
  };

  const handleForgotPasswordStart = async () => {
    try {
      setForgotPasswordLoading(true);
      const csrfToken = await ensureCsrf();

      const res = await fetch("/api/forgot-password/start/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({
          email: forgotEmail,
        }),
      });
      const result: ForgotPasswordResponse = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Unable to start password recovery.");
      }

      setForgotPasswordStep(2);
      toast.success(result.message || "Authenticator code requested.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to start password recovery."
      );
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleForgotPasswordVerify = async () => {
    try {
      setForgotPasswordLoading(true);
      const csrfToken = await ensureCsrf();

      const res = await fetch("/api/forgot-password/verify/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({
          email: forgotEmail,
          otp: forgotOtp,
        }),
      });
      const result: ForgotPasswordResponse = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Invalid authenticator code.");
      }

      setResetToken(result.reset_token || "");
      setForgotPasswordStep(3);
      toast.success(result.message || "Authenticator code verified.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Invalid authenticator code."
      );
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleForgotPasswordReset = async () => {
    if (newPassword !== confirmNewPassword) {
      toast.error("New password and confirmation do not match.");
      return;
    }

    try {
      setForgotPasswordLoading(true);
      const csrfToken = await ensureCsrf();

      const res = await fetch("/api/forgot-password/reset/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({
          reset_token: resetToken,
          new_password: newPassword,
          confirm_password: confirmNewPassword,
        }),
      });
      const result: ForgotPasswordResponse = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Unable to reset password.");
      }

      setEmail(forgotEmail);
      setForgotPasswordOpen(false);
      resetForgotPasswordState();
      resetLoginState();
      toast.success(result.message || "Password reset successful.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to reset password."
      );
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  return (
    <>
      <form
        className={cn("grid w-full max-w-sm gap-4", className)}
        onSubmit={(event) => void handleFormSubmit(event)}
        {...props}
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            placeholder="name@example.com"
            type="email"
            autoComplete="username"
            disabled={isLoading || step !== "email"}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        {step === "otp" ? (
          <div className="space-y-4 rounded-2xl border border-border/70 bg-background/50 p-4 dark:border-white/10">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">Authenticator</p>
                <p className="text-xs text-muted-foreground">{email}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="otp">6-digit code</Label>
              <InputOTP
                id="otp"
                maxLength={6}
                value={otp}
                onChange={(value) => setOtp(value)}
                disabled={isLoading}
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

            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                className="px-2"
                onClick={() => {
                  setStep("password");
                  setPassword("");
                  setErrorMessage(null);
                }}
                disabled={isLoading}
              >
                <KeyRound className="mr-2 h-4 w-4" />
                Use password
              </Button>

              <Button
                type="button"
                onClick={() => void handleLogin("otp")}
                disabled={isLoading || otp.trim().length !== 6}
              >
                {isLoading ? <SpinnerCustom /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                Continue
              </Button>
            </div>
          </div>
        ) : null}

        {step === "password" ? (
          <div className="space-y-4 rounded-2xl border border-border/70 bg-background/50 p-4 dark:border-white/10">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <KeyRound className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">Password</p>
                <p className="text-xs text-muted-foreground">{email}</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotPasswordOpen(true);
                    setForgotEmail(email);
                  }}
                  className="text-xs font-medium text-primary transition-opacity hover:opacity-80"
                >
                  Forgot password?
                </button>
              </div>
              <PasswordInput
                id="password"
                placeholder="********"
                autoComplete="current-password"
                disabled={isLoading}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                className="px-2"
                onClick={() => {
                  setStep("email");
                  setPassword("");
                  setErrorMessage(null);
                }}
                disabled={isLoading}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Change email
              </Button>

              <Button
                type="button"
                onClick={() => void handleLogin("password")}
                disabled={isLoading || !password.trim()}
              >
                {isLoading ? <SpinnerCustom /> : <LogIn className="mr-2 h-4 w-4" />}
                Sign in
              </Button>
            </div>
          </div>
        ) : null}

        {step === "email" ? (
          <Button
            type="button"
            className="mt-3 h-11 w-full font-medium"
            disabled={isLoading || !email.trim()}
            onClick={() => void handleContinueWithEmail()}
          >
            {isLoading ? <SpinnerCustom /> : <ArrowRight className="mr-2 h-4 w-4" />}
            Continue
          </Button>
        ) : null}

        {errorMessage ? (
          <p className="text-sm font-medium text-destructive">{errorMessage}</p>
        ) : null}
      </form>

      <Dialog open={forgotPasswordOpen} onOpenChange={handleForgotPasswordOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recover Account</DialogTitle>
          </DialogHeader>

          {forgotPasswordStep === 1 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Original Email</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  value={forgotEmail}
                  onChange={(event) => setForgotEmail(event.target.value)}
                  placeholder="name@example.com"
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => void handleForgotPasswordStart()}
                  disabled={forgotPasswordLoading || !forgotEmail.trim()}
                  className="min-w-[140px]"
                >
                  {forgotPasswordLoading ? "Checking..." : "Continue"}
                </Button>
              </DialogFooter>
            </div>
          ) : null}

          {forgotPasswordStep === 2 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-otp">Authenticator Code</Label>
                <InputOTP
                  id="forgot-otp"
                  maxLength={6}
                  value={forgotOtp}
                  onChange={(value) => setForgotOtp(value)}
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
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setForgotPasswordStep(1)}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleForgotPasswordVerify()}
                  disabled={forgotPasswordLoading || forgotOtp.trim().length !== 6}
                  className="min-w-[140px]"
                >
                  {forgotPasswordLoading ? "Verifying..." : "Verify Code"}
                </Button>
              </DialogFooter>
            </div>
          ) : null}

          {forgotPasswordStep === 3 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password-reset">New Password</Label>
                <PasswordInput
                  id="new-password-reset"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="Enter new password"
                />
              </div>

              {passwordStrength ? (
                <p className={cn("text-xs font-medium uppercase tracking-[0.18em]", passwordStrength.classes)}>
                  {passwordStrength.label}
                </p>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="confirm-password-reset">Confirm Password</Label>
                <PasswordInput
                  id="confirm-password-reset"
                  value={confirmNewPassword}
                  onChange={(event) => setConfirmNewPassword(event.target.value)}
                  placeholder="Confirm new password"
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setForgotPasswordStep(2)}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleForgotPasswordReset()}
                  disabled={
                    forgotPasswordLoading ||
                    !newPassword.trim() ||
                    !confirmNewPassword.trim()
                  }
                  className="min-w-[170px]"
                >
                  {forgotPasswordLoading ? (
                    <span className="inline-flex items-center gap-2">
                      Resetting <ArrowRight className="h-4 w-4 animate-pulse" />
                    </span>
                  ) : (
                    "Reset Password"
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
