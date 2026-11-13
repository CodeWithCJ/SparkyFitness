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
  <b>Italiano</b> ·
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

Un'alternativa self-hosted e incentrata sulla privacy a MyFitnessPal, Flo, Hevy, Shotsy e altro ancora. Monitora alimentazione, allenamento, misure corporee e dati sulla salute mantenendo il pieno controllo dei tuoi dati.
<img width="5120" height="2880" alt="immagine" src="https://github.com/user-attachments/assets/d8b09f48-cb4d-41a6-b678-ac93e551f257" />


SparkyFitness è una piattaforma self-hosted per il monitoraggio del fitness composta da:

- Un server backend (API + archiviazione dei dati)
- Un frontend web
- App mobili native per iOS e Android

Archivia e gestisce i dati sulla salute su un'infrastruttura che controlli tu, senza dipendere da servizi di terze parti.

## Funzionalità principali

- Monitoraggio di alimentazione, allenamento, idratazione, sonno, digiuno, umore e misure corporee
- Definizione degli obiettivi e check-in giornalieri
- Grafici interattivi e report a lungo termine
- Più profili utente e accesso per la famiglia
- Temi chiaro e scuro
- OIDC, TOTP, Passkey, MFA ecc.

## Il confronto con SparkyFitness

**SparkyFitness è source-available, non open source**: la [licenza](../../LICENSE) è non commerciale e richiede un'autorizzazione per l'uso commerciale.

La maggior parte delle app fa una cosa sola. Una buona app per l'alimentazione costa dai 40 ai 100 $ all'anno; coprire tutto ciò che copre SparkyFitness significa tre o quattro abbonamenti, a persona, e comunque nessun report unico che li riunisca. SparkyFitness fa tutto in un'unica app, gratis, per tutta la famiglia.

