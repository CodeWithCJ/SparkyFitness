import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { formatDateToYYYYMMDD } from "@/lib/utils"; // Import the new utility function
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Calendar as CalendarIcon } from "lucide-react"; // Import CalendarIcon
import { Calendar } from "@/components/ui/calendar"; // Import Calendar component
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"; // Import Popover components
import { Save, Upload, User, Settings as SettingsIcon, Lock, Camera, ClipboardCopy, Copy, Eye, EyeOff, KeyRound, Trash2, Droplet, ListChecks, Users, Tag, Cloud, Sparkles } from "lucide-react";
import { apiCall } from '@/services/api'; // Assuming a common API utility
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import FamilyAccessManager from "./FamilyAccessManager";
import AIServiceSettings from "./AIServiceSettings";
import CustomCategoryManager from "./CustomCategoryManager";
import { CustomCategory } from "@/services/customCategoryService";
import ExternalProviderSettings from "./ExternalProviderSettings"; // Import ExternalProviderSettings
import GarminConnectSettings from "./GarminConnectSettings"; // Import GarminConnectSettings
import { usePreferences } from "@/contexts/PreferencesContext"; // Import usePreferences
import NutrientDisplaySettings from "./NutrientDisplaySettings"; // Import NutrientDisplaySettings
import WaterContainerManager from "./WaterContainerManager"; // Import WaterContainerManager
import { parse } from "date-fns"; // Import parse for parsing user-entered date strings
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"; // Import Accordion components
import CalculationSettings from "@/pages/CalculationSettings";
import TooltipWarning from "./TooltipWarning";

interface Profile {
 id: string;
  full_name: string | null;
  phone_number: string | null; // Changed from 'phone' to 'phone_number' to match DB
  date_of_birth: string | null;
  bio: string | null;
  avatar_url: string | null;
  gender: string | null; // Add gender to the Profile interface
}

interface UserPreferences {
  date_format: string;
  default_weight_unit: string;
  default_measurement_unit: string;
  logging_level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT'; // Add logging level
}

interface SettingsProps {
  onShowAboutDialog: () => void;
}

