<p align="center">
  <a href="../../README.md">English</a> ·
  <a href="README_zh-CN.md">简体中文</a> ·
  <a href="README_zh-TW.md">繁體中文</a> ·
  <a href="README_ja.md">日本語</a> ·
  <a href="README_ko.md">한국어</a> ·
  <a href="README_hi.md">हिन्दी</a> ·
  <a href="README_th.md">ไทย</a> ·
  <a href="README_fr.md">Français</a> ·
  <a href="README_de.md">Deutsch</a> ·
  <a href="README_es.md">Español</a> ·
  <a href="README_it.md">Italiano</a> ·
  <b>Русский</b> ·
  <a href="README_pt-BR.md">Português (Brasil)</a> ·
  <a href="README_nl.md">Nederlands</a> ·
  <a href="README_pl.md">Polski</a> ·
  <a href="README_ar.md">العربية</a> ·
  <a href="README_fa.md">فارسی</a> ·
  <a href="README_tr.md">Türkçe</a> ·
  <a href="README_vi.md">Tiếng Việt</a> ·
  <a href="README_id.md">Bahasa Indonesia</a>
</p>

# SparkyFitness

Самостоятельно размещаемая альтернатива MyFitnessPal, Flo, Hevy, Shotsy и другим приложениям, в основе которой — конфиденциальность. Отслеживайте питание, тренировки, параметры тела и данные о здоровье, полностью сохраняя контроль над своими данными.
<img width="5120" height="2880" alt="изображение" src="https://github.com/user-attachments/assets/d8b09f48-cb4d-41a6-b678-ac93e551f257" />


SparkyFitness — это самостоятельно размещаемая платформа для фитнес-трекинга, которая состоит из:

- Серверной части (API + хранилище данных)
- Веб-интерфейса
- Нативных мобильных приложений для iOS и Android

Она хранит данные о здоровье и управляет ими на инфраструктуре, которую контролируете вы, не полагаясь на сторонние сервисы.

## Основные возможности

- Учёт питания, тренировок, потребления воды, сна, голодания, настроения и замеров тела
- Постановка целей и ежедневные отметки
- Интерактивные графики и долгосрочные отчёты
- Несколько профилей пользователей и семейный доступ
- Светлая и тёмная темы
- OIDC, TOTP, Passkey, MFA и т. д.

## Сравнение SparkyFitness с другими приложениями

**SparkyFitness — проект с доступным исходным кодом, но не open source**: [лицензия](../../LICENSE) некоммерческая, для коммерческого использования требуется разрешение.

Большинство приложений умеют что-то одно. Одно хорошее приложение для учёта питания стоит 40–100 $ в год; чтобы покрыть всё, что умеет SparkyFitness, понадобится три-четыре подписки на каждого человека — и всё равно не будет единого отчёта по всем данным. SparkyFitness делает всё это в одном приложении, бесплатно, для всей семьи.

