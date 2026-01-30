
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { useAuth } from '@/hooks/useAuth';
import { Users, User, Loader2 } from 'lucide-react';

const ProfileSwitcher = () => {
  const { user } = useAuth();
  const {
    activeUserId,
    isActingOnBehalf,
    accessibleUsers,
    switchToUser
  } = useActiveUser();
  const [isSwitching, setIsSwitching] = useState(false);

  if (!user) return null;
  // If not acting on behalf and no accessible users, hide the switcher
  if (!isActingOnBehalf && accessibleUsers.length === 0) return null;

  // Filter out users where only food_list permission is granted
  const switchableUsers = accessibleUsers.filter(accessibleUser => {
    const permissions = accessibleUser.permissions;
    if (!permissions || typeof permissions !== 'object') return true;

    const hasOnlyFoodList = permissions.food_list &&
      !permissions.calorie &&
      !permissions.checkin &&
      !permissions.reports &&
      !permissions.diary;
    return !hasOnlyFoodList;
  });

  if (!isActingOnBehalf && switchableUsers.length === 0) return null;

  const handleValueChange = async (value: string) => {
    setIsSwitching(true);
    try {
      await switchToUser(value);
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <Select value={activeUserId || user.id} onValueChange={handleValueChange} disabled={isSwitching}>
      <SelectTrigger className="w-auto h-9 p-2 border-none bg-transparent hover:bg-accent">
        {isSwitching ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Users className="h-4 w-4" />
        )}
        {isActingOnBehalf && (
          <div className="w-2 h-2 bg-blue-500 rounded-full ml-1" />
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={user.id}>
          <div className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span>Your Profile</span>
          </div>
        </SelectItem>
        {switchableUsers.map((accessibleUser) => (
          <SelectItem key={accessibleUser.user_id} value={accessibleUser.user_id}>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>{accessibleUser.full_name || accessibleUser.email}</span>
              <span className="text-xs text-gray-500">
                (Family)
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default ProfileSwitcher;
