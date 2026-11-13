<p align="center">
  <a href="../../README.md">English</a> ·
  <a href="README_zh-CN.md">简体中文</a> ·
  <a href="README_zh-TW.md">繁體中文</a> ·
  <a href="README_ja.md">日本語</a> ·
  <a href="README_ko.md">한국어</a> ·
  <b>हिन्दी</b> ·
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
  <a href="README_fa.md">فارسی</a> ·
  <a href="README_tr.md">Türkçe</a> ·
  <a href="README_vi.md">Tiếng Việt</a> ·
  <a href="README_id.md">Bahasa Indonesia</a>
</p>

# SparkyFitness

MyFitnessPal, Flo, Hevy, Shotsy और अन्य ऐप्स का एक सेल्फ-होस्टेड, गोपनीयता-प्रथम विकल्प। अपने डेटा पर पूरा नियंत्रण रखते हुए पोषण, व्यायाम, शारीरिक माप और स्वास्थ्य डेटा ट्रैक करें।
<img width="5120" height="2880" alt="चित्र" src="https://github.com/user-attachments/assets/d8b09f48-cb4d-41a6-b678-ac93e551f257" />


SparkyFitness एक सेल्फ-होस्टेड फ़िटनेस ट्रैकिंग प्लेटफ़ॉर्म है, जिसमें शामिल हैं:

- एक बैकएंड सर्वर (API + डेटा स्टोरेज)
- एक वेब-आधारित फ़्रंटएंड
- iOS और Android के लिए नेटिव मोबाइल ऐप्स

यह स्वास्थ्य डेटा को आपके अपने नियंत्रण वाले इन्फ्रास्ट्रक्चर पर संग्रहीत और प्रबंधित करता है, बिना किसी थर्ड-पार्टी सेवा पर निर्भर हुए।

## मुख्य सुविधाएँ

- पोषण, व्यायाम, हाइड्रेशन, नींद, उपवास, मूड और शारीरिक माप की ट्रैकिंग
- लक्ष्य निर्धारण और दैनिक चेक-इन
- इंटरैक्टिव चार्ट और दीर्घकालिक रिपोर्ट
- कई यूज़र प्रोफ़ाइल और परिवार के लिए एक्सेस
- लाइट और डार्क थीम
- OIDC, TOTP, Passkey, MFA आदि।

## SparkyFitness की तुलना

**SparkyFitness सोर्स-अवेलेबल है, ओपन सोर्स नहीं** — इसका [लाइसेंस](../../LICENSE) गैर-व्यावसायिक है और व्यावसायिक उपयोग के लिए अनुमति आवश्यक है।

ज़्यादातर ऐप्स सिर्फ़ एक ही काम करते हैं। एक अच्छा पोषण ऐप साल में $40–$100 का पड़ता है; SparkyFitness जितना कुछ कवर करने के लिए प्रति व्यक्ति तीन या चार सब्सक्रिप्शन चाहिए, और फिर भी उन सबको मिलाकर एक भी रिपोर्ट नहीं मिलती। SparkyFitness यह सब एक ही ऐप में, मुफ़्त में, पूरे परिवार के लिए करता है।

