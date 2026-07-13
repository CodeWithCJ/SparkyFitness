import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontalIcon } from 'lucide-react';
import type { ChatToolCategorySlug } from '@workspace/shared';
import { useChatToolCategories } from '@/contexts/ChatToolCategoriesContext';
import { TooltipIconButton } from '@/components/tooltip-icon-button';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

// English fallbacks kept inline (2nd arg) so the control is readable before the
// translation keys land in every locale, matching the repo's t('key', 'text')
// convention.
const CATEGORY_LABELS: Record<ChatToolCategorySlug, [string, string]> = {
  food: ['chat.toolCategories.food', 'Food & Water'],
  exercise: ['chat.toolCategories.exercise', 'Exercise'],
  checkin: ['chat.toolCategories.checkin', 'Body & Check-ins'],
  goals: ['chat.toolCategories.goals', 'Goals'],
  reports: ['chat.toolCategories.reports', 'Reports & Analytics'],
  coaching: ['chat.toolCategories.coaching', 'Coaching'],
  vision: ['chat.toolCategories.vision', 'Vision'],
  profile: ['chat.toolCategories.profile', 'Profile & Habits'],
};

/**
 * Runtime tool-category selector shown in the chat composer. Lets the user
 * trim which tool domains the chatbot may use (fewer tools = smaller prompt,
 * which weak local models handle far better). Selection is persisted per AI
 * service in localStorage via ChatToolCategoriesContext.
 */
export const ChatToolCategoriesSelector: FC = () => {
  const { t } = useTranslation();
  const { allCategories, selected, presetFull, presetCore, clearAll, toggle } =
    useChatToolCategories();

  const selectedSet = new Set(selected);
  const count = selected.length;
  const isTrimmed = count > 0 && count < allCategories.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <TooltipIconButton
          tooltip={t('chat.toolCategories.tooltip', 'Choose chatbot tools')}
          side="top"
          type="button"
          variant="ghost"
          size="icon"
          className="relative size-8"
          aria-label={t('chat.toolCategories.tooltip', 'Choose chatbot tools')}
        >
          <SlidersHorizontalIcon className="size-4" />
          {isTrimmed && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-medium text-white">
              {count}
            </span>
          )}
        </TooltipIconButton>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-72">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium">
              {t('chat.toolCategories.title', 'Chatbot tools')}
            </p>
            <p className="text-muted-foreground text-xs">
              {t(
                'chat.toolCategories.description',
                'Fewer tools help smaller local models respond reliably.'
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={presetFull}
            >
              {t('chat.toolCategories.presetFull', 'Full')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={presetCore}
            >
              {t('chat.toolCategories.presetCore', 'Core')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={clearAll}
            >
              {t('chat.toolCategories.clearAll', 'Clear all')}
            </Button>
          </div>

          <Separator />

          <div className="flex flex-wrap gap-1.5">
            {allCategories.map((slug) => {
              const [key, fallback] = CATEGORY_LABELS[slug];
              return (
                <Toggle
                  key={slug}
                  size="sm"
                  variant="outline"
                  pressed={selectedSet.has(slug)}
                  onPressedChange={() => toggle(slug)}
                  className="h-7 px-2 text-xs"
                  aria-label={t(key, fallback)}
                >
                  {t(key, fallback)}
                </Toggle>
              );
            })}
          </div>

          {count === 0 && (
            <p className="text-muted-foreground text-xs">
              {t(
                'chat.toolCategories.emptyHint',
                'No categories selected — the chatbot will use its default tool set.'
              )}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
