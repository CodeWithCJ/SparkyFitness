import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Save, Upload, User, Settings as SettingsIcon, Lock, Camera, ClipboardCopy, Copy, Eye, EyeOff, KeyRound } from "lucide-react";
import { apiCall } from '@/services/api'; // Assuming a common API utility
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import FamilyAccessManager from "./FamilyAccessManager";
import AIServiceSettings from "./AIServiceSettings";
import CustomCategoryManager from "./CustomCategoryManager";
import FoodDataProviderSettings from "./FoodDataProviderSettings"; // Import FoodDataProviderSettings
import { usePreferences } from "@/contexts/PreferencesContext"; // Import usePreferences

interface Profile {
  id: string;
  full_name: string | null;
  phone_number: string | null; // Changed from 'phone' to 'phone_number' to match DB
  date_of_birth: string | null;
  bio: string | null;
  avatar_url: string | null;
}

interface UserPreferences {
  date_format: string;
  default_weight_unit: string;
  default_measurement_unit: string;
  logging_level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT'; // Add logging level
  timezone: string; // Add timezone
}

interface CustomCategory {
  id: string;
  name: string;
  measurement_type: string;
  frequency: string;
}

const Settings = () => {
  const { user } = useAuth();
  const {
    weightUnit, setWeightUnit,
    measurementUnit, setMeasurementUnit,
    dateFormat, setDateFormat,
    loggingLevel, setLoggingLevel,
    timezone, setTimezone,
    loadPreferences: loadUserPreferencesFromContext, // Rename to avoid conflict
    saveAllPreferences // Add saveAllPreferences from context
  } = usePreferences();
  const [profile, setProfile] = useState<Profile | null>(null);
  // Remove local preferences state as it's now managed by PreferencesContext
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [profileForm, setProfileForm] = useState({
    full_name: '',
    phone: '',
    date_of_birth: '',
    bio: ''
  });
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  });
  const [newEmail, setNewEmail] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // State for API Key Management
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [showApiKey, setShowApiKey] = useState<string | null>(null); // Stores the ID of the key to show
  const [newApiKeyDescription, setNewApiKeyDescription] = useState<string>('');
  const [generatingApiKey, setGeneratingApiKey] = useState(false);

  useEffect(() => {
    if (user) {
      loadProfile();
      loadUserPreferencesFromContext(); // Load preferences from context
      loadCustomCategories();
      loadApiKeys(); // Load API keys
      setNewEmail(user.email || ''); // Initialize newEmail here
    }
  }, [user]); // Removed loadUserPreferencesFromContext from dependency array

  const loadCustomCategories = async () => {
    if (!user) return;

    try {
      
      const data = await apiCall(`/api/custom-categories/${user.id}`, {
        method: 'GET',
      });
      setCustomCategories(data || []);
    } catch (error: any) {
      console.error('Error loading custom categories:', error);
      toast({
        title: "Error",
        description: `Failed to load custom categories: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const loadApiKeys = async () => {
    if (!user) return;
    try {
      const data = await apiCall(`/api/user-api-keys/${user.id}`, {
        method: 'GET',
      });
      setApiKeys(data || []);
    } catch (error: any) {
      console.error('Error loading API keys:', error);
      toast({
        title: "Error",
        description: `Failed to load API keys: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const handleGenerateApiKey = async () => {
    if (!user) return;
    setGeneratingApiKey(true);
    try {
      const data = await apiCall('/api/user/generate-api-key', {
        method: 'POST',
        body: JSON.stringify({ userId: user.id, description: newApiKeyDescription || null }),
      });

      toast({
        title: "Success",
        description: "New API key generated successfully!",
      });
      setNewApiKeyDescription('');
      loadApiKeys(); // Reload keys to show the new one
    } catch (error: any) {
      console.error('Error generating API key:', error);
      toast({
        title: "Error",
        description: `Failed to generate API key: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setGeneratingApiKey(false);
    }
  };

  const handleRevokeApiKey = async (apiKeyId: string) => {
    if (!user) return;
    setLoading(true); // Use general loading for this
    try {
      await apiCall('/api/user/revoke-api-key', {
        method: 'POST',
        body: JSON.stringify({ userId: user.id, apiKeyId: apiKeyId }),
      });

      toast({
        title: "Success",
        description: "API key revoked successfully!",
      });
      loadApiKeys(); // Reload keys
    } catch (error: any) {
      console.error('Error revoking API key:', error);
      toast({
        title: "Error",
        description: `Failed to revoke API key: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadProfile = async () => {
    if (!user) return;

    try {
      const data = await apiCall(`/api/profiles/${user.id}`, {
        method: 'GET',
      });
      setProfile(data);
      setProfileForm({
        full_name: data.full_name || '',
        phone: data.phone_number || '', // Use phone_number from backend
        date_of_birth: data.date_of_birth || '',
        bio: data.bio || ''
      });
    } catch (error: any) {
      console.error('Error loading profile:', error);
      toast({
        title: "Error",
        description: `Failed to load profile: ${error.message}`,
        variant: "destructive",
      });
    }
  };



  const handleProfileUpdate = async () => {
    if (!user) return;

    setLoading(true);
    try {
      await apiCall(`/api/profiles/${user.id}`, {
        method: 'PUT', // Or PATCH, depending on backend implementation
        body: JSON.stringify({
          full_name: profileForm.full_name,
          phone_number: profileForm.phone, // Changed to phone_number
          date_of_birth: profileForm.date_of_birth || null,
          bio: profileForm.bio
        }),
      });

      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
      loadProfile();
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast({
        title: "Error",
        description: `Failed to update profile: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };


  const handlePreferencesUpdate = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await saveAllPreferences(); // Call the new function from context
      toast({
        title: "Success",
        description: "Preferences updated successfully",
      });
    } catch (error: any) {
      console.error('Error updating preferences:', error);
      toast({
        title: "Error",
        description: `Failed to update preferences: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast({
        title: "Error",
        description: "New passwords do not match",
        variant: "destructive",
      });
      return;
    }

    if (passwordForm.new_password.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters long",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      await apiCall('/api/auth/update-password', {
        method: 'POST',
        body: JSON.stringify({
          userId: user?.id, // Assuming userId is available from useAuth
          currentPassword: passwordForm.current_password, // If needed for verification
          newPassword: passwordForm.new_password,
        }),
      });

      toast({
        title: "Success",
        description: "Password updated successfully",
      });
      setPasswordForm({
        current_password: '',
        new_password: '',
        confirm_password: ''
      });
    } catch (error: any) {
      console.error('Error updating password:', error);
      toast({
        title: "Error",
        description: `Failed to update password: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEmailChange = async () => {
    if (!newEmail || newEmail === user?.email) {
      toast({
        title: "Error",
        description: "Please enter a new email address",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      await apiCall('/api/auth/update-email', {
        method: 'POST',
        body: JSON.stringify({
          userId: user?.id, // Assuming userId is available from useAuth
          newEmail: newEmail,
        }),
      });

      toast({
        title: "Success",
        description: "Email update initiated. Please check your new email for confirmation.",
      });
    } catch (error: any) {
      console.error('Error updating email:', error);
      toast({
        title: "Error",
        description: `Failed to update email: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || !event.target.files[0] || !user) return;

    const file = event.target.files[0];

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Error",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "Image must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    setUploadingImage(true);

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/avatar.${fileExt}`;

    try {
      // Image upload functionality will require a dedicated backend endpoint
      // to handle file storage (e.g., S3, local filesystem) and return the public URL.
      // The existing placeholder logic for updating the profile with a dummy URL remains.

      // For now, simulate success and update profile with a dummy URL
      const publicUrl = `http://localhost:3010/uploads/${fileName}`; // Dummy URL

      // Update profile with new avatar URL
      await apiCall(`/api/profiles/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ avatar_url: publicUrl }),
      });

      toast({
        title: "Success",
        description: "Profile picture updated successfully",
      });
      loadProfile();
    } catch (error: any) {
      console.error('Error uploading image:', error);
      toast({
        title: "Error",
        description: `Failed to upload profile picture: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setUploadingImage(false);
    }
  };

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <SettingsIcon className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      {/* Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Profile Picture */}
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src={profile?.avatar_url || ''} alt={profile?.full_name || 'User'} />
              <AvatarFallback className="text-lg">
                {getInitials(profile?.full_name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <Label htmlFor="avatar-upload" className="cursor-pointer">
                <Button variant="outline" size="sm" disabled={uploadingImage} asChild>
                  <span>
                    <Camera className="h-4 w-4 mr-2" />
                    {uploadingImage ? 'Uploading...' : 'Change Photo'}
                  </span>
                </Button>
              </Label>
              <Input
                id="avatar-upload"
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <p className="text-xs text-muted-foreground mt-1">
                PNG, JPG up to 5MB
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                value={profileForm.full_name}
                onChange={(e) => setProfileForm(prev => ({ ...prev, full_name: e.target.value }))}
                placeholder="Enter your full name"
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                value={profileForm.phone}
                onChange={(e) => setProfileForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="Enter your phone number"
              />
            </div>
            <div>
              <Label htmlFor="date_of_birth">Date of Birth</Label>
              <Input
                id="date_of_birth"
                type="date"
                value={profileForm.date_of_birth}
                onChange={(e) => setProfileForm(prev => ({ ...prev, date_of_birth: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                value={profileForm.bio}
                onChange={(e) => setProfileForm(prev => ({ ...prev, bio: e.target.value }))}
                placeholder="Tell us about yourself"
                rows={3}
              />
            </div>
          </div>

          <Button onClick={handleProfileUpdate} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Saving...' : 'Save Profile'}
          </Button>
        </CardContent>
      </Card>

      {/* User Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="date_format">Date Format</Label>
              <Select
                value={dateFormat}
                onValueChange={setDateFormat}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MM/dd/yyyy">MM/dd/yyyy (12/25/2024)</SelectItem>
                  <SelectItem value="dd/MM/yyyy">dd/MM/yyyy (25/12/2024)</SelectItem>
                  <SelectItem value="dd-MMM-yyyy">dd-MMM-yyyy (25-Dec-2024)</SelectItem>
                  <SelectItem value="yyyy-MM-dd">yyyy-MM-dd (2024-12-25)</SelectItem>
                  <SelectItem value="MMM dd, yyyy">MMM dd, yyyy (Dec 25, 2024)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="weight_unit">Weight Unit</Label>
              <Select
                value={weightUnit}
                onValueChange={setWeightUnit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">Kilograms (kg)</SelectItem>
                  <SelectItem value="lbs">Pounds (lbs)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="measurement_unit">Measurement Unit</Label>
              <Select
                value={measurementUnit}
                onValueChange={setMeasurementUnit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cm">Centimeters (cm)</SelectItem>
                  <SelectItem value="inches">Inches (in)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="logging_level">Minimum Logging Level</Label>
              <Select
                value={loggingLevel}
                onValueChange={setLoggingLevel}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEBUG">DEBUG (Most Detailed)</SelectItem>
                  <SelectItem value="INFO">INFO</SelectItem>
                  <SelectItem value="WARN">WARN</SelectItem>
                  <SelectItem value="ERROR">ERROR</SelectItem>
                  <SelectItem value="SILENT">SILENT (No Logs)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="e.g., Etc/UTC or America/New_York"
              />
            </div>
          </div>
          <Button onClick={handlePreferencesUpdate} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Saving...' : 'Save Preferences'}
          </Button>
         </CardContent>
       </Card>
  
       {/* Family Access Management */}
       <FamilyAccessManager />

      {/* Custom Categories Management */}
      <CustomCategoryManager
        categories={customCategories}
        onCategoriesChange={setCustomCategories}
      />

      {/* Food Data Provider Settings */}
      <FoodDataProviderSettings />

      {/* AI Service Settings */}
      <AIServiceSettings />

      {/* API Key Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            API Key Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Generate API keys to securely submit data from external applications like iPhone Shortcuts.
            These keys are tied to your account and can be revoked at any time.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Description (e.g., 'iPhone Health Shortcut')"
              value={newApiKeyDescription}
              onChange={(e) => setNewApiKeyDescription(e.target.value)}
              className="flex-grow"
            />
            <Button onClick={handleGenerateApiKey} disabled={generatingApiKey}>
              <Save className="h-4 w-4 mr-2" />
              {generatingApiKey ? 'Generating...' : 'Generate New Key'}
            </Button>
          </div>

          <Separator />

          <div className="space-y-3">
            {apiKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">No API keys generated yet.</p>
            ) : (
              apiKeys.map((key) => (
                <div key={key.id} className="flex items-center space-x-2 p-2 border rounded-md">
                  <div className="flex-grow">
                    <p className="font-medium">{key.description || 'No Description'}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="font-mono text-xs">
                        {showApiKey === key.id ? key.api_key : '********************'}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowApiKey(showApiKey === key.id ? null : key.id)}
                        className="h-auto p-1"
                      >
                        {showApiKey === key.id ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(key.api_key);
                          toast({ title: "Copied!", description: "API key copied to clipboard." });
                        }}
                        className="h-auto p-1"
                      >
                        <ClipboardCopy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Created: {new Date(key.created_at).toLocaleDateString()}
                      {key.last_used_at && ` | Last Used: ${new Date(key.last_used_at).toLocaleDateString()}`}
                      {!key.is_active && ' | (Inactive)'}
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleRevokeApiKey(key.id)}
                    disabled={!key.is_active || loading}
                  >
                    Revoke
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Account Security */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Account Security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email Change */}
          <div>
            <Label htmlFor="current_email">Current Email</Label>
            <div className="flex gap-2">
              <Input
                id="current_email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Enter new email address"
              />
              <Button onClick={handleEmailChange} disabled={loading} variant="outline">
                Update Email
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              You'll need to verify your new email address
            </p>
          </div>

          <Separator />

          {/* Password Change */}
          <form onSubmit={(e) => { e.preventDefault(); handlePasswordChange(); }} className="space-y-4">
            <h3 className="text-lg font-medium">Change Password</h3>
            {/* Hidden username field for password managers */}
            <Input
              type="text"
              id="username"
              name="username"
              autoComplete="username"
              className="hidden"
              tabIndex={-1}
              aria-hidden="true"
              value={user?.email || ''} // Pre-fill with user's email if available
              readOnly
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="new_password">New Password</Label>
                <Input
                  id="new_password"
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.new_password}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, new_password: e.target.value }))}
                  placeholder="Enter new password"
                />
              </div>
              <div>
                <Label htmlFor="confirm_password">Confirm New Password</Label>
                <Input
                  id="confirm_password"
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.confirm_password}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, confirm_password: e.target.value }))}
                  placeholder="Confirm new password"
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={loading || !passwordForm.new_password || !passwordForm.confirm_password}
            >
              <Lock className="h-4 w-4 mr-2" />
              {loading ? 'Updating...' : 'Update Password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
