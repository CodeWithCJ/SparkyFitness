import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { User, Camera } from 'lucide-react';
import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { useTranslation } from 'react-i18next';
import { getInitials } from '@/utils/settings';
import { useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import {
  useAvatarQuery,
  useProfileQuery,
  useUploadAvatarMutation,
} from '@/hooks/Settings/useProfile';
import { ProfileFormContent } from './ProfileFormContent';

export const ProfileInformation = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const { data: profile, isLoading: isProfileLoading } = useProfileQuery(
    user?.id
  );

  const { data: avatarBlob } = useAvatarQuery(profile?.avatar_url);

  const avatarObjectURL = useMemo(() => {
    if (!avatarBlob) return null;
    return URL.createObjectURL(avatarBlob);
  }, [avatarBlob]);
  const { mutateAsync: uploadAvatar, isPending: uploadingImage } =
    useUploadAvatarMutation();

  useEffect(() => {
    return () => {
      if (avatarObjectURL) {
        URL.revokeObjectURL(avatarObjectURL);
      }
    };
  }, [avatarObjectURL]);

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
    <AccordionItem
      value="profile-information"
      className="border rounded-lg mb-4"
    >
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
            {avatarObjectURL ? ( // Use avatarObjectURL for display
              <AvatarImage
                src={avatarObjectURL}
                alt={profile?.full_name || 'User'}
              />
            ) : (
              <AvatarFallback className="text-lg">
                {getInitials(profile?.full_name)}
              </AvatarFallback>
            )}
          </Avatar>
          <div>
            <Label htmlFor="avatar-upload" className="cursor-pointer">
              <Button
                variant="outline"
                size="sm"
                disabled={uploadingImage}
                asChild
              >
                <span>
                  <Camera className="h-4 w-4 mr-2" />
                  {uploadingImage
                    ? t('settings.profileInformation.uploading', 'Uploading...')
                    : t(
                        'settings.profileInformation.changePhoto',
                        'Change Photo'
                      )}
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
              {t('settings.profileInformation.photoSize', 'PNG, JPG up to 5MB')}
            </p>
          </div>
        </div>

        <Separator />

        <ProfileFormContent key={profile.id} profile={profile} />
      </AccordionContent>
    </AccordionItem>
  );
};
