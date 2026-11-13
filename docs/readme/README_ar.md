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
  <b>العربية</b> ·
  <a href="README_fa.md">فارسی</a> ·
  <a href="README_tr.md">Türkçe</a> ·
  <a href="README_vi.md">Tiếng Việt</a> ·
  <a href="README_id.md">Bahasa Indonesia</a>
</p>

# SparkyFitness

بديل مُستضاف ذاتيًا يضع الخصوصية أولًا لتطبيقات MyFitnessPal وFlo وHevy وShotsy وغيرها. تتبّع التغذية والتمارين وقياسات الجسم والبيانات الصحية مع الاحتفاظ بالتحكم الكامل في بياناتك.
<img width="5120" height="2880" alt="صورة" src="https://github.com/user-attachments/assets/d8b09f48-cb4d-41a6-b678-ac93e551f257" />


SparkyFitness منصة مُستضافة ذاتيًا لتتبّع اللياقة البدنية، تتكوّن من:

- خادم خلفي (واجهة برمجة تطبيقات API + تخزين البيانات)
- واجهة أمامية تعمل عبر الويب
- تطبيقات جوّال أصلية لنظامَي iOS وAndroid

تخزّن البيانات الصحية وتديرها على بنية تحتية تتحكّم بها أنت، دون الاعتماد على خدمات أطراف ثالثة.

## الميزات الأساسية

- تتبّع التغذية والتمارين وشرب الماء والنوم والصيام والمزاج وقياسات الجسم
- تحديد الأهداف وتسجيل المتابعة اليومية
- رسوم بيانية تفاعلية وتقارير طويلة المدى
- ملفات تعريف متعددة للمستخدمين ووصول للعائلة
- سمات فاتحة وداكنة
- OIDC وTOTP وPasskey وMFA وغيرها.

## كيف يُقارَن SparkyFitness بغيره

**SparkyFitness مُتاح المصدر وليس مفتوح المصدر** — [الترخيص](../../LICENSE) غير تجاري ويتطلّب الحصول على إذن للاستخدام التجاري.

معظم التطبيقات تؤدي وظيفة واحدة فقط. تطبيق تغذية جيد واحد يكلّف ما بين 40 و100 دولار سنويًا؛ وتغطية كل ما يغطيه SparkyFitness تعني ثلاثة أو أربعة اشتراكات لكل شخص، ومع ذلك لا يوجد تقرير واحد يجمعها. أما SparkyFitness فيقدّم ذلك كله في تطبيق واحد، مجانًا، للأسرة بأكملها.

