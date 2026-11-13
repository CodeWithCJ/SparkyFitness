<p align="center">
  <a href="../../README.md">English</a> ·
  <a href="README_zh-CN.md">简体中文</a> ·
  <a href="README_zh-TW.md">繁體中文</a> ·
  <a href="README_ja.md">日本語</a> ·
  <a href="README_ko.md">한국어</a> ·
  <a href="README_hi.md">हिन्दी</a> ·
  <a href="README_th.md">ไทย</a> ·
  <a href="README_fr.md">Français</a> ·
  <b>Deutsch</b> ·
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

Eine selbst gehostete, datenschutzorientierte Alternative zu MyFitnessPal, Flo, Hevy, Shotsy und mehr. Erfasse Ernährung, Training, Körpermaße und Gesundheitsdaten und behalte dabei die volle Kontrolle über deine Daten.
<img width="5120" height="2880" alt="Bild" src="https://github.com/user-attachments/assets/d8b09f48-cb4d-41a6-b678-ac93e551f257" />


SparkyFitness ist eine selbst gehostete Fitness-Tracking-Plattform, bestehend aus:

- Einem Backend-Server (API + Datenspeicherung)
- Einem webbasierten Frontend
- Nativen Mobil-Apps für iOS und Android

Sie speichert und verwaltet Gesundheitsdaten auf einer Infrastruktur, die du selbst kontrollierst, ohne auf Drittanbieterdienste angewiesen zu sein.

## Kernfunktionen

- Erfassung von Ernährung, Training, Flüssigkeitszufuhr, Schlaf, Fasten, Stimmung und Körpermaßen
- Zielsetzung und tägliche Check-ins
- Interaktive Diagramme und Langzeitberichte
- Mehrere Benutzerprofile und Familienzugriff
- Helles und dunkles Design
- OIDC, TOTP, Passkey, MFA usw.

## Wie sich SparkyFitness im Vergleich schlägt

**SparkyFitness ist Source-Available, nicht Open Source** — die [Lizenz](../../LICENSE) ist nicht kommerziell und eine kommerzielle Nutzung erfordert eine Genehmigung.

Die meisten Apps können nur eine Sache. Eine gute Ernährungs-App kostet 40–100 $ pro Jahr; um alles abzudecken, was SparkyFitness abdeckt, braucht man drei oder vier Abos, pro Person, und trotzdem keinen gemeinsamen Bericht über alle hinweg. SparkyFitness erledigt das in einer einzigen App, kostenlos, für den ganzen Haushalt.

