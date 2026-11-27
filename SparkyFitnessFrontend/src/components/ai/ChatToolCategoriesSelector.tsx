import { CHAT_TOOL_CATEGORY_LABELS } from '@/constants/chatToolCategoryLabels';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { SlidersHorizontalIcon } from 'lucide-react';
import {
  CHAT_TOOL_CATEGORY_FEATURES,
  isShownByFeature,
} from '@workspace/shared';
import { useChatToolCategories } from '@/contexts/ChatToolCategoriesContext';
import { useChatbotVisibility } from '@/contexts/ChatbotVisibilityContext';
import { useWebFeatures } from '@/hooks/Settings/useWebFeatures';
import { TooltipIconButton } from '@/components/tooltip-icon-button';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

/**
 * Runtime tool-category selector shown in the chat composer. Lets the user
 * trim which tool domains the chatbot may use (fewer tools = smaller prompt,
 * which weak local models handle far better). Selection is persisted per AI
 * service in localStorage via ChatToolCategoriesContext.
 *
 * The chip of an optional feature that is off on this website (Settings >
 * Features) is left out, with one line that says so. Only the chips change:
 * the stored selection, and so the tools the chatbot gets, stay as they were.
 * The count is about the chips shown, and it stays while the stored selection
 * is trimmed even if none of the chips shown is chosen (only a hidden category
 * is, so it reads 0); the empty hint only shows when nothing at all is chosen,
 * since a chosen hidden category is still sent.
 */
export const ChatToolCategoriesSelector: FC = () => {
  const { t } = useTranslation();
  const { allCategories, selected, presetFull, presetCore, clearAll, toggle } =
    useChatToolCategories();
  const { isShown } = useWebFeatures();
  const { closeChat } = useChatbotVisibility();
  const [open, setOpen] = useState(false);

  const shownCategories = allCategories.filter((slug) =>
    isShownByFeature(CHAT_TOOL_CATEGORY_FEATURES[slug], isShown)
  );
  const someFeaturesOff = shownCategories.length < allCategories.length;
  const selectedSet = new Set(selected);
  const count = shownCategories.filter((slug) => selectedSet.has(slug)).length;
  const isTrimmed = selected.length > 0 && count < shownCategories.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
            {shownCategories.map((slug) => {
              const [key, fallback] = CHAT_TOOL_CATEGORY_LABELS[slug];
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

          {selected.length === 0 && (
            <p className="text-muted-foreground text-xs">
              {t(
                'chat.toolCategories.emptyHint',
                'No categories selected — the chatbot will use its default tool set.'
              )}
            </p>
          )}

          {someFeaturesOff && (
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
              <span>
                {t(
                  'settings.webTabs.someFeaturesOff',
                  'Some features are turned off'
                )}
              </span>
              <span aria-hidden="true">·</span>
              <Button variant="link" className="h-auto p-0 text-xs" asChild>
                <Link
                  to="/settings?section=features"
                  onClick={(event) => {
                    // Opening Settings in another tab or window leaves this
                    // one as it is.
                    if (
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    ) {
                      return;
                    }
                    // The chat panel would stay over Settings (full screen on
                    // phones), so it closes along with this popover.
                    setOpen(false);
                    closeChat();
                  }}
                >
                  {t('settings.webTabs.manageFeatures', 'Manage')}
                </Link>
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
