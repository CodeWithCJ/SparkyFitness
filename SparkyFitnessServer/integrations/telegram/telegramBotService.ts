import TelegramBot from 'node-telegram-bot-api';
import { log } from '../../config/logging';
import globalSettingsRepository from '../../models/globalSettingsRepository';
import chatService from '../../services/chatService';
import * as chatRepository from '../../models/chatRepository';
import * as exerciseEntry from '../../models/exerciseEntry';
import * as poolManager from '../../db/poolManager';
import { executeIntent } from './intentExecutor';
import axios from 'axios';
const { loadUserTimezone } = require('../../utils/timezoneLoader');
const { todayInZone } = require('@workspace/shared');

interface TelegramUser {
  id: string;
  name: string;
  language: string;
  telegram_chat_id: string;
}

interface TranslationSet {
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
  // ... more as needed
  [key: string]: string;
}

/**
 * Service to manage Telegram Bot interactions.
 * Connects Telegram users to SparkyFitness AI and database.
 */
class TelegramBotService {
  private bot: TelegramBot | null = null;

  constructor() {
    this.bot = null;
  }

  async initialize(): Promise<void> {
    try {
      const settings = await globalSettingsRepository.getGlobalSettings();
      const token =
        settings.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN;

      if (!token) {
        log(
          'info',
          '[TELEGRAM BOT] Bot token not configured. Telegram integration is inactive.'
        );
        return;
      }

      const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;

      if (webhookUrl) {
        log(
          'info',
          `[TELEGRAM BOT] Initializing in WEBHOOK mode. URL: ${webhookUrl}`
        );
        this.bot = new TelegramBot(token, { polling: false });
        const fullWebhookUrl = `${webhookUrl.replace(/\/$/, '')}/api/telegram/webhook`;
        await this.bot.setWebHook(fullWebhookUrl);
        log('info', `[TELEGRAM BOT] Webhook registered: ${fullWebhookUrl}`);
      } else {
        log('info', '[TELEGRAM BOT] Initializing in POLLING mode.');
        this.bot = new TelegramBot(token, { polling: true });
      }

      log(
        'info',
        `[TELEGRAM BOT] Bot active: ${settings.telegram_bot_name || 'SparkyFitnessBot'}`
      );
      this.setupHandlers();
    } catch (error) {
      log('error', '[TELEGRAM BOT] Initialization error:', error);
    }
  }

  handleUpdate(update: any): void {
    if (this.bot) {
      this.bot.processUpdate(update);
    }
  }

