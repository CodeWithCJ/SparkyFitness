import { parseISO } from 'date-fns';
import { CoachResponse } from './Chatbot_types';
import { debug, info, error, UserLoggingLevel } from '@/utils/logging';
import { apiCall } from '../api';
import { getPrimaryWaterContainer } from '../waterContainerService'; // Import getPrimaryWaterContainer

export const processWaterInput = async (
  data: { quantity: number; unit?: 'oz' | 'cup' | 'glass' },
  entryDate: string | undefined,
  formatDateInUserTimezone: (date: string | Date, formatStr?: string) => string,
  userLoggingLevel: UserLoggingLevel,
  transactionId: string
): Promise<CoachResponse> => {
  try {
    debug(userLoggingLevel, `[${transactionId}] Processing water input with data:`, data, 'and entryDate:', entryDate);

    const { quantity, unit = 'glass' } = data;
    const rawEntryDate = entryDate;
    debug(userLoggingLevel, `[${transactionId}] Extracted quantity:`, quantity, 'unit:', unit, 'and rawEntryDate:', rawEntryDate);

    if (typeof quantity !== 'number' || isNaN(quantity) || quantity <= 0) {
      error(userLoggingLevel, `❌ [Water Coach] Invalid or non-positive quantity received:`, quantity);
      return {
        action: 'none',
        response: 'Sorry, I could not understand the quantity of water or it was not a positive number. Please specify a valid number (e.g., "8 oz").'
      };
    }

    // Convert all units to a base unit of ml for backend storage
    const convertToMl = (vol: number, u: string) => {
        switch (u) {
            case 'oz':
                return vol * 29.5735;
            case 'cup':
                return vol * 240;
            case 'glass':
            default:
                return vol * 240; // Assume a standard glass is 240ml
        }
    };

    const waterMl = convertToMl(quantity, unit);

    const dateToUse = formatDateInUserTimezone(rawEntryDate ? parseISO(rawEntryDate) : new Date(), 'yyyy-MM-dd');
    debug(userLoggingLevel, `[${transactionId}] Date to use for logging:`, dateToUse);

    info(userLoggingLevel, `[${transactionId}] Saving water intake: ${waterMl} ml on ${dateToUse}`);

    const primaryContainer = await getPrimaryWaterContainer();
    const containerId = primaryContainer?.id || '00000000-0000-0000-0000-000000000001'; // Use primary container ID or a default

    await apiCall('/measurements/water-intake', {
      method: 'POST',
      body: {
        entry_date: dateToUse,
        change_drinks: waterMl,
        container_id: containerId,
      },
    });

    info(userLoggingLevel, `[${transactionId}] Water intake saved successfully.`);

    return {
      action: 'water_added',
      response: `✅ **Added ${waterMl} ml of water to your intake on ${formatDateInUserTimezone(dateToUse, 'PPP')}!**\n\nKeep up the great work!`
    };

  } catch (err) {
    error(userLoggingLevel, `❌ [Water Coach] Error processing water input:`, err);
    console.error(`❌ [Water Coach] Full error details:`, err); // Added console.error for direct visibility
    return {
      action: 'none',
      response: 'Sorry, I had trouble logging your water intake. Please try again.'
    };
  }
};