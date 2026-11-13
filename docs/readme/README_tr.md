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
  <a href="README_fa.md">فارسی</a> ·
  <b>Türkçe</b> ·
  <a href="README_vi.md">Tiếng Việt</a> ·
  <a href="README_id.md">Bahasa Indonesia</a>
</p>

# SparkyFitness

MyFitnessPal, Flo, Hevy, Shotsy ve daha fazlasına kendi sunucunuzda barındırılan, gizliliği ön planda tutan bir alternatif. Beslenmeyi, egzersizi, vücut ölçümlerini ve sağlık verilerini takip edin; verilerinizin kontrolü tamamen sizde kalsın.
<img width="5120" height="2880" alt="görsel" src="https://github.com/user-attachments/assets/d8b09f48-cb4d-41a6-b678-ac93e551f257" />


SparkyFitness, kendi sunucunuzda barındırılan bir fitness takip platformudur ve şunlardan oluşur:

- Bir arka uç sunucusu (API + veri depolama)
- Web tabanlı bir ön yüz
- iOS ve Android için yerel mobil uygulamalar

Sağlık verilerini üçüncü taraf hizmetlere bağımlı olmadan, sizin kontrol ettiğiniz altyapıda depolar ve yönetir.

## Temel Özellikler

- Beslenme, egzersiz, su tüketimi, uyku, oruç, ruh hali ve vücut ölçüsü takibi
- Hedef belirleme ve günlük check-in'ler
- Etkileşimli grafikler ve uzun vadeli raporlar
- Birden fazla kullanıcı profili ve aile erişimi
- Açık ve koyu temalar
- OIDC, TOTP, Passkey, MFA vb.

## SparkyFitness'ın Karşılaştırması

**SparkyFitness kaynağı erişilebilir bir yazılımdır, açık kaynak değildir** — [lisans](../../LICENSE) ticari olmayan kullanım içindir ve ticari kullanım için izin gerektirir.

Çoğu uygulama tek bir iş yapar. İyi bir beslenme uygulaması yılda 40–100 $ tutar; SparkyFitness'ın kapsadığı her şeyi karşılamak kişi başına üç ya da dört abonelik demektir ve yine de hepsini kapsayan tek bir rapor elde edemezsiniz. SparkyFitness bunu tek bir uygulamada, ücretsiz ve tüm hane için yapar.

