<p align="center">
  <a href="../../README.md">English</a> ·
  <a href="README_zh-CN.md">简体中文</a> ·
  <a href="README_zh-TW.md">繁體中文</a> ·
  <a href="README_ja.md">日本語</a> ·
  <a href="README_ko.md">한국어</a> ·
  <a href="README_hi.md">हिन्दी</a> ·
  <a href="README_th.md">ไทย</a> ·
  <b>Français</b> ·
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

Une alternative auto-hébergée et respectueuse de la vie privée à MyFitnessPal, Flo, Hevy, Shotsy et bien d'autres. Suivez votre nutrition, votre activité physique, vos mesures corporelles et vos données de santé tout en gardant le contrôle total de vos données.
<img width="5120" height="2880" alt="image" src="https://github.com/user-attachments/assets/d8b09f48-cb4d-41a6-b678-ac93e551f257" />


SparkyFitness est une plateforme de suivi de forme auto-hébergée composée de :

- Un serveur backend (API + stockage des données)
- Une interface web
- Des applications mobiles natives pour iOS et Android

Elle stocke et gère les données de santé sur une infrastructure que vous contrôlez, sans dépendre de services tiers.

## Fonctionnalités principales

- Suivi de la nutrition, de l'exercice, de l'hydratation, du sommeil, du jeûne, de l'humeur et des mensurations
- Définition d'objectifs et bilans quotidiens
- Graphiques interactifs et rapports sur le long terme
- Plusieurs profils utilisateurs et accès familial
- Thèmes clair et sombre
- OIDC, TOTP, Passkey, MFA, etc.

## Comment se positionne SparkyFitness

**SparkyFitness est source-available, pas open source** — la [licence](../../LICENSE) est non commerciale et toute utilisation commerciale nécessite une autorisation.

La plupart des applications ne font qu'une seule chose. Une bonne application de nutrition coûte entre 40 $ et 100 $ par an ; couvrir tout ce que couvre SparkyFitness implique trois ou quatre abonnements, par personne, sans pour autant obtenir un rapport unique qui les regroupe. SparkyFitness fait tout cela dans une seule application, gratuitement, pour tout le foyer.

