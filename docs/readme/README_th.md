<p align="center">
  <a href="../../README.md">English</a> ·
  <a href="README_zh-CN.md">简体中文</a> ·
  <a href="README_zh-TW.md">繁體中文</a> ·
  <a href="README_ja.md">日本語</a> ·
  <a href="README_ko.md">한국어</a> ·
  <a href="README_hi.md">हिन्दी</a> ·
  <b>ไทย</b> ·
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

ทางเลือกแบบโฮสต์เองที่ให้ความสำคัญกับความเป็นส่วนตัวเป็นอันดับแรก แทน MyFitnessPal, Flo, Hevy, Shotsy และอื่น ๆ ติดตามโภชนาการ การออกกำลังกาย ค่าสัดส่วนร่างกาย และข้อมูลสุขภาพ โดยที่คุณยังควบคุมข้อมูลของตัวเองได้อย่างเต็มที่
<img width="5120" height="2880" alt="รูปภาพ" src="https://github.com/user-attachments/assets/d8b09f48-cb4d-41a6-b678-ac93e551f257" />


SparkyFitness คือแพลตฟอร์มติดตามฟิตเนสแบบโฮสต์เอง ซึ่งประกอบด้วย:

- เซิร์ฟเวอร์แบ็กเอนด์ (API + ที่เก็บข้อมูล)
- ฟรอนต์เอนด์บนเว็บ
- แอปมือถือแบบเนทีฟสำหรับ iOS และ Android

ระบบจัดเก็บและจัดการข้อมูลสุขภาพบนโครงสร้างพื้นฐานที่คุณควบคุมเอง โดยไม่ต้องพึ่งพาบริการของบุคคลที่สาม

## ฟีเจอร์หลัก

- ติดตามโภชนาการ การออกกำลังกาย การดื่มน้ำ การนอนหลับ การอดอาหาร อารมณ์ และสัดส่วนร่างกาย
- ตั้งเป้าหมายและเช็กอินรายวัน
- กราฟแบบอินเทอร์แอกทีฟและรายงานระยะยาว
- รองรับหลายโปรไฟล์ผู้ใช้และการเข้าถึงสำหรับครอบครัว
- ธีมสว่างและธีมมืด
- OIDC, TOTP, Passkey, MFA และอื่น ๆ

## SparkyFitness เทียบกับแอปอื่น

**SparkyFitness เป็นแบบ source-available ไม่ใช่โอเพนซอร์ส** — [สัญญาอนุญาต](../../LICENSE) เป็นแบบไม่ใช่เชิงพาณิชย์ และการใช้งานเชิงพาณิชย์ต้องได้รับอนุญาตก่อน

แอปส่วนใหญ่ทำได้เพียงอย่างเดียว แอปโภชนาการดี ๆ สักตัวมีค่าใช้จ่ายราว $40–$100 ต่อปี หากต้องการครอบคลุมทุกอย่างที่ SparkyFitness ทำได้ คุณต้องสมัครสมาชิกสามถึงสี่แอปต่อคน และก็ยังไม่มีรายงานรวมเพียงฉบับเดียวจากทุกแอปอยู่ดี SparkyFitness ทำทั้งหมดนี้ได้ในแอปเดียว ฟรี สำหรับทุกคนในบ้าน