<sub>US-Listenpreise, 14. Aug. 2026. [Vollständige Kostenaufstellung →](https://codewithcj.github.io/SparkyFitness/features/comparison)</sub>

| | **SparkyFitness** | wger | MyFitnessPal | Cronometer | Hevy | Zero | Flo | Garmin Connect | Google Health |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Selbst gehostet, deine Daten bleiben deine | ⭐ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Kein Abo, keine Werbung | ✅ | ✅ | ❌ | 🟡 | 🟡 | ❌ | ❌ | ✅ | 🟡 |
| Ernährung, Krafttraining, Schlaf, Fasten, Zyklus und Medikamente an einem Ort\* | ⭐ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| Vollständiger Verlauf und Berichte mit eigenem Zeitraum | ✅ kostenlos | 🟡 | 💰 | 💰 | 💰 | 💰 | 💰 | ✅ | 💰 |
| Synchronisierung mit Wearables und Gesundheitsplattformen | ✅ 8+ Dienste | ❌ | ✅ | ⭐ | ✅ | 🟡 | 🟡 | 🟡 | ✅ |
| Familienfreigabe mit detaillierten Berechtigungen | ⭐ 7 Berechtigungen | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| CSV-Import und kostenloser Datenexport | ✅ | 🟡 | 💰 | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ❌ |
| MCP-Server + eigenes LLM nutzbar | ⭐ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

⭐ herausragend &nbsp;•&nbsp; ✅ unterstützt &nbsp;•&nbsp; 🟡 teilweise &nbsp;•&nbsp; 💰 nur in kostenpflichtiger Version &nbsp;•&nbsp; ❌ nicht unterstützt

<sub>\* Schlafphasen, HRV und Blutzucker werden von deiner Uhr, deinem Smartphone oder Messgerät importiert. SparkyFitness speichert, analysiert und visualisiert sie, misst sie aber nicht selbst.</sub>

> **Diese Tabelle stammt vom verglichenen Projekt selbst, lies sie also entsprechend.** Geprüft am 14. Aug. 2026 anhand offizieller Dokumentationen, Repositories und Store-Einträge; manches davon ist bereits veraltet. Wenn eine Zelle falsch oder einem anderen Projekt gegenüber unfair ist, [eröffne ein Issue](https://github.com/CodeWithCJ/SparkyFitness/issues) — Korrekturen, durch die SparkyFitness *schlechter* dasteht, sind genauso willkommen.

**[Zum vollständigen Vergleich →](https://codewithcj.github.io/SparkyFitness/features/comparison)** — 17 Apps aus den Kategorien selbst gehostet, Ernährung, Spezial-Apps und Geräte-Ökosysteme, und wo jede von ihnen uns überlegen ist.

## Gesundheits- und Geräteintegrationen

SparkyFitness kann Daten von zahlreichen Gesundheits- und Fitnessplattformen synchronisieren:

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
- **Strava** (teilweise getestet)
- **COROS**
- **Norish**
- **Yazio** (nutzt eine inoffizielle API)
- **Swiss Food Database**
- **Canadian Nutrient File (Health Canada)**
- **Swedish Food Agency (Livsmedelsverket)**
- **Free Exercise DB** (Github)
- **Wger**

Integrationen synchronisieren Aktivitätsdaten wie Schritte, Workouts und Schlaf sowie Gesundheitswerte wie Gewicht und Körpermaße automatisch mit deinem SparkyFitness-Server.

## Optionale KI-Funktionen (Beta)

SparkyAI bietet eine Chat-Oberfläche, um Daten zu erfassen und Fortschritte zu überprüfen.

- Mahlzeiten, Training, Körperwerte und Schritte per Chat erfassen
- Fotos von Mahlzeiten hochladen, um sie automatisch zu protokollieren
- Speichert den Gesprächsverlauf für Rückfragen

Hinweis: Die KI-Funktionen befinden sich derzeit in der Beta-Phase.

## Installation

Wähle eine der beiden Möglichkeiten, SparkyFitness zu betreiben:

### 1. Selbst gehostet

Bring einen SparkyFitness-Server in wenigen Minuten mit Docker Compose zum Laufen:

```bash
# 1. Einen neuen Ordner anlegen
mkdir sparkyfitness && cd sparkyfitness

# 2. docker-compose.yml herunterladen
curl -L -o docker-compose.yml https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/docker-compose.prod.yml

# 3. Die .env-Konfiguration einrichten (eine Option wählen):
# Option A (empfohlen): Eine individuelle .env mit sicheren Schlüsseln per Klick im Browser erzeugen:
# 👉 https://codewithcj.github.io/SparkyFitness/install/env-generator

# Option B: Minimale Vorlage — 5 Werte, alles andere nutzt die Standardwerte,
# die docker-compose bereits setzt. Für die meisten selbst gehosteten Installationen ausreichend.
curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.simple.example

# Option C: Vollständige Referenz — jede unterstützte Variable, auskommentiert mit ihrem
# Standardwert. Hier anfangen für SSO, SMTP, eine externe Datenbank oder einen Reverse Proxy.
# curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.example

# 4. Die Platzhalter ersetzen (entfällt bei Option A — der Generator hat sie
# bereits ausgefüllt). Der Server startet nicht, solange sie unverändert
# bleiben, und die Datenbank würde sonst mit einem öffentlich bekannten Passwort initialisiert.
#   SPARKY_FITNESS_DB_PASSWORD        ein beliebiges starkes Passwort
#   SPARKY_FITNESS_API_ENCRYPTION_KEY openssl rand -hex 32     (64 Hex-Zeichen)
#   BETTER_AUTH_SECRET                openssl rand -base64 32  (44 Zeichen)
#   SPARKY_FITNESS_FRONTEND_URL       die URL, unter der du die App öffnen wirst

# 5. Die App starten
docker compose pull && docker compose up -d

# Die Anwendung ist unter http://localhost:3004 erreichbar
```

_Hinweis: Alle Konfigurationsoptionen, Reverse Proxies und alternative Installationsmethoden findest du auf der [Dokumentationsseite](https://codewithcj.github.io/SparkyFitness/)._

### 2. Cloud (für technisch weniger versierte Nutzer)

Wenn du technisch nicht versiert bist und SparkyFitness nicht auf deinem eigenen Server betreiben möchtest, kannst du über einen der folgenden Anbieter eine gehostete Instanz in der Cloud bereitstellen.

<a href="https://www.pikapods.com/pods?run=sparkyfitness">
  <img src="https://www.pikapods.com/static/run-button.svg" height="70" width="150" alt="Auf PikaPods starten">
</a>
<br>
<a href="https://zenith.hosting/host/sparkyfitness?ref=gh">
  <img src="https://cdn.zenith.hosting/buttons/deploy-with-zenith.svg" height="70" width="150" alt="Mit Zenith bereitstellen">
</a>


> **Hinweis:** Dies sind unabhängige Drittanbieterdienste. Wir empfehlen dir, die Funktionen der einzelnen Anbieter zu vergleichen, um den für deine Bedürfnisse am besten geeigneten zu finden.
 

## 🎥 Video-Tutorial

[![Video ansehen](https://img.youtube.com/vi/B13IiL2DeQc/maxresdefault.jpg)](https://www.youtube.com/watch?v=B13IiL2DeQc)

Kurzes 2-Minuten-Tutorial, das zeigt, wie man SparkyFitness (selbst gehosteter Fitness-Tracker) installiert.

## Dokumentation

Vollständige Installationsanleitungen, Konfigurationsoptionen und Entwicklerdokumentation findest du auf unserer [Dokumentationsseite](https://codewithcj.github.io/SparkyFitness/).

### Schnellzugriff

- **[Installationsanleitung](https://codewithcj.github.io/SparkyFitness/install/docker-compose)** - Bereitstellung und Konfiguration
- **[Interaktiver .env-Generator](https://codewithcj.github.io/SparkyFitness/install/env-generator)** - Clientseitiger Konfigurator für die `.env`
- **[Funktionsübersicht](https://codewithcj.github.io/SparkyFitness/features)** - Vollständige Dokumentation der Funktionen
- **[Entwicklungs-Workflow](https://codewithcj.github.io/SparkyFitness/developer/getting-started)** - Entwicklerhandbuch und Beitragsprozess
- **[Infos zur iOS-App](https://github.com/CodeWithCJ/SparkyFitness/wiki/Apple-Health-Integration)** und **[Infos zur Android-App](https://github.com/CodeWithCJ/SparkyFitness/wiki/Android-Mobile-App)**

### Brauchst du Hilfe?

- Schreibe in die GitHub-Issues oder -Diskussionen.
- Für schnellere Antworten und Hilfe von anderen Community-Mitgliedern **[tritt unserem Discord bei](https://discord.gg/vcnMT5cPEA)**

## Sterne-Verlauf

<a href="https://www.star-history.com/?repos=CodeWithCJ%2FSparkyFitness&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&theme=dark&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <img alt="Diagramm des Sterne-Verlaufs" src="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
 </picture>
</a>

## Übersetzungen


**[Übersetzungen auf Weblate](https://weblate.sparkyfitness.com/engage/sparkyfitness)**

<a href="http://weblate.sparkyfitness.com/engage/sparkyfitness/"><img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/svg-badge.svg" alt="Übersetzungsstatus"></a>



<a href="https://weblate.sparkyfitness.com/engage/sparkyfitness">
<img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/multi-auto.svg" alt="Übersetzungsstatus" />
</a>

## Repository-Aktivität

![Alt](https://repobeats.axiom.co/api/embed/828203d3070ff56c8873c727b6873b684c4ed399.svg "Repobeats-Analysebild")

## Mitwirkende

<a href="https://github.com/CodeWithCJ/SparkyFitness/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=CodeWithCJ/SparkyFitness" width="100%" alt="Mitwirkende an SparkyFitness"/>
</a>

## ⚠️ Bekannte Probleme / Beta-Funktionen ⚠️

SparkyFitness befindet sich in aktiver Entwicklung.
Zwischen Releases kann es zu inkompatiblen Änderungen kommen.

- Automatische Container-Updates werden nicht empfohlen
- Lies vor einem Upgrade immer die Release Notes

Die folgenden Funktionen befinden sich derzeit in der Beta-Phase und wurden möglicherweise nicht gründlich getestet. Rechne mit möglichen Fehlern oder unvollständiger Funktionalität:

- KI-Chatbot
- Zugriff für Familie und Freunde
- API-Dokumentation

_Dies ist eine Übersetzung der englischen README. Bei Abweichungen ist die [englische Version](../../README.md) maßgeblich._
