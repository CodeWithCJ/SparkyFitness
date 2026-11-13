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
  <a href="README_ru.md">Русский</a> ·
  <a href="README_pt-BR.md">Português (Brasil)</a> ·
  <a href="README_nl.md">Nederlands</a> ·
  <a href="README_pl.md">Polski</a> ·
  <a href="README_ar.md">العربية</a> ·
  <b>فارسی</b> ·
  <a href="README_tr.md">Türkçe</a> ·
  <a href="README_vi.md">Tiếng Việt</a> ·
  <a href="README_id.md">Bahasa Indonesia</a>
</p>

# SparkyFitness

جایگزینی خودمیزبان و حریم‌خصوصی‌محور برای MyFitnessPal، Flo، Hevy، Shotsy و موارد دیگر. تغذیه، ورزش، اندازه‌های بدن و داده‌های سلامت را ثبت کنید و کنترل کامل داده‌هایتان را در دست داشته باشید.
<img width="5120" height="2880" alt="تصویر" src="https://github.com/user-attachments/assets/d8b09f48-cb4d-41a6-b678-ac93e551f257" />


SparkyFitness یک پلتفرم خودمیزبان برای پیگیری تناسب اندام است که از این بخش‌ها تشکیل شده:

- یک سرور بک‌اند (API + ذخیره‌سازی داده)
- یک فرانت‌اند تحت وب
- اپلیکیشن‌های موبایل بومی برای iOS و Android

داده‌های سلامت را روی زیرساختی که خودتان کنترل می‌کنید ذخیره و مدیریت می‌کند، بدون وابستگی به سرویس‌های شخص ثالث.

## قابلیت‌های اصلی

- پیگیری تغذیه، ورزش، آب‌رسانی، خواب، روزه‌داری، حال‌وهوا و اندازه‌های بدن
- تعیین هدف و ثبت وضعیت روزانه
- نمودارهای تعاملی و گزارش‌های بلندمدت
- چند پروفایل کاربری و دسترسی خانوادگی
- پوسته‌های روشن و تیره
- OIDC، TOTP، Passkey، MFA و غیره.

## مقایسهٔ SparkyFitness با دیگران

**SparkyFitness منبع‌در‌دسترس (source-available) است، نه متن‌باز** — [مجوز](../../LICENSE) آن غیرتجاری است و استفادهٔ تجاری نیازمند اجازه است.

بیشتر اپلیکیشن‌ها فقط یک کار انجام می‌دهند. یک اپلیکیشن تغذیهٔ خوب سالانه ۴۰ تا ۱۰۰ دلار هزینه دارد؛ پوشش همهٔ آنچه SparkyFitness پوشش می‌دهد یعنی سه یا چهار اشتراک برای هر نفر، و باز هم هیچ گزارش واحدی که همه را کنار هم بیاورد. SparkyFitness همهٔ این‌ها را در یک اپلیکیشن، رایگان، برای کل خانواده انجام می‌دهد.

