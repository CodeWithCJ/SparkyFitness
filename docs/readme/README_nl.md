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
  <b>Nederlands</b> ·
  <a href="README_pl.md">Polski</a> ·
  <a href="README_ar.md">العربية</a> ·
  <a href="README_fa.md">فارسی</a> ·
  <a href="README_tr.md">Türkçe</a> ·
  <a href="README_vi.md">Tiếng Việt</a> ·
  <a href="README_id.md">Bahasa Indonesia</a>
</p>

# SparkyFitness

Een zelf-gehost, privacygericht alternatief voor MyFitnessPal, Flo, Hevy, Shotsy en meer. Houd voeding, training, lichaamsmetingen en gezondheidsgegevens bij en behoud volledige controle over je data.
<img width="5120" height="2880" alt="afbeelding" src="https://github.com/user-attachments/assets/d8b09f48-cb4d-41a6-b678-ac93e551f257" />


SparkyFitness is een zelf-gehost platform voor het bijhouden van fitness, bestaande uit:

- Een backendserver (API + gegevensopslag)
- Een webgebaseerde frontend
- Native mobiele apps voor iOS en Android

Het slaat gezondheidsgegevens op en beheert ze op infrastructuur die jij beheert, zonder afhankelijk te zijn van diensten van derden.

## Kernfuncties

- Bijhouden van voeding, training, hydratatie, slaap, vasten, stemming en lichaamsmaten
- Doelen stellen en dagelijkse check-ins
- Interactieve grafieken en langetermijnrapporten
- Meerdere gebruikersprofielen en toegang voor het gezin
- Lichte en donkere thema's
- OIDC, TOTP, Passkey, MFA enz.

## Hoe SparkyFitness zich verhoudt

**SparkyFitness is source-available, geen open source** — de [licentie](../../LICENSE) is niet-commercieel en vereist toestemming voor commercieel gebruik.

De meeste apps doen één ding. Eén goede voedingsapp kost $40–$100 per jaar; alles afdekken wat SparkyFitness afdekt betekent drie of vier abonnementen, per persoon, en nog steeds geen enkel rapport dat alles samenbrengt. SparkyFitness doet het in één app, gratis, voor het hele huishouden.

