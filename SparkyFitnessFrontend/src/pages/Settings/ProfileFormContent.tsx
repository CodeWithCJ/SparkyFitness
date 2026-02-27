import { parseISO } from 'date-fns';
import { formatDateToYYYYMMDD } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar as CalendarIcon, Save } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'; // Import Popover components
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUpdateProfileMutation } from '@/hooks/Settings/useProfile';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Profile, ProfileFormState } from '@/types/settings';

export const ProfileFormContent = ({ profile }: { profile: Profile }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { formatDate } = usePreferences();
  const { mutateAsync: updateProfile, isPending: updatingProfile } =
    useUpdateProfileMutation();

  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    full_name: profile.full_name || '',
    phone: profile.phone_number || '',
    date_of_birth: profile.date_of_birth || '',
    bio: profile.bio || '',
    gender: profile.gender || '',
  });

  const handleProfileUpdate = async () => {
    if (!user) return;

    try {
      await updateProfile({
        full_name: profileForm.full_name,
        phone_number: profileForm.phone,
        date_of_birth: profileForm.date_of_birth || null,
        bio: profileForm.bio,
        gender: profileForm.gender || null,
      });
    } catch (error: unknown) {
      console.error(error);
    }
  };
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="full_name">
            {t('settings.profileInformation.fullName', 'Full Name')}
          </Label>
          <Input
            id="full_name"
            value={profileForm.full_name}
            onChange={(e) =>
              setProfileForm((prev) => ({
                ...prev,
                full_name: e.target.value,
              }))
            }
            placeholder={t(
              'settings.profileInformation.enterFullName',
              'Enter your full name'
            )}
          />
        </div>
        <div>
          <Label htmlFor="phone">
            {t('settings.profileInformation.phoneNumber', 'Phone Number')}
          </Label>
          <Input
            id="phone"
            value={profileForm.phone}
            onChange={(e) =>
              setProfileForm((prev) => ({
                ...prev,
                phone: e.target.value,
              }))
            }
            placeholder={t(
              'settings.profileInformation.enterPhoneNumber',
              'Enter your phone number'
            )}
          />
        </div>
        <div>
          <Label htmlFor="date_of_birth">
            {t('settings.profileInformation.dateOfBirth', 'Date of Birth')}
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={'outline'}
                className="w-full justify-start text-left font-normal"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {profileForm.date_of_birth ? (
                  <span>{formatDate(profileForm.date_of_birth)}</span> // Format for display
                ) : (
                  <span>
                    {t('settings.profileInformation.pickADate', 'Pick a date')}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={
                  profileForm.date_of_birth
                    ? parseISO(profileForm.date_of_birth)
                    : undefined
                } // Parse YYYY-MM-DD string to Date object
                onSelect={(date) => {
                  setProfileForm((prev) => ({
                    ...prev,
                    date_of_birth: date ? formatDateToYYYYMMDD(date) : '', // Store as YYYY-MM-DD string
                  }));
                }}
                yearsRange={100} // Set to 100 years for date of birth
              />
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <Label htmlFor="gender">
            {t('settings.profileInformation.gender', 'Gender')}
          </Label>
          <Select
            value={profileForm.gender}
            onValueChange={(value) =>
              setProfileForm((prev) => ({ ...prev, gender: value }))
            }
          >
            <SelectTrigger>
              <SelectValue
                placeholder={t(
                  'settings.profileInformation.selectGender',
                  'Select Gender'
                )}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">
                {t('settings.profileInformation.male', 'Male')}
              </SelectItem>
              <SelectItem value="female">
                {t('settings.profileInformation.female', 'Female')}
              </SelectItem>
              <SelectItem value="other">
                {t('settings.profileInformation.other', 'Other')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="bio">
            {t('settings.profileInformation.bio', 'Bio')}
          </Label>
          <Textarea
            id="bio"
            value={profileForm.bio}
            onChange={(e) =>
              setProfileForm((prev) => ({ ...prev, bio: e.target.value }))
            }
            placeholder={t(
              'settings.profileInformation.tellAboutYourself',
              'Tell us about yourself'
            )}
            rows={3}
          />
        </div>
      </div>
      <Button onClick={handleProfileUpdate} disabled={updatingProfile}>
        <Save className="h-4 w-4 mr-2" />
        {updatingProfile
          ? t('settings.profileInformation.saving', 'Saving...')
          : t('settings.profileInformation.saveProfile', 'Save Profile')}
      </Button>
    </>
  );
};
