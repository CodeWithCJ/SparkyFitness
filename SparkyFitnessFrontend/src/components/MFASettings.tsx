import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, EyeOff, Copy, RefreshCw, QrCode, Mail } from "lucide-react";
import { apiCall } from '@/services/api';
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { log, UserLoggingLevel } from "@/utils/logging"; // Import the log utility and UserLoggingLevel
import { usePreferences } from "@/contexts/PreferencesContext"; // Import usePreferences
import QRCode from "react-qr-code"; // Make sure to install react-qr-code

interface MFASettingsProps {
    // No props needed for now
}

const MFASettings: React.FC<MFASettingsProps> = () => {
    const { t } = useTranslation();
        const { user } = useAuth();
        const { loggingLevel } = usePreferences(); // Get loggingLevel from preferences
        const [loading, setLoading] = useState(false);

    const [totpEnabled, setTotpEnabled] = useState(false);
    const [emailMfaEnabled, setEmailMfaEnabled] = useState(false);
    const [otpAuthUrl, setOtpAuthUrl] = useState<string | null>(null);
    const [totpCode, setTotpCode] = useState("");
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
    const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);

    useEffect(() => {
        if (user) {
            fetchMFAStatus();
        }
    }, [user]);

    const fetchMFAStatus = async () => {
        setLoading(true);
        try {
            const data = await apiCall('/auth/mfa/status', { method: 'GET' });
            log(loggingLevel, "DEBUG", "MFA Status from backend:", data);
            setTotpEnabled(data.totp_enabled);
            setEmailMfaEnabled(data.email_mfa_enabled);
        } catch (error: any) {
            log(loggingLevel, "ERROR", "Error fetching MFA status:", error);
            toast({
                title: "Error",
                description: `Failed to fetch MFA status: ${error.message}`,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    // TOTP MFA Actions
    const handleEnableTotp = async () => {
        setLoading(true);
        try {
            const data = await apiCall('/auth/mfa/setup/totp', {
                method: 'POST',
                body: JSON.stringify({ email: user?.email }),
            });
            log(loggingLevel, "DEBUG", "OTP Auth URL from backend:", data.otpauthUrl);
            setOtpAuthUrl(data.otpauthUrl);
            toast({
                title: "TOTP Setup",
                description: "Scan QR code and enter code to verify.",
            });
        } catch (error: any) {
            log(loggingLevel, "ERROR", "Error initiating TOTP setup:", error);
            toast({
                title: "Error",
                description: `Failed to initiate TOTP setup: ${error.message}`,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyTotp = async () => {
        setLoading(true);
        try {
          const response = await apiCall('/auth/mfa/enable/totp', {
            method: 'POST',
            body: JSON.stringify({ code: totpCode }),
          });
          log(loggingLevel, "DEBUG", "TOTP Enable response:", response);
          if (response && response.message) { // Check for a success message from the backend
            toast({
              title: "Success",
              description: response.message, // Use the success message from the backend
            });
            setTotpEnabled(true); // Assuming successful enablement
          } else {
            // Fallback for unexpected successful response structures
            toast({
              title: "Success",
              description: "TOTP MFA enabled successfully!",
            });
            setTotpEnabled(true);
          }
          setOtpAuthUrl(null);
          setTotpCode("");
          fetchMFAStatus();
        } catch (error: any) {
          log(loggingLevel, "ERROR", "Error verifying TOTP:", error);
          toast({
            title: "Error",
            description: `Failed to verify TOTP: ${error.message}`,
            variant: "destructive",
          });
        } finally {
          setLoading(false);
        }
    };

    const handleDisableTotp = async () => {
        if (!confirm(t('settings.mfa.totpDisableConfirm', 'Are you sure you want to disable Authenticator App (TOTP)?'))) {
            return;
        }
        setLoading(true);
        try {
            await apiCall('/auth/mfa/disable/totp', { method: 'POST' });
            toast({
                title: "Success",
                description: "TOTP MFA disabled successfully!",
            });
            fetchMFAStatus();
        } catch (error: any) {
            log(loggingLevel, "ERROR", "Error disabling TOTP:", error);
            toast({
                title: "Error",
                description: `Failed to disable TOTP: ${error.message}`,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    // Email MFA Actions
    const handleEnableEmailMfa = async () => {
        setLoading(true);
        try {
            await apiCall('/auth/mfa/enable/email', { method: 'POST' });
            toast({
                title: "Success",
                description: "Email MFA enabled successfully!",
            });
            fetchMFAStatus();
        } catch (error: any) {
            log(loggingLevel, "ERROR", "Error enabling Email MFA:", error);
            toast({
                title: "Error",
                description: `Failed to enable Email MFA: ${error.message}`,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleDisableEmailMfa = async () => {
        if (!confirm(t('settings.mfa.emailDisableConfirm', 'Are you sure you want to disable Email Code MFA?'))) {
            return;
        }
        setLoading(true);
        try {
            await apiCall('/auth/mfa/disable/email', { method: 'POST' });
            toast({
                title: "Success",
                description: "Email MFA disabled successfully!",
            });
            fetchMFAStatus();
        } catch (error: any) {
            log(loggingLevel, "ERROR", "Error disabling Email MFA:", error);
            toast({
                title: "Error",
                description: `Failed to disable Email MFA: ${error.message}`,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    // Recovery Code Actions
    const handleGenerateRecoveryCodes = async () => {
        if (!confirm(t('settings.mfa.recoveryCodeConfirm', 'Generating new recovery codes will invalidate your old ones. Are you sure?'))) {
            return;
        }
        setLoading(true);
        try {
            const data = await apiCall('/auth/mfa/recovery-codes', { method: 'POST' });
            setRecoveryCodes(data.recoveryCodes);
            setShowRecoveryCodes(true);
            toast({
                title: "Success",
                description: "New recovery codes generated!",
            });
        } catch (error: any) {
            log(loggingLevel, "ERROR", "Error generating recovery codes.", error);
            toast({
                title: "Error",
                description: `Failed to generate recovery codes: ${error.message}`,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const copyRecoveryCodes = () => {
        navigator.clipboard.writeText(recoveryCodes.join('\n'));
        toast({
            title: "Copied",
            description: "Recovery codes copied to clipboard.",
        });
    };

    return (
        <div className="space-y-6">
            <h3 className="text-lg font-medium">{t('settings.mfa.title', 'Multi-Factor Authentication (MFA)')}</h3>

            {/* TOTP MFA Section */}
            <Card>
                <CardContent className="p-4 space-y-4">
                    <div className="flex justify-between items-center">
                        <Label>{t('settings.mfa.totp', 'Authenticator App (TOTP)')}</Label>
                        {totpEnabled ? (
                            <Button variant="destructive" onClick={handleDisableTotp} disabled={loading}>
                                {t('settings.mfa.disable', 'Disable')}
                            </Button>
                        ) : (
                            <Button onClick={handleEnableTotp} disabled={loading}>
                                {t('settings.mfa.enable', 'Enable')}
                            </Button>
                        )}
                    </div>
                    {otpAuthUrl ? (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">{t('settings.mfa.scanQr', 'Scan the QR code with your authenticator app (e.g., Google Authenticator, Authy) and enter the generated code to verify.')}</p>
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
                                        placeholder={t('settings.mfa.enterCode', 'Enter code from app')}
                                        maxLength={6}
                                    />
                                    <Button onClick={handleVerifyTotp} disabled={loading || totpCode.length !== 6}>
                                        {t('settings.mfa.verify', 'Verify')}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : totpEnabled ? (
                        <p className="text-sm text-muted-foreground">{t('settings.mfa.totpEnabled', 'Authenticator App is currently enabled.')}</p>
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
                    {emailMfaEnabled ? (
                        <p className="text-sm text-muted-foreground">{t('settings.mfa.emailEnabled', 'Email Code MFA is currently enabled. You will receive a code via email to log in.')}</p>
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
                    <p className="text-sm text-muted-foreground">{t('settings.mfa.recoveryCodesInfo', 'Recovery codes can be used to access your account if you lose access to your primary MFA methods. Store them in a safe place.')}</p>
                    <Button onClick={handleGenerateRecoveryCodes} disabled={loading}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {t('settings.mfa.generateNewCodes', 'Generate New Recovery Codes')}
                    </Button>
                    {recoveryCodes.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                                <Label>{t('settings.mfa.yourRecoveryCodes', 'Your Recovery Codes')}</Label>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowRecoveryCodes(!showRecoveryCodes)}
                                    className="h-auto p-1"
                                >
                                    {showRecoveryCodes ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={copyRecoveryCodes}
                                    className="h-auto p-1"
                                >
                                    <Copy className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="border rounded-md p-3 bg-muted font-mono text-sm">
                                {showRecoveryCodes ? (
                                    recoveryCodes.map((code, index) => (
                                        <p key={index}>{code}</p>
                                    ))
                                ) : (
                                    <p>********************</p>
                                )}
                            </div>
                            <p className="text-sm text-red-500">{t('settings.mfa.saveCodesWarning', 'IMPORTANT: Save these codes in a safe place. They will not be shown again.')}</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default MFASettings;