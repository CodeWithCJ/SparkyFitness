import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, EyeOff, Copy, RefreshCw, QrCode, Mail, Lock } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { log } from "@/utils/logging";
import { usePreferences } from "@/contexts/PreferencesContext";
import QRCode from "react-qr-code";

interface MFASettingsProps {
    // No props needed for now
}

const MFASettings: React.FC<MFASettingsProps> = () => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const { loggingLevel } = usePreferences();
    const [loading, setLoading] = useState(false);
    const { data: session, isPending: sessionLoading, refetch } = authClient.useSession();

    const [totpEnabled, setTotpEnabled] = useState(false);
    const [emailMfaEnabled, setEmailMfaEnabled] = useState(false);
    const [otpAuthUrl, setOtpAuthUrl] = useState<string | null>(null);
    const [totpCode, setTotpCode] = useState("");
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
    const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
    const [pendingAction, setPendingAction] = useState<'enableTotp' | 'disableTotp' | 'enableEmail' | 'disableEmail' | 'generateBackup' | null>(null);

    useEffect(() => {
        if (session?.user) {
            console.log("DEBUG: Session User:", session.user);
            setTotpEnabled(!!session.user.twoFactorEnabled);
            // Better Auth doesn't store email_mfa_enabled natively in user object by default,
            // but we added it to the table. We might need a separate fetch or custom user field.
            // For now, let's assume it's available via session or a small custom fetch.
            setEmailMfaEnabled(!!(session.user as any).mfaEmailEnabled);
        }
    }, [session]);

    const handlePasswordAction = async () => {
        if (!confirmPassword) {
            toast({ title: "Error", description: "Password is required.", variant: "destructive" });
            return;
        }

        setLoading(true);
        try {
            switch (pendingAction) {
                case 'enableTotp':
                    const enableRes = await authClient.twoFactor.enable({ password: confirmPassword });
                    if (enableRes.error) throw enableRes.error;
                    setOtpAuthUrl(enableRes.data.totpURI);
                    setRecoveryCodes(enableRes.data.backupCodes);
                    toast({ title: "Success", description: "Scan QR code to verify." });
                    await refetch();
                    break;
                case 'disableTotp':
                    const disableRes = await authClient.twoFactor.disable({ password: confirmPassword });
                    if (disableRes.error) throw disableRes.error;
                    toast({ title: "Success", description: "TOTP disabled." });
                    await refetch();
                    break;
                case 'generateBackup':
                    const backupRes = await authClient.twoFactor.generateBackupCodes({ password: confirmPassword });
                    if (backupRes.error) throw backupRes.error;
                    setRecoveryCodes(backupRes.data.backupCodes);
                    setShowRecoveryCodes(true);
                    toast({ title: "Success", description: "Backup codes generated." });
                    await refetch();
                    break;
                // Custom Email MFA still needs an endpoint or we adapt Better Auth OTP
            }
            setShowPasswordPrompt(false);
            setConfirmPassword(""); // Clear password after use
            setPendingAction(null);
        } catch (error: any) {
            log(loggingLevel, "ERROR", "MFA Action Error:", error);
            toast({ title: "Error", description: error.message || "Failed to perform action", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyTotp = async () => {
        setLoading(true);
        try {
            const { error } = await authClient.twoFactor.verifyTotp({ code: totpCode });
            if (error) throw error;

            toast({ title: "Success", description: "TOTP verified and enabled!" });
            await refetch();
            setOtpAuthUrl(null); // Clear OTP URL after successful verification
            setTotpCode(""); // Clear TOTP code after successful verification
        } catch (error: any) {
            log(loggingLevel, "ERROR", "Error verifying TOTP:", error);
            toast({ title: "Error", description: `Failed to verify TOTP: ${error.message}`, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const handleEnableEmailMfa = async () => {
        setLoading(true);
        try {
            const response = await fetch("/api/identity/mfa/email-toggle", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: true }),
            });
            if (!response.ok) throw new Error("Failed to enable Email MFA");

            toast({ title: "Success", description: "Email MFA enabled!" });
            // Refresh session to pick up changes - force bypass of local fetch cache
            await refetch();
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const handleDisableEmailMfa = async () => {
        setLoading(true);
        try {
            const response = await fetch("/api/identity/mfa/email-toggle", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: false }),
            });
            if (!response.ok) throw new Error("Failed to disable Email MFA");

            toast({ title: "Success", description: "Email MFA disabled." });
            // Refresh session to pick up changes - force bypass of local fetch cache
            await refetch();
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const copyRecoveryCodes = () => {
        navigator.clipboard.writeText(recoveryCodes.join('\n'));
        toast({ title: "Copied", description: "Recovery codes copied to clipboard." });
    };

    return (
        <div className="space-y-6">
            <h3 className="text-lg font-medium">{t('settings.mfa.title', 'Multi-Factor Authentication (MFA)')}</h3>

            {/* Password Confirmation Modal */}
            {showPasswordPrompt && (
                <Card className="border-primary">
                    <CardContent className="p-4 space-y-4">
                        <div className="flex items-center gap-2 text-primary font-medium">
                            <Lock className="h-4 w-4" />
                            <span>{t('settings.mfa.confirmPassword', 'Confirm Password to Continue')}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {t('settings.mfa.passwordRequired', 'Please enter your account password to modify security settings.')}
                        </p>
                        <div className="flex gap-2">
                            <Input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder={t('settings.mfa.enterPassword', 'Enter password')}
                                onKeyDown={(e) => e.key === 'Enter' && handlePasswordAction()}
                            />
                            <Button onClick={handlePasswordAction} disabled={loading}>
                                {t('common.confirm', 'Confirm')}
                            </Button>
                            <Button variant="ghost" onClick={() => {
                                setShowPasswordPrompt(false);
                                setPendingAction(null);
                                if (pendingAction === 'enableTotp') {
                                    setOtpAuthUrl(null); // Clear OTP URL if TOTP enablement was cancelled
                                }
                            }}>
                                {t('common.cancel', 'Cancel')}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* TOTP MFA Section */}
            <Card>
                <CardContent className="p-4 space-y-4">
                    <div className="flex justify-between items-center">
                        <Label>{t('settings.mfa.totp', 'Authenticator App (TOTP)')}</Label>
                        {totpEnabled ? (
                            <Button
                                variant="destructive"
                                onClick={() => { setPendingAction('disableTotp'); setShowPasswordPrompt(true); }}
                                disabled={loading || showPasswordPrompt}
                            >
                                {t('settings.mfa.disable', 'Disable')}
                            </Button>
                        ) : (
                            <Button
                                onClick={() => { setPendingAction('enableTotp'); setShowPasswordPrompt(true); }}
                                disabled={loading || showPasswordPrompt || otpAuthUrl !== null}
                            >
                                {t('settings.mfa.enable', 'Enable')}
                            </Button>
                        )}
                    </div>
                    {otpAuthUrl ? (
                        <div className="space-y-4 border-t pt-4">
                            <p className="text-sm text-muted-foreground">{t('settings.mfa.scanQr', 'Scan the QR code with your authenticator app and enter the generated code to verify.')}</p>
                            <div className="flex justify-center p-4 bg-white rounded-md">
                                <QRCode value={otpAuthUrl} size={128} level="H" />
                            </div>
                            <div>
                                <Label htmlFor="totp-code">{t('settings.mfa.verificationCode', 'Verification Code')}</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="totp-code"
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={totpCode}
                                        onChange={(e) => setTotpCode(e.target.value)}
                                        placeholder={t('settings.mfa.enterCode', 'Enter 6-digit code')}
                                        maxLength={6}
                                    />
                                    <Button onClick={handleVerifyTotp} disabled={loading || totpCode.length !== 6}>
                                        {t('settings.mfa.verify', 'Verify & Enable')}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : totpEnabled ? (
                        <p className="text-sm text-success">{t('settings.mfa.totpEnabled', 'Authenticator App is currently enabled.')}</p>
                    ) : (
                        <p className="text-sm text-muted-foreground">{t('settings.mfa.totpDisabled', 'Authenticator App is currently disabled.')}</p>
                    )}
                </CardContent>
            </Card>

            {/* Email MFA Section */}
            <Card>
                <CardContent className="p-4 space-y-4">
                    <div className="flex justify-between items-center">
                        <Label>{t('settings.mfa.emailCode', 'Email Code MFA')}</Label>
                        <div className="flex gap-2">
                            {emailMfaEnabled ? (
                                <Button variant="destructive" onClick={handleDisableEmailMfa} disabled={loading}>
                                    {t('settings.mfa.disable', 'Disable')}
                                </Button>
                            ) : (
                                <Button onClick={handleEnableEmailMfa} disabled={loading}>
                                    {t('settings.mfa.enable', 'Enable')}
                                </Button>
                            )}
                        </div>
                    </div>
                    {emailMfaEnabled ? (
                        <p className="text-sm text-success">{t('settings.mfa.emailEnabled', 'Email Code MFA is currently enabled.')}</p>
                    ) : (
                        <p className="text-sm text-muted-foreground">{t('settings.mfa.emailDisabled', 'Email Code MFA is currently disabled.')}</p>
                    )}
                </CardContent>
            </Card>

            <Separator />

            {/* Recovery Codes Section */}
            <h3 className="text-lg font-medium">{t('settings.mfa.recoveryCodesTitle', 'Recovery Codes')}</h3>
            <Card>
                <CardContent className="p-4 space-y-4">
                    <p className="text-sm text-muted-foreground">{t('settings.mfa.recoveryCodesInfo', 'Recovery codes can be used to access your account if you lose access to your primary MFA methods.')}</p>
                    <Button
                        onClick={() => { setPendingAction('generateBackup'); setShowPasswordPrompt(true); }}
                        disabled={loading || showPasswordPrompt}
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {t('settings.mfa.generateNewCodes', 'Generate New Recovery Codes')}
                    </Button>
                    {recoveryCodes.length > 0 && (
                        <div className="space-y-2 border-t pt-4">
                            <div className="flex items-center space-x-2">
                                <Label>{t('settings.mfa.yourRecoveryCodes', 'Your Recovery Codes')}</Label>
                                <Button variant="ghost" size="sm" onClick={() => setShowRecoveryCodes(!showRecoveryCodes)} className="h-auto p-1">
                                    {showRecoveryCodes ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={copyRecoveryCodes} className="h-auto p-1">
                                    <Copy className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="border rounded-md p-3 bg-muted font-mono text-sm">
                                {showRecoveryCodes ? (
                                    <div className="grid grid-cols-2 gap-1">
                                        {recoveryCodes.map((code, index) => <p key={index}>{code}</p>)}
                                    </div>
                                ) : (
                                    <p>********************</p>
                                )}
                            </div>
                            <p className="text-sm text-red-500 font-medium">{t('settings.mfa.saveCodesWarning', 'IMPORTANT: Save these codes in a safe place. They will not be shown again.')}</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default MFASettings;