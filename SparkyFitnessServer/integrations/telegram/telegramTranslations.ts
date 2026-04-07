import TelegramBot from 'node-telegram-bot-api';

export interface TelegramUser {
  id: string;
  name: string;
  language: string;
  telegram_chat_id: string;
  timezone?: string;
}

export interface TranslationSet {
  greeting: string;
  helpPrompt: string;
  welcome: string;
  noRecentActivities: string;
  recentActivities: string;
  todayLog: string;
  macros: string;
  profile: string;
  language: string;
  diary: string;
  exercises: string;
  syncMenu: string;
  back: string;
  langSet: string;
  syncGarmin: string;
  addWater: string;
  [key: string]: string;
}

export function getTranslations(lang: string = 'en'): TranslationSet {
  const dicts: Record<string, TranslationSet> = {
    en: {
      greeting: 'Hello',
      helpPrompt: 'How can I help you today?',
      welcome: 'Welcome!',
      noRecentActivities: 'No recent activities found.',
      recentActivities: '🏋️ Recent Activities',
      todayLog: '🍏 What did I eat?',
      macros: '📊 Macros/Profile',
      profile: '👤 Profile',
      language: '🌐 Language',
      diary: '📔 Diary Menu',
      exercises: '🏋️ Exercises',
      syncMenu: '🔄 Sync Menu',
      back: '⬅️ Back',
      langSet: '✅ Language updated to English.',
      syncGarmin: 'Garmin Data Sync',
      addWater: '+ 1🥛',
    },
    uk: {
      greeting: 'Привіт',
      helpPrompt: 'Чим я можу допомогти?',
      welcome: 'Вітаємо!',
      noRecentActivities: 'Останніх занять не знайдено.',
      recentActivities: '🏋️ Останні заняття',
      todayLog: "🍏 Що я з'їв?",
      macros: '📊 Макроси/Профіль',
      profile: '👤 Профіль',
      language: '🌐 Мова',
      diary: '📔 Меню щоденника',
      exercises: '🏋️ Заняття',
      syncMenu: '🔄 Меню синхронізації',
      back: '⬅️ Назад',
      langSet: '✅ Мову змінено на українську.',
      syncGarmin: 'Синхронізація Garmin',
      addWater: '+ 1🥛',
    },
    ru: {
      greeting: 'Привет',
      helpPrompt: 'Чем я могу помочь?',
      welcome: 'Добро пожаловать!',
      noRecentActivities: 'Последних занятий не найдено.',
      recentActivities: '🏋️ Последние занятия',
      todayLog: '🍏 Что я съел?',
      macros: '📊 Макросы/Профиль',
      profile: '👤 Профиль',
      language: '🌐 Язык',
      diary: '📔 Меню дневника',
      exercises: '🏋️ Занятия',
      syncMenu: '🔄 Меню синхронизации',
      back: '⬅️ Назад',
      langSet: '✅ Язык изменен на русский.',
      syncGarmin: 'Синхронизация Garmin',
      addWater: '+ 1🥛',
    },
  };
  return dicts[lang] || dicts.en;
}

export function getMainMenuKeyboard(t: TranslationSet): TelegramBot.SendMessageOptions {
  return {
    reply_markup: {
      keyboard: [
        [{ text: t.profile }, { text: t.diary }],
        [{ text: t.syncMenu }, { text: t.language }],
        [{ text: t.addWater }],
      ],
      resize_keyboard: true,
    },
  };
}

export function getDiaryMenuKeyboard(t: TranslationSet): TelegramBot.SendMessageOptions {
  return {
    reply_markup: {
      keyboard: [
        [{ text: t.todayLog }],
        [{ text: t.exercises }],
        [{ text: t.back }],
      ],
      resize_keyboard: true,
    },
  };
}
