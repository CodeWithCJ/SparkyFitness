import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { apiCall } from '@/services/api';
import { useAuth } from "@/hooks/useAuth";
import TooltipWarning from './TooltipWarning';

interface GarminConnectSettingsProps {
  onStatusChange: () => void;
  initialClientState?: string | null;
  onMfaComplete?: () => void;
}

const GarminConnectSettings: React.FC<GarminConnectSettingsProps> = ({ onStatusChange, initialClientState, onMfaComplete }) => {
  const { user } = useAuth();
  const [garminEmail, setGarminEmail] = useState('');
  const [garminPassword, setGarminPassword] = useState('');
  const [garminMfaCode, setGarminMfaCode] = useState('');
  const [garminClientState, setGarminClientState] = useState<string | null>(initialClientState || null);
  const [showGarminMfaInput, setShowGarminMfaInput] = useState(!!initialClientState);
  const [garminData, setGarminData] = useState({ steps: null, weight: null });
  const [loading, setLoading] = useState(false);
  const [isGarminLinked, setIsGarminLinked] = useState(false);
  const [hasInitialGarminCheckRun, setHasInitialGarminCheckRun] = useState(false);
  const [garminStatus, setGarminStatus] = useState({ isLinked: false, lastUpdated: null, tokenExpiresAt: null });


  const fetchGarminStatus = async () => {
    if (!user) return;
    try {
      console.log('Fetching Garmin status...');
      const response = await apiCall('/integrations/garmin/status');
      console.log('Garmin status response:', response);
      setGarminStatus(response);
      setIsGarminLinked(response.isLinked);
      console.log('isGarminLinked after fetch:', response.isLinked);
    } catch (error) {
      console.error('Failed to fetch Garmin status:', error);
      setGarminStatus({ isLinked: false, lastUpdated: null, tokenExpiresAt: null });
      setIsGarminLinked(false);
    }
  };

  useEffect(() => {
    fetchGarminStatus();
  }, [user]);

  useEffect(() => {
    if (initialClientState) {
      setGarminClientState(initialClientState);
      setShowGarminMfaInput(true);
    } else {
      setGarminClientState(null);
      setShowGarminMfaInput(false);
      setGarminMfaCode('');
    }
  }, [initialClientState]);

  const syncGarminData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Fetch daily summary (for steps)
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const dailySummaryResponse = await apiCall(`/integrations/garmin/sync/daily_summary`, {
        method: 'POST',
        body: JSON.stringify({ date: today }),
      });
      if (dailySummaryResponse && dailySummaryResponse.data && dailySummaryResponse.data.steps) {
        setGarminData(prevState => ({ ...prevState, steps: dailySummaryResponse.data.steps }));
      }

      // Fetch body composition (for weight)
      const bodyCompResponse = await apiCall(`/integrations/garmin/sync/body_composition`, {
        method: 'POST',
        body: JSON.stringify({ startDate: today, endDate: today }),
      });
      if (bodyCompResponse && bodyCompResponse.data && bodyCompResponse.data.weight) {
        setGarminData(prevState => ({ ...prevState, weight: bodyCompResponse.data.weight }));
      }
      setIsGarminLinked(true); // Data fetched successfully, so Garmin is linked
      // After successful sync, refresh status
      const updatedStatus = await apiCall('/integrations/garmin/status');
      setGarminStatus(updatedStatus);
    } catch (error: any) {
      console.error('Failed to sync Garmin data:', error);
      if (error.message.includes("Garmin Connect not linked for this user.")) {
        setIsGarminLinked(false);
        toast({
          title: "Garmin Connect Not Linked",
          description: "Your Garmin Connect account is not linked. Please log in.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: `Failed to sync Garmin data: ${error.message}`,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGarminLogin = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "User not authenticated. Please log in.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const result = await apiCall(`/integrations/garmin/login`, {
        method: 'POST',
        body: JSON.stringify({ email: garminEmail, password: garminPassword }),
      });

      if (result.status === 'needs_mfa') {
        setGarminClientState(result.client_state);
        setShowGarminMfaInput(true);
        toast({
          title: "MFA Required",
          description: "Please enter the MFA code from your Garmin Connect app.",
        });
      } else if (result.status === 'success') {
        toast({
          title: "Success",
          description: "Garmin Connect linked successfully!",
        });
        setShowGarminMfaInput(false);
        setGarminMfaCode('');
        // After successful login, fetch status to update UI and notify parent
        fetchGarminStatus();
        onStatusChange();
        if (onMfaComplete) {
          onMfaComplete();
        }
      }
    } catch (error: any) {
      console.error('Login Error:', error);
      toast({
        title: "Login Error",
        description: `Failed to connect to Garmin: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGarminMfaSubmit = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "User not authenticated. Please log in.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const result = await apiCall(`/integrations/garmin/resume_login`, {
        method: 'POST',
        body: JSON.stringify({ client_state: garminClientState, mfa_code: garminMfaCode }),
      });

      if (result.status === 'success') {
        toast({
          title: "Success",
          description: "Garmin Connect linked successfully!",
        });
        setShowGarminMfaInput(false);
        setGarminMfaCode('');
        setGarminClientState(null); // Clear client state on success
        // After successful MFA, fetch status to update UI and notify parent
        fetchGarminStatus();
        onStatusChange();
        if (onMfaComplete) {
          onMfaComplete();
        }
      } else {
        // Handle other potential statuses or errors from the backend
        toast({
          title: "MFA Error",
          description: result.message || "Failed to submit MFA code. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('MFA Error:', error);
      toast({
        title: "MFA Error",
        description: `Failed to submit MFA code: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUnlinkGarmin = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "User not authenticated. Please log in.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      await apiCall('/integrations/garmin/unlink', {
        method: 'POST',
      });
      toast({
        title: "Garmin Unlinked",
        description: "Your Garmin Connect account has been unlinked.",
      });
      setIsGarminLinked(false);
      setGarminStatus({ isLinked: false, lastUpdated: null, tokenExpiresAt: null });
      setGarminData({ steps: null, weight: null });
      setGarminEmail('');
      setGarminPassword('');
      setGarminMfaCode('');
      setShowGarminMfaInput(false);
      onStatusChange(); // Notify parent component of status change
    } catch (error: any) {
      console.error('Failed to unlink Garmin:', error);
      toast({
        title: "Error",
        description: `Failed to unlink Garmin: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "User not authenticated. Please log in.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {

      // If linked, proceed with full sync
      const today = new Date().toISOString().split('T')[0];
      await apiCall(`/integrations/garmin/sync/daily_summary`, {
        method: 'POST',
        body: JSON.stringify({ date: today }),
      });
      await apiCall(`/integrations/garmin/sync/body_composition`, {
        method: 'POST',
        body: JSON.stringify({ startDate: today, endDate: today }),
      });
      toast({
        title: "Sync Initiated",
        description: "Garmin data sync initiated. Check back shortly.",
      });
      syncGarminData();
    } catch (error: any) {
      console.error('Manual Sync Error:', error);
      toast({
        title: "Error",
        description: `Failed to initiate manual sync: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
  
      <TooltipWarning warningMsg={"Garmin Connect integration is tested with few metrics only. Ensure your Docker Compose is updated to include Garmin section."} />
      <p className="text-sm text-muted-foreground">
        Sparky Fitness does not store your Garmin email or password. They are used only during login to obtain secure tokens.
      </p>
      {!garminStatus.isLinked && !showGarminMfaInput && !initialClientState && ( // Show login form if not linked and not in MFA
        <form onSubmit={(e) => { e.preventDefault(); handleGarminLogin(); }} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="garmin-email">Garmin Email</Label>
              <Input
                id="settings-garmin-email"
                type="email"
                placeholder="Enter your Garmin email"
                value={garminEmail}
                onChange={(e) => setGarminEmail(e.target.value)}
                disabled={loading}
                autoComplete="username"
              />
            </div>
            <div>
              <Label htmlFor="garmin-password">Garmin Password</Label>
              <Input
                id="settings-garmin-password"
                type="password"
                placeholder="Enter your Garmin password"
                value={garminPassword}
                onChange={(e) => setGarminPassword(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
              />
            </div>
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? 'Connecting...' : 'Connect Garmin'}
          </Button>
        </form>
      )}

      {showGarminMfaInput && ( // Show MFA input if MFA is required
        <>
          <Label htmlFor="garmin-mfa-code">Garmin MFA Code</Label>
          <Input
            id="settings-garmin-mfa-code"
            type="text"
            placeholder="Enter MFA code"
            value={garminMfaCode}
            onChange={(e) => setGarminMfaCode(e.target.value)}
            disabled={loading}
          />
          <Button onClick={handleGarminMfaSubmit} disabled={loading}>
            {loading ? 'Submitting...' : 'Submit MFA Code'}
          </Button>
        </>
      )}

      {garminData.steps !== null && (
        <p className="text-sm">Last Synced Steps: {garminData.steps}</p>
      )}
      {garminData.weight !== null && (
        <p className="text-sm">Last Synced Weight: {garminData.weight} kg</p>
      )}

    </div>
  );
};

export default GarminConnectSettings;