<sub>Prix catalogue aux États-Unis, 14 août 2026. [Détail complet des coûts →](https://codewithcj.github.io/SparkyFitness/features/comparison)</sub>

| | **SparkyFitness** | wger | MyFitnessPal | Cronometer | Hevy | Zero | Flo | Garmin Connect | Google Health |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Auto-hébergé, vos données restent les vôtres | ⭐ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Sans abonnement, sans publicité | ✅ | ✅ | ❌ | 🟡 | 🟡 | ❌ | ❌ | ✅ | 🟡 |
| Nutrition, musculation, sommeil, jeûne, cycle et médicaments au même endroit\* | ⭐ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| Historique complet et rapports sur une période personnalisée | ✅ gratuit | 🟡 | 💰 | 💰 | 💰 | 💰 | 💰 | ✅ | 💰 |
| Synchronisation avec objets connectés et plateformes de santé | ✅ plus de 8 services | ❌ | ✅ | ⭐ | ✅ | 🟡 | 🟡 | 🟡 | ✅ |
| Partage familial avec permissions détaillées | ⭐ 7 permissions | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| Import CSV et export de données gratuit | ✅ | 🟡 | 💰 | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ❌ |
| Serveur MCP + votre propre LLM | ⭐ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

⭐ point fort &nbsp;•&nbsp; ✅ pris en charge &nbsp;•&nbsp; 🟡 partiel &nbsp;•&nbsp; 💰 offre payante uniquement &nbsp;•&nbsp; ❌ non pris en charge

<sub>\* Les phases de sommeil, la VFC et la glycémie sont importées depuis votre montre, votre téléphone ou votre glucomètre. SparkyFitness les stocke, les analyse et les représente sous forme de graphiques, mais ne les mesure pas lui-même.</sub>

> **Ce tableau est rédigé par le projet comparé : lisez-le en gardant cela à l'esprit.** Vérifié le 14 août 2026 à partir de la documentation officielle, des dépôts et des fiches des boutiques d'applications ; certaines informations sont déjà obsolètes. Si une cellule est erronée ou injuste envers un autre projet, [ouvrez une issue](https://github.com/CodeWithCJ/SparkyFitness/issues) — les corrections qui font paraître SparkyFitness *moins bien* sont tout aussi bienvenues.

**[Voir la comparaison complète →](https://codewithcj.github.io/SparkyFitness/features/comparison)** — 17 applications réparties entre les catégories auto-hébergé, nutrition, spécialisé et écosystème d'appareils, ainsi que les points sur lesquels chacune nous surpasse.

## Intégrations santé et appareils

SparkyFitness peut synchroniser les données de nombreuses plateformes de santé et de fitness :

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
- **Strava** (partiellement testé)
- **COROS**
- **Norish**
- **Yazio** (utilise une API non officielle)
- **Swiss Food Database**
- **Canadian Nutrient File (Health Canada)**
- **Swedish Food Agency (Livsmedelsverket)**
- **Free Exercise DB** (Github)
- **Wger**

Les intégrations synchronisent automatiquement vers votre serveur SparkyFitness les données d'activité, comme les pas, les entraînements et le sommeil, ainsi que les indicateurs de santé comme le poids et les mensurations.

## Fonctionnalités d'IA optionnelles (bêta)

SparkyAI offre une interface conversationnelle pour enregistrer des données et suivre vos progrès.

- Enregistrez vos repas, exercices, mesures corporelles et pas via le chat
- Envoyez des photos de vos plats pour enregistrer automatiquement vos repas
- Conserve l'historique des conversations pour les échanges suivants

Remarque : les fonctionnalités d'IA sont actuellement en bêta.

## Installation

Choisissez l'une des deux façons d'exécuter SparkyFitness :

### 1. Auto-hébergé

Lancez un serveur SparkyFitness en quelques minutes avec Docker Compose :

```bash
# 1. Créez un nouveau dossier
mkdir sparkyfitness && cd sparkyfitness

# 2. Téléchargez docker-compose.yml
curl -L -o docker-compose.yml https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/docker-compose.prod.yml

# 3. Configurez votre fichier .env (choisissez une option) :
# Option A (recommandée) : générez un .env personnalisé avec des clés sécurisées en 1 clic dans le navigateur :
# 👉 https://codewithcj.github.io/SparkyFitness/install/env-generator

# Option B : modèle minimal — 5 valeurs, tout le reste utilise les valeurs par défaut
# déjà appliquées par docker-compose. Convient à la plupart des installations auto-hébergées.
curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.simple.example

# Option C : référence complète — toutes les variables prises en charge, commentées avec leur
# valeur par défaut. Partez de là pour le SSO, le SMTP, une base de données externe ou un reverse proxy.
# curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.example

# 4. Remplacez les valeurs d'exemple (inutile si vous avez utilisé l'option A — le générateur
# les a déjà remplies). Le serveur refuse de démarrer tant qu'elles restent
# inchangées, et la base de données serait sinon initialisée avec un mot de passe public.
#   SPARKY_FITNESS_DB_PASSWORD        un mot de passe robuste
#   SPARKY_FITNESS_API_ENCRYPTION_KEY openssl rand -hex 32     (64 caractères hexadécimaux)
#   BETTER_AUTH_SECRET                openssl rand -base64 32  (44 caractères)
#   SPARKY_FITNESS_FRONTEND_URL       l'URL à laquelle vous ouvrirez l'application

# 5. Démarrez l'application
docker compose pull && docker compose up -d

# Accédez à l'application sur http://localhost:3004
```

_Remarque : pour toutes les options de configuration, les reverse proxies et les autres méthodes d'installation, consultez le [site de documentation](https://codewithcj.github.io/SparkyFitness/)._

### 2. Cloud (pour les utilisateurs non techniques)

Si vous n'êtes pas un utilisateur technique et préférez ne pas exécuter SparkyFitness sur votre propre serveur, vous pouvez déployer une instance hébergée dans le cloud auprès de l'un des fournisseurs suivants.

<a href="https://www.pikapods.com/pods?run=sparkyfitness">
  <img src="https://www.pikapods.com/static/run-button.svg" height="70" width="150" alt="Lancer sur PikaPods">
</a>
<br>
<a href="https://zenith.hosting/host/sparkyfitness?ref=gh">
  <img src="https://cdn.zenith.hosting/buttons/deploy-with-zenith.svg" height="70" width="150" alt="Déployer avec Zenith">
</a>


> **Remarque :** il s'agit de services tiers indépendants. Nous vous encourageons à explorer les fonctionnalités proposées par chaque fournisseur afin de choisir celui qui correspond le mieux à vos besoins.
 

## 🎥 Tutoriel vidéo

[![Regarder la vidéo](https://img.youtube.com/vi/B13IiL2DeQc/maxresdefault.jpg)](https://www.youtube.com/watch?v=B13IiL2DeQc)

Tutoriel rapide de 2 minutes montrant comment installer SparkyFitness (outil de suivi de forme auto-hébergé).

## Documentation

Pour les guides d'installation complets, les options de configuration et la documentation de développement, consultez notre [site de documentation](https://codewithcj.github.io/SparkyFitness/).

### Liens rapides

- **[Guide d'installation](https://codewithcj.github.io/SparkyFitness/install/docker-compose)** - Déploiement et configurations
- **[Générateur interactif de .env](https://codewithcj.github.io/SparkyFitness/install/env-generator)** - Outil de configuration du `.env` côté client
- **[Aperçu des fonctionnalités](https://codewithcj.github.io/SparkyFitness/features)** - Documentation complète des fonctionnalités
- **[Flux de développement](https://codewithcj.github.io/SparkyFitness/developer/getting-started)** - Guide du développeur et processus de contribution
- **[Infos sur l'application iOS](https://github.com/CodeWithCJ/SparkyFitness/wiki/Apple-Health-Integration)** et **[Infos sur l'application Android](https://github.com/CodeWithCJ/SparkyFitness/wiki/Android-Mobile-App)**

### Besoin d'aide ?

- Publiez dans les issues ou discussions GitHub.
- Pour une réponse plus rapide et obtenir l'aide d'autres membres de la communauté, **[rejoignez notre Discord](https://discord.gg/vcnMT5cPEA)**

## Historique des étoiles

<a href="https://www.star-history.com/?repos=CodeWithCJ%2FSparkyFitness&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&theme=dark&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <img alt="Graphique de l'historique des étoiles" src="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
 </picture>
</a>

## Traductions


**[Traductions sur Weblate](https://weblate.sparkyfitness.com/engage/sparkyfitness)**

<a href="http://weblate.sparkyfitness.com/engage/sparkyfitness/"><img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/svg-badge.svg" alt="État des traductions"></a>



<a href="https://weblate.sparkyfitness.com/engage/sparkyfitness">
<img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/multi-auto.svg" alt="État des traductions" />
</a>

## Activité du dépôt

![Alt](https://repobeats.axiom.co/api/embed/828203d3070ff56c8873c727b6873b684c4ed399.svg "Image d'analyse Repobeats")

## Contributeurs

<a href="https://github.com/CodeWithCJ/SparkyFitness/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=CodeWithCJ/SparkyFitness" width="100%" alt="Contributeurs de SparkyFitness"/>
</a>

## ⚠️ Problèmes connus / Fonctionnalités bêta ⚠️

SparkyFitness est en cours de développement actif.
Des changements incompatibles peuvent survenir d'une version à l'autre.

- La mise à jour automatique des conteneurs n'est pas recommandée
- Consultez toujours les notes de version avant de mettre à jour

Les fonctionnalités suivantes sont actuellement en bêta et n'ont peut-être pas été testées en profondeur. Attendez-vous à d'éventuels bugs ou à des fonctionnalités incomplètes :

- Chatbot IA
- Accès Famille et amis
- Documentation de l'API

_Ceci est une traduction du README en anglais. En cas de divergence, la [version anglaise](../../README.md) fait foi._