<sub>Amerikaanse catalogusprijzen, 14 aug 2026. [Volledig kostenoverzicht →](https://codewithcj.github.io/SparkyFitness/features/comparison)</sub>

| | **SparkyFitness** | wger | MyFitnessPal | Cronometer | Hevy | Zero | Flo | Garmin Connect | Google Health |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Zelf-gehost, je data blijft van jou | ⭐ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Geen abonnement, geen advertenties | ✅ | ✅ | ❌ | 🟡 | 🟡 | ❌ | ❌ | ✅ | 🟡 |
| Voeding, krachttraining, slaap, vasten, cyclus en medicatie op één plek\* | ⭐ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| Volledige geschiedenis en rapporten met aangepaste periode | ✅ gratis | 🟡 | 💰 | 💰 | 💰 | 💰 | 💰 | ✅ | 💰 |
| Synchronisatie met wearables en gezondheidsplatforms | ✅ 8+ diensten | ❌ | ✅ | ⭐ | ✅ | 🟡 | 🟡 | 🟡 | ✅ |
| Delen met het gezin met fijnmazige rechten | ⭐ 7 rechten | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| CSV-import en gratis gegevensexport | ✅ | 🟡 | 💰 | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ❌ |
| MCP-server + gebruik je eigen LLM | ⭐ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

⭐ uitblinker &nbsp;•&nbsp; ✅ ondersteund &nbsp;•&nbsp; 🟡 gedeeltelijk &nbsp;•&nbsp; 💰 alleen in betaald abonnement &nbsp;•&nbsp; ❌ niet ondersteund

<sub>\* Slaapfasen, HRV en bloedglucose worden geïmporteerd vanaf je horloge, telefoon of meter. SparkyFitness slaat ze op, analyseert ze en zet ze in grafieken, maar meet ze niet zelf.</sub>

> **Deze tabel is geschreven door het project dat wordt vergeleken, dus lees hem ook zo.** Gecontroleerd op 14 aug 2026 aan de hand van officiële documentatie, repositories en storevermeldingen; een deel ervan is al verouderd. Als een cel onjuist of oneerlijk is tegenover een ander project, [open dan een issue](https://github.com/CodeWithCJ/SparkyFitness/issues) — correcties waardoor SparkyFitness er *slechter* uitziet, zijn net zo welkom.

**[Bekijk de volledige vergelijking →](https://codewithcj.github.io/SparkyFitness/features/comparison)** — 17 apps in de categorieën zelf-gehost, voeding, specialistisch en apparaat-ecosystemen, plus waar elk ervan beter is dan wij.

## Integraties met gezondheidsplatforms en apparaten

SparkyFitness kan gegevens synchroniseren vanaf meerdere gezondheids- en fitnessplatforms:

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
- **Strava** (gedeeltelijk getest)
- **COROS**
- **Norish**
- **Yazio** (gebruikt een onofficiële API)
- **Swiss Food Database**
- **Canadian Nutrient File (Health Canada)**
- **Swedish Food Agency (Livsmedelsverket)**
- **Free Exercise DB** (Github)
- **Wger**

Integraties synchroniseren automatisch activiteitsgegevens zoals stappen, trainingen en slaap, samen met gezondheidsmetingen zoals gewicht en lichaamsmaten, naar je SparkyFitness-server.

## Optionele AI-functies (bèta)

SparkyAI biedt een conversationele interface om gegevens te registreren en je voortgang te bekijken.

- Registreer voeding, training, lichaamswaarden en stappen via chat
- Upload foto's van eten om maaltijden automatisch te registreren
- Bewaart de gespreksgeschiedenis voor vervolgvragen

Let op: AI-functies zijn momenteel in bèta.

## Installatie

Kies een van de twee manieren om SparkyFitness te draaien:

### 1. Zelf-gehost

Zet binnen enkele minuten een SparkyFitness-server op met Docker Compose:

```bash
# 1. Maak een nieuwe map aan
mkdir sparkyfitness && cd sparkyfitness

# 2. Download docker-compose.yml
curl -L -o docker-compose.yml https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/docker-compose.prod.yml

# 3. Stel je .env-configuratie in (kies één optie):
# Optie A (aanbevolen): genereer een aangepaste .env met veilige sleutels in 1 klik in de browser:
# 👉 https://codewithcj.github.io/SparkyFitness/install/env-generator

# Optie B: minimaal sjabloon — 5 waarden, al het andere gebruikt de standaardwaarden
# die docker-compose al toepast. Prima voor de meeste zelf-gehoste installaties.
curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.simple.example

# Optie C: volledige referentie — elke ondersteunde variabele, uitgecommentarieerd met
# de standaardwaarde. Begin hier voor SSO, SMTP, een externe database of een reverse proxy.
# curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.example

# 4. Vervang de placeholders (sla over als je optie A hebt gebruikt — de generator
# heeft ze al ingevuld). De server weigert te starten zolang ze ongewijzigd
# blijven, en anders zou de database worden geïnitialiseerd met een openbaar wachtwoord.
#   SPARKY_FITNESS_DB_PASSWORD        een willekeurig sterk wachtwoord
#   SPARKY_FITNESS_API_ENCRYPTION_KEY openssl rand -hex 32     (64 hex-tekens)
#   BETTER_AUTH_SECRET                openssl rand -base64 32  (44 tekens)
#   SPARKY_FITNESS_FRONTEND_URL       de URL waarop je de app gaat openen

# 5. Start de app
docker compose pull && docker compose up -d

# Open de applicatie op http://localhost:3004
```

_Let op: bezoek de [documentatiesite](https://codewithcj.github.io/SparkyFitness/) voor alle configuratieopties, reverse proxies en alternatieve installatiemethoden._

### 2. Cloud (voor niet-technische gebruikers)

Als je geen technische gebruiker bent en SparkyFitness liever niet op je eigen server draait, kun je een gehoste instantie in de cloud uitrollen via een van de volgende aanbieders.

<a href="https://www.pikapods.com/pods?run=sparkyfitness">
  <img src="https://www.pikapods.com/static/run-button.svg" height="70" width="150" alt="Draaien op PikaPods">
</a>
<br>
<a href="https://zenith.hosting/host/sparkyfitness?ref=gh">
  <img src="https://cdn.zenith.hosting/buttons/deploy-with-zenith.svg" height="70" width="150" alt="Uitrollen met Zenith">
</a>


> **Let op:** dit zijn onafhankelijke diensten van derden. We raden je aan de functies van elke aanbieder te verkennen om te bepalen welke het best bij je behoeften past.
 

## 🎥 Videotutorial

[![Bekijk de video](https://img.youtube.com/vi/B13IiL2DeQc/maxresdefault.jpg)](https://www.youtube.com/watch?v=B13IiL2DeQc)

Korte tutorial van 2 minuten die laat zien hoe je SparkyFitness installeert (zelf-gehoste fitnesstracker).

## Documentatie

Bezoek onze [documentatiesite](https://codewithcj.github.io/SparkyFitness/) voor volledige installatiehandleidingen, configuratieopties en ontwikkelaarsdocumentatie.

### Snelle links

- **[Installatiehandleiding](https://codewithcj.github.io/SparkyFitness/install/docker-compose)** - Uitrol en configuraties
- **[Interactieve .env-generator](https://codewithcj.github.io/SparkyFitness/install/env-generator)** - Client-side bouwer voor de `.env`-configuratie
- **[Overzicht van functies](https://codewithcj.github.io/SparkyFitness/features)** - Volledige documentatie van de functies
- **[Ontwikkelworkflow](https://codewithcj.github.io/SparkyFitness/developer/getting-started)** - Ontwikkelaarshandleiding en bijdrageproces
- **[Info over de iOS-app](https://github.com/CodeWithCJ/SparkyFitness/wiki/Apple-Health-Integration)** en **[Info over de Android-app](https://github.com/CodeWithCJ/SparkyFitness/wiki/Android-Mobile-App)**

### Hulp nodig?

- Plaats een bericht in de GitHub-issues of -discussies.
- Voor een sneller antwoord en hulp van andere communityleden: **[word lid van onze Discord](https://discord.gg/vcnMT5cPEA)**

## Stergeschiedenis

<a href="https://www.star-history.com/?repos=CodeWithCJ%2FSparkyFitness&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&theme=dark&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <img alt="Grafiek van de stergeschiedenis" src="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
 </picture>
</a>

## Vertalingen


**[Vertalingen op Weblate](https://weblate.sparkyfitness.com/engage/sparkyfitness)**

<a href="http://weblate.sparkyfitness.com/engage/sparkyfitness/"><img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/svg-badge.svg" alt="Vertaalstatus"></a>



<a href="https://weblate.sparkyfitness.com/engage/sparkyfitness">
<img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/multi-auto.svg" alt="Vertaalstatus" />
</a>

## Activiteit in de repository

![Alt](https://repobeats.axiom.co/api/embed/828203d3070ff56c8873c727b6873b684c4ed399.svg "Analyseafbeelding van Repobeats")

## Bijdragers

<a href="https://github.com/CodeWithCJ/SparkyFitness/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=CodeWithCJ/SparkyFitness" width="100%" alt="Bijdragers aan SparkyFitness"/>
</a>

## ⚠️ Bekende problemen / bètafuncties ⚠️

SparkyFitness wordt actief ontwikkeld.
Tussen releases kunnen ingrijpende wijzigingen optreden.

- Automatisch bijwerken van containers wordt afgeraden
- Lees altijd de release notes voordat je upgradet

De volgende functies zijn momenteel in bèta en zijn mogelijk niet grondig getest. Houd rekening met mogelijke bugs of onvolledige functionaliteit:

- AI-chatbot
- Toegang voor familie en vrienden
- API-documentatie

_Dit is een vertaling van de Engelse README. Als er iets afwijkt, is de [Engelse versie](../../README.md) leidend._
