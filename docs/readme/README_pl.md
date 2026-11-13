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
  <b>Polski</b> ·
  <a href="README_ar.md">العربية</a> ·
  <a href="README_fa.md">فارسی</a> ·
  <a href="README_tr.md">Türkçe</a> ·
  <a href="README_vi.md">Tiếng Việt</a> ·
  <a href="README_id.md">Bahasa Indonesia</a>
</p>

# SparkyFitness

Samodzielnie hostowana, stawiająca na prywatność alternatywa dla MyFitnessPal, Flo, Hevy, Shotsy i innych. Śledź odżywianie, ćwiczenia, pomiary ciała i dane zdrowotne, zachowując pełną kontrolę nad swoimi danymi.
<img width="5120" height="2880" alt="obraz" src="https://github.com/user-attachments/assets/d8b09f48-cb4d-41a6-b678-ac93e551f257" />


SparkyFitness to samodzielnie hostowana platforma do śledzenia aktywności fizycznej, na którą składają się:

- Serwer backendowy (API + przechowywanie danych)
- Frontend dostępny w przeglądarce
- Natywne aplikacje mobilne na iOS i Androida

Przechowuje dane zdrowotne i zarządza nimi na infrastrukturze, którą kontrolujesz, bez polegania na usługach firm trzecich.

## Główne funkcje

- Śledzenie odżywiania, ćwiczeń, nawodnienia, snu, postu, nastroju i pomiarów ciała
- Wyznaczanie celów i codzienne podsumowania
- Interaktywne wykresy i raporty długoterminowe
- Wiele profili użytkowników i dostęp dla rodziny
- Jasny i ciemny motyw
- OIDC, TOTP, Passkey, MFA itd.

## Jak SparkyFitness wypada na tle innych

**SparkyFitness jest source-available, a nie open source** — [licencja](../../LICENSE) jest niekomercyjna i wymaga zgody na użycie komercyjne.

Większość aplikacji robi jedną rzecz. Jedna dobra aplikacja do odżywiania kosztuje 40–100 USD rocznie; pokrycie wszystkiego, co oferuje SparkyFitness, oznacza trzy lub cztery subskrypcje na osobę, a i tak bez jednego wspólnego raportu. SparkyFitness robi to w jednej aplikacji, za darmo, dla całego domu.