<sub>अमेरिकी सूची मूल्य, 14 अगस्त 2026। [लागत का पूरा विवरण →](https://codewithcj.github.io/SparkyFitness/features/comparison)</sub>

| | **SparkyFitness** | wger | MyFitnessPal | Cronometer | Hevy | Zero | Flo | Garmin Connect | Google Health |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| सेल्फ-होस्टेड, आपका डेटा आपका ही रहता है | ⭐ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| कोई सब्सक्रिप्शन नहीं, कोई विज्ञापन नहीं | ✅ | ✅ | ❌ | 🟡 | 🟡 | ❌ | ❌ | ✅ | 🟡 |
| पोषण, स्ट्रेंथ ट्रेनिंग, नींद, उपवास, मासिक चक्र और दवाएँ एक ही जगह\* | ⭐ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| पूरा इतिहास और कस्टम तिथि-सीमा रिपोर्ट | ✅ मुफ़्त | 🟡 | 💰 | 💰 | 💰 | 💰 | 💰 | ✅ | 💰 |
| वियरेबल और हेल्थ-प्लेटफ़ॉर्म सिंक | ✅ 8+ सेवाएँ | ❌ | ✅ | ⭐ | ✅ | 🟡 | 🟡 | 🟡 | ✅ |
| विस्तृत अनुमतियों के साथ फ़ैमिली शेयरिंग | ⭐ 7 अनुमतियाँ | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| CSV इम्पोर्ट और मुफ़्त डेटा एक्सपोर्ट | ✅ | 🟡 | 💰 | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ❌ |
| MCP सर्वर + अपना खुद का LLM इस्तेमाल करें | ⭐ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

⭐ सबसे अलग &nbsp;•&nbsp; ✅ समर्थित &nbsp;•&nbsp; 🟡 आंशिक &nbsp;•&nbsp; 💰 केवल सशुल्क प्लान में &nbsp;•&nbsp; ❌ समर्थित नहीं

<sub>\* नींद के चरण, HRV और ब्लड ग्लूकोज़ आपकी घड़ी, फ़ोन या मीटर से इम्पोर्ट किए जाते हैं। SparkyFitness इन्हें स्वयं नहीं मापता, बल्कि इन्हें संग्रहीत करता है, इनका विश्लेषण करता है और चार्ट में दिखाता है।</sub>

> **यह तालिका उसी प्रोजेक्ट ने लिखी है जिसकी तुलना की जा रही है, इसलिए इसे इसी नज़र से पढ़ें।** 14 अगस्त 2026 को आधिकारिक डॉक्स, रिपॉज़िटरी और स्टोर लिस्टिंग से जाँची गई; इसमें से कुछ जानकारी पहले ही पुरानी हो चुकी है। अगर कोई सेल गलत है या किसी दूसरे प्रोजेक्ट के साथ अन्याय करता है, तो [एक issue खोलें](https://github.com/CodeWithCJ/SparkyFitness/issues) — ऐसे सुधार भी उतने ही स्वागत योग्य हैं जिनसे SparkyFitness *कमतर* दिखे।

**[पूरी तुलना देखें →](https://codewithcj.github.io/SparkyFitness/features/comparison)** — सेल्फ-होस्टेड, पोषण, विशेषज्ञ और डिवाइस-इकोसिस्टम श्रेणियों के 17 ऐप्स, साथ ही यह भी कि उनमें से हर एक हमसे कहाँ बेहतर है।

## स्वास्थ्य और डिवाइस इंटीग्रेशन

SparkyFitness कई स्वास्थ्य और फ़िटनेस प्लेटफ़ॉर्म से डेटा सिंक कर सकता है:

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
- **Strava** (आंशिक रूप से परीक्षित)
- **COROS**
- **Norish**
- **Yazio** (अनौपचारिक API का उपयोग करता है)
- **Swiss Food Database**
- **Canadian Nutrient File (Health Canada)**
- **Swedish Food Agency (Livsmedelsverket)**
- **Free Exercise DB** (Github)
- **Wger**

इंटीग्रेशन कदम, वर्कआउट और नींद जैसे गतिविधि डेटा के साथ-साथ वज़न और शारीरिक माप जैसे स्वास्थ्य मेट्रिक्स को अपने-आप आपके SparkyFitness सर्वर पर सिंक कर देते हैं।

## वैकल्पिक AI सुविधाएँ (बीटा)

SparkyAI डेटा दर्ज करने और प्रगति की समीक्षा करने के लिए एक बातचीत-आधारित इंटरफ़ेस देता है।

- चैट के ज़रिए भोजन, व्यायाम, शारीरिक आँकड़े और कदम दर्ज करें
- भोजन को अपने-आप दर्ज करने के लिए खाने की तस्वीरें अपलोड करें
- आगे की बातचीत के लिए बातचीत का इतिहास सहेजकर रखता है

नोट: AI सुविधाएँ फ़िलहाल बीटा में हैं।

## इंस्टॉलेशन

SparkyFitness चलाने के दो तरीकों में से एक चुनें:

### 1. सेल्फ-होस्टेड

Docker Compose का उपयोग करके कुछ ही मिनटों में SparkyFitness सर्वर चलाएँ:

```bash
# 1. एक नया फ़ोल्डर बनाएँ
mkdir sparkyfitness && cd sparkyfitness

# 2. docker-compose.yml डाउनलोड करें
curl -L -o docker-compose.yml https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/docker-compose.prod.yml

# 3. अपना .env कॉन्फ़िगरेशन सेट करें (कोई एक विकल्प चुनें):
# विकल्प A (अनुशंसित): ब्राउज़र में 1-क्लिक सुरक्षित कुंजियों के साथ कस्टम .env बनाएँ:
# 👉 https://codewithcj.github.io/SparkyFitness/install/env-generator

# विकल्प B: न्यूनतम टेम्पलेट — 5 मान, बाकी सब कुछ वही डिफ़ॉल्ट इस्तेमाल करता है
# जो docker-compose पहले से लागू करता है। ज़्यादातर सेल्फ-होस्टेड इंस्टॉलेशन के लिए पर्याप्त।
curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.simple.example

# विकल्प C: पूरा संदर्भ — हर समर्थित वेरिएबल, अपने डिफ़ॉल्ट मान के साथ
# कमेंट किया हुआ। SSO, SMTP, बाहरी डेटाबेस या रिवर्स प्रॉक्सी के लिए यहीं से शुरू करें।
# curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.example

# 4. प्लेसहोल्डर बदलें (अगर आपने विकल्प A इस्तेमाल किया है तो इसे छोड़ दें — जनरेटर
# इन्हें पहले ही भर चुका है)। जब तक ये जस के तस रहते हैं, सर्वर शुरू होने से इनकार करता है,
# वरना डेटाबेस एक सार्वजनिक रूप से प्रकाशित पासवर्ड के साथ इनिशियलाइज़ हो जाएगा।
#   SPARKY_FITNESS_DB_PASSWORD        कोई भी मज़बूत पासवर्ड
#   SPARKY_FITNESS_API_ENCRYPTION_KEY openssl rand -hex 32     (64 हेक्स अक्षर)
#   BETTER_AUTH_SECRET                openssl rand -base64 32  (44 अक्षर)
#   SPARKY_FITNESS_FRONTEND_URL       वह URL जिस पर आप ऐप खोलेंगे

# 5. ऐप शुरू करें
docker compose pull && docker compose up -d

# ऐप्लिकेशन को http://localhost:3004 पर खोलें
```

_नोट: सभी कॉन्फ़िगरेशन विकल्पों, रिवर्स प्रॉक्सी और इंस्टॉलेशन के वैकल्पिक तरीकों के लिए [डॉक्यूमेंटेशन साइट](https://codewithcj.github.io/SparkyFitness/) देखें।_

### 2. क्लाउड (गैर-तकनीकी उपयोगकर्ताओं के लिए)

अगर आप तकनीकी उपयोगकर्ता नहीं हैं और SparkyFitness को अपने सर्वर पर नहीं चलाना चाहते, तो आप नीचे दिए गए किसी एक प्रदाता के ज़रिए क्लाउड में एक होस्टेड इंस्टेंस डिप्लॉय कर सकते हैं।

<a href="https://www.pikapods.com/pods?run=sparkyfitness">
  <img src="https://www.pikapods.com/static/run-button.svg" height="70" width="150" alt="PikaPods पर चलाएँ">
</a>
<br>
<a href="https://zenith.hosting/host/sparkyfitness?ref=gh">
  <img src="https://cdn.zenith.hosting/buttons/deploy-with-zenith.svg" height="70" width="150" alt="Zenith के साथ डिप्लॉय करें">
</a>


> **नोट:** ये स्वतंत्र थर्ड-पार्टी सेवाएँ हैं। हम आपको प्रोत्साहित करते हैं कि आप हर प्रदाता की सुविधाओं को देखें और तय करें कि आपकी ज़रूरतों के लिए कौन-सा सबसे उपयुक्त है।
 

## 🎥 वीडियो ट्यूटोरियल

[![वीडियो देखें](https://img.youtube.com/vi/B13IiL2DeQc/maxresdefault.jpg)](https://www.youtube.com/watch?v=B13IiL2DeQc)

SparkyFitness (सेल्फ-होस्टेड फ़िटनेस ट्रैकर) को इंस्टॉल करने का तरीका दिखाने वाला 2 मिनट का छोटा ट्यूटोरियल।

## डॉक्यूमेंटेशन

पूरी इंस्टॉलेशन गाइड, कॉन्फ़िगरेशन विकल्पों और डेवलपमेंट डॉक्स के लिए कृपया हमारी [डॉक्यूमेंटेशन साइट](https://codewithcj.github.io/SparkyFitness/) देखें।

### त्वरित लिंक

- **[इंस्टॉलेशन गाइड](https://codewithcj.github.io/SparkyFitness/install/docker-compose)** - डिप्लॉयमेंट और कॉन्फ़िगरेशन
- **[इंटरैक्टिव .env जनरेटर](https://codewithcj.github.io/SparkyFitness/install/env-generator)** - क्लाइंट-साइड `.env` कॉन्फ़िगरेशन बिल्डर
- **[सुविधाओं का अवलोकन](https://codewithcj.github.io/SparkyFitness/features)** - सभी सुविधाओं का पूरा डॉक्यूमेंटेशन
- **[डेवलपमेंट वर्कफ़्लो](https://codewithcj.github.io/SparkyFitness/developer/getting-started)** - डेवलपर गाइड और योगदान प्रक्रिया
- **[iOS ऐप की जानकारी](https://github.com/CodeWithCJ/SparkyFitness/wiki/Apple-Health-Integration)** और **[Android ऐप की जानकारी](https://github.com/CodeWithCJ/SparkyFitness/wiki/Android-Mobile-App)**

### मदद चाहिए?

- GitHub issues/discussion में पोस्ट करें।
- तेज़ जवाब पाने और समुदाय के अन्य सदस्यों से मदद लेने के लिए **[हमारे Discord से जुड़ें](https://discord.gg/vcnMT5cPEA)**

## स्टार इतिहास

<a href="https://www.star-history.com/?repos=CodeWithCJ%2FSparkyFitness&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&theme=dark&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <img alt="स्टार इतिहास चार्ट" src="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
 </picture>
</a>

## अनुवाद


**[Weblate पर अनुवाद](https://weblate.sparkyfitness.com/engage/sparkyfitness)**

<a href="http://weblate.sparkyfitness.com/engage/sparkyfitness/"><img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/svg-badge.svg" alt="अनुवाद की स्थिति"></a>



<a href="https://weblate.sparkyfitness.com/engage/sparkyfitness">
<img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/multi-auto.svg" alt="अनुवाद की स्थिति" />
</a>

## रिपॉज़िटरी गतिविधि

![Alt](https://repobeats.axiom.co/api/embed/828203d3070ff56c8873c727b6873b684c4ed399.svg "Repobeats एनालिटिक्स चित्र")

## योगदानकर्ता

<a href="https://github.com/CodeWithCJ/SparkyFitness/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=CodeWithCJ/SparkyFitness" width="100%" alt="SparkyFitness के योगदानकर्ता"/>
</a>

## ⚠️ ज्ञात समस्याएँ / बीटा सुविधाएँ ⚠️

SparkyFitness पर सक्रिय रूप से काम चल रहा है।
रिलीज़ के बीच ब्रेकिंग बदलाव हो सकते हैं।

- कंटेनरों को अपने-आप अपडेट करने की सलाह नहीं दी जाती
- अपग्रेड करने से पहले हमेशा रिलीज़ नोट्स पढ़ें

निम्नलिखित सुविधाएँ फ़िलहाल बीटा में हैं और हो सकता है कि इनका पूरी तरह परीक्षण न हुआ हो। संभावित बग या अधूरी कार्यक्षमता की अपेक्षा रखें:

- AI चैटबॉट
- परिवार और दोस्तों के लिए एक्सेस
- API डॉक्यूमेंटेशन

_यह अंग्रेज़ी README का अनुवाद है। अगर कोई अंतर हो, तो [अंग्रेज़ी संस्करण](../../README.md) ही मान्य है।_