const Settings: React.FC<SettingsProps> = ({ onShowAboutDialog }) => {
  const { user } = useAuth();
  const {
    weightUnit, setWeightUnit,
    measurementUnit, setMeasurementUnit,
    distanceUnit, setDistanceUnit,
    dateFormat, setDateFormat,
    loggingLevel, setLoggingLevel,
    itemDisplayLimit, setItemDisplayLimit, // Add itemDisplayLimit and setItemDisplayLimit
    loadPreferences: loadUserPreferencesFromContext, // Rename to avoid conflict
    saveAllPreferences, // Add saveAllPreferences from context
    formatDate, // Destructure formatDate
    water_display_unit, setWaterDisplayUnit
  } = usePreferences();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [avatarObjectURL, setAvatarObjectURL] = useState<string | null>(null); // State to hold the object URL for the avatar
  // Remove local preferences state as it's now managed by PreferencesContext
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [localLoggingLevel, setLocalLoggingLevel] = useState(loggingLevel);
  const [profileForm, setProfileForm] = useState({
    full_name: '',
    phone: '',
    date_of_birth: '',
    bio: '',
    gender: '' // Add gender to the profileForm state
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

  useEffect(() => {
    setLocalLoggingLevel(loggingLevel);
  }, [loggingLevel]);

  // Effect to fetch avatar image when profile.avatar_url changes
  useEffect(() => {
    const fetchAvatar = async () => {
      if (profile?.avatar_url) {
        try {
          // Fetch the image as a Blob
          const response = await apiCall(profile.avatar_url, {
            method: 'GET',
            responseType: 'blob', // Indicate that we expect a blob response
          });
          const blob = new Blob([response], { type: 'image/jpeg' }); // Adjust type if needed
          const url = URL.createObjectURL(blob);
          setAvatarObjectURL(url);
        } catch (error) {
          console.error('Error fetching avatar:', error);
          setAvatarObjectURL(null);
        }
      } else {
        setAvatarObjectURL(null);
      }
    };

    fetchAvatar();

    // Cleanup object URL when component unmounts or avatar_url changes
    return () => {
      if (avatarObjectURL) {
        URL.revokeObjectURL(avatarObjectURL);
      }
    };
  }, [profile?.avatar_url]);


  const loadCustomCategories = async () => {
    if (!user) return;

    try {
      
      const data = await apiCall(`/measurements/custom-categories`, {
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
      const data = await apiCall(`/auth/user-api-keys`, {
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
      const data = await apiCall('/auth/user/generate-api-key', {
        method: 'POST',
        body: JSON.stringify({ description: newApiKeyDescription || null }),
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

  const handleDeleteApiKey = async (apiKeyId: string) => {
    if (!user) return;
    if (!confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
      return;
    }
    setLoading(true); // Use general loading for this
    try {
      await apiCall(`/auth/user/api-key/${apiKeyId}`, {
        method: 'DELETE',
        body: JSON.stringify({}), // Send userId in body for DELETE
      });
 
      toast({
        title: "Success",
        description: "API key deleted successfully!",
      });
      loadApiKeys(); // Reload keys
    } catch (error: any) {
      console.error('Error deleting API key:', error);
      toast({
        title: "Error",
        description: `Failed to delete API key: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadProfile = async () => {
    if (!user) return;

    try {
      const data = await apiCall(`/auth/profiles`, {
        method: 'GET',
      });
      setProfile(data);
      setProfileForm({
        full_name: data.full_name || '',
        phone: data.phone_number || '', // Use phone_number from backend
        date_of_birth: data.date_of_birth || '', // Store as YYYY-MM-DD string directly
        bio: data.bio || '',
        gender: data.gender || '' // Set gender from fetched profile
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
      await apiCall(`/auth/profiles`, {
        method: 'PUT', // Or PATCH, depending on backend implementation
        body: JSON.stringify({
          full_name: profileForm.full_name,
          phone_number: profileForm.phone, // Changed to phone_number
          date_of_birth: profileForm.date_of_birth || null, // Send YYYY-MM-DD string directly
          bio: profileForm.bio,
          gender: profileForm.gender || null // Send gender to the API
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
      await saveAllPreferences({ loggingLevel: localLoggingLevel }); // Pass the new logging level directly
      toast({
        title: "Success",
        description: "Preferences updated successfully",
      });
      window.location.reload();
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
      await apiCall('/auth/update-password', {
        method: 'POST',
        body: JSON.stringify({
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
      await apiCall('/auth/update-email', {
        method: 'POST',
        body: JSON.stringify({
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

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const response = await apiCall('/auth/profiles/avatar', {
        method: 'POST',
        body: formData,
        isFormData: true, // Indicate that the body is FormData
      });

      toast({
        title: "Success",
        description: "Profile picture updated successfully",
      });
      loadProfile(); // Reload profile to display the new avatar
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
    <div className="space-y-6 w-full">
      {/* Removed redundant Settings heading */}
      <Accordion type="multiple" className="w-full">
        {/* Profile Information */}
        <AccordionItem value="profile-information" className="border rounded-lg mb-4">
          <AccordionTrigger
            className="flex items-center gap-2 p-4 hover:no-underline"
            description="Manage your personal information and profile picture"
          >
            <User className="h-5 w-5" />
            Profile Information
          </AccordionTrigger>
          <AccordionContent className="p-4 pt-0 space-y-6">
            {/* Profile Picture */}
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                {avatarObjectURL ? ( // Use avatarObjectURL for display
                  <AvatarImage src={avatarObjectURL} alt={profile?.full_name || 'User'} />
                ) : (
                  <AvatarFallback className="text-lg">
                    {getInitials(profile?.full_name)}
                  </AvatarFallback>
                )}
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
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className="w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {profileForm.date_of_birth ? (
                        <span>{formatDate(profileForm.date_of_birth)}</span> // Format for display
                      ) : (
                        <span>Pick a date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={profileForm.date_of_birth ? parseISO(profileForm.date_of_birth) : undefined} // Parse YYYY-MM-DD string to Date object
                      onSelect={(date) => {
                        setProfileForm(prev => ({
                          ...prev,
                          date_of_birth: date ? formatDateToYYYYMMDD(date) : '' // Store as YYYY-MM-DD string
                        }));
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label htmlFor="gender">Gender</Label>
                <Select
                  value={profileForm.gender}
                  onValueChange={(value) => setProfileForm(prev => ({ ...prev, gender: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
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
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="user-preferences" className="border rounded-lg mb-4">
          <AccordionTrigger
            className="flex items-center gap-2 p-4 hover:no-underline"
            description="Customize your app settings and display preferences"
          >
            <SettingsIcon className="h-5 w-5" />
            Preferences
          </AccordionTrigger>
          <AccordionContent className="p-4 pt-0 space-y-4">
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
              <div>
                <Label htmlFor="distance_unit">Distance Unit</Label>
                <Select
                  value={distanceUnit}
                  onValueChange={setDistanceUnit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="km">Kilometers (km)</SelectItem>
                    <SelectItem value="miles">Miles (miles)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="distance_unit">Distance Unit</Label>
                <Select
                  value={distanceUnit}
                  onValueChange={setDistanceUnit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="km">Kilometers (km)</SelectItem>
                    <SelectItem value="miles">Miles (miles)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="logging_level">Minimum Logging Level</Label>
                <Select
                  value={localLoggingLevel}
                  onValueChange={(value) => setLocalLoggingLevel(value as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT')}
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
                <Label htmlFor="item_display_limit">Recent/Top Limit</Label>
                <Select
                  value={String(itemDisplayLimit)}
                  onValueChange={(value) => setItemDisplayLimit(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 items</SelectItem>
                    <SelectItem value="10">10 items</SelectItem>
                    <SelectItem value="15">15 items</SelectItem>
                    <SelectItem value="20">20 items</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handlePreferencesUpdate} disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              {loading ? 'Saving...' : 'Save Preferences'}
            </Button>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="water-tracking" className="border rounded-lg mb-4">
          <AccordionTrigger
            className="flex items-center gap-2 p-4 hover:no-underline"
            description="Configure your water intake tracking settings"
          >
            <Droplet className="h-5 w-5" />
            Water Tracking
          </AccordionTrigger>
          <AccordionContent className="p-4 pt-0 space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="water_display_unit">Water Display Unit</Label>
              <Select
                value={water_display_unit}
                onValueChange={setWaterDisplayUnit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ml">Milliliters (ml)</SelectItem>
                  <SelectItem value="oz">Fluid Ounces (oz)</SelectItem>
                  <SelectItem value="cup">Cups</SelectItem>
                </SelectContent>
              </Select>

            </div>
            <Button onClick={handlePreferencesUpdate} disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              {loading ? 'Saving...' : 'Save Water Display Unit'}
            </Button>
            <Separator />
            <WaterContainerManager />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="nutrient-display" className="border rounded-lg mb-4">
          <AccordionTrigger
            className="flex items-center gap-2 p-4 hover:no-underline"
            description="Choose which nutrients to display in food and meal views"
          >
            <ListChecks className="h-5 w-5" />
            Nutrient Display
          </AccordionTrigger>
          <AccordionContent className="p-4 pt-0">
            <NutrientDisplaySettings />
          </AccordionContent>
       </AccordionItem>

       <AccordionItem value="calculation-settings" className="border rounded-lg mb-4">
         <AccordionTrigger
           className="flex items-center gap-2 p-4 hover:no-underline"
           description="Manage BMR and Body Fat calculation preferences"
         >
           <SettingsIcon className="h-5 w-5" />
           Calculation Settings
         </AccordionTrigger>
         <AccordionContent className="p-4 pt-0">
           <CalculationSettings />
         </AccordionContent>
       </AccordionItem>

       <AccordionItem value="family-access" className="border rounded-lg mb-4">
         <AccordionTrigger
            className="flex items-center gap-2 p-4 hover:no-underline"
            description="Manage access to your data for family members"
          >
            <Users className="h-5 w-5" />
            Family Access
          </AccordionTrigger>
          <AccordionContent className="p-4 pt-0">
            <FamilyAccessManager />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="custom-categories" className="border rounded-lg mb-4">
          <AccordionTrigger
            className="flex items-center gap-2 p-4 hover:no-underline"
            description="Create and manage custom measurement categories"
          >
            <Tag className="h-5 w-5" />
            Custom Categories
          </AccordionTrigger>
          <AccordionContent className="p-4 pt-0">
            <CustomCategoryManager
              categories={customCategories}
              onCategoriesChange={setCustomCategories}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="food-and-exercise-data-providers" className="border rounded-lg mb-4">
          <AccordionTrigger
            className="flex items-center gap-2 p-4 hover:no-underline"
            description="Configure external food and exercise data sources and synchronize data with Garmin Connect"
          >
            <Cloud className="h-5 w-5" />
            Food & Exercise Data Providers
          </AccordionTrigger>
          <AccordionContent className="p-4 pt-0 space-y-4">
            <TooltipWarning warningMsg={`If you encounter an "Invalid key length" error, ensure your encryption and JWT authentication keys in the server's env variables are 64 hex.`} />
            <ExternalProviderSettings />
            <Separator />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="ai-service" className="border rounded-lg mb-4">
          <AccordionTrigger
            className="flex items-center gap-2 p-4 hover:no-underline"
            description="Manage settings for AI-powered features"
          >
            <Sparkles className="h-5 w-5" />
            AI Service
          </AccordionTrigger>
          <AccordionContent className="p-4 pt-0">
            <TooltipWarning warningMsg={`If you encounter an "Invalid key length" error, ensure your encryption and JWT authentication keys in the server's env variables are 64 hex.`} />
            <AIServiceSettings />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="api-key-management" className="border rounded-lg mb-4">
          <AccordionTrigger
            className="flex items-center gap-2 p-4 hover:no-underline"
            description="Generate and manage API keys for external integrations"
          >
            <KeyRound className="h-5 w-5" />
            API Key Management
          </AccordionTrigger>
          <AccordionContent className="p-4 pt-0 space-y-4">
            
            <p className="text-sm text-muted-foreground">
              Generate API keys to securely submit data from external applications like iPhone Shortcuts.
              These keys are tied to your account and can be revoked at any time.
            </p>

            <TooltipWarning warningMsg = {`Refer to the Wiki page in Github for sample setup instructions for iPhone and Android.`} color="blue" />
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
                        {/* Removed Inactive status as per user request */}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDeleteApiKey(key.id)}
                      disabled={loading}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="account-security" className="border rounded-lg mb-4">
          <AccordionTrigger
            className="flex items-center gap-2 p-4 hover:no-underline"
            description="Change your email or password"
          >
            <Lock className="h-5 w-5" />
            Account Security
          </AccordionTrigger>
          <AccordionContent className="p-4 pt-0 space-y-6">
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
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default Settings;
