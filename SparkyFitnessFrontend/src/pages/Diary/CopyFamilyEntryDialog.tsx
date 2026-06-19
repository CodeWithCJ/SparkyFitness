import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CalendarIcon, Users, ArrowRightLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseISO } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useAuth } from '@/hooks/useAuth';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { useFamilyAccess } from '@/hooks/Settings/useFamilyAccess';
import { useMealTypes } from '@/hooks/Diary/useMealTypes';
import {
  useCopyFoodEntriesFromUserMutation,
  useCopyFoodEntriesToUserMutation,
} from '@/hooks/Diary/useFoodEntries';
import { toast } from '@/hooks/use-toast';
import { info } from '@/utils/logging';

interface CopyFamilyEntryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sourceMealType: string;
  currentDate: string; // YYYY-MM-DD
}

const CopyFamilyEntryDialog = ({
  isOpen,
  onClose,
  sourceMealType,
  currentDate,
}: CopyFamilyEntryDialogProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { accessibleUsers } = useActiveUser();
  const { formatDate, formatDateInUserTimezone, loggingLevel } =
    usePreferences();

  // Date values initialized with parsed currentDate or fallback to today
  const initialDate = currentDate ? parseISO(currentDate) : new Date();

  const [activeTab, setActiveTab] = useState<'from' | 'to'>('from');
  const [selectedFamilyMember, setSelectedFamilyMember] = useState<string>('');

  const [sourceDate, setSourceDate] = useState<Date | undefined>(initialDate);
  const [sourceMealTypeState, setSourceMealTypeState] =
    useState<string>(sourceMealType);

  const [targetDate, setTargetDate] = useState<Date | undefined>(initialDate);
  const [targetMealTypeState, setTargetMealTypeState] =
    useState<string>(sourceMealType);

  const { data: familyAccess = [] } = useFamilyAccess(user?.activeUserId);
  const { data: availableMealTypes } = useMealTypes();

  const { mutateAsync: copyFromFamily, isPending: isCopyingFrom } =
    useCopyFoodEntriesFromUserMutation();
  const { mutateAsync: copyToFamily, isPending: isCopyingTo } =
    useCopyFoodEntriesToUserMutation();

  // Filter eligible family members who granted BOTH manage and library permissions to me
  const eligibleFamily = familyAccess.filter(
    (access) =>
      user &&
      access.family_user_id === user.activeUserId && // Granted to active user
      access.is_active && // Share is active
      access.status === 'active' && // Rule approved
      access.access_permissions.can_manage_diary && // Manage permission check
      access.access_permissions.can_view_food_library && // Food library permission check
      (!access.access_end_date || new Date(access.access_end_date) > new Date()) // Not expired
  );

  //console.log('[CopyFamilyEntryDialog] familyAccess:', familyAccess);
  //console.log('[CopyFamilyEntryDialog] eligibleFamily:', eligibleFamily);

  const activeFamilyMember =
    selectedFamilyMember || eligibleFamily[0]?.owner_user_id || '';

  const handleCopyClick = async () => {
    if (!activeFamilyMember) {
      toast({
        title: t('common.error', 'Error'),
        description: t(
          'diary.copyFamilyNoMember',
          'Please select a family member.'
        ),
        variant: 'destructive',
      });
      return;
    }

    if (!sourceDate || !targetDate) {
      toast({
        title: t('common.error', 'Error'),
        description: t(
          'diary.copyFamilyNoDate',
          'Please select valid source and target dates.'
        ),
        variant: 'destructive',
      });
      return;
    }

    const formattedSourceDate = formatDateInUserTimezone(
      sourceDate,
      'yyyy-MM-dd'
    );
    const formattedTargetDate = formatDateInUserTimezone(
      targetDate,
      'yyyy-MM-dd'
    );

    try {
      if (activeTab === 'from') {
        info(
          loggingLevel,
          `Copying FROM family member ${activeFamilyMember} (${formattedSourceDate} ${sourceMealTypeState}) to target (${formattedTargetDate} ${targetMealTypeState})`
        );
        await copyFromFamily({
          familyUserId: activeFamilyMember,
          sourceDate: formattedSourceDate,
          sourceMealType: sourceMealTypeState,
          targetDate: formattedTargetDate,
          targetMealType: targetMealTypeState,
        });
        toast({
          title: t('common.success', 'Success'),
          description: t(
            'diary.copyFamilyFromSuccess',
            'Entries copied from family successfully.'
          ),
        });
      } else {
        info(
          loggingLevel,
          `Copying TO family member ${activeFamilyMember} (${formattedTargetDate} ${targetMealTypeState}) from source (${formattedSourceDate} ${sourceMealTypeState})`
        );
        await copyToFamily({
          familyUserId: activeFamilyMember,
          sourceDate: formattedSourceDate,
          sourceMealType: sourceMealTypeState,
          targetDate: formattedTargetDate,
          targetMealType: targetMealTypeState,
        });
        toast({
          title: t('common.success', 'Success'),
          description: t(
            'diary.copyFamilyToSuccess',
            'Entries copied to family successfully.'
          ),
        });
      }
      onClose();
    } catch (err) {
      console.error('Error during family diary copy:', err);
    }
  };

  const getDisplayName = (name: string) => {
    const lower = name.toLowerCase();
    if (lower === 'breakfast') return t('common.breakfast', 'Breakfast');
    if (lower === 'lunch') return t('common.lunch', 'Lunch');
    if (lower === 'dinner') return t('common.dinner', 'Dinner');
    if (lower === 'snacks') return t('common.snacks', 'Snacks');
    return name;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {t('diary.copyFamilyTitle', 'Copy Food with Family')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'diary.copyFamilyDesc',
              'Symmetrically copy diary entries between your diary and family member diaries.'
            )}
          </DialogDescription>
        </DialogHeader>

        {eligibleFamily.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground text-sm space-y-2">
            <p className="font-semibold">
              {t(
                'diary.copyFamilyNoConnections',
                'No authorized family connections found.'
              )}
            </p>
            <p className="text-xs max-w-xs mx-auto">
              {t(
                'diary.copyFamilyNoConnectionsHelp',
                'Your family members must grant you both "Can Manage Diary" and "Can Use My Food & Meal Library" permissions to enable sharing.'
              )}
            </p>
          </div>
        ) : (
          <Tabs
            defaultValue="from"
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as 'from' | 'to')}
            className="w-full py-2"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="from">
                {t('diary.copyFamilyTabFrom', 'Copy From Family')}
              </TabsTrigger>
              <TabsTrigger value="to">
                {t('diary.copyFamilyTabTo', 'Copy To Family')}
              </TabsTrigger>
            </TabsList>

            <div className="grid gap-4 py-4 mt-2">
              {/* Family Member Select */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label
                  htmlFor="familyMember"
                  className="text-right text-xs font-semibold"
                >
                  {t('diary.copyFamilyMemberLabel', 'Family Member')}
                </Label>
                <Select
                  value={activeFamilyMember}
                  onValueChange={setSelectedFamilyMember}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue
                      placeholder={t(
                        'diary.copyFamilyMemberPlaceholder',
                        'Select family member'
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleFamily.map((access) => {
                      const match = accessibleUsers.find(
                        (u) => u.user_id === access.owner_user_id
                      );
                      const label =
                        match?.full_name ||
                        access.owner_full_name ||
                        match?.email ||
                        access.owner_email;
                      return (
                        <SelectItem
                          key={access.id}
                          value={access.owner_user_id}
                        >
                          {label}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Source Details */}
              <div className="border rounded-lg p-3 bg-muted/40 space-y-3">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  {activeTab === 'from'
                    ? t('diary.copySourceTitleFamily', 'Source (Family)')
                    : t('diary.copySourceTitleSelf', 'Source (You)')}
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right text-xs">
                    {t('common.date', 'Date')}
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'col-span-3 justify-start text-left font-normal text-xs',
                          !sourceDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {sourceDate ? (
                          formatDate(sourceDate)
                        ) : (
                          <span>{t('common.pickADate', 'Pick a date')}</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={sourceDate}
                        onSelect={setSourceDate}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right text-xs">
                    {t('diary.copyFamilyMealType', 'Meal Type')}
                  </Label>
                  <Select
                    value={sourceMealTypeState}
                    onValueChange={setSourceMealTypeState}
                  >
                    <SelectTrigger className="col-span-3 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMealTypes?.map((meal) => (
                        <SelectItem key={meal.id} value={meal.name}>
                          {getDisplayName(meal.name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Arrow Indicator */}
              <div className="flex justify-center -my-2">
                <div className="bg-primary/10 text-primary p-1.5 rounded-full border border-primary/20">
                  <ArrowRightLeft
                    className={cn(
                      'h-4 w-4 transition-transform duration-300',
                      activeTab === 'to' && 'rotate-180'
                    )}
                  />
                </div>
              </div>

              {/* Target Details */}
              <div className="border rounded-lg p-3 bg-muted/40 space-y-3">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  {activeTab === 'from'
                    ? t('diary.copyTargetTitleSelf', 'Target (You)')
                    : t('diary.copyTargetTitleFamily', 'Target (Family)')}
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right text-xs">
                    {t('common.date', 'Date')}
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'col-span-3 justify-start text-left font-normal text-xs',
                          !targetDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {targetDate ? (
                          formatDate(targetDate)
                        ) : (
                          <span>{t('common.pickADate', 'Pick a date')}</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={targetDate}
                        onSelect={setTargetDate}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right text-xs">
                    {t('diary.copyFamilyMealType', 'Meal Type')}
                  </Label>
                  <Select
                    value={targetMealTypeState}
                    onValueChange={setTargetMealTypeState}
                  >
                    <SelectTrigger className="col-span-3 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMealTypes?.map((meal) => (
                        <SelectItem key={meal.id} value={meal.name}>
                          {getDisplayName(meal.name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </Tabs>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          {eligibleFamily.length > 0 && (
            <Button
              onClick={handleCopyClick}
              disabled={
                isCopyingFrom ||
                isCopyingTo ||
                !activeFamilyMember ||
                !sourceDate ||
                !targetDate
              }
            >
              {isCopyingFrom || isCopyingTo
                ? t('common.copying', 'Copying...')
                : t('copyFoodEntryDialog.copyButton', 'Copy')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CopyFamilyEntryDialog;