<sub>Prezzi di listino negli USA, 14 agosto 2026. [Dettaglio completo dei costi →](https://codewithcj.github.io/SparkyFitness/features/comparison)</sub>

| | **SparkyFitness** | wger | MyFitnessPal | Cronometer | Hevy | Zero | Flo | Garmin Connect | Google Health |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Self-hosted, i tuoi dati restano tuoi | ⭐ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Nessun abbonamento, nessuna pubblicità | ✅ | ✅ | ❌ | 🟡 | 🟡 | ❌ | ❌ | ✅ | 🟡 |
| Alimentazione, forza, sonno, digiuno, ciclo e farmaci in un unico posto\* | ⭐ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| Cronologia completa e report su intervalli di date personalizzati | ✅ gratis | 🟡 | 💰 | 💰 | 💰 | 💰 | 💰 | ✅ | 💰 |
| Sincronizzazione con wearable e piattaforme per la salute | ✅ oltre 8 servizi | ❌ | ✅ | ⭐ | ✅ | 🟡 | 🟡 | 🟡 | ✅ |
| Condivisione familiare con permessi granulari | ⭐ 7 permessi | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| Importazione CSV ed esportazione dei dati gratuita | ✅ | 🟡 | 💰 | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ❌ |
| Server MCP + usa il tuo LLM | ⭐ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

⭐ punto di forza &nbsp;•&nbsp; ✅ supportato &nbsp;•&nbsp; 🟡 parziale &nbsp;•&nbsp; 💰 solo nel piano a pagamento &nbsp;•&nbsp; ❌ non supportato

<sub>\* Le fasi del sonno, l'HRV e la glicemia vengono importate dal tuo orologio, telefono o glucometro. SparkyFitness le archivia, le analizza e le rappresenta in grafici, ma non le misura direttamente.</sub>

> **Questa tabella è scritta dal progetto stesso che viene confrontato, quindi leggila tenendone conto.** Verificata il 14 agosto 2026 rispetto a documentazione ufficiale, repository e schede degli store; una parte è già superata. Se una cella è sbagliata o ingiusta verso un altro progetto, [apri una issue](https://github.com/CodeWithCJ/SparkyFitness/issues): le correzioni che fanno apparire SparkyFitness *peggiore* sono altrettanto benvenute.

**[Guarda il confronto completo →](https://codewithcj.github.io/SparkyFitness/features/comparison)**: 17 app nelle categorie self-hosted, alimentazione, specialistiche ed ecosistemi di dispositivi, oltre ai punti in cui ognuna di esse ci batte.

## Integrazioni con salute e dispositivi

SparkyFitness può sincronizzare i dati da diverse piattaforme per la salute e il fitness:

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
- **Strava** (testato parzialmente)
- **COROS**
- **Norish**
- **Yazio** (usa un'API non ufficiale)
- **Swiss Food Database**
- **Canadian Nutrient File (Health Canada)**
- **Swedish Food Agency (Livsmedelsverket)**
- **Free Exercise DB** (Github)
- **Wger**

Le integrazioni sincronizzano automaticamente sul tuo server SparkyFitness i dati di attività come passi, allenamenti e sonno, insieme a parametri di salute come il peso e le misure corporee.

## Funzionalità IA opzionali (beta)

SparkyAI offre un'interfaccia conversazionale per registrare i dati e controllare i progressi.

- Registra cibo, allenamenti, dati corporei e passi tramite chat
- Carica foto del cibo per registrare automaticamente i pasti
- Conserva la cronologia della conversazione per i messaggi successivi

Nota: le funzionalità IA sono attualmente in beta.

## Installazione

Scegli uno dei due modi per eseguire SparkyFitness:

### 1. Self-hosted

Avvia un server SparkyFitness in pochi minuti con Docker Compose:

```bash
# 1. Crea una nuova cartella
mkdir sparkyfitness && cd sparkyfitness

# 2. Scarica docker-compose.yml
curl -L -o docker-compose.yml https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/docker-compose.prod.yml

# 3. Prepara la configurazione .env (scegli un'opzione):
# Opzione A (consigliata): genera un .env personalizzato con chiavi sicure in 1 clic nel browser:
# 👉 https://codewithcj.github.io/SparkyFitness/install/env-generator

# Opzione B: modello minimo: 5 valori, tutto il resto usa i valori predefiniti
# già applicati da docker-compose. Va bene per la maggior parte delle installazioni self-hosted.
curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.simple.example

# Opzione C: riferimento completo: tutte le variabili supportate, commentate con il
# loro valore predefinito. Parti da qui per SSO, SMTP, un database esterno o un reverse proxy.
# curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.example

# 4. Sostituisci i segnaposto (salta questo passaggio se hai usato l'Opzione A: il generatore
# li ha già compilati). Il server si rifiuta di avviarsi finché restano
# invariati, e altrimenti il database verrebbe inizializzato con una password pubblica.
#   SPARKY_FITNESS_DB_PASSWORD        una qualsiasi password robusta
#   SPARKY_FITNESS_API_ENCRYPTION_KEY openssl rand -hex 32     (64 caratteri esadecimali)
#   BETTER_AUTH_SECRET                openssl rand -base64 32  (44 caratteri)
#   SPARKY_FITNESS_FRONTEND_URL       l'URL da cui aprirai l'app

# 5. Avvia l'app
docker compose pull && docker compose up -d

# Accedi all'applicazione su http://localhost:3004
```

_Nota: per tutte le opzioni di configurazione, i reverse proxy e i metodi di installazione alternativi, visita il [sito della documentazione](https://codewithcj.github.io/SparkyFitness/)._

### 2. Cloud (per utenti non tecnici)

Se non sei un utente tecnico e preferisci non eseguire SparkyFitness sul tuo server, puoi distribuire un'istanza ospitata nel cloud con uno dei seguenti provider.

<a href="https://www.pikapods.com/pods?run=sparkyfitness">
  <img src="https://www.pikapods.com/static/run-button.svg" height="70" width="150" alt="Esegui su PikaPods">
</a>
<br>
<a href="https://zenith.hosting/host/sparkyfitness?ref=gh">
  <img src="https://cdn.zenith.hosting/buttons/deploy-with-zenith.svg" height="70" width="150" alt="Distribuisci con Zenith">
</a>


> **Nota:** si tratta di servizi di terze parti indipendenti. Ti invitiamo a esplorare le funzionalità offerte da ciascun provider per individuare quello più adatto alle tue esigenze.
 

## 🎥 Video tutorial

[![Guarda il video](https://img.youtube.com/vi/B13IiL2DeQc/maxresdefault.jpg)](https://www.youtube.com/watch?v=B13IiL2DeQc)

Breve tutorial di 2 minuti che mostra come installare SparkyFitness (fitness tracker self-hosted).

## Documentazione

Per guide di installazione complete, opzioni di configurazione e documentazione per sviluppatori, visita il nostro [sito della documentazione](https://codewithcj.github.io/SparkyFitness/).

### Link rapidi

- **[Guida all'installazione](https://codewithcj.github.io/SparkyFitness/install/docker-compose)** - Distribuzione e configurazioni
- **[Generatore interattivo di .env](https://codewithcj.github.io/SparkyFitness/install/env-generator)** - Strumento lato client per creare la configurazione `.env`
- **[Panoramica delle funzionalità](https://codewithcj.github.io/SparkyFitness/features)** - Documentazione completa delle funzionalità
- **[Flusso di sviluppo](https://codewithcj.github.io/SparkyFitness/developer/getting-started)** - Guida per sviluppatori e processo di contribuzione
- **[Info sull'app iOS](https://github.com/CodeWithCJ/SparkyFitness/wiki/Apple-Health-Integration)** e **[info sull'app Android](https://github.com/CodeWithCJ/SparkyFitness/wiki/Android-Mobile-App)**

### Serve aiuto?

- Scrivi nelle issue o nelle discussioni su Github.
- Per una risposta più rapida e per ricevere aiuto dagli altri membri della community, **[unisciti al nostro Discord](https://discord.gg/vcnMT5cPEA)**

## Cronologia delle stelle

<a href="https://www.star-history.com/?repos=CodeWithCJ%2FSparkyFitness&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&theme=dark&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <img alt="Grafico della cronologia delle stelle" src="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
 </picture>
</a>

## Traduzioni


**[Traduzioni su Weblate](https://weblate.sparkyfitness.com/engage/sparkyfitness)**

<a href="http://weblate.sparkyfitness.com/engage/sparkyfitness/"><img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/svg-badge.svg" alt="Stato della traduzione"></a>



<a href="https://weblate.sparkyfitness.com/engage/sparkyfitness">
<img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/multi-auto.svg" alt="Stato della traduzione" />
</a>

## Attività del repository

![Alt](https://repobeats.axiom.co/api/embed/828203d3070ff56c8873c727b6873b684c4ed399.svg "Immagine delle statistiche di Repobeats")

## Contributori

<a href="https://github.com/CodeWithCJ/SparkyFitness/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=CodeWithCJ/SparkyFitness" width="100%" alt="Collaboratori di SparkyFitness"/>
</a>

## ⚠️ Problemi noti / Funzionalità in beta ⚠️

SparkyFitness è in fase di sviluppo attivo.
Tra una release e l'altra possono verificarsi modifiche incompatibili.

- L'aggiornamento automatico dei container è sconsigliato
- Leggi sempre le note di rilascio prima di aggiornare

Le seguenti funzionalità sono attualmente in beta e potrebbero non essere state testate a fondo. Aspettati possibili bug o funzionalità incomplete:

- Chatbot IA
- Accesso per famiglia e amici
- Documentazione dell'API

_Questa è una traduzione del README in inglese. In caso di differenze, fa fede la [versione inglese](../../README.md)._