<sub>ราคาขายปลีกในสหรัฐฯ ณ วันที่ 14 ส.ค. 2026 [รายละเอียดค่าใช้จ่ายทั้งหมด →](https://codewithcj.github.io/SparkyFitness/features/comparison)</sub>

| | **SparkyFitness** | wger | MyFitnessPal | Cronometer | Hevy | Zero | Flo | Garmin Connect | Google Health |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| โฮสต์เอง ข้อมูลของคุณยังเป็นของคุณ | ⭐ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| ไม่มีค่าสมาชิก ไม่มีโฆษณา | ✅ | ✅ | ❌ | 🟡 | 🟡 | ❌ | ❌ | ✅ | 🟡 |
| โภชนาการ การฝึกความแข็งแรง การนอน การอดอาหาร รอบเดือน และยา ครบในที่เดียว\* | ⭐ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| ประวัติทั้งหมดและรายงานตามช่วงวันที่กำหนดเอง | ✅ ฟรี | 🟡 | 💰 | 💰 | 💰 | 💰 | 💰 | ✅ | 💰 |
| ซิงก์กับอุปกรณ์สวมใส่และแพลตฟอร์มสุขภาพ | ✅ 8+ บริการ | ❌ | ✅ | ⭐ | ✅ | 🟡 | 🟡 | 🟡 | ✅ |
| แชร์กับครอบครัวพร้อมสิทธิ์แบบละเอียด | ⭐ 7 สิทธิ์ | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| นำเข้า CSV และส่งออกข้อมูลฟรี | ✅ | 🟡 | 💰 | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ❌ |
| เซิร์ฟเวอร์ MCP + ใช้ LLM ของคุณเองได้ | ⭐ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

⭐ โดดเด่น &nbsp;•&nbsp; ✅ รองรับ &nbsp;•&nbsp; 🟡 รองรับบางส่วน &nbsp;•&nbsp; 💰 เฉพาะแพ็กเกจแบบชำระเงิน &nbsp;•&nbsp; ❌ ไม่รองรับ

<sub>\* ระยะการนอนหลับ, HRV และระดับน้ำตาลในเลือดจะนำเข้าจากนาฬิกา โทรศัพท์ หรือเครื่องวัดของคุณ SparkyFitness ทำหน้าที่จัดเก็บ วิเคราะห์ และแสดงเป็นกราฟ แต่ไม่ได้วัดค่าเหล่านี้เอง</sub>

> **ตารางนี้เขียนโดยโปรเจกต์ที่ถูกนำมาเปรียบเทียบเอง จึงควรอ่านโดยคำนึงถึงข้อนี้** ตรวจสอบเมื่อวันที่ 14 ส.ค. 2026 จากเอกสารทางการ รีโพสิทอรี และหน้าร้านค้าแอป ข้อมูลบางส่วนอาจล้าสมัยไปแล้ว หากช่องใดไม่ถูกต้องหรือไม่เป็นธรรมต่อโปรเจกต์อื่น [เปิด issue](https://github.com/CodeWithCJ/SparkyFitness/issues) ได้เลย — การแก้ไขที่ทำให้ SparkyFitness ดู *แย่ลง* ก็ยินดีต้อนรับเช่นกัน

**[ดูการเปรียบเทียบฉบับเต็ม →](https://codewithcj.github.io/SparkyFitness/features/comparison)** — 17 แอปในหมวดโฮสต์เอง โภชนาการ แอปเฉพาะทาง และระบบนิเวศของอุปกรณ์ พร้อมจุดที่แต่ละแอปเหนือกว่าเรา

## การเชื่อมต่อกับระบบสุขภาพและอุปกรณ์

SparkyFitness สามารถซิงก์ข้อมูลจากแพลตฟอร์มสุขภาพและฟิตเนสได้หลายแห่ง:

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
- **Strava** (ทดสอบแล้วบางส่วน)
- **COROS**
- **Norish**
- **Yazio** (ใช้ API ที่ไม่เป็นทางการ)
- **Swiss Food Database**
- **Canadian Nutrient File (Health Canada)**
- **Swedish Food Agency (Livsmedelsverket)**
- **Free Exercise DB** (Github)
- **Wger**

การเชื่อมต่อเหล่านี้จะซิงก์ข้อมูลกิจกรรม เช่น จำนวนก้าว การออกกำลังกาย และการนอนหลับ รวมถึงค่าสุขภาพอย่างน้ำหนักและสัดส่วนร่างกาย ไปยังเซิร์ฟเวอร์ SparkyFitness ของคุณโดยอัตโนมัติ

## ฟีเจอร์ AI เสริม (เบต้า)

SparkyAI มีอินเทอร์เฟซแบบสนทนาสำหรับบันทึกข้อมูลและติดตามความคืบหน้า

- บันทึกอาหาร การออกกำลังกาย ค่าร่างกาย และจำนวนก้าวผ่านแชต
- อัปโหลดรูปอาหารเพื่อบันทึกมื้ออาหารโดยอัตโนมัติ
- เก็บประวัติการสนทนาไว้สำหรับการถามต่อเนื่อง

หมายเหตุ: ขณะนี้ฟีเจอร์ AI ยังอยู่ในช่วงเบต้า

## การติดตั้ง

เลือกหนึ่งในสองวิธีในการใช้งาน SparkyFitness:

### 1. โฮสต์เอง

เริ่มใช้งานเซิร์ฟเวอร์ SparkyFitness ได้ในไม่กี่นาทีด้วย Docker Compose:

```bash
# 1. สร้างโฟลเดอร์ใหม่
mkdir sparkyfitness && cd sparkyfitness

# 2. ดาวน์โหลด docker-compose.yml
curl -L -o docker-compose.yml https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/docker-compose.prod.yml

# 3. ตั้งค่าไฟล์ .env ของคุณ (เลือกหนึ่งตัวเลือก):
# ตัวเลือก A (แนะนำ): สร้าง .env แบบกำหนดเองพร้อมคีย์ที่ปลอดภัยในคลิกเดียวบนเบราว์เซอร์:
# 👉 https://codewithcj.github.io/SparkyFitness/install/env-generator

# ตัวเลือก B: เทมเพลตขั้นต่ำ — 5 ค่า ส่วนที่เหลือใช้ค่าเริ่มต้น
# ที่ docker-compose กำหนดไว้แล้ว เหมาะกับการติดตั้งแบบโฮสต์เองส่วนใหญ่
curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.simple.example

# ตัวเลือก C: ข้อมูลอ้างอิงฉบับเต็ม — ทุกตัวแปรที่รองรับ ถูกคอมเมนต์ไว้พร้อม
# ค่าเริ่มต้น เริ่มจากตรงนี้หากต้องการใช้ SSO, SMTP, ฐานข้อมูลภายนอก หรือ reverse proxy
# curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.example

# 4. แทนที่ค่าตัวอย่าง (ข้ามได้หากใช้ตัวเลือก A — ตัวสร้าง
# กรอกค่าเหล่านี้ให้แล้ว) เซิร์ฟเวอร์จะไม่ยอมเริ่มทำงานหากยังปล่อยไว้
# ตามเดิม และมิฉะนั้นฐานข้อมูลจะถูกตั้งค่าเริ่มต้นด้วยรหัสผ่านที่เผยแพร่สู่สาธารณะ
#   SPARKY_FITNESS_DB_PASSWORD        รหัสผ่านที่รัดกุมใดก็ได้
#   SPARKY_FITNESS_API_ENCRYPTION_KEY openssl rand -hex 32     (อักขระฐานสิบหก 64 ตัว)
#   BETTER_AUTH_SECRET                openssl rand -base64 32  (44 อักขระ)
#   SPARKY_FITNESS_FRONTEND_URL       URL ที่คุณจะใช้เปิดแอป

# 5. เริ่มแอป
docker compose pull && docker compose up -d

# เข้าใช้งานแอปพลิเคชันได้ที่ http://localhost:3004
```

_หมายเหตุ: สำหรับตัวเลือกการตั้งค่าทั้งหมด reverse proxy และวิธีติดตั้งแบบอื่น โปรดดูที่ [เว็บไซต์เอกสาร](https://codewithcj.github.io/SparkyFitness/)_

### 2. คลาวด์ (สำหรับผู้ใช้ที่ไม่ถนัดด้านเทคนิค)

หากคุณไม่ถนัดด้านเทคนิคและไม่ต้องการรัน SparkyFitness บนเซิร์ฟเวอร์ของตัวเอง คุณสามารถติดตั้งอินสแตนซ์แบบโฮสต์บนคลาวด์ผ่านผู้ให้บริการรายใดรายหนึ่งต่อไปนี้

<a href="https://www.pikapods.com/pods?run=sparkyfitness">
  <img src="https://www.pikapods.com/static/run-button.svg" height="70" width="150" alt="รันบน PikaPods">
</a>
<br>
<a href="https://zenith.hosting/host/sparkyfitness?ref=gh">
  <img src="https://cdn.zenith.hosting/buttons/deploy-with-zenith.svg" height="70" width="150" alt="ติดตั้งด้วย Zenith">
</a>


> **หมายเหตุ:** บริการเหล่านี้เป็นบริการอิสระของบุคคลที่สาม เราแนะนำให้คุณสำรวจฟีเจอร์ของผู้ให้บริการแต่ละรายเพื่อเลือกรายที่ตรงกับความต้องการของคุณมากที่สุด
 

## 🎥 วิดีโอสอนการใช้งาน

[![ดูวิดีโอ](https://img.youtube.com/vi/B13IiL2DeQc/maxresdefault.jpg)](https://www.youtube.com/watch?v=B13IiL2DeQc)

วิดีโอสอนสั้น ๆ 2 นาที แสดงวิธีติดตั้ง SparkyFitness (ตัวติดตามฟิตเนสแบบโฮสต์เอง)

## เอกสารประกอบ

สำหรับคู่มือการติดตั้งฉบับเต็ม ตัวเลือกการตั้งค่า และเอกสารสำหรับนักพัฒนา โปรดไปที่ [เว็บไซต์เอกสาร](https://codewithcj.github.io/SparkyFitness/) ของเรา

### ลิงก์ด่วน

- **[คู่มือการติดตั้ง](https://codewithcj.github.io/SparkyFitness/install/docker-compose)** - การติดตั้งใช้งานและการตั้งค่า
- **[ตัวสร้าง .env แบบอินเทอร์แอกทีฟ](https://codewithcj.github.io/SparkyFitness/install/env-generator)** - เครื่องมือสร้างการตั้งค่า `.env` ฝั่งไคลเอนต์
- **[ภาพรวมฟีเจอร์](https://codewithcj.github.io/SparkyFitness/features)** - เอกสารฟีเจอร์ฉบับสมบูรณ์
- **[ขั้นตอนการพัฒนา](https://codewithcj.github.io/SparkyFitness/developer/getting-started)** - คู่มือนักพัฒนาและขั้นตอนการมีส่วนร่วม
- **[ข้อมูลแอป iOS](https://github.com/CodeWithCJ/SparkyFitness/wiki/Apple-Health-Integration)** และ **[ข้อมูลแอป Android](https://github.com/CodeWithCJ/SparkyFitness/wiki/Android-Mobile-App)**

### ต้องการความช่วยเหลือ?

- โพสต์ใน GitHub issues/discussion
- หากต้องการคำตอบที่เร็วขึ้นและรับความช่วยเหลือจากสมาชิกคนอื่นในชุมชน **[เข้าร่วม Discord ของเรา](https://discord.gg/vcnMT5cPEA)**

## ประวัติดาว

<a href="https://www.star-history.com/?repos=CodeWithCJ%2FSparkyFitness&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&theme=dark&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <img alt="กราฟประวัติดาว" src="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
 </picture>
</a>

## การแปลภาษา


**[การแปลบน Weblate](https://weblate.sparkyfitness.com/engage/sparkyfitness)**

<a href="http://weblate.sparkyfitness.com/engage/sparkyfitness/"><img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/svg-badge.svg" alt="สถานะการแปล"></a>



<a href="https://weblate.sparkyfitness.com/engage/sparkyfitness">
<img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/multi-auto.svg" alt="สถานะการแปล" />
</a>

## กิจกรรมของรีโพสิทอรี

![Alt](https://repobeats.axiom.co/api/embed/828203d3070ff56c8873c727b6873b684c4ed399.svg "ภาพสถิติจาก Repobeats")

## ผู้ร่วมพัฒนา

<a href="https://github.com/CodeWithCJ/SparkyFitness/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=CodeWithCJ/SparkyFitness" width="100%" alt="ผู้ร่วมพัฒนา SparkyFitness"/>
</a>

## ⚠️ ปัญหาที่ทราบแล้ว / ฟีเจอร์เบต้า ⚠️

SparkyFitness อยู่ระหว่างการพัฒนาอย่างต่อเนื่อง
อาจมีการเปลี่ยนแปลงที่ไม่เข้ากันกับเวอร์ชันก่อนหน้าระหว่างการออกรุ่นแต่ละครั้ง

- ไม่แนะนำให้อัปเดตคอนเทนเนอร์โดยอัตโนมัติ
- อ่านบันทึกประจำรุ่นทุกครั้งก่อนอัปเกรด

ฟีเจอร์ต่อไปนี้ยังอยู่ในช่วงเบต้าและอาจยังไม่ได้รับการทดสอบอย่างละเอียด อาจพบข้อบกพร่องหรือฟังก์ชันที่ยังไม่สมบูรณ์:

- แชตบอท AI
- การเข้าถึงสำหรับครอบครัวและเพื่อน
- เอกสาร API

_นี่คือฉบับแปลของ README ภาษาอังกฤษ หากมีเนื้อหาใดแตกต่างกัน ให้ยึด[ฉบับภาษาอังกฤษ](../../README.md)เป็นหลัก_