<sub>ABD liste fiyatları, 14 Ağustos 2026. [Ayrıntılı maliyet dökümü →](https://codewithcj.github.io/SparkyFitness/features/comparison)</sub>

| | **SparkyFitness** | wger | MyFitnessPal | Cronometer | Hevy | Zero | Flo | Garmin Connect | Google Health |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Kendi sunucunuzda, verileriniz sizde kalır | ⭐ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Abonelik yok, reklam yok | ✅ | ✅ | ❌ | 🟡 | 🟡 | ❌ | ❌ | ✅ | 🟡 |
| Beslenme, kuvvet, uyku, oruç, döngü ve ilaçlar tek yerde\* | ⭐ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| Tam geçmiş ve özel tarih aralığı raporları | ✅ ücretsiz | 🟡 | 💰 | 💰 | 💰 | 💰 | 💰 | ✅ | 💰 |
| Giyilebilir cihaz ve sağlık platformu senkronizasyonu | ✅ 8+ hizmet | ❌ | ✅ | ⭐ | ✅ | 🟡 | 🟡 | 🟡 | ✅ |
| Ayrıntılı izinlerle aile paylaşımı | ⭐ 7 izin | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| CSV içe aktarma ve ücretsiz veri dışa aktarma | ✅ | 🟡 | 💰 | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ❌ |
| MCP sunucusu + kendi LLM'inizi getirin | ⭐ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

⭐ öne çıkan &nbsp;•&nbsp; ✅ destekleniyor &nbsp;•&nbsp; 🟡 kısmi &nbsp;•&nbsp; 💰 yalnızca ücretli planda &nbsp;•&nbsp; ❌ desteklenmiyor

<sub>\* Uyku evreleri, HRV ve kan şekeri saatinizden, telefonunuzdan veya ölçüm cihazınızdan içe aktarılır. SparkyFitness bunları kendisi ölçmez; depolar, analiz eder ve grafiklere döker.</sub>

> **Bu tablo, karşılaştırılan projenin kendisi tarafından yazılmıştır; bunu göz önünde bulundurarak okuyun.** 14 Ağustos 2026'da resmi belgeler, depolar ve mağaza sayfalarıyla karşılaştırılarak kontrol edilmiştir; bir kısmı şimdiden güncelliğini yitirmiş olabilir. Bir hücre yanlışsa veya başka bir projeye haksızlık ediyorsa [bir issue açın](https://github.com/CodeWithCJ/SparkyFitness/issues) — SparkyFitness'ı *daha kötü* gösteren düzeltmeler de aynı derecede memnuniyetle karşılanır.

**[Tam karşılaştırmayı görün →](https://codewithcj.github.io/SparkyFitness/features/comparison)** — kendi sunucunuzda barındırılan, beslenme, uzmanlık ve cihaz ekosistemi kategorilerinde 17 uygulama ve her birinin bizi nerede geride bıraktığı.

## Sağlık ve Cihaz Entegrasyonları

SparkyFitness, birden fazla sağlık ve fitness platformundan veri senkronize edebilir:

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
- **Strava** (kısmen test edildi)
- **COROS**
- **Norish**
- **Yazio** (resmi olmayan API kullanır)
- **Swiss Food Database**
- **Canadian Nutrient File (Health Canada)**
- **Swedish Food Agency (Livsmedelsverket)**
- **Free Exercise DB** (Github)
- **Wger**

Entegrasyonlar adım, antrenman ve uyku gibi aktivite verilerini; kilo ve vücut ölçüleri gibi sağlık metrikleriyle birlikte SparkyFitness sunucunuza otomatik olarak senkronize eder.

## İsteğe Bağlı Yapay Zekâ Özellikleri (Beta)

SparkyAI, veri kaydetmek ve ilerlemenizi incelemek için sohbet tabanlı bir arayüz sunar.

- Yemek, egzersiz, vücut istatistikleri ve adımları sohbet üzerinden kaydedin
- Otomatik öğün kaydı için yemek fotoğrafları yükleyin
- Takip soruları için sohbet geçmişini saklar

Not: Yapay zekâ özellikleri şu anda beta aşamasındadır.

## Kurulum

SparkyFitness'ı çalıştırmanın iki yolundan birini seçin:

### 1. Kendi Sunucunuzda

Docker Compose ile dakikalar içinde bir SparkyFitness sunucusu çalıştırın:

```bash
# 1. Yeni bir klasör oluşturun
mkdir sparkyfitness && cd sparkyfitness

# 2. docker-compose.yml dosyasını indirin
curl -L -o docker-compose.yml https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/docker-compose.prod.yml

# 3. .env yapılandırmanızı ayarlayın (Bir seçenek belirleyin):
# Seçenek A (Önerilen): Tarayıcıda tek tıkla güvenli anahtarlarla özel bir .env oluşturun:
# 👉 https://codewithcj.github.io/SparkyFitness/install/env-generator

# Seçenek B: Minimal şablon — 5 değer, geri kalan her şey docker-compose'un
# zaten uyguladığı varsayılanları kullanır. Çoğu kendi sunucunuzdaki kurulum için yeterlidir.
curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.simple.example

# Seçenek C: Tam referans — desteklenen her değişken, varsayılan değeriyle
# yorum satırı olarak. SSO, SMTP, harici veritabanı veya ters vekil sunucu için buradan başlayın.
# curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.example

# 4. Yer tutucuları değiştirin (Seçenek A'yı kullandıysanız atlayın — oluşturucu
# bunları zaten doldurdu). Bunlar olduğu gibi bırakılırsa sunucu başlamayı reddeder;
# aksi halde veritabanı herkese açık olarak yayımlanmış bir parolayla başlatılırdı.
#   SPARKY_FITNESS_DB_PASSWORD        güçlü herhangi bir parola
#   SPARKY_FITNESS_API_ENCRYPTION_KEY openssl rand -hex 32     (64 onaltılık karakter)
#   BETTER_AUTH_SECRET                openssl rand -base64 32  (44 karakter)
#   SPARKY_FITNESS_FRONTEND_URL       uygulamayı açacağınız URL

# 5. Uygulamayı başlatın
docker compose pull && docker compose up -d

# Uygulamaya http://localhost:3004 adresinden erişin
```

_Not: Tüm yapılandırma seçenekleri, ters vekil sunucular ve alternatif kurulum yöntemleri için [Dokümantasyon Sitesi](https://codewithcj.github.io/SparkyFitness/)'ni ziyaret edin._

### 2. Bulut (teknik olmayan kullanıcılar için)

Teknik bir kullanıcı değilseniz ve SparkyFitness'ı kendi sunucunuzda çalıştırmak istemiyorsanız, aşağıdaki sağlayıcılardan birini kullanarak bulutta barındırılan bir örnek dağıtabilirsiniz.

<a href="https://www.pikapods.com/pods?run=sparkyfitness">
  <img src="https://www.pikapods.com/static/run-button.svg" height="70" width="150" alt="PikaPods üzerinde çalıştırın">
</a>
<br>
<a href="https://zenith.hosting/host/sparkyfitness?ref=gh">
  <img src="https://cdn.zenith.hosting/buttons/deploy-with-zenith.svg" height="70" width="150" alt="Zenith ile dağıtın">
</a>


> **Not:** Bunlar bağımsız üçüncü taraf hizmetlerdir. İhtiyaçlarınıza en uygun olanı belirlemek için her sağlayıcının sunduğu özellikleri incelemenizi öneririz.
 

## 🎥 Video Eğitimi

[![Videoyu izleyin](https://img.youtube.com/vi/B13IiL2DeQc/maxresdefault.jpg)](https://www.youtube.com/watch?v=B13IiL2DeQc)

SparkyFitness'ın (kendi sunucunuzda barındırılan fitness takipçisi) nasıl kurulacağını gösteren 2 dakikalık kısa bir eğitim.

## Dokümantasyon

Ayrıntılı kurulum kılavuzları, yapılandırma seçenekleri ve geliştirme belgeleri için lütfen [Dokümantasyon Sitemizi](https://codewithcj.github.io/SparkyFitness/) ziyaret edin.

### Hızlı Bağlantılar

- **[Kurulum Kılavuzu](https://codewithcj.github.io/SparkyFitness/install/docker-compose)** - Dağıtım ve yapılandırmalar
- **[Etkileşimli .env Oluşturucu](https://codewithcj.github.io/SparkyFitness/install/env-generator)** - İstemci tarafında `.env` yapılandırma oluşturucu
- **[Özelliklere Genel Bakış](https://codewithcj.github.io/SparkyFitness/features)** - Eksiksiz özellik dokümantasyonu
- **[Geliştirme Akışı](https://codewithcj.github.io/SparkyFitness/developer/getting-started)** - Geliştirici kılavuzu ve katkı süreci
- **[iOS Uygulama Bilgisi](https://github.com/CodeWithCJ/SparkyFitness/wiki/Apple-Health-Integration)** ve **[Android Uygulama Bilgisi](https://github.com/CodeWithCJ/SparkyFitness/wiki/Android-Mobile-App)**

### Yardıma mı İhtiyacınız Var?

- Github issues/discussions bölümünde paylaşın.
- Daha hızlı yanıt almak ve diğer topluluk üyelerinden yardım almak için **[Discord'umuza katılın](https://discord.gg/vcnMT5cPEA)**

## Yıldız Geçmişi

<a href="https://www.star-history.com/?repos=CodeWithCJ%2FSparkyFitness&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&theme=dark&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <img alt="Yıldız Geçmişi Grafiği" src="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
 </picture>
</a>

## Çeviriler


**[Weblate Çevirileri](https://weblate.sparkyfitness.com/engage/sparkyfitness)**

<a href="http://weblate.sparkyfitness.com/engage/sparkyfitness/"><img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/svg-badge.svg" alt="Çeviri durumu"></a>



<a href="https://weblate.sparkyfitness.com/engage/sparkyfitness">
<img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/multi-auto.svg" alt="Çeviri durumu" />
</a>

## Depo etkinliği

![Alt](https://repobeats.axiom.co/api/embed/828203d3070ff56c8873c727b6873b684c4ed399.svg "Repobeats analiz görseli")

## Katkıda Bulunanlar

<a href="https://github.com/CodeWithCJ/SparkyFitness/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=CodeWithCJ/SparkyFitness" width="100%" alt="SparkyFitness katkıda bulunanları"/>
</a>

## ⚠️ Bilinen Sorunlar / Beta Özellikleri ⚠️

SparkyFitness aktif olarak geliştirilmektedir.
Sürümler arasında geriye dönük uyumsuz değişiklikler olabilir.

- Konteynerlerin otomatik güncellenmesi önerilmez
- Yükseltmeden önce her zaman sürüm notlarını inceleyin

Aşağıdaki özellikler şu anda beta aşamasındadır ve kapsamlı biçimde test edilmemiş olabilir. Olası hatalar veya eksik işlevler bekleyin:

- Yapay Zekâ Sohbet Botu
- Aile ve Arkadaş erişimi
- API dokümantasyonu

_Bu, İngilizce README'nin bir çevirisidir. Herhangi bir farklılık olması durumunda [İngilizce sürüm](../../README.md) esas alınır._
