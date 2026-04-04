const TelegramBot = require('node-telegram-bot-api');
const { log } = require('../../config/logging');
const globalSettingsRepository = require('../../models/globalSettingsRepository');
const chatService = require('../../services/chatService');
const chatRepository = require('../../models/chatRepository');
const poolManager = require('../../db/poolManager');
const { executeIntent } = require('./intentExecutor');
const axios = require('axios');

/**
 * Service to manage Telegram Bot interactions.
 * Connects Telegram users to SparkyFitness AI and database.
 */
class TelegramBotService {
  constructor() {
    this.bot = null;
  }

  async initialize() {
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

  handleUpdate(update) {
    if (this.bot) {
      this.bot.processUpdate(update);
    }
  }

  setupHandlers() {
    this.bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const linkParam = match[1];

      if (linkParam) {
        return this.handleLink(chatId, linkParam);
      }

      const user = await this.findUserAndLanguageByChatId(chatId);

      if (user) {
        const lang = user.language;
        const t = this.getTranslations(lang);
        const keyboardOptions = this.getMainMenuKeyboard(t);

        return this.bot.sendMessage(
          chatId,
          `${t.greeting}, ${user.name}! ${t.helpPrompt}`,
          keyboardOptions
        );
      }

      this.bot.sendMessage(
        chatId,
        'Welcome to SparkyFitness! Link your account in the web app under Settings → Telegram, then send `/start <CODE>`.'
      );
    });

    this.bot.onText(
      /\/(profile|профиль)|👤 (Профіль|Профиль|Profile)/i,
      async (msg) => {
        const chatId = msg.chat.id;
        const user = await this.findUserAndLanguageByChatId(chatId);
        if (!user) return;

        this.bot.sendChatAction(chatId, 'typing').catch(() => {});
        try {
          const profileText = await this.formatProfileResponse(
            user.id,
            user.language
          );
          this.bot.sendMessage(chatId, profileText, { parse_mode: 'HTML' });
        } catch (e) {
          this.bot.sendMessage(chatId, `❌ Error: ${e.message}`);
        }
      }
    );

    this.bot.onText(
      /\/(diary|дневник|щоденник)|📖 (Меню щоденника|Меню дневника|Diary Menu)/i,
      async (msg) => {
        const chatId = msg.chat.id;
        const user = await this.findUserAndLanguageByChatId(chatId);
        if (!user) return;

        const t = this.getTranslations(user.language);
        this.bot.sendMessage(
          chatId,
          'Оберіть розділ щоденника:',
          this.getDiaryMenuKeyboard(t)
        );
      }
    );

    this.bot.onText(/⬅️ (Назад|Back)/i, async (msg) => {
      const chatId = msg.chat.id;
      const user = await this.findUserAndLanguageByChatId(chatId);
      if (!user) return;

      const t = this.getTranslations(user.language);
      this.bot.sendMessage(
        chatId,
        'Головне меню:',
        this.getMainMenuKeyboard(t)
      );
    });

