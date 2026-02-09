import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { usePreferences } from "@/contexts/PreferencesContext";
import { debug, info, error } from "@/utils/logging";
import { resetPassword } from "@/services/authService";
import useToggle from "@/hooks/use-toggle";
import PasswordToggle from "@/components/PasswordToggle";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { loggingLevel } = usePreferences();
  debug(loggingLevel, "ResetPassword: Component rendered.");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const { isToggled: showPassword, toggleHandler: passwordToggleHandler } = useToggle();

  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) {
      setMessage("Invalid or missing password reset token.");
      toast({
        title: "Error",
        description: "Invalid or missing password reset token.",
        variant: "destructive",
      });
    }
  }, [token]);

  const validatePassword = (pwd: string) => {
    if (pwd.length < 6) {
      return "Password must be at least 6 characters long.";
    }
    if (!/[A-Z]/.test(pwd)) {
      return "Password must contain at least one uppercase letter.";
    }
    if (!/[a-z]/.test(pwd)) {
      return "Password must contain at least one lowercase letter.";
    }
    if (!/[0-9]/.test(pwd)) {
      return "Password must contain at least one number.";
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) {
      return "Password must contain at least one special character.";
    }
    return null; // No error
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    info(loggingLevel, "ResetPassword: Attempting to reset password.");
    setLoading(true);
    setMessage("");
    setPasswordError(null);

    if (!token) {
      setMessage("Invalid or missing password reset token.");
      setLoading(false);
      return;
    }

    const validationError = validatePassword(newPassword);
    if (validationError) {
      setPasswordError(validationError);
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      await resetPassword(token, newPassword);
      setMessage("Your password has been reset successfully. You can now sign in with your new password.");
      toast({
        title: "Success",
        description: "Password reset successfully!",
      });
      navigate("/"); // Redirect to root
    } catch (err: any) {
      error(loggingLevel, "ResetPassword: Password reset failed:", err);
      setMessage(err.message || "An unexpected error occurred.");
      toast({
        title: "Error",
        description: err.message || "Failed to reset password.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md dark:bg-gray-">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            <img
              src="/images/SparkyFitness.png"
              alt="SparkyFitness Logo"
              className="h-10 w-10 mr-2"
            />
            <CardTitle className="text-2xl font-bold text-gray-900 dark:text-gray-300">
              SparkyFitness
            </CardTitle>
          </div>
          <CardDescription>
            Set your new password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2 relative">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPasswordError(validatePassword(e.target.value));
                }}
                required
                autoComplete="new-password"
              />
              <PasswordToggle showPassword={showPassword} passwordToggleHandler={passwordToggleHandler} />
              {passwordError && (
                <p className="text-red-500 text-sm">{passwordError}</p>
              )}
            </div>
            <div className="space-y-2 relative">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              <PasswordToggle showPassword={showPassword} passwordToggleHandler={passwordToggleHandler} />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !!passwordError || newPassword !== confirmPassword}>
              {loading ? "Resetting..." : "Reset Password"}
            </Button>
            {message && (
              <p className="text-center text-sm text-muted-foreground">
                {message}
              </p>
            )}
            <div className="text-center text-sm">
              <a
                href="/"
                className="font-medium text-primary hover:underline"
              >
                Back to Sign In
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;