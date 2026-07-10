import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { User, Camera } from 'lucide-react';
import { AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { useTranslation } from 'react-i18next';
import { getInitials } from '@/utils/settings';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import {
  useProfileQuery,
  useUploadAvatarMutation,
} from '@/hooks/Settings/useProfile';
import { ProfileFormContent } from './ProfileFormContent';
import {
  areUploadsEnabled,
  useDeploymentCapabilities,
} from '@/hooks/useDeploymentCapabilities';
import { useRef } from 'react';

export const ProfileInformation = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const { data: profile, isLoading: isProfileLoading } = useProfileQuery(
    user?.id
  );
  const { data: capabilities } = useDeploymentCapabilities();
  const uploadsEnabled = areUploadsEnabled(capabilities);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const { mutateAsync: uploadAvatar, isPending: uploadingImage } =
    useUploadAvatarMutation(user!.activeUserId);

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!event.target.files || !event.target.files[0] || !user) return;

    const file = event.target.files[0];

    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Error',
        description: 'Please select an image file',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Error',
        description: 'Image must be less than 5MB',
        variant: 'destructive',
      });
      return;
    }

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      await uploadAvatar(formData);
    } catch (error: unknown) {
      console.error(error);
    }
  };
  if (isProfileLoading || !profile) return null;
  return (
    <>
      <AccordionTrigger
        className="flex items-center gap-2 p-4 hover:no-underline"
        description={t(
          'settings.profileInformation.description',
          'Manage your personal information and profile picture'
        )}
      >
        <User className="h-5 w-5" />
        {t('settings.profileInformation.title', 'Profile Information')}
      </AccordionTrigger>
      <AccordionContent className="p-4 pt-0 space-y-6">
        {/* Profile Picture */}
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20">
            {profile?.avatar_url ? ( // Use avatar_url directly
              <AvatarImage
                src={profile.avatar_url}
                alt={profile?.full_name || 'User'}
              />
            ) : (
              <AvatarFallback className="text-lg">
                {getInitials(profile?.full_name)}
              </AvatarFallback>
            )}
          </Avatar>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadingImage || !uploadsEnabled}
              onClick={() => avatarInputRef.current?.click()}
            >
              <Camera className="h-4 w-4 me-2" />
              {uploadingImage
                ? t('settings.profileInformation.uploading', 'Uploading...')
                : t('settings.profileInformation.changePhoto', 'Change Photo')}
            </Button>
            <Input
              ref={avatarInputRef}
              id="avatar-upload"
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              disabled={!uploadsEnabled}
              className="hidden"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {uploadsEnabled
                ? t(
                    'settings.profileInformation.photoSize',
                    'PNG, JPG up to 5MB'
                  )
                : t(
                    'settings.profileInformation.uploadsUnavailable',
                    'Photo uploads are unavailable in this deployment.'
                  )}
            </p>
          </div>
        </div>

        <Separator />

        <ProfileFormContent key={profile.id} profile={profile} />
      </AccordionContent>
    </>
  );
};