  private setupHandlers(): void {
    if (!this.bot) return;

    this.bot.onText(/\/start( (.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const linkParam = match ? match[2] : null;

      if (linkParam) {
        return this.handleLink(chatId, linkParam.trim());
      }

      const user = await this.findUserAndLanguageByChatId(chatId);

      if (user) {
        const lang = user.language;
        const t = this.getTranslations(lang);
        const keyboardOptions = this.getMainMenuKeyboard(t);

        return this.bot!.sendMessage(
          chatId,
          `${t.greeting}, ${user.name}! ${t.helpPrompt}`,
          keyboardOptions
        );
      }

      this.bot!.sendMessage(
        chatId,
        'Welcome to SparkyFitness! Link your account in the web app under Settings → Telegram, then send `/start <CODE>`.'
      );
    });

    this.bot.onText(/\/(profile|профиль)/i, async (msg) => {
        const chatId = msg.chat.id;
        const user = await this.findUserAndLanguageByChatId(chatId);
        if (!user) return;

        this.bot!.sendChatAction(chatId, 'typing').catch(() => {});
        try {
          const profileText = await this.formatProfileResponse(
            user.id,
            user.language
          );
          this.bot!.sendMessage(chatId, profileText, { parse_mode: 'HTML' });
        } catch (e: any) {
          this.bot!.sendMessage(chatId, `❌ Error: ${e.message}`);
        }
      }
    );

    this.bot.onText(/\/(diary|дневник|щоденник)/i, async (msg) => {
        const chatId = msg.chat.id;
        const user = await this.findUserAndLanguageByChatId(chatId);
        if (!user) return;

        const t = this.getTranslations(user.language);
        return this.bot!.sendMessage(chatId, t.diary, this.getDiaryMenuKeyboard(t));
      }
    );

    this.bot.onText(/\/(exercises|упражнения|вправи)/i, async (msg) => {
        const chatId = msg.chat.id;
        const user = await this.findUserAndLanguageByChatId(chatId);
        if (!user) return;

        this.bot!.sendChatAction(chatId, 'typing').catch(() => {});
        return this.handleDirectRecentExercises(chatId, user);
      }
    );

    this.bot.onText(/\/(sync|синхронизировать|синхронізувати)/i, async (msg) => {
        const chatId = msg.chat.id;
        const user = await this.findUserAndLanguageByChatId(chatId);
        if (!user) return;
        return this.showSyncMenu(chatId, user.language);
      }
    );

    this.bot.on('message', async (msg) => {
      if (msg.text && msg.text.startsWith('/')) return;

      const chatId = msg.chat.id;
      const user = await this.findUserAndLanguageByChatId(chatId);

      if (!user) {
        this.bot!.sendMessage(
          chatId,
          'Your account is not linked. Please link it in the web app under Settings → Telegram, then send `/start <CODE>`.'
        );
        return;
      }

      const t = this.getTranslations(user.language);
      
      // Centralized button handling
      if (msg.text === t.profile) {
        this.bot!.sendChatAction(chatId, 'typing').catch(() => {});
        const profileText = await this.formatProfileResponse(user.id, user.language);
        this.bot!.sendMessage(chatId, profileText, { parse_mode: 'HTML' });
        return;
      }

      if (msg.text === t.diary) {
        this.bot!.sendMessage(chatId, t.diary, this.getDiaryMenuKeyboard(t));
        return;
      }

      if (msg.text === t.exercises) {
        this.bot!.sendChatAction(chatId, 'typing').catch(() => {});
        return this.handleDirectRecentExercises(chatId, user);
      }

      if (msg.text === t.syncMenu) {
        return this.showSyncMenu(chatId, user.language);
      }

      if (msg.text === t.language) {
        return this.showLanguageMenu(chatId);
      }

      if (msg.text === t.back) {
        return this.bot!.sendMessage(chatId, t.welcome, this.getMainMenuKeyboard(t));
      }

      // Handle custom standard commands directly without AI
      if (msg.text === t.todayLog) {
        await this.handleDirectTodayLog(chatId, user);
        return;
      }

      if (msg.text === t.macros) {
        this.bot!.sendChatAction(chatId, 'typing').catch(() => {});
        try {
          const profileText = await this.formatProfileResponse(
            user.id,
            user.language
          );
          this.bot!.sendMessage(chatId, profileText, { parse_mode: 'HTML' });
        } catch (e: any) {
          this.bot!.sendMessage(chatId, `❌ Error: ${e.message}`);
        }
        return;
      }

      await this.processMessage(chatId, user, msg);
    });

    this.bot.on('callback_query', async (query) => {
      const chatId = query.message?.chat.id;
      if (!chatId) return;
      
      const user = await this.findUserAndLanguageByChatId(chatId);
      if (!user) return;

      const [action, type] = (query.data || '').split(':');

      if (action === 'setlang') {
        const newLang = type;
        await this.setLanguage(user.id, newLang);
        const t = this.getTranslations(newLang);

        await this.bot!.deleteMessage(chatId, query.message!.message_id).catch(() => false);
        await this.bot!.sendMessage(
          chatId,
          t.langSet,
          this.getMainMenuKeyboard(t)
        );
        return this.bot!.answerCallbackQuery(query.id).catch(() => {});
      } else if (action === 'sync') {
        if (type === 'garmin') {
          const garminService = require('../../services/garminService');
          this.bot!.sendMessage(
            chatId,
            '🔄 Синхронізація з Garmin запущена... Це може зайняти хвилину.'
          ).catch(() => {});
          try {
            await garminService.syncGarminData(user.id);
            this.bot!.sendMessage(
              chatId,
              '✅ Синхронізація Garmin успішно завершена!'
            ).catch(() => {});
          } catch (error: any) {
            log('error', `[TELEGRAM BOT] Garmin sync error: ${error.message}`);
            this.bot!.sendMessage(
              chatId,
              '❌ Помилка синхронізації Garmin. Переконайтеся, що ваш акаунт підключено у веб-додатку.'
            ).catch(() => {});
          }
          return this.bot!.answerCallbackQuery(query.id).catch(() => {});
        }
      }
    });

    log('info', '[TELEGRAM BOT] Handlers setup complete.');
  }

  async handleLink(chatId: number, code: string): Promise<void> {
    const client = await poolManager.getSystemClient();
    try {
      const result = await client.query(
        `SELECT u.id, u.name, p.language 
         FROM public."user" u
         LEFT JOIN user_preferences p ON u.id = p.user_id
         WHERE u.telegram_link_code = $1`,
        [code]
      );

      if (result.rows.length === 0) {
        await this.bot!.sendMessage(
          chatId,
          '❌ Invalid linking code. Please check the web app for a fresh code.'
        );
        return;
      }

      const user = result.rows[0];
      await client.query(
        'UPDATE public."user" SET telegram_chat_id = $1, telegram_link_code = NULL WHERE id = $2',
        [chatId.toString(), user.id]
      );

      const t = this.getTranslations(user.language);
      await this.bot!.sendMessage(
        chatId,
        `✅ Success! Your account is now linked, ${user.name}. ${t.helpPrompt}`,
        this.getMainMenuKeyboard(t)
      );
    } catch (e: any) {
      log('error', '[TELEGRAM BOT] Linking error:', e);
      await this.bot!.sendMessage(chatId, `❌ Link error: ${e.message}`);
    } finally {
      client.release();
    }
  }

  async processMessage(chatId: number, user: TelegramUser, msg: TelegramBot.Message): Promise<void> {
    this.bot!.sendChatAction(chatId, 'typing');

    const typingInterval = setInterval(() => {
      this.bot!.sendChatAction(chatId, 'typing').catch(() => {});
    }, 4000);

    try {
      const contentParts = await this.buildContentParts(chatId, msg);
      if (!contentParts) {
        clearInterval(typingInterval);
        return;
      }

      const aiService = await chatRepository.getActiveAiServiceSetting(user.id);
      if (!aiService) {
        clearInterval(typingInterval);
        return (this.bot!.sendMessage(
          chatId,
          'No AI service configured. Please check your settings in the web app.'
        ) as unknown) as void;
      }

      const chatHistory = await chatRepository.getChatHistoryByUserId(user.id);
      const exerciseSummary = await this.getExerciseSummary(user.id);

      const historyContext = chatHistory.map((h: any) => ({
        role: h.message_type === 'user' ? 'user' : 'assistant',
        content: h.content,
      }));

      const contextBlock = this.buildContextBlock(user, exerciseSummary);
      const fullMessages = [
        { role: 'user', content: contextBlock },
        {
          role: 'assistant',
          content: 'Understood. I will provide concise, helpful responses for Telegram.',
        },
        ...historyContext,
        { role: 'user', content: msg.text || '[Image/File]' },
      ];

      const response = await chatService.processChatMessage(
        fullMessages,
        aiService.id,
        user.id
      );

      clearInterval(typingInterval);

      if (response && (response.text || response.content)) {
        const replyText = response.text || response.content;
        await chatRepository.saveChatMessage(user.id, msg.text || '[Multi-modal]', 'user');
        await chatRepository.saveChatMessage(user.id, replyText, 'ai');

        await this.bot!.sendMessage(chatId, replyText, { parse_mode: 'Markdown' });
        
        if (response.intent) {
          await this.tryExecuteIntent(chatId, user, response);
        }
      }
    } catch (e: any) {
      clearInterval(typingInterval);
      log('error', '[TELEGRAM BOT] Error processing message:', e);
      this.bot!.sendMessage(chatId, `❌ AI Error: ${e.message}`);
    }
  }

  async tryExecuteIntent(chatId: number, user: TelegramUser, response: any): Promise<void> {
    try {
      const tz = await loadUserTimezone(user.id);
      const today = todayInZone(tz);
      
      const result = await executeIntent(
        response.intent,
        response.data,
        response.entryDate,
        user.id,
        today
      );
      
      if (result && result.message) {
        await this.bot!.sendMessage(chatId, result.message);
      }
    } catch (e: any) {
      log('error', '[TELEGRAM BOT] Intent execution error:', e);
    }
  }

  async handleDirectTodayLog(chatId: number, user: TelegramUser): Promise<void> {
    try {
      const { todayInZone } = require('@workspace/shared');
      const { loadUserTimezone } = require('../../utils/timezoneLoader');
      const tz = await loadUserTimezone(user.id);
      const today = todayInZone(tz);

      const client = await poolManager.getSystemClient();
      const result = await client.query(
        `SELECT * FROM food_entries WHERE user_id = $1 AND entry_date = $2`,
        [user.id, today]
      );
      const todayFood = result.rows;
      client.release();

      if (todayFood.length === 0) {
        return (this.bot!.sendMessage(chatId, 'Жодних записів про їжу за сьогодні.') as unknown) as void;
      }

      let text = `🍴 <b>Щоденник за сьогодні (${today}):</b>\n\n`;
      let totalCals = 0;

      const grouped: { [key: string]: any[] } = {
        breakfast: [],
        lunch: [],
        dinner: [],
        snacks: [],
      };

      todayFood.forEach((f) => {
        const type = f.meal_type || 'snacks';
        if (grouped[type]) grouped[type].push(f);
        else grouped.snacks.push(f);
        totalCals += Number(f.calories || 0);
      });

      const mealNames: { [key: string]: string } = {
        breakfast: 'Сніданок',
        lunch: 'Обід',
        dinner: 'Вечеря',
        snacks: 'Перекуси',
      };

      for (const [type, items] of Object.entries(grouped)) {
        if (items.length > 0) {
          text += `<b>${mealNames[type]}:</b>\n`;
          items.forEach((i) => {
            const cal = i.calories ? `${Math.round(i.calories)} ккал` : '';
            text += ` • ${i.food_name || i.name} — ${i.quantity} ${i.unit} ${cal}\n`;
          });
          text += '\n';
        }
      }

      text += `<b>Всього:</b> ${Math.round(totalCals)} ккал`;
      this.bot!.sendMessage(chatId, text, { parse_mode: 'HTML' });
    } catch (e: any) {
      this.bot!.sendMessage(chatId, `❌ Помилка: ${e.message}`);
    }
  }

  async handleDirectRecentExercises(chatId: number, user: TelegramUser): Promise<void> {
    try {
      const { todayInZone } = require('@workspace/shared');
      const { loadUserTimezone } = require('../../utils/timezoneLoader');
      const tz = await loadUserTimezone(user.id);
      const today = todayInZone(tz);
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      let exercises = await exerciseEntry.getExerciseEntriesByDateRange(
        user.id,
        startDate,
        today
      );

      const t = this.getTranslations(user.language);

      if (!exercises || exercises.length === 0) {
        return (this.bot!.sendMessage(chatId, t.noRecentActivities) as unknown) as void;
      }

      exercises = exercises.filter((ex: any) => {
        const name = (ex.exercise_name || ex.name || '').toLowerCase();
        if (name === 'active calories' && !ex.duration_minutes && !ex.distance) {
          return false;
        }
        return true;
      });

      const uniqueExercisesMap = new Map<string, any>();
      exercises.forEach((ex: any) => {
        let dateStr = today;
        if (ex.entry_date) {
          const d = new Date(ex.entry_date);
          if (!isNaN(d.getTime())) {
            dateStr = d.toISOString().split('T')[0];
          }
        }

        const name = (ex.exercise_name || ex.name || 'Activity').trim();
        const dur = Math.round(ex.duration_minutes || 0);

        const key = `${dateStr}|${name.toLowerCase()}|${dur}`;
        const existing = uniqueExercisesMap.get(key);

        let keepCurrent = !existing;
        if (existing) {
          const existingScore = (existing.distance ? 1 : 0) + (existing.avg_heart_rate ? 1 : 0);
          const currentScore = (ex.distance ? 1 : 0) + (ex.avg_heart_rate ? 1 : 0);
          if (currentScore > existingScore) {
            keepCurrent = true;
          }
        }

        if (keepCurrent) {
          uniqueExercisesMap.set(key, { ...ex, entry_date_str: dateStr });
        }
      });

      const processedExercises = Array.from(uniqueExercisesMap.values());
      const grouped: { [key: string]: any[] } = {};
      processedExercises.forEach((ex) => {
        const d = ex.entry_date_str;
        if (!grouped[d]) grouped[d] = [];
        grouped[d].push(ex);
      });

      let text = `${t.recentActivities}\n\n`;
      const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

      dates.forEach((dateString) => {
        const dParts = dateString.split('-');
        let formattedLabel = dateString;
        if (dParts.length === 3) {
          formattedLabel = `${dParts[2]}.${dParts[1]}.${dParts[0]}`;
          if (dateString === today) {
            formattedLabel += ` (${t.todayLog.split(' ')[1] || 'Today'})`;
          }
        }

        text += `📅 <b>${formattedLabel}</b>\n`;
        grouped[dateString].forEach((ex) => {
          const durationVal = Math.round(ex.duration_minutes || 0);
          const durationText = durationVal > 0 ? `${durationVal}m` : '';
          const cals = ex.calories ? ` (${Math.round(ex.calories)} kcal)` : '';

          let emoji = '🏋️';
          const name = (ex.exercise_name || ex.name || '').toLowerCase();
          if (name.includes('run')) emoji = '🏃';
          else if (name.includes('cycl') || name.includes('bike')) emoji = '🚴';
          else if (name.includes('swim')) emoji = '🏊';
          else if (name.includes('walk')) emoji = '🚶';
          else if (name.includes('hik')) emoji = '🧗';
          else if (name.includes('yoga')) emoji = '🧘';
          else if (name.includes('strength') || name.includes('press')) emoji = '💪';

          text += `${emoji} <b>${ex.exercise_name || ex.name}</b> — ${durationText}${cals}\n`;

          const details = [];
          if (ex.distance) {
            details.push(`📍 ${Number(ex.distance).toFixed(2)} km`);
          }
          if (ex.avg_heart_rate) {
            details.push(`❤️ ${Math.round(ex.avg_heart_rate)} bpm`);
          }

          if (details.length > 0) {
            text += `  <i>${details.join(' | ')}</i>\n`;
          }
        });
        text += '\n';
      });

      this.bot!.sendMessage(chatId, text.trim(), { parse_mode: 'HTML' });
    } catch (e: any) {
      log('error', '[TELEGRAM BOT] Error fetching exercises:', e);
      this.bot!.sendMessage(chatId, `❌ Помилка: ${e.message}`);
    }
  }

  private async buildContentParts(chatId: number, msg: TelegramBot.Message): Promise<any[] | null> {
    const parts: any[] = [];
    if (msg.text) {
      parts.push({ text: msg.text });
    }
    // Handle photos/files here if needed
    return parts.length > 0 ? parts : null;
  }

  private buildContextBlock(user: any, exerciseSummary: string): string {
    return `
SYSTEM CONTEXT FOR TELEGRAM BOT:
- User: ${user.name} (ID: ${user.id})
- Today: ${new Date().toISOString().split('T')[0]}
- Exercise History (Last 7 days):
${exerciseSummary}

INSTRUCTIONS:
1. You are SparkyFitness AI, a helpful fitness assistant.
2. If the user asks for historical data beyond 7 days, trigger the 'request_data' intent with data_type='exercise_history'.
3. Keep responses concise for Telegram.
    `.trim();
  }

  private async findUserAndLanguageByChatId(chatId: number): Promise<TelegramUser | null> {
    const client = await poolManager.getSystemClient();
    try {
      const result = await client.query(
        `SELECT u.id, u.name, p.language, u.telegram_chat_id 
         FROM public."user" u
         LEFT JOIN user_preferences p ON u.id = p.user_id
         WHERE u.telegram_chat_id = $1`,
        [chatId.toString()]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  private async getExerciseSummary(userId: string): Promise<string> {
    try {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const endDate = new Date().toISOString().split('T')[0];
      const exercises = await exerciseEntry.getExerciseEntriesByDateRange(userId, startDate, endDate);
      
      if (!exercises || exercises.length === 0) return 'No exercises in the last 7 days.';
      
      return exercises.map((ex: any) => {
        const date = ex.entry_date ? new Date(ex.entry_date).toISOString().split('T')[0] : 'Unknown';
        return `- ${date}: ${ex.exercise_name || ex.name} (${ex.duration_minutes}m, ${ex.calories}kcal)`;
      }).join('\n');
    } catch (e) {
      return 'Error fetching exercise summary.';
    }
  }

  private async setLanguage(userId: string, lang: string): Promise<void> {
    const client = await poolManager.getSystemClient();
    try {
      await client.query(
        'UPDATE user_preferences SET language = $1 WHERE user_id = $2',
        [lang, userId]
      );
    } finally {
      client.release();
    }
  }

  private async formatProfileResponse(userId: string, lang: string): Promise<string> {
    // Simplified profile formatter
    return `👤 <b>Profile Info</b>\nUser ID: ${userId}\nLanguage: ${lang}`;
  }

  private getTranslations(lang: string): TranslationSet {
    const dicts: { [key: string]: TranslationSet } = {
      en: {
        greeting: 'Hello',
        helpPrompt: 'How can I help you today?',
        welcome: 'Welcome!',
        noRecentActivities: 'No recent activities.',
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
        syncGarmin: 'Garmin Sync',
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
      },
    };
    return dicts[lang] || dicts.en;
  }

  private getMainMenuKeyboard(t: TranslationSet): TelegramBot.SendMessageOptions {
    return {
      reply_markup: {
        keyboard: [
          [{ text: t.profile }, { text: t.diary }],
          [{ text: t.syncMenu }, { text: t.language }],
        ],
        resize_keyboard: true,
      },
    };
  }

  private getDiaryMenuKeyboard(t: TranslationSet): TelegramBot.SendMessageOptions {
    return {
      reply_markup: {
        keyboard: [[{ text: t.todayLog }], [{ text: t.exercises }], [{ text: t.back }]],
        resize_keyboard: true,
      },
    };
  }

  private async showLanguageMenu(chatId: number): Promise<void> {
    await this.bot!.sendMessage(chatId, 'Оберіть мову / Choose language:', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🇺🇦 Українська', callback_data: 'setlang:uk' },
            { text: '🇬🇧 English', callback_data: 'setlang:en' },
            { text: '🇷🇺 Русский', callback_data: 'setlang:ru' },
          ],
        ],
      },
    });
  }

  private async showSyncMenu(chatId: number, lang: string): Promise<void> {
    const t = this.getTranslations(lang);
    await this.bot!.sendMessage(chatId, 'Оберіть платформу для синхронізації:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: t.syncGarmin, callback_data: 'sync:garmin' }],
        ],
      },
    });
  }
}

module.exports = new TelegramBotService();