    this.bot.onText(
      /\/(language|мова|язык)|🌐 (Мова|Язык|Language)/i,
      async (msg) => {
        const chatId = msg.chat.id;
        const user = await this.findUserAndLanguageByChatId(chatId);
        if (!user) return;

        const t = this.getTranslations(user.language);
        this.bot.sendMessage(chatId, t.chooseLanguage, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🇬🇧 English', callback_data: 'setlang:en' }],
              [{ text: '🇺🇦 Українська', callback_data: 'setlang:uk' }],
              [{ text: '🇷🇺 Русский', callback_data: 'setlang:ru' }],
            ],
          },
        });
      }
    );

    this.bot.onText(
      /\/(sync|синхронизировать|синхронізувати)|🔄 (Пристрої|Устройства|Devices)/i,
      async (msg) => {
        const chatId = msg.chat.id;
        const user = await this.findUserAndLanguageByChatId(chatId);
        if (!user) return;

        const t = this.getTranslations(user.language);
        this.bot.sendMessage(chatId, 'Оберіть платформу для синхронізації:', {
          reply_markup: {
            inline_keyboard: [
              [{ text: t.syncGarmin, callback_data: 'sync:garmin' }],
            ],
          },
        });
      }
    );

    this.bot.on('message', async (msg) => {
      if (msg.text && msg.text.startsWith('/')) return;

      const chatId = msg.chat.id;
      const user = await this.findUserAndLanguageByChatId(chatId);

      if (!user) {
        this.bot.sendMessage(
          chatId,
          'Your account is not linked. Please link it in the web app under Settings → Telegram.'
        );
        return;
      }

      const t = this.getTranslations(user.language);
      // Ignore main menu button presses if handled separately
      if (
        msg.text === t.profile ||
        msg.text === t.language ||
        msg.text === t.diary ||
        msg.text === t.syncMenu ||
        msg.text === t.back
      )
        return;

      // Handle custom standard commands directly without AI
      if (msg.text === t.todayLog) {
        await this.handleDirectTodayLog(chatId, user);
        return;
      }

      if (msg.text === t.macros) {
        this.bot.sendChatAction(chatId, 'typing').catch(() => {});
        try {
          const profileText = await this.formatProfileResponse(
            user.id,
            user.language
          );
          this.bot.sendMessage(chatId, profileText, { parse_mode: 'HTML' });
        } catch (e) {
          this.bot.sendMessage(chatId, `❌ Error: ${e.message}`);
        }
        return;
      }

      await this.processMessage(chatId, user, msg);
    });

    this.bot.on('callback_query', async (query) => {
      const chatId = query.message.chat.id;
      const user = await this.findUserAndLanguageByChatId(chatId);
      if (!user) return;

      const [action, type, id] = query.data.split(':');

      if (action === 'setlang') {
        const newLang = type;
        await this.setLanguage(user.id, newLang);
        const t = this.getTranslations(newLang);

        await this.bot
          .deleteMessage(chatId, query.message.message_id)
          .catch(() => false);
        await this.bot.sendMessage(
          chatId,
          t.langSet,
          this.getMainMenuKeyboard(t)
        );
        return this.bot.answerCallbackQuery(query.id);
      } else if (action === 'sync') {
        if (type === 'garmin') {
          const garminService = require('../../services/garminService');
          this.bot.sendMessage(
            chatId,
            '🔄 Синхронізація з Garmin запущена... Це може зайняти хвилину.'
          );
          try {
            await garminService.syncGarminData(user.id);
            this.bot.sendMessage(
              chatId,
              '✅ Синхронізація Garmin успішно завершена!'
            );
          } catch (error) {
            log('error', `[TELEGRAM BOT] Garmin sync error: ${error.message}`);
            this.bot.sendMessage(
              chatId,
              '❌ Помилка синхронізації Garmin. Переконайтеся, що ваш акаунт підключено у веб-додатку.'
            );
          }
        }
        return this.bot.answerCallbackQuery(query.id);
      }

      if (action === 'confirm_del') {
        try {
          let success = false;
          if (type === 'measurement') {
            const measurementRepository = require('../../models/measurementRepository');
            success = await measurementRepository.deleteCheckInMeasurements(
              id,
              user.id
            );
          } else if (type === 'food') {
            const foodRepository = require('../../models/foodRepository');
            success = await foodRepository.deleteFoodEntry(id, user.id);
          }

          if (success) {
            await this.bot.editMessageText(`✅ Запис видалено.`, {
              chat_id: chatId,
              message_id: query.message.message_id,
            });
          } else {
            await this.bot.answerCallbackQuery(query.id, {
              text: '❌ Не вдалося знайти запис.',
            });
          }
        } catch (e) {
          log('error', `[TELEGRAM BOT] Callback delete error: ${e.message}`);
          await this.bot.answerCallbackQuery(query.id, {
            text: '❌ Помилка видалення.',
          });
        }
      } else if (action === 'cancel_del') {
        await this.bot.editMessageText('❌ Видалення скасовано.', {
          chat_id: chatId,
          message_id: query.message.message_id,
        });
      }

      await this.bot.answerCallbackQuery(query.id);
    });

    log('info', '[TELEGRAM BOT] Handlers setup complete.');
  }

  getMainMenuKeyboard(t) {
    return {
      reply_markup: {
        keyboard: [
          [{ text: t.profile }, { text: t.diary }],
          [{ text: t.macros }, { text: t.syncMenu }],
          [{ text: t.language }],
        ],
        resize_keyboard: true,
      },
    };
  }

  getDiaryMenuKeyboard(t) {
    return {
      reply_markup: {
        keyboard: [[{ text: t.todayLog }], [{ text: t.back }]],
        resize_keyboard: true,
      },
    };
  }

  async handleDirectTodayLog(chatId, user) {
    this.bot.sendChatAction(chatId, 'typing').catch(() => {});
    try {
      const foodEntry = require('../../models/foodEntry');
      const { todayInZone } = require('@workspace/shared');
      const { loadUserTimezone } = require('../../utils/timezoneLoader');

      const tz = await loadUserTimezone(user.id);
      const today = todayInZone(tz);
      const todayFood = await foodEntry
        .getFoodEntriesByDate(user.id, today)
        .catch(() => []);

      const t = this.getTranslations(user.language);

      if (!todayFood || todayFood.length === 0) {
        return this.bot.sendMessage(
          chatId,
          `🤷 Здається, сьогодні ще нічого не записано. Спробуй написати або надіслати фото їжі!`
        );
      }

      let text = `🍏 <b>${t.todayLog} (${today})</b>\n\n`;
      let totalCals = 0;

      // Групуємо по meal_type
      const grouped = {
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

      const mealNames = {
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
      this.bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
    } catch (e) {
      this.bot.sendMessage(chatId, `❌ Помилка: ${e.message}`);
    }
  }

  async processMessage(chatId, user, msg) {
    this.bot.sendChatAction(chatId, 'typing');

    const typingInterval = setInterval(() => {
      this.bot.sendChatAction(chatId, 'typing').catch(() => {});
    }, 4000);

    try {
      // Build content parts from the Telegram message
      const contentParts = await this.buildContentParts(chatId, msg);
      if (!contentParts) {
        clearInterval(typingInterval);
        return;
      }

      // Get user's active AI service
      const aiService = await chatRepository.getActiveAiServiceSetting(user.id);
      if (!aiService) {
        clearInterval(typingInterval);
        return this.bot.sendMessage(
          chatId,
          'Please configure an AI service in the web app under Settings → AI.'
        );
      }

      // Build context (measurements + goals + today's food) and inject into the user message text
      const { todayInZone } = require('@workspace/shared');
      const { loadUserTimezone } = require('../../utils/timezoneLoader');
      const tz = await loadUserTimezone(user.id);
      const today = todayInZone(tz);

      const contextBlock = await this.buildContextBlock(user.id, today, tz);
      const langNote = this.buildLanguageInstruction(
        msg.text || msg.caption || ''
      );

      // Inject context into the first text part
      let contextInjected = false;
      const enrichedParts = contentParts.map((part) => {
        if (part.type === 'text' && !contextInjected) {
          contextInjected = true;
          return {
            type: 'text',
            text: `${part.text}\n\n${contextBlock}\n\n${langNote}`,
          };
        }
        return part;
      });

      if (!contextInjected) {
        enrichedParts.push({
          type: 'text',
          text: `${contextBlock}\n\n${langNote}`,
        });
      }

      // processChatMessage expects: [{role: 'user', content: [...parts]}]
      const messages = [{ role: 'user', content: enrichedParts }];

      // First AI call
      log(
        'info',
        `[TELEGRAM BOT] AI Input for user ${user.id}: ${JSON.stringify(messages)}`
      );
      let response = await chatService.processChatMessage(
        messages,
        aiService.id,
        user.id
      );
      log(
        'info',
        `[TELEGRAM BOT] AI Response for user ${user.id}: ${JSON.stringify(response)}`
      );

      // Agentic loop: if AI requests more data
      response = await this.handleDataRequest(
        response,
        messages,
        aiService.id,
        user.id,
        chatId
      );

      clearInterval(typingInterval);

      if (response && response.content) {
        // Try to execute the intent in the DB
        const executionResult = await this.tryExecuteIntent(
          response.content,
          user.id,
          today
        );

        // If intent was executed, send DB result; otherwise send AI text response
        if (executionResult !== null) {
          if (
            typeof executionResult === 'object' &&
            executionResult.intent === 'confirm_deletion'
          ) {
            await this.showDeletionConfirmation(
              chatId,
              executionResult.matches
            );
          } else {
            await this.sendLongMessage(chatId, executionResult);
          }
        } else {
          const text = this.extractResponseText(response.content);
          await this.sendLongMessage(chatId, text);
        }
      }
    } catch (error) {
      clearInterval(typingInterval);
      log('error', '[TELEGRAM BOT] Error processing message:', error);
      this.bot.sendMessage(chatId, `❌ Помилка: ${error.message}`);
    }
  }

  async showDeletionConfirmation(chatId, matches) {
    let text = 'Знайдено записи для видалення:\n\n';
    const keyboard = [];

    matches.forEach((m) => {
      let label = '';
      if (m.type === 'measurement') {
        label = `🗑️ ${m.subType}: ${m.value} ${m.unit} за ${m.date}`;
      } else {
        label = `🗑️ ${m.name} (${Math.round(m.calories)} ккал) за ${m.date}`;
      }
      text += `• ${label}\n`;
      keyboard.push([
        { text: label, callback_data: `confirm_del:${m.type}:${m.id}` },
      ]);
    });

    keyboard.push([{ text: '❌ Скасувати', callback_data: 'cancel_del' }]);

    await this.bot.sendMessage(chatId, text, {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }

  async formatProfileResponse(userId, lang) {
    const measurementRepository = require('../../models/measurementRepository');
    const goalRepository = require('../../models/goalRepository');
    const foodEntry = require('../../models/foodEntry');
    const { todayInZone } = require('@workspace/shared');
    const { loadUserTimezone } = require('../../utils/timezoneLoader');

    const tz = await loadUserTimezone(userId);
    const today = todayInZone(tz);
    const t = this.getTranslations(lang);

    const [recentMeasurements, todayGoal, todayFood] = await Promise.all([
      measurementRepository.getLatestMeasurementsSummary(userId, 1),
      goalRepository
        .getMostRecentGoalBeforeDate(userId, today)
        .catch(() => null),
      foodEntry.getFoodEntriesByDate(userId, today).catch(() => []),
    ]);

    let text = `${t.profileTitle}\n📅 <i>${today}</i>\n\n`;

    if (recentMeasurements && recentMeasurements.length > 0) {
      const m = recentMeasurements[0];
      text += `${t.weight} ${m.weight ? `${m.weight} kg` : t.notSpecified}\n`;
    }

    let caloriesEaten = 0;
    let protein = 0,
      carbs = 0,
      fat = 0;

    if (todayFood && todayFood.length > 0) {
      todayFood.forEach((f) => {
        caloriesEaten += Number(f.calories || 0);
        protein += Number(f.protein || 0);
        carbs += Number(f.carbs || 0);
        fat += Number(f.fat || 0);
      });
    }

    if (todayGoal) {
      const goalCal = todayGoal.calories || 0;
      const remaining = goalCal - caloriesEaten;

      text += `${t.dailyGoal} ${goalCal} kcal\n`;
      text += `${t.consumed} ${Math.round(caloriesEaten)} kcal\n`;
      text += `${t.remaining} ${Math.round(remaining)} kcal\n\n`;

      text += `${t.protein}: ${Math.round(protein)} / ${todayGoal.protein || '?'} g\n`;
      text += `${t.carbs}: ${Math.round(carbs)} / ${todayGoal.carbs || '?'} g\n`;
      text += `${t.fat}: ${Math.round(fat)} / ${todayGoal.fat || '?'} g\n`;
    } else {
      text += `${t.consumed} ${Math.round(caloriesEaten)} kcal\n`;
      text += `${t.noGoals}\n`;
    }

    return text;
  }

  async buildContentParts(chatId, msg) {
    const parts = [];

    if (msg.text) {
      parts.push({ type: 'text', text: msg.text });
    }

    if (msg.photo) {
      const photo = msg.photo[msg.photo.length - 1];
      const fileLink = await this.bot.getFileLink(photo.file_id);

      try {
        const response = await axios.get(fileLink, {
          responseType: 'arraybuffer',
        });
        const base64 = Buffer.from(response.data).toString('base64');
        parts.push({
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${base64}` },
        });
      } catch (e) {
        log('error', `[TELEGRAM BOT] Photo fetch error: ${e.message}`);
      }

      if (msg.caption) {
        parts.push({ type: 'text', text: `Caption: ${msg.caption}` });
      }
    }

    if (msg.voice || msg.video_note || msg.video) {
      const media = msg.voice || msg.video_note || msg.video;
      const fileId = media.file_id;
      const fileLink = await this.bot.getFileLink(fileId);

      let type = 'audio_url';
      let mimeType = 'audio/ogg'; // Telegram voice is .oga (ogg)

      if (msg.video_note || msg.video) {
        type = 'video_url';
        mimeType = 'video/mp4';
      }

      // Download and convert to base64 to pass to AI
      const response = await axios.get(fileLink, {
        responseType: 'arraybuffer',
      });
      const base64 = Buffer.from(response.data).toString('base64');

      parts.push({
        type,
        [type]: { url: `data:${mimeType};base64,${base64}` },
      });

      if (msg.caption) {
        parts.push({ type: 'text', text: `Caption: ${msg.caption}` });
      }
    }

    return parts.length > 0 ? parts : null;
  }

  buildLanguageInstruction(text) {
    if (/[\u0400-\u04FF]/.test(text)) {
      return 'ВАЖНО: Відповідай тією ж мовою, якою написане повідомлення (українська або російська). Будь лаконічним.';
    }
    return 'IMPORTANT: Reply in the same language the user wrote in. Be concise.';
  }

  async buildContextBlock(userId, today, tz) {
    const measurementRepository = require('../../models/measurementRepository');
    const goalRepository = require('../../models/goalRepository');
    const foodEntry = require('../../models/foodEntry');

    const [recentMeasurements, todayGoal, todayFood] = await Promise.all([
      measurementRepository.getLatestMeasurementsSummary(userId, 3),
      goalRepository
        .getMostRecentGoalBeforeDate(userId, today)
        .catch(() => null),
      foodEntry.getFoodEntriesByDate(userId, today).catch(() => []),
    ]);

    // Get exact time in user's timezone for better meal classification
    const now = new Date();
    const userTimeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const userCurrentTime = userTimeFormatter.format(now);

    let block = '[SYSTEM CONTEXT: USER DATA]\n';
    block += `Current date for user: ${today}\n`;
    block += `Current time for user: ${userCurrentTime}\n`;

    if (recentMeasurements.length > 0) {
      block += 'Recent measurements (newest first):\n';
      recentMeasurements.forEach((h) => {
        const parts = [];
        if (h.weight) parts.push(`weight: ${h.weight} kg`);
        if (h.steps) parts.push(`steps: ${h.steps}`);
        if (h.waist) parts.push(`waist: ${h.waist} cm`);
        if (h.hips) parts.push(`hips: ${h.hips} cm`);
        if (h.body_fat_percentage)
          parts.push(`body fat: ${h.body_fat_percentage}%`);
        block += `  ${h.entry_date}: ${parts.length > 0 ? parts.join(', ') : 'no values recorded'}\n`;
      });
    } else {
      block += 'No recent measurements available.\n';
    }

    if (todayGoal) {
      const water = todayGoal.water_goal_ml
        ? `${Math.round(todayGoal.water_goal_ml / 1000)} L`
        : '?';
      block += `Current goals: calories ${todayGoal.calories || '?'} kcal, protein ${todayGoal.protein || '?'} g, carbs ${todayGoal.carbs || '?'} g, fat ${todayGoal.fat || '?'} g, water ${water}.\n`;
    }

    // Today's food entries
    if (todayFood && todayFood.length > 0) {
      block += `Today's food log (${today}):\n`;
      todayFood.forEach((e) => {
        const cal = e.calories ? ` ~${Math.round(e.calories)} kcal` : '';
        block += `  • ${e.food_name || e.name} — ${e.quantity} ${e.unit} [${e.meal_type || ''}]${cal}\n`;
      });
    } else {
      block += `Today's food log (${today}): nothing logged yet.\n`;
    }

    block += '[END CONTEXT]';
    return block;
  }

  /**
   * Handle AI request_data intent — fetch deeper history and re-call AI.
   * Supports data types: measurements_history, food_history.
   */
  async handleDataRequest(response, messages, serviceConfigId, userId, chatId) {
    if (!response || !response.content) return response;

    let parsed = null;
    try {
      parsed = JSON.parse(response.content);
    } catch (e) {
      return response;
    }

    if (!parsed || parsed.intent !== 'request_data') return response;

    log(
      'info',
      `[TELEGRAM BOT] AI requested more data: ${JSON.stringify(parsed.data)}`
    );
    this.bot.sendChatAction(chatId, 'typing').catch(() => {});

    const measurementRepository = require('../../models/measurementRepository');
    const foodEntry = require('../../models/foodEntry');
    const { todayInZone } = require('@workspace/shared');
    const { loadUserTimezone } = require('../../utils/timezoneLoader');

    const tz = await loadUserTimezone(userId);
    const today = todayInZone(tz);
    const days = parseInt(parsed.data?.days) || 14;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const dataType = parsed.data?.type || 'measurements_history';
    let fetchedData = [];

    if (dataType === 'food_history') {
      fetchedData = await foodEntry
        .getFoodEntriesByDateRange(userId, startDate, today)
        .catch(() => []);
    } else {
      fetchedData = await measurementRepository
        .getCheckInMeasurementsByDateRange(userId, startDate, today)
        .catch(() => []);
    }

    // Append additional data as a new user message turn
    const updatedMessages = [
      ...messages,
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `[ADDITIONAL DATA: ${dataType} for last ${days} days]\n${JSON.stringify(fetchedData)}\n[END ADDITIONAL DATA]\nNow give me a concise answer.`,
          },
        ],
      },
    ];

    return chatService.processChatMessage(
      updatedMessages,
      serviceConfigId,
      userId
    );
  }

  /**
   * Try to parse AI response as an intent and execute it in the DB.
   * Returns confirmation string if executed, null if it's a chat/question response.
   */
  async tryExecuteIntent(content, userId, today) {
    let parsed = null;
    try {
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      parsed = JSON.parse(jsonStr.trim());
    } catch (e) {
      return null; // Not JSON — plain text response
    }

    if (!parsed || !parsed.intent) return null;

    // Chat/question intents: return the AI's response text directly
    if (parsed.intent === 'ask_question' || parsed.intent === 'chat') {
      return parsed.response || null;
    }

    // Logging intents: execute in DB
    try {
      const result = await executeIntent(
        parsed.intent,
        parsed.data || {},
        parsed.entryDate,
        userId,
        today
      );
      return result;
    } catch (e) {
      log('error', `[TELEGRAM BOT] Intent execution error: ${e.message}`);
      return `❌ Помилка виконання: ${e.message}`;
    }
  }

  extractResponseText(content) {
    try {
      const parsed = JSON.parse(content);
      if (parsed.response) return parsed.response;
      if (parsed.intent && parsed.intent !== 'request_data') {
        return `✅ ${parsed.intent.replace(/_/g, ' ')}`;
      }
      return content;
    } catch (e) {
      return content;
    }
  }

  async sendLongMessage(chatId, text) {
    const maxLength = 4000;
    const opts = { parse_mode: 'HTML' };

    const sendSafe = async (c, t, o) => {
      try {
        await this.bot.sendMessage(c, t, o);
      } catch (e) {
        log(
          'warn',
          `[TELEGRAM BOT] HTML parse failed, falling back to plain text: ${e.message}`
        );
        // Fallback to plain text by removing HTML tags
        await this.bot.sendMessage(c, t.replace(/<[^>]*>?/gm, ''));
      }
    };

    if (text.length <= maxLength) {
      return sendSafe(chatId, text, opts);
    }

    const paragraphs = text.split(/\n\n+/);
    let chunk = '';

    for (const para of paragraphs) {
      const candidate = chunk ? `${chunk}\n\n${para}` : para;
      if (candidate.length > maxLength) {
        if (chunk) {
          await sendSafe(chatId, chunk.trim(), opts);
          chunk = para;
        } else {
          // Single paragraph too long — hard split
          const parts =
            para.match(new RegExp(`[\\s\\S]{1,${maxLength}}`, 'g')) || [];
          for (const part of parts) {
            await sendSafe(chatId, part, opts);
          }
        }
      } else {
        chunk = candidate;
      }
    }

    if (chunk) {
      await sendSafe(chatId, chunk.trim(), opts);
    }
  }

  async handleLink(chatId, code) {
    const client = await poolManager.getSystemClient();
    try {
      const result = await client.query(
        'UPDATE public."user" SET telegram_chat_id = $1, telegram_link_code = NULL WHERE telegram_link_code = $2 RETURNING name',
        [chatId.toString(), code]
      );

      if (result.rowCount > 0) {
        this.bot.sendMessage(
          chatId,
          `✅ Account linked: ${result.rows[0].name}. You can now log meals, exercises, and chat with AI directly here!`
        );
      } else {
        this.bot.sendMessage(
          chatId,
          'Invalid or expired linking code. Please generate a new one in the app.'
        );
      }
    } catch (error) {
      log('error', '[TELEGRAM BOT] Linking error:', error);
      this.bot.sendMessage(
        chatId,
        'An error occurred while linking your account.'
      );
    } finally {
      client.release();
    }
  }

  async findUserAndLanguageByChatId(chatId) {
    const client = await poolManager.getSystemClient();
    try {
      const result = await client.query(
        `SELECT u.id, u.name, COALESCE(up.language, 'en') as language
         FROM public."user" u 
         LEFT JOIN public.user_preferences up ON u.id = up.user_id 
         WHERE u.telegram_chat_id = $1`,
        [chatId.toString()]
      );
      return result.rows[0] || null;
    } catch (error) {
      log('error', '[TELEGRAM BOT] Database error:', error);
      return null;
    } finally {
      client.release();
    }
  }

  async setLanguage(userId, lang) {
    const client = await poolManager.getSystemClient();
    try {
      await client.query(
        `UPDATE public.user_preferences SET language = $1 WHERE user_id = $2`,
        [lang, userId]
      );
      return true;
    } catch (error) {
      log('error', '[TELEGRAM BOT] Set language error:', error);
      return false;
    } finally {
      client.release();
    }
  }

  getTranslations(lang) {
    const translations = {
      en: {
        profile: '👤 Profile',
        addWater: '💧 Add Water',
        diary: '📖 Diary Menu',
        todayLog: "🍏 Today's Log",
        macros: '📊 Macros',
        syncMenu: '🔄 Devices',
        language: '🌐 Language',
        back: '⬅️ Back',
        syncGarmin: '⌚ Sync Garmin',
        greeting: 'Hello',
        helpPrompt:
          "I'm your SparkyFitness assistant. How can I help you today?",
        unlinked:
          'Your account is not linked. Please link it in the web app under Settings → Telegram.',
        profileTitle: '👤 <b>Your Profile</b>',
        weight: '⚖️ <b>Weight:</b>',
        notSpecified: 'Not specified',
        dailyGoal: '🎯 <b>Daily Goal:</b>',
        consumed: '🍽 <b>Consumed:</b>',
        remaining: '📊 <b>Remaining:</b>',
        protein: '🥩 Protein',
        carbs: '🍞 Carbs',
        fat: '🥑 Fat',
        noGoals: '⚠️ <i>Goals not configured. Please visit the web app.</i>',
        chooseLanguage: 'Please choose your language:',
        langSet: '✅ Language updated successfully!',
      },
      uk: {
        profile: '👤 Профіль',
        addWater: '💧 Додати воду',
        diary: '📖 Меню щоденника',
        todayLog: "🍏 Що я з'їв?",
        macros: '📊 Мої макроси',
        syncMenu: '🔄 Пристрої',
        language: '🌐 Мова',
        back: '⬅️ Назад',
        syncGarmin: '⌚ Синхронізувати Garmin',
        greeting: 'Привіт',
        helpPrompt: 'Я твій SparkyFitness асистент. Чим можу допомогти?',
        unlinked:
          "Твій акаунт не прив'язаний. Зроби це у веб-додатку в розділі Налаштування → Telegram.",
        profileTitle: '👤 <b>Твій Профіль</b>',
        weight: '⚖️ <b>Вага:</b>',
        notSpecified: 'Не вказано',
        dailyGoal: '🎯 <b>Денна ціль:</b>',
        consumed: '🍽 <b>Спожито:</b>',
        remaining: '📊 <b>Залишилось:</b>',
        protein: '🥩 Білки',
        carbs: '🍞 Вуглеводи',
        fat: '🥑 Жири',
        noGoals: '⚠️ <i>Цілі не налаштовано. Зайдіть у веб-додаток.</i>',
        chooseLanguage: 'Оберіть вашу мову:',
        langSet: '✅ Мову успішно змінено!',
      },
      ru: {
        profile: '👤 Профиль',
        addWater: '💧 Добавить воду',
        diary: '📖 Меню дневника',
        todayLog: '🍏 Что я съел?',
        macros: '📊 Мои макросы',
        syncMenu: '🔄 Устройства',
        language: '🌐 Язык',
        back: '⬅️ Назад',
        syncGarmin: '⌚ Синхронизировать Garmin',
        greeting: 'Привет',
        helpPrompt: 'Я твой ассистент SparkyFitness. Чем могу помочь?',
        unlinked:
          'Твой аккаунт не привязан. Сделай это в веб-приложении в разделе Настройки → Telegram.',
        profileTitle: '👤 <b>Твой Профиль</b>',
        weight: '⚖️ <b>Вес:</b>',
        notSpecified: 'Не указан',
        dailyGoal: '🎯 <b>Дневная цель:</b>',
        consumed: '🍽 <b>Употреблено:</b>',
        remaining: '📊 <b>Осталось:</b>',
        protein: '🥩 Белки',
        carbs: '🍞 Углеводы',
        fat: '🥑 Жиры',
        noGoals: '⚠️ <i>Цели не настроены. Зайдите в веб-приложение.</i>',
        chooseLanguage: 'Выберите ваш язык:',
        langSet: '✅ Язык успешно изменен!',
      },
    };
    return translations[lang] || translations['en'];
  }
}

module.exports = new TelegramBotService();