<sub>Ceny katalogowe w USA, 14 sie 2026. [Pełne zestawienie kosztów →](https://codewithcj.github.io/SparkyFitness/features/comparison)</sub>

| | **SparkyFitness** | wger | MyFitnessPal | Cronometer | Hevy | Zero | Flo | Garmin Connect | Google Health |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Samodzielny hosting, Twoje dane pozostają Twoje | ⭐ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Bez subskrypcji, bez reklam | ✅ | ✅ | ❌ | 🟡 | 🟡 | ❌ | ❌ | ✅ | 🟡 |
| Odżywianie, siła, sen, post, cykl i leki w jednym miejscu\* | ⭐ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| Pełna historia i raporty z dowolnego zakresu dat | ✅ za darmo | 🟡 | 💰 | 💰 | 💰 | 💰 | 💰 | ✅ | 💰 |
| Synchronizacja z urządzeniami ubieralnymi i platformami zdrowotnymi | ✅ 8+ usług | ❌ | ✅ | ⭐ | ✅ | 🟡 | 🟡 | 🟡 | ✅ |
| Udostępnianie rodzinie ze szczegółowymi uprawnieniami | ⭐ 7 uprawnień | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| Import CSV i darmowy eksport danych | ✅ | 🟡 | 💰 | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ❌ |
| Serwer MCP + własny LLM | ⭐ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

⭐ wyróżnienie &nbsp;•&nbsp; ✅ obsługiwane &nbsp;•&nbsp; 🟡 częściowo &nbsp;•&nbsp; 💰 tylko w płatnym planie &nbsp;•&nbsp; ❌ nieobsługiwane

<sub>\* Fazy snu, HRV i poziom glukozy we krwi są importowane z zegarka, telefonu lub glukometru. SparkyFitness je przechowuje, analizuje i przedstawia na wykresach, ale sam ich nie mierzy.</sub>

> **Tę tabelę napisał projekt, który jest w niej porównywany, więc tak ją czytaj.** Sprawdzono 14 sie 2026 na podstawie oficjalnej dokumentacji, repozytoriów i opisów w sklepach; część informacji jest już nieaktualna. Jeśli jakaś komórka jest błędna lub niesprawiedliwa wobec innego projektu, [zgłoś issue](https://github.com/CodeWithCJ/SparkyFitness/issues) — poprawki, przez które SparkyFitness wypada *gorzej*, są równie mile widziane.

**[Zobacz pełne porównanie →](https://codewithcj.github.io/SparkyFitness/features/comparison)** — 17 aplikacji z kategorii samodzielnie hostowanych, żywieniowych, specjalistycznych i ekosystemów urządzeń, wraz z tym, w czym każda z nich nas przewyższa.

## Integracje ze zdrowiem i urządzeniami

SparkyFitness może synchronizować dane z wielu platform zdrowotnych i fitness:

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
- **Strava** (częściowo przetestowane)
- **COROS**
- **Norish**
- **Yazio** (korzysta z nieoficjalnego API)
- **Swiss Food Database**
- **Canadian Nutrient File (Health Canada)**
- **Swedish Food Agency (Livsmedelsverket)**
- **Free Exercise DB** (Github)
- **Wger**

Integracje automatycznie synchronizują z Twoim serwerem SparkyFitness dane o aktywności, takie jak kroki, treningi i sen, a także wskaźniki zdrowotne, takie jak waga i pomiary ciała.

## Opcjonalne funkcje AI (beta)

SparkyAI zapewnia konwersacyjny interfejs do rejestrowania danych i przeglądania postępów.

- Rejestruj jedzenie, ćwiczenia, parametry ciała i kroki przez czat
- Przesyłaj zdjęcia jedzenia, aby automatycznie rejestrować posiłki
- Zachowuje historię rozmowy na potrzeby dalszych pytań

Uwaga: funkcje AI są obecnie w wersji beta.

## Instalacja

Wybierz jeden z dwóch sposobów uruchomienia SparkyFitness:

### 1. Samodzielny hosting

Uruchom serwer SparkyFitness w kilka minut za pomocą Docker Compose:

```bash
# 1. Utwórz nowy folder
mkdir sparkyfitness && cd sparkyfitness

# 2. Pobierz docker-compose.yml
curl -L -o docker-compose.yml https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/docker-compose.prod.yml

# 3. Skonfiguruj plik .env (wybierz jedną opcję):
# Opcja A (zalecana): wygeneruj własny plik .env z bezpiecznymi kluczami jednym kliknięciem w przeglądarce:
# 👉 https://codewithcj.github.io/SparkyFitness/install/env-generator

# Opcja B: minimalny szablon — 5 wartości, cała reszta korzysta z domyślnych
# ustawień, które docker-compose już stosuje. Wystarcza do większości instalacji.
curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.simple.example

# Opcja C: pełna referencja — każda obsługiwana zmienna, zakomentowana wraz z
# wartością domyślną. Zacznij tutaj dla SSO, SMTP, zewnętrznej bazy danych lub reverse proxy.
# curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.example

# 4. Zastąp wartości zastępcze (pomiń, jeśli użyłeś opcji A — generator
# już je uzupełnił). Serwer odmówi uruchomienia, dopóki pozostaną
# niezmienione, a baza danych zostałaby zainicjalizowana z publicznie znanym hasłem.
#   SPARKY_FITNESS_DB_PASSWORD        dowolne silne hasło
#   SPARKY_FITNESS_API_ENCRYPTION_KEY openssl rand -hex 32     (64 znaki hex)
#   BETTER_AUTH_SECRET                openssl rand -base64 32  (44 znaki)
#   SPARKY_FITNESS_FRONTEND_URL       adres URL, pod którym otworzysz aplikację

# 5. Uruchom aplikację
docker compose pull && docker compose up -d

# Aplikacja dostępna pod adresem http://localhost:3004
```

_Uwaga: pełne opcje konfiguracji, reverse proxy i alternatywne metody instalacji znajdziesz na [stronie dokumentacji](https://codewithcj.github.io/SparkyFitness/)._

### 2. Chmura (dla użytkowników nietechnicznych)

Jeśli nie jesteś osobą techniczną i wolisz nie uruchamiać SparkyFitness na własnym serwerze, możesz wdrożyć hostowaną instancję w chmurze u jednego z poniższych dostawców.

<a href="https://www.pikapods.com/pods?run=sparkyfitness">
  <img src="https://www.pikapods.com/static/run-button.svg" height="70" width="150" alt="Uruchom na PikaPods">
</a>
<br>
<a href="https://zenith.hosting/host/sparkyfitness?ref=gh">
  <img src="https://cdn.zenith.hosting/buttons/deploy-with-zenith.svg" height="70" width="150" alt="Wdróż z Zenith">
</a>


> **Uwaga:** są to niezależne usługi firm trzecich. Zachęcamy do zapoznania się z funkcjami oferowanymi przez każdego dostawcę, aby wybrać tego, który najlepiej odpowiada Twoim potrzebom.
 

## 🎥 Samouczek wideo

[![Obejrzyj wideo](https://img.youtube.com/vi/B13IiL2DeQc/maxresdefault.jpg)](https://www.youtube.com/watch?v=B13IiL2DeQc)

Krótki, 2-minutowy samouczek pokazujący, jak zainstalować SparkyFitness (samodzielnie hostowany tracker fitness).

## Dokumentacja

Pełne przewodniki instalacji, opcje konfiguracji i dokumentację dla programistów znajdziesz na naszej [stronie dokumentacji](https://codewithcj.github.io/SparkyFitness/).

### Szybkie linki

- **[Przewodnik instalacji](https://codewithcj.github.io/SparkyFitness/install/docker-compose)** - Wdrożenie i konfiguracja
- **[Interaktywny generator .env](https://codewithcj.github.io/SparkyFitness/install/env-generator)** - Kreator konfiguracji `.env` działający po stronie klienta
- **[Przegląd funkcji](https://codewithcj.github.io/SparkyFitness/features)** - Pełna dokumentacja funkcji
- **[Proces rozwoju](https://codewithcj.github.io/SparkyFitness/developer/getting-started)** - Przewodnik dla programistów i proces wnoszenia wkładu
- **[Informacje o aplikacji na iOS](https://github.com/CodeWithCJ/SparkyFitness/wiki/Apple-Health-Integration)** i **[Informacje o aplikacji na Androida](https://github.com/CodeWithCJ/SparkyFitness/wiki/Android-Mobile-App)**

### Potrzebujesz pomocy?

- Napisz w issues lub dyskusjach na GitHubie.
- Aby szybciej uzyskać odpowiedź i pomoc od innych członków społeczności, **[dołącz do naszego Discorda](https://discord.gg/vcnMT5cPEA)**

## Historia gwiazdek

<a href="https://www.star-history.com/?repos=CodeWithCJ%2FSparkyFitness&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&theme=dark&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <img alt="Wykres historii gwiazdek" src="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
 </picture>
</a>

## Tłumaczenia


**[Tłumaczenia w Weblate](https://weblate.sparkyfitness.com/engage/sparkyfitness)**

<a href="http://weblate.sparkyfitness.com/engage/sparkyfitness/"><img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/svg-badge.svg" alt="Stan tłumaczenia"></a>



<a href="https://weblate.sparkyfitness.com/engage/sparkyfitness">
<img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/multi-auto.svg" alt="Stan tłumaczenia" />
</a>

## Aktywność repozytorium

![Alt](https://repobeats.axiom.co/api/embed/828203d3070ff56c8873c727b6873b684c4ed399.svg "Obraz analityki Repobeats")

## Współtwórcy

<a href="https://github.com/CodeWithCJ/SparkyFitness/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=CodeWithCJ/SparkyFitness" width="100%" alt="Współtwórcy SparkyFitness"/>
</a>

## ⚠️ Znane problemy / funkcje w wersji beta ⚠️

SparkyFitness jest aktywnie rozwijany.
Między wydaniami mogą pojawiać się zmiany niekompatybilne wstecz.

- Automatyczne aktualizowanie kontenerów nie jest zalecane
- Zawsze czytaj informacje o wydaniu przed aktualizacją

Poniższe funkcje są obecnie w wersji beta i mogły nie zostać dokładnie przetestowane. Należy liczyć się z możliwymi błędami lub niepełną funkcjonalnością:

- Chatbot AI
- Dostęp dla rodziny i znajomych
- Dokumentacja API

_To jest tłumaczenie angielskiego pliku README. W razie rozbieżności obowiązuje [wersja angielska](../../README.md)._