<sub>أسعار القوائم في الولايات المتحدة، 14 أغسطس 2026. [التفصيل الكامل للتكاليف ←](https://codewithcj.github.io/SparkyFitness/features/comparison)</sub>

| | **SparkyFitness** | wger | MyFitnessPal | Cronometer | Hevy | Zero | Flo | Garmin Connect | Google Health |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| استضافة ذاتية، بياناتك تبقى ملكك | ⭐ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| بلا اشتراك وبلا إعلانات | ✅ | ✅ | ❌ | 🟡 | 🟡 | ❌ | ❌ | ✅ | 🟡 |
| التغذية والقوة والنوم والصيام والدورة الشهرية والأدوية في مكان واحد\* | ⭐ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| سجل كامل وتقارير بنطاق تواريخ مخصّص | ✅ مجانًا | 🟡 | 💰 | 💰 | 💰 | 💰 | 💰 | ✅ | 💰 |
| مزامنة الأجهزة القابلة للارتداء والمنصات الصحية | ✅ أكثر من 8 خدمات | ❌ | ✅ | ⭐ | ✅ | 🟡 | 🟡 | 🟡 | ✅ |
| مشاركة عائلية بصلاحيات دقيقة | ⭐ 7 صلاحيات | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| استيراد CSV وتصدير مجاني للبيانات | ✅ | 🟡 | 💰 | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ❌ |
| خادم MCP + استخدم LLM الخاص بك | ⭐ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

⭐ متميّز &nbsp;•&nbsp; ✅ مدعوم &nbsp;•&nbsp; 🟡 جزئي &nbsp;•&nbsp; 💰 في الخطة المدفوعة فقط &nbsp;•&nbsp; ❌ غير مدعوم

<sub>\* تُستورد مراحل النوم وتقلّب معدل ضربات القلب (HRV) وسكر الدم من ساعتك أو هاتفك أو جهاز القياس. يخزّنها SparkyFitness ويحلّلها ويعرضها في رسوم بيانية، لكنه لا يقيسها بنفسه.</sub>

> **هذا الجدول كتبه المشروع نفسه الذي تجري مقارنته، فاقرأه على هذا الأساس.** جرى التحقق منه في 14 أغسطس 2026 مقابل الوثائق الرسمية والمستودعات وصفحات المتاجر؛ وبعض محتواه أصبح قديمًا بالفعل. إذا كانت إحدى الخلايا خاطئة أو مجحفة بحق مشروع آخر، [افتح issue](https://github.com/CodeWithCJ/SparkyFitness/issues) — فالتصحيحات التي تُظهر SparkyFitness بصورة *أسوأ* مرحّب بها بالقدر نفسه.

**[اطّلع على المقارنة الكاملة ←](https://codewithcj.github.io/SparkyFitness/features/comparison)** — 17 تطبيقًا ضمن فئات الاستضافة الذاتية والتغذية والتطبيقات المتخصّصة ومنظومات الأجهزة، مع بيان المجالات التي يتفوّق فيها كل منها علينا.

## التكامل مع منصات الصحة والأجهزة

يمكن لـ SparkyFitness مزامنة البيانات من منصات متعددة للصحة واللياقة البدنية:

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
- **Strava** (مُختبَر جزئيًا)
- **COROS**
- **Norish**
- **Yazio** (يستخدم API غير رسمية)
- **Swiss Food Database**
- **Canadian Nutrient File (Health Canada)**
- **Swedish Food Agency (Livsmedelsverket)**
- **Free Exercise DB** (Github)
- **Wger**

تعمل التكاملات تلقائيًا على مزامنة بيانات النشاط مثل الخطوات والتمارين والنوم، إلى جانب المؤشرات الصحية مثل الوزن وقياسات الجسم، مع خادم SparkyFitness الخاص بك.

## ميزات الذكاء الاصطناعي الاختيارية (تجريبية)

يوفّر SparkyAI واجهة محادثة لتسجيل البيانات ومراجعة التقدّم.

- سجّل الطعام والتمارين وقياسات الجسم والخطوات عبر المحادثة
- ارفع صور الطعام لتسجيل الوجبات تلقائيًا
- يحتفظ بسجل المحادثة لمتابعة الأسئلة اللاحقة

ملاحظة: ميزات الذكاء الاصطناعي في مرحلة تجريبية حاليًا.

## التثبيت

اختر إحدى الطريقتين لتشغيل SparkyFitness:

### 1. الاستضافة الذاتية

شغّل خادم SparkyFitness خلال دقائق باستخدام Docker Compose:

```bash
# 1. أنشئ مجلدًا جديدًا
mkdir sparkyfitness && cd sparkyfitness

# 2. نزّل ملف docker-compose.yml
curl -L -o docker-compose.yml https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/docker-compose.prod.yml

# 3. اضبط إعدادات ملف .env (اختر خيارًا واحدًا):
# الخيار A (موصى به): أنشئ ملف .env مخصّصًا بمفاتيح آمنة بنقرة واحدة في المتصفح:
# 👉 https://codewithcj.github.io/SparkyFitness/install/env-generator

# الخيار B: قالب مختصر — 5 قيم، وكل ما عداها يستخدم القيم الافتراضية
# التي يطبّقها docker-compose أصلًا. مناسب لمعظم عمليات التثبيت الذاتية.
curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.simple.example

# الخيار C: مرجع كامل — كل متغير مدعوم، مُعلَّق مع
# قيمته الافتراضية. ابدأ من هنا لإعداد SSO أو SMTP أو قاعدة بيانات خارجية أو وكيل عكسي.
# curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.example

# 4. استبدل القيم المؤقتة (تخطَّ هذه الخطوة إذا استخدمت الخيار A — فقد ملأها
# المولّد بالفعل). يرفض الخادم البدء ما دامت متروكة
# كما هي، وإلا فستُهيَّأ قاعدة البيانات بكلمة مرور منشورة علنًا.
#   SPARKY_FITNESS_DB_PASSWORD        أي كلمة مرور قوية
#   SPARKY_FITNESS_API_ENCRYPTION_KEY openssl rand -hex 32     (64 حرفًا ست عشريًا)
#   BETTER_AUTH_SECRET                openssl rand -base64 32  (44 حرفًا)
#   SPARKY_FITNESS_FRONTEND_URL       عنوان URL الذي ستفتح التطبيق عليه

# 5. شغّل التطبيق
docker compose pull && docker compose up -d

# افتح التطبيق على http://localhost:3004
```

_ملاحظة: للاطلاع على خيارات الإعداد الكاملة والوكلاء العكسيين وطرق التثبيت البديلة، تفضّل بزيارة [موقع الوثائق](https://codewithcj.github.io/SparkyFitness/)._

### 2. السحابة (للمستخدمين غير التقنيين)

إذا لم تكن مستخدمًا تقنيًا وتفضّل عدم تشغيل SparkyFitness على خادمك الخاص، يمكنك نشر نسخة مُستضافة في السحابة عبر أحد المزوّدين التاليين.

<a href="https://www.pikapods.com/pods?run=sparkyfitness">
  <img src="https://www.pikapods.com/static/run-button.svg" height="70" width="150" alt="التشغيل على PikaPods">
</a>
<br>
<a href="https://zenith.hosting/host/sparkyfitness?ref=gh">
  <img src="https://cdn.zenith.hosting/buttons/deploy-with-zenith.svg" height="70" width="150" alt="النشر باستخدام Zenith">
</a>


> **ملاحظة:** هذه خدمات مستقلة تابعة لأطراف ثالثة. نشجّعك على استكشاف الميزات التي يقدّمها كل مزوّد لتحديد الأنسب لاحتياجاتك.
 

## 🎥 فيديو تعليمي

[![شاهد الفيديو](https://img.youtube.com/vi/B13IiL2DeQc/maxresdefault.jpg)](https://www.youtube.com/watch?v=B13IiL2DeQc)

درس تعليمي سريع مدته دقيقتان يوضّح كيفية تثبيت SparkyFitness (متتبّع لياقة مُستضاف ذاتيًا).

## الوثائق

للاطلاع على أدلة التثبيت الكاملة وخيارات الإعداد ووثائق التطوير، يُرجى زيارة [موقع الوثائق](https://codewithcj.github.io/SparkyFitness/) الخاص بنا.

### روابط سريعة

- **[دليل التثبيت](https://codewithcj.github.io/SparkyFitness/install/docker-compose)** - النشر والإعدادات
- **[مولّد .env التفاعلي](https://codewithcj.github.io/SparkyFitness/install/env-generator)** - أداة لإنشاء إعدادات `.env` تعمل من جهة العميل
- **[نظرة عامة على الميزات](https://codewithcj.github.io/SparkyFitness/features)** - وثائق كاملة للميزات
- **[سير عمل التطوير](https://codewithcj.github.io/SparkyFitness/developer/getting-started)** - دليل المطوّرين وآلية المساهمة
- **[معلومات تطبيق iOS](https://github.com/CodeWithCJ/SparkyFitness/wiki/Apple-Health-Integration)** و**[معلومات تطبيق Android](https://github.com/CodeWithCJ/SparkyFitness/wiki/Android-Mobile-App)**

### تحتاج إلى مساعدة؟

- انشر في قسم issues أو discussions على GitHub.
- للحصول على رد أسرع ومساعدة من أعضاء المجتمع الآخرين **[انضم إلى Discord الخاص بنا](https://discord.gg/vcnMT5cPEA)**

## سجل النجوم

<a href="https://www.star-history.com/?repos=CodeWithCJ%2FSparkyFitness&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&theme=dark&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <img alt="مخطط سجل النجوم" src="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
 </picture>
</a>

## الترجمات


**[الترجمات على Weblate](https://weblate.sparkyfitness.com/engage/sparkyfitness)**

<a href="http://weblate.sparkyfitness.com/engage/sparkyfitness/"><img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/svg-badge.svg" alt="حالة الترجمة"></a>



<a href="https://weblate.sparkyfitness.com/engage/sparkyfitness">
<img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/multi-auto.svg" alt="حالة الترجمة" />
</a>

## نشاط المستودع

![Alt](https://repobeats.axiom.co/api/embed/828203d3070ff56c8873c727b6873b684c4ed399.svg "صورة تحليلات Repobeats")

## المساهمون

<a href="https://github.com/CodeWithCJ/SparkyFitness/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=CodeWithCJ/SparkyFitness" width="100%" alt="المساهمون في SparkyFitness"/>
</a>

## ⚠️ مشكلات معروفة / ميزات تجريبية ⚠️

SparkyFitness قيد التطوير النشط.
قد تحدث تغييرات جذرية غير متوافقة بين الإصدارات.

- لا يُنصح بالتحديث التلقائي للحاويات
- راجع دائمًا ملاحظات الإصدار قبل الترقية

الميزات التالية في مرحلة تجريبية حاليًا وربما لم تُختبر بشكل شامل. توقّع وجود أخطاء محتملة أو وظائف غير مكتملة:

- روبوت المحادثة بالذكاء الاصطناعي
- وصول العائلة والأصدقاء
- وثائق API

_هذه ترجمة لملف README الإنجليزي. في حال وجود أي اختلاف، تكون [النسخة الإنجليزية](../../README.md) هي المرجع._
