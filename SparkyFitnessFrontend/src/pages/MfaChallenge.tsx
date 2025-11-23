import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, QrCode, KeyRound, Loader2 } from "lucide-react";
import { apiCall } from '@/services/api';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface MfaChallengeProps {
    userId: string;
    email: string;
    mfaTotpEnabled: boolean;
    mfaEmailEnabled: boolean;
    needsMfaSetup: boolean;
    mfaToken?: string;
    onMfaSuccess: () => void;
    onMfaCancel: () => void; // Callback to return to login or cancel MFA flow
}

const MfaChallenge: React.FC<MfaChallengeProps> = ({
    userId,
    email,
    mfaTotpEnabled,
    mfaEmailEnabled,
    needsMfaSetup,
    mfaToken,
    onMfaSuccess,
    onMfaCancel
}) => {
    const { t } = useTranslation();
    const { signIn } = useAuth();

    const [loading, setLoading] = useState(false);
    const [totpCode, setTotpCode] = useState("");
    const [emailOtpCode, setEmailOtpCode] = useState("");
    const [recoveryCode, setRecoveryCode] = useState("");
    const [emailCodeSent, setEmailCodeSent] = useState(false);
    const [activeTab, setActiveTab] = useState(mfaTotpEnabled ? "totp" : (mfaEmailEnabled ? "email" : "recovery"));

    useEffect(() => {
        // If critical props are missing, trigger onMfaCancel
        if (!userId || !email) {
            toast({
                title: t('mfaChallenge.error.missingInfo', 'Error'),
                description: t('mfaChallenge.error.missingAuthInfo', 'Missing authentication information. Please try logging in again.'),
                variant: 'destructive',
            });
            onMfaCancel();
        }
    }, [userId, email, onMfaCancel, t]);

    const handleVerifyTotp = async () => {
        setLoading(true);
        try {
            const response = await apiCall('/auth/mfa/verify/totp', {
                method: 'POST',
                body: JSON.stringify({ userId, code: totpCode }),
                headers: mfaToken ? { 'X-MFA-Token': mfaToken } : {},
            });
            if (response.token && response.userId && response.role) {
                signIn(response.userId, email || '', response.role, 'password');
                onMfaSuccess();
            } else {
                toast({
                    title: t('mfaChallenge.error.verificationFailed', 'Verification Failed'),
                    description: t('mfaChallenge.error.totpInvalid', 'Invalid TOTP code. Please try again.'),
                    variant: 'destructive',
                });
            }
        } catch (error: any) {
            console.error('Error verifying TOTP:', error);
            toast({
                title: t('mfaChallenge.error.verificationFailed', 'Verification Failed'),
                description: error.message || t('mfaChallenge.error.totpGeneric', 'Failed to verify TOTP code.'),
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleSendEmailCode = async () => {
        setLoading(true);
        try {
            await apiCall('/auth/mfa/request-email-code', {
                method: 'POST',
                body: JSON.stringify({ userId }),
                headers: mfaToken ? { 'X-MFA-Token': mfaToken } : {},
            });
            setEmailCodeSent(true);
            toast({
                title: t('mfaChallenge.success.emailCodeSent', 'Email Code Sent'),
                description: t('mfaChallenge.success.checkEmail', 'A verification code has been sent to your email.'),
            });
        } catch (error: any) {
            console.error('Error requesting email code:', error);
            toast({
                title: t('mfaChallenge.error.requestFailed', 'Request Failed'),
                description: error.message || t('mfaChallenge.error.emailCodeGeneric', 'Failed to send email verification code.'),
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyEmailCode = async () => {
        setLoading(true);
        try {
            const response = await apiCall('/auth/mfa/verify-email-code', {
                method: 'POST',
                body: { userId, code: emailOtpCode },
                headers: mfaToken ? { 'X-MFA-Token': mfaToken } : {},
            });
            if (response.token && response.userId && response.role) {
                signIn(response.userId, email || '', response.role, 'password');
                onMfaSuccess();
            } else {
                toast({
                    title: t('mfaChallenge.error.verificationFailed', 'Verification Failed'),
                    description: t('mfaChallenge.error.emailCodeInvalid', 'Invalid email code. Please try again.'),
                    variant: 'destructive',
                });
            }
        } catch (error: any) {
            console.error('Error verifying email code:', error);
            toast({
                title: t('mfaChallenge.error.verificationFailed', 'Verification Failed'),
                description: error.message || t('mfaChallenge.error.emailCodeGeneric', 'Failed to verify email code.'),
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyRecoveryCode = async () => {
        setLoading(true);
        try {
            const response = await apiCall('/auth/mfa/verify-recovery-code', {
                method: 'POST',
                body: JSON.stringify({ userId, code: recoveryCode }),
                headers: mfaToken ? { 'X-MFA-Token': mfaToken } : {},
            });
            if (response.token && response.userId && response.role) {
                signIn(response.userId, email || '', response.role, 'password');
                onMfaSuccess();
            } else {
                toast({
                    title: t('mfaChallenge.error.verificationFailed', 'Verification Failed'),
                    description: t('mfaChallenge.error.recoveryCodeInvalid', 'Invalid recovery code. Please try again.'),
                    variant: 'destructive',
                });
            }
        } catch (error: any) {
            console.error('Error verifying recovery code:', error);
            toast({
                title: t('mfaChallenge.error.verificationFailed', 'Verification Failed'),
                description: error.message || t('mfaChallenge.error.recoveryCodeGeneric', 'Failed to verify recovery code.'),
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    // The entire card and its content are returned here
    return (
        <Card className="w-[400px]">
            <CardHeader>
                <CardTitle>{t('mfaChallenge.challengeTitle', 'MFA Challenge')}</CardTitle>
                <CardDescription>
                    {needsMfaSetup ? t('mfaChallenge.setupRequired', 'MFA setup is required for your account. Please complete the setup.') : t('mfaChallenge.verifyLogin', 'Please verify your login using one of your Multi-Factor Authentication methods.')}
                </CardDescription>
                <p className="text-sm text-muted-foreground mt-2">{t('mfaChallenge.loggedInAs', 'Logged in as:')} <strong>{email}</strong></p>
            </CardHeader>
            <CardContent className="space-y-4">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        {mfaTotpEnabled && (
                            <TabsTrigger value="totp" disabled={needsMfaSetup}>
                                <QrCode className="h-4 w-4 mr-2" /> {t('mfaChallenge.totpTab', 'App Code')}
                            </TabsTrigger>
                        )}
                        {mfaEmailEnabled && (
                            <TabsTrigger value="email" disabled={needsMfaSetup}>
                                <Mail className="h-4 w-4 mr-2" /> {t('mfaChallenge.emailTab', 'Email Code')}
                            </TabsTrigger>
                        )}
                        <TabsTrigger value="recovery" className={needsMfaSetup ? "col-span-3" : ""}>
                            <KeyRound className="h-4 w-4 mr-2" /> {t('mfaChallenge.recoveryTab', 'Recovery Code')}
                        </TabsTrigger>
                    </TabsList>
                    {mfaTotpEnabled && (
                        <TabsContent value="totp" className="space-y-4 pt-4">
                            <Label htmlFor="totp-code">{t('mfaChallenge.totpCodeLabel', 'Authenticator App Code')}</Label>
                            <Input
                                id="totp-code"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={totpCode}
                                onChange={(e) => setTotpCode(e.target.value)}
                                placeholder={t('mfaChallenge.enterAppCode', 'Enter code from authenticator app')}
                                maxLength={6}
                            />
                            <Button onClick={handleVerifyTotp} disabled={loading || totpCode.length !== 6} className="w-full">
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {t('mfaChallenge.verify', 'Verify')}
                            </Button>
                        </TabsContent>
                    )}
                    {mfaEmailEnabled && (
                        <TabsContent value="email" className="space-y-4 pt-4">
                            <Label htmlFor="email-code">{t('mfaChallenge.emailCodeLabel', 'Email Verification Code')}</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="email-code"
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={emailOtpCode}
                                    onChange={(e) => setEmailOtpCode(e.target.value)}
                                    placeholder={t('mfaChallenge.enterEmailCode', 'Enter code from email')}
                                    maxLength={6}
                                />
                                <Button onClick={handleSendEmailCode} disabled={loading || emailCodeSent}>
                                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    {t('mfaChallenge.sendCode', 'Send Code')}
                                </Button>
                            </div>
                            <Button onClick={handleVerifyEmailCode} disabled={loading || emailOtpCode.length !== 6} className="w-full">
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {t('mfaChallenge.verify', 'Verify')}
                            </Button>
                        </TabsContent>
                    )}
                    <TabsContent value="recovery" className="space-y-4 pt-4">
                        <Label htmlFor="recovery-code">{t('mfaChallenge.recoveryCodeLabel', 'Recovery Code')}</Label>
                        <Input
                            id="recovery-code"
                            type="text"
                            value={recoveryCode}
                            onChange={(e) => setRecoveryCode(e.target.value)}
                            placeholder={t('mfaChallenge.enterRecoveryCode', 'Enter recovery code')}
                        />
                        <Button onClick={handleVerifyRecoveryCode} disabled={loading || recoveryCode.length === 0} className="w-full">
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {t('mfaChallenge.verifyRecovery', 'Verify Recovery Code')}
                        </Button>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
};

export default MfaChallenge;