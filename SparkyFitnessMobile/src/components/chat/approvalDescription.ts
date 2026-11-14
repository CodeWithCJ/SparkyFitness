import type { TFunction } from 'i18next';

export interface ApprovalDescriptionValues {
  server: string;
  otherServer: string;
}

/**
 * The card's sentence for a key from `chatApprovalDescriptionKey`. Each key is
 * written out so the i18n audit can read it and its English fallback; the
 * thing being run, changed or deleted is shown on its own line by the card.
 */
export function approvalDescription(
  t: TFunction,
  key: string,
  values: ApprovalDescriptionValues
): string {
  switch (key) {
    case 'chat.approval.run':
      return t('chat.approval.run', {
        ...values,
        defaultValue: 'After reading {{server}}, Sparky wants to run:',
      });
    case 'chat.approval.runCompleted':
      return t('chat.approval.runCompleted', {
        ...values,
        defaultValue: 'After reading {{server}}, Sparky ran:',
      });
    case 'chat.approval.runFailed':
      return t('chat.approval.runFailed', {
        ...values,
        defaultValue: 'After reading {{server}}, Sparky tried to run:',
      });
    case 'chat.approval.runUnused':
      return t('chat.approval.runUnused', {
        ...values,
        defaultValue: 'After reading {{server}}, Sparky wanted to run:',
      });
    case 'chat.approval.runPlain':
      return t('chat.approval.runPlain', {
        ...values,
        defaultValue: 'Sparky wants to run:',
      });
    case 'chat.approval.runPlainCompleted':
      return t('chat.approval.runPlainCompleted', {
        ...values,
        defaultValue: 'Sparky ran:',
      });
    case 'chat.approval.runPlainFailed':
      return t('chat.approval.runPlainFailed', {
        ...values,
        defaultValue: 'Sparky tried to run:',
      });
    case 'chat.approval.runPlainUnused':
      return t('chat.approval.runPlainUnused', {
        ...values,
        defaultValue: 'Sparky wanted to run:',
      });
    case 'chat.approval.send':
      return t('chat.approval.send', {
        ...values,
        defaultValue:
          'After reading {{server}}, Sparky wants to use this from {{otherServer}}:',
      });
    case 'chat.approval.sendCompleted':
      return t('chat.approval.sendCompleted', {
        ...values,
        defaultValue: 'After reading {{server}}, Sparky ran:',
      });
    case 'chat.approval.sendFailed':
      return t('chat.approval.sendFailed', {
        ...values,
        defaultValue: 'After reading {{server}}, Sparky tried to run:',
      });
    case 'chat.approval.sendUnused':
      return t('chat.approval.sendUnused', {
        ...values,
        defaultValue:
          'After reading {{server}}, Sparky wanted to use this from {{otherServer}}:',
      });
    case 'chat.approval.delete':
      return t('chat.approval.delete', {
        ...values,
        defaultValue: 'Sparky wants to delete:',
      });
    case 'chat.approval.deleteCompleted':
      return t('chat.approval.deleteCompleted', {
        ...values,
        defaultValue: 'You allowed Sparky to delete:',
      });
    case 'chat.approval.deleteFailed':
      return t('chat.approval.deleteFailed', {
        ...values,
        defaultValue: 'Sparky tried to delete:',
      });
    case 'chat.approval.deleteUnused':
      return t('chat.approval.deleteUnused', {
        ...values,
        defaultValue: 'Sparky wanted to delete:',
      });
    case 'chat.approval.deleteAfter':
      return t('chat.approval.deleteAfter', {
        ...values,
        defaultValue: 'After reading {{server}}, Sparky wants to delete:',
      });
    case 'chat.approval.deleteAfterCompleted':
      return t('chat.approval.deleteAfterCompleted', {
        ...values,
        defaultValue: 'After Sparky read {{server}}, you allowed it to delete:',
      });
    case 'chat.approval.deleteAfterFailed':
      return t('chat.approval.deleteAfterFailed', {
        ...values,
        defaultValue: 'After reading {{server}}, Sparky tried to delete:',
      });
    case 'chat.approval.deleteAfterUnused':
      return t('chat.approval.deleteAfterUnused', {
        ...values,
        defaultValue: 'After reading {{server}}, Sparky wanted to delete:',
      });
    case 'chat.approval.change':
      return t('chat.approval.change', {
        ...values,
        defaultValue: 'Sparky wants to make this change:',
      });
    case 'chat.approval.changeCompleted':
      return t('chat.approval.changeCompleted', {
        ...values,
        defaultValue: 'You allowed Sparky to make this change:',
      });
    case 'chat.approval.changeFailed':
      return t('chat.approval.changeFailed', {
        ...values,
        defaultValue: 'Sparky tried to make this change:',
      });
    case 'chat.approval.changeUnused':
      return t('chat.approval.changeUnused', {
        ...values,
        defaultValue: 'Sparky wanted to make this change:',
      });
    case 'chat.approval.changeAfter':
      return t('chat.approval.changeAfter', {
        ...values,
        defaultValue:
          'After reading {{server}}, Sparky wants to make this change:',
      });
    case 'chat.approval.changeAfterCompleted':
      return t('chat.approval.changeAfterCompleted', {
        ...values,
        defaultValue:
          'After Sparky read {{server}}, you allowed it to make this change:',
      });
    case 'chat.approval.changeAfterFailed':
      return t('chat.approval.changeAfterFailed', {
        ...values,
        defaultValue:
          'After reading {{server}}, Sparky tried to make this change:',
      });
    case 'chat.approval.changeAfterUnused':
      return t('chat.approval.changeAfterUnused', {
        ...values,
        defaultValue:
          'After reading {{server}}, Sparky wanted to make this change:',
      });
    default:
      return '';
  }
}