<sub>قیمت‌های فهرست‌شده در آمریکا، ۱۴ اوت ۲۰۲۶. [جزئیات کامل هزینه‌ها ←](https://codewithcj.github.io/SparkyFitness/features/comparison)</sub>

| | **SparkyFitness** | wger | MyFitnessPal | Cronometer | Hevy | Zero | Flo | Garmin Connect | Google Health |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| خودمیزبان، داده‌هایتان مال خودتان می‌ماند | ⭐ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| بدون اشتراک، بدون تبلیغات | ✅ | ✅ | ❌ | 🟡 | 🟡 | ❌ | ❌ | ✅ | 🟡 |
| تغذیه، تمرین قدرتی، خواب، روزه‌داری، چرخهٔ قاعدگی و داروها در یک جا\* | ⭐ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| تاریخچهٔ کامل و گزارش با بازهٔ زمانی دلخواه | ✅ رایگان | 🟡 | 💰 | 💰 | 💰 | 💰 | 💰 | ✅ | 💰 |
| همگام‌سازی با پوشیدنی‌ها و پلتفرم‌های سلامت | ✅ بیش از ۸ سرویس | ❌ | ✅ | ⭐ | ✅ | 🟡 | 🟡 | 🟡 | ✅ |
| اشتراک‌گذاری خانوادگی با مجوزهای دقیق | ⭐ ۷ مجوز | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| ورود CSV و خروجی رایگان داده | ✅ | 🟡 | 💰 | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ❌ |
| سرور MCP + استفاده از LLM دلخواه خودتان | ⭐ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

⭐ برجسته &nbsp;•&nbsp; ✅ پشتیبانی می‌شود &nbsp;•&nbsp; 🟡 جزئی &nbsp;•&nbsp; 💰 فقط در طرح پولی &nbsp;•&nbsp; ❌ پشتیبانی نمی‌شود

<sub>\* مراحل خواب، HRV و قند خون از ساعت، گوشی یا دستگاه اندازه‌گیری شما وارد می‌شوند. SparkyFitness آن‌ها را ذخیره، تحلیل و در نمودار نمایش می‌دهد، اما خودش آن‌ها را اندازه‌گیری نمی‌کند.</sub>

> **این جدول را همان پروژه‌ای نوشته که در آن مقایسه می‌شود، پس با همین دید آن را بخوانید.** در ۱۴ اوت ۲۰۲۶ با مستندات رسمی، مخازن و صفحات فروشگاه‌ها بررسی شده است؛ بخشی از آن همین حالا هم قدیمی شده است. اگر خانه‌ای نادرست است یا نسبت به پروژهٔ دیگری منصفانه نیست، [یک issue باز کنید](https://github.com/CodeWithCJ/SparkyFitness/issues) — اصلاحاتی که SparkyFitness را *بدتر* نشان می‌دهند هم به همان اندازه خوش‌آمدند.

**[مقایسهٔ کامل را ببینید ←](https://codewithcj.github.io/SparkyFitness/features/comparison)** — ۱۷ اپلیکیشن در دسته‌های خودمیزبان، تغذیه، تخصصی و اکوسیستم دستگاه‌ها، به‌همراه جاهایی که هر کدام از ما بهترند.

## یکپارچه‌سازی با سلامت و دستگاه‌ها

SparkyFitness می‌تواند داده‌ها را از چندین پلتفرم سلامت و تناسب اندام همگام‌سازی کند:

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
- **Strava** (تا حدی آزموده‌شده)
- **COROS**
- **Norish**
- **Yazio** (از API غیررسمی استفاده می‌کند)
- **Swiss Food Database**
- **Canadian Nutrient File (Health Canada)**
- **Swedish Food Agency (Livsmedelsverket)**
- **Free Exercise DB** (Github)
- **Wger**

یکپارچه‌سازی‌ها به‌طور خودکار داده‌های فعالیت مانند گام‌ها، تمرین‌ها و خواب را، همراه با شاخص‌های سلامت مانند وزن و اندازه‌های بدن، با سرور SparkyFitness شما همگام‌سازی می‌کنند.

## قابلیت‌های اختیاری هوش مصنوعی (بتا)

SparkyAI یک رابط گفت‌وگومحور برای ثبت داده‌ها و مرور پیشرفت فراهم می‌کند.

- ثبت غذا، ورزش، شاخص‌های بدن و گام‌ها از طریق چت
- بارگذاری عکس غذا برای ثبت خودکار وعده‌ها
- نگه‌داشتن تاریخچهٔ گفت‌وگو برای پرسش‌های بعدی

توجه: قابلیت‌های هوش مصنوعی در حال حاضر در مرحلهٔ بتا هستند.

## نصب

یکی از دو روش اجرای SparkyFitness را انتخاب کنید:

### ۱. خودمیزبان

با Docker Compose در چند دقیقه یک سرور SparkyFitness راه‌اندازی کنید:

```bash
# 1. یک پوشهٔ جدید بسازید
mkdir sparkyfitness && cd sparkyfitness

# 2. فایل docker-compose.yml را دانلود کنید
curl -L -o docker-compose.yml https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/docker-compose.prod.yml

# 3. پیکربندی .env را تنظیم کنید (یکی از گزینه‌ها را انتخاب کنید):
# گزینهٔ A (توصیه‌شده): یک .env سفارشی با کلیدهای امن و تنها با یک کلیک در مرورگر بسازید:
# 👉 https://codewithcj.github.io/SparkyFitness/install/env-generator

# گزینهٔ B: قالب حداقلی — ۵ مقدار، بقیه از مقادیر پیش‌فرضی استفاده می‌کنند
# که docker-compose از قبل اعمال می‌کند. برای بیشتر نصب‌های خودمیزبان کافی است.
curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.simple.example

# گزینهٔ C: مرجع کامل — همهٔ متغیرهای پشتیبانی‌شده، به‌صورت کامنت‌شده همراه با
# مقدار پیش‌فرضشان. برای SSO، SMTP، پایگاه دادهٔ خارجی یا reverse proxy از اینجا شروع کنید.
# curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.example

# 4. مقادیر جایگزین را عوض کنید (اگر از گزینهٔ A استفاده کرده‌اید رد شوید — مولد
# آن‌ها را از قبل پر کرده است). تا وقتی این مقادیر دست‌نخورده بمانند سرور
# اجرا نمی‌شود، وگرنه پایگاه داده با یک رمز عبور عمومی مقداردهی اولیه می‌شد.
#   SPARKY_FITNESS_DB_PASSWORD        هر رمز عبور قوی
#   SPARKY_FITNESS_API_ENCRYPTION_KEY openssl rand -hex 32     (۶۴ نویسهٔ هگز)
#   BETTER_AUTH_SECRET                openssl rand -base64 32  (۴۴ نویسه)
#   SPARKY_FITNESS_FRONTEND_URL       نشانی URL که اپلیکیشن را با آن باز می‌کنید

# 5. اپلیکیشن را اجرا کنید
docker compose pull && docker compose up -d

# دسترسی به اپلیکیشن در http://localhost:3004
```

_توجه: برای گزینه‌های کامل پیکربندی، reverse proxyها و روش‌های جایگزین نصب، به [سایت مستندات](https://codewithcj.github.io/SparkyFitness/) سر بزنید._

### ۲. ابری (برای کاربران غیرفنی)

اگر کاربر فنی نیستید و ترجیح می‌دهید SparkyFitness را روی سرور خودتان اجرا نکنید، می‌توانید با یکی از ارائه‌دهندگان زیر یک نمونهٔ میزبانی‌شده در فضای ابری راه‌اندازی کنید.

<a href="https://www.pikapods.com/pods?run=sparkyfitness">
  <img src="https://www.pikapods.com/static/run-button.svg" height="70" width="150" alt="اجرا روی PikaPods">
</a>
<br>
<a href="https://zenith.hosting/host/sparkyfitness?ref=gh">
  <img src="https://cdn.zenith.hosting/buttons/deploy-with-zenith.svg" height="70" width="150" alt="راه‌اندازی با Zenith">
</a>


> **توجه:** این‌ها سرویس‌های مستقل شخص ثالث هستند. پیشنهاد می‌کنیم قابلیت‌های هر ارائه‌دهنده را بررسی کنید تا مناسب‌ترین گزینه را برای نیازهایتان پیدا کنید.
 

## 🎥 آموزش ویدیویی

[![ویدیو را تماشا کنید](https://img.youtube.com/vi/B13IiL2DeQc/maxresdefault.jpg)](https://www.youtube.com/watch?v=B13IiL2DeQc)

آموزش کوتاه ۲ دقیقه‌ای که نحوهٔ نصب SparkyFitness (ردیاب تناسب اندام خودمیزبان) را نشان می‌دهد.

## مستندات

برای راهنماهای کامل نصب، گزینه‌های پیکربندی و مستندات توسعه، لطفاً به [سایت مستندات](https://codewithcj.github.io/SparkyFitness/) ما سر بزنید.

### پیوندهای سریع

- **[راهنمای نصب](https://codewithcj.github.io/SparkyFitness/install/docker-compose)** - استقرار و پیکربندی‌ها
- **[مولد تعاملی .env](https://codewithcj.github.io/SparkyFitness/install/env-generator)** - سازندهٔ پیکربندی `.env` در سمت کاربر
- **[مروری بر قابلیت‌ها](https://codewithcj.github.io/SparkyFitness/features)** - مستندات کامل قابلیت‌ها
- **[روند توسعه](https://codewithcj.github.io/SparkyFitness/developer/getting-started)** - راهنمای توسعه‌دهندگان و فرایند مشارکت
- **[اطلاعات اپلیکیشن iOS](https://github.com/CodeWithCJ/SparkyFitness/wiki/Apple-Health-Integration)** و **[اطلاعات اپلیکیشن Android](https://github.com/CodeWithCJ/SparkyFitness/wiki/Android-Mobile-App)**

### کمک لازم دارید؟

- در issues یا discussions گیت‌هاب مطلب بگذارید.
- برای پاسخ سریع‌تر و دریافت کمک از دیگر اعضای جامعه **[به Discord ما بپیوندید](https://discord.gg/vcnMT5cPEA)**

## تاریخچهٔ ستاره‌ها

<a href="https://www.star-history.com/?repos=CodeWithCJ%2FSparkyFitness&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&theme=dark&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <img alt="نمودار تاریخچهٔ ستاره‌ها" src="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
 </picture>
</a>

## ترجمه‌ها


**[ترجمه‌ها در Weblate](https://weblate.sparkyfitness.com/engage/sparkyfitness)**

<a href="http://weblate.sparkyfitness.com/engage/sparkyfitness/"><img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/svg-badge.svg" alt="وضعیت ترجمه"></a>



<a href="https://weblate.sparkyfitness.com/engage/sparkyfitness">
<img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/multi-auto.svg" alt="وضعیت ترجمه" />
</a>

## فعالیت مخزن

![Alt](https://repobeats.axiom.co/api/embed/828203d3070ff56c8873c727b6873b684c4ed399.svg "تصویر تحلیل‌های Repobeats")

## مشارکت‌کنندگان

<a href="https://github.com/CodeWithCJ/SparkyFitness/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=CodeWithCJ/SparkyFitness" width="100%" alt="مشارکت‌کنندگان SparkyFitness"/>
</a>

## ⚠️ مشکلات شناخته‌شده / قابلیت‌های بتا ⚠️

SparkyFitness در حال توسعهٔ فعال است.
ممکن است بین نسخه‌ها تغییرات ناسازگار رخ دهد.

- به‌روزرسانی خودکار کانتینرها توصیه نمی‌شود
- همیشه پیش از ارتقا، یادداشت‌های انتشار را بخوانید

قابلیت‌های زیر در حال حاضر در مرحلهٔ بتا هستند و ممکن است به‌طور کامل آزموده نشده باشند. احتمال وجود باگ یا عملکرد ناقص را در نظر داشته باشید:

- چت‌بات هوش مصنوعی
- دسترسی خانواده و دوستان
- مستندات API

_این یک ترجمه از README انگلیسی است. در صورت هرگونه تفاوت، [نسخهٔ انگلیسی](../../README.md) مرجع است._