<sub>Цены в США, 14 августа 2026 г. [Полная разбивка стоимости →](https://codewithcj.github.io/SparkyFitness/features/comparison)</sub>

| | **SparkyFitness** | wger | MyFitnessPal | Cronometer | Hevy | Zero | Flo | Garmin Connect | Google Health |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Самостоятельное размещение, ваши данные остаются вашими | ⭐ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Без подписки и рекламы | ✅ | ✅ | ❌ | 🟡 | 🟡 | ❌ | ❌ | ✅ | 🟡 |
| Питание, силовые тренировки, сон, голодание, цикл и лекарства в одном месте\* | ⭐ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| Полная история и отчёты за произвольный период | ✅ бесплатно | 🟡 | 💰 | 💰 | 💰 | 💰 | 💰 | ✅ | 💰 |
| Синхронизация с носимыми устройствами и платформами здоровья | ✅ 8+ сервисов | ❌ | ✅ | ⭐ | ✅ | 🟡 | 🟡 | 🟡 | ✅ |
| Семейный доступ с детальными разрешениями | ⭐ 7 разрешений | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| Импорт CSV и бесплатный экспорт данных | ✅ | 🟡 | 💰 | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ❌ |
| MCP-сервер + собственная LLM | ⭐ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

⭐ выделяется &nbsp;•&nbsp; ✅ поддерживается &nbsp;•&nbsp; 🟡 частично &nbsp;•&nbsp; 💰 только в платном тарифе &nbsp;•&nbsp; ❌ не поддерживается

<sub>\* Фазы сна, ВСР и уровень глюкозы в крови импортируются с ваших часов, телефона или глюкометра. SparkyFitness хранит, анализирует и визуализирует эти данные, но не измеряет их сам.</sub>

> **Эту таблицу составил сам сравниваемый проект, так что читайте её с этой поправкой.** Проверено 14 августа 2026 г. по официальной документации, репозиториям и страницам в магазинах приложений; часть данных уже устарела. Если какая-то ячейка неверна или несправедлива по отношению к другому проекту, [создайте issue](https://github.com/CodeWithCJ/SparkyFitness/issues) — исправления, после которых SparkyFitness выглядит *хуже*, приветствуются ничуть не меньше.

**[Смотреть полное сравнение →](https://codewithcj.github.io/SparkyFitness/features/comparison)** — 17 приложений в категориях «самостоятельное размещение», «питание», «специализированные» и «экосистемы устройств», а также то, в чём каждое из них нас превосходит.

## Интеграции со службами здоровья и устройствами

SparkyFitness может синхронизировать данные с различными платформами для здоровья и фитнеса:

- **Apple Health** (iOS)
- **Google Health Connect** (Android)
- **Google Health API** 
- **Fitbit**
- **Garmin Connect**
- **Withings**
- **Polar Flow** 
- **Oura**
- **Hevy**
- **OpenFoodFacts**
- **USDA**
- **Fatsecret**
- **Nutritionix**
- **Mealie**
- **Tandoor**
- **Strava** (частично протестировано)
- **COROS**
- **Norish**
- **Yazio** (использует неофициальный API)
- **Swiss Food Database**
- **Canadian Nutrient File (Health Canada)**
- **Swedish Food Agency (Livsmedelsverket)**
- **Free Exercise DB** (Github)
- **Wger**

Интеграции автоматически синхронизируют с вашим сервером SparkyFitness данные об активности, такие как шаги, тренировки и сон, а также показатели здоровья, например вес и замеры тела.

## Дополнительные функции ИИ (бета)

SparkyAI предоставляет диалоговый интерфейс для записи данных и просмотра прогресса.

- Записывайте питание, тренировки, параметры тела и шаги через чат
- Загружайте фотографии еды для автоматической записи приёмов пищи
- История переписки сохраняется для последующих вопросов

Примечание: функции ИИ сейчас находятся в стадии бета-тестирования.

## Установка

Выберите один из двух способов запуска SparkyFitness:

### 1. Самостоятельное размещение

Запустите сервер SparkyFitness за несколько минут с помощью Docker Compose:

```bash
# 1. Создайте новую папку
mkdir sparkyfitness && cd sparkyfitness

# 2. Скачайте docker-compose.yml
curl -L -o docker-compose.yml https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/docker-compose.prod.yml

# 3. Настройте конфигурацию .env (выберите один вариант):
# Вариант A (рекомендуется): создайте собственный .env с надёжными ключами в 1 клик прямо в браузере:
# 👉 https://codewithcj.github.io/SparkyFitness/install/env-generator

# Вариант B: минимальный шаблон — 5 значений, для всего остального используются значения
# по умолчанию, которые уже задаёт docker-compose. Подходит для большинства установок.
curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.simple.example

# Вариант C: полный справочник — все поддерживаемые переменные, закомментированные со
# значениями по умолчанию. Начните с него для SSO, SMTP, внешней базы данных или обратного прокси.
# curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.example

# 4. Замените заполнители (пропустите этот шаг, если вы использовали вариант A — генератор
# уже их заполнил). Сервер не запустится, пока они остаются
# без изменений, а иначе база данных была бы инициализирована с общеизвестным паролем.
#   SPARKY_FITNESS_DB_PASSWORD        любой надёжный пароль
#   SPARKY_FITNESS_API_ENCRYPTION_KEY openssl rand -hex 32     (64 шестнадцатеричных символа)
#   BETTER_AUTH_SECRET                openssl rand -base64 32  (44 символа)
#   SPARKY_FITNESS_FRONTEND_URL       URL, по которому вы будете открывать приложение

# 5. Запустите приложение
docker compose pull && docker compose up -d

# Приложение доступно по адресу http://localhost:3004
```

_Примечание: полный список параметров конфигурации, настройку обратных прокси и альтернативные способы установки смотрите на [сайте документации](https://codewithcj.github.io/SparkyFitness/)._

### 2. Облако (для нетехнических пользователей)

Если вы не разбираетесь в технических деталях и не хотите запускать SparkyFitness на собственном сервере, вы можете развернуть размещённый экземпляр в облаке у одного из следующих провайдеров.

<a href="https://www.pikapods.com/pods?run=sparkyfitness">
  <img src="https://www.pikapods.com/static/run-button.svg" height="70" width="150" alt="Запустить на PikaPods">
</a>
<br>
<a href="https://zenith.hosting/host/sparkyfitness?ref=gh">
  <img src="https://cdn.zenith.hosting/buttons/deploy-with-zenith.svg" height="70" width="150" alt="Развернуть с Zenith">
</a>


> **Примечание:** это независимые сторонние сервисы. Рекомендуем ознакомиться с возможностями каждого провайдера, чтобы выбрать тот, который лучше всего подходит именно вам.
 

## 🎥 Видеоурок

[![Смотреть видео](https://img.youtube.com/vi/B13IiL2DeQc/maxresdefault.jpg)](https://www.youtube.com/watch?v=B13IiL2DeQc)

Короткий двухминутный урок о том, как установить SparkyFitness (самостоятельно размещаемый фитнес-трекер).

## Документация

Полные руководства по установке, параметры конфигурации и документацию для разработчиков вы найдёте на нашем [сайте документации](https://codewithcj.github.io/SparkyFitness/).

### Быстрые ссылки

- **[Руководство по установке](https://codewithcj.github.io/SparkyFitness/install/docker-compose)** - Развёртывание и настройка
- **[Интерактивный генератор .env](https://codewithcj.github.io/SparkyFitness/install/env-generator)** - Конструктор конфигурации `.env`, работающий в браузере
- **[Обзор возможностей](https://codewithcj.github.io/SparkyFitness/features)** - Полная документация по функциям
- **[Процесс разработки](https://codewithcj.github.io/SparkyFitness/developer/getting-started)** - Руководство разработчика и порядок внесения вклада
- **[Информация о приложении для iOS](https://github.com/CodeWithCJ/SparkyFitness/wiki/Apple-Health-Integration)** и **[информация о приложении для Android](https://github.com/CodeWithCJ/SparkyFitness/wiki/Android-Mobile-App)**

### Нужна помощь?

- Пишите в issues или обсуждениях на Github.
- Чтобы получить ответ быстрее и помощь от других участников сообщества, **[присоединяйтесь к нашему Discord](https://discord.gg/vcnMT5cPEA)**

## История звёзд

<a href="https://www.star-history.com/?repos=CodeWithCJ%2FSparkyFitness&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&theme=dark&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <img alt="График истории звёзд" src="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
 </picture>
</a>

## Переводы


**[Переводы в Weblate](https://weblate.sparkyfitness.com/engage/sparkyfitness)**

<a href="http://weblate.sparkyfitness.com/engage/sparkyfitness/"><img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/svg-badge.svg" alt="Статус перевода"></a>



<a href="https://weblate.sparkyfitness.com/engage/sparkyfitness">
<img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/multi-auto.svg" alt="Статус перевода" />
</a>

## Активность репозитория

![Alt](https://repobeats.axiom.co/api/embed/828203d3070ff56c8873c727b6873b684c4ed399.svg "Аналитика репозитория от Repobeats")

## Участники

<a href="https://github.com/CodeWithCJ/SparkyFitness/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=CodeWithCJ/SparkyFitness" width="100%" alt="Участники проекта SparkyFitness"/>
</a>

## ⚠️ Известные проблемы / Бета-функции ⚠️

SparkyFitness находится в стадии активной разработки.
Между релизами возможны изменения, нарушающие обратную совместимость.

- Автоматическое обновление контейнеров не рекомендуется
- Всегда читайте примечания к релизу перед обновлением

Следующие функции сейчас находятся в бета-версии и могли быть недостаточно протестированы. Возможны ошибки или неполная функциональность:

- ИИ-чатбот
- Доступ для семьи и друзей
- Документация API

_Это перевод README на английском языке. В случае расхождений ориентиром служит [английская версия](../../README.md)._
