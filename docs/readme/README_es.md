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
  <b>Español</b> ·
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

Una alternativa autoalojada y centrada en la privacidad a MyFitnessPal, Flo, Hevy, Shotsy y más. Registra nutrición, ejercicio, métricas corporales y datos de salud manteniendo el control total de tus datos.
<img width="5120" height="2880" alt="imagen" src="https://github.com/user-attachments/assets/d8b09f48-cb4d-41a6-b678-ac93e551f257" />


SparkyFitness es una plataforma autoalojada de seguimiento fitness compuesta por:

- Un servidor backend (API + almacenamiento de datos)
- Un frontend web
- Apps móviles nativas para iOS y Android

Almacena y gestiona los datos de salud en una infraestructura que tú controlas, sin depender de servicios de terceros.

## Funciones principales

- Seguimiento de nutrición, ejercicio, hidratación, sueño, ayuno, estado de ánimo y medidas corporales
- Definición de objetivos y registros diarios
- Gráficos interactivos e informes a largo plazo
- Varios perfiles de usuario y acceso familiar
- Temas claro y oscuro
- OIDC, TOTP, Passkey, MFA, etc.

## Cómo se compara SparkyFitness

**SparkyFitness es de código disponible, no de código abierto**: la [licencia](../../LICENSE) es no comercial y exige permiso para el uso comercial.

La mayoría de las apps hacen una sola cosa. Una buena app de nutrición cuesta entre 40 y 100 $ al año; cubrir todo lo que cubre SparkyFitness supone tres o cuatro suscripciones, por persona, y aun así sin un único informe que lo reúna todo. SparkyFitness lo hace en una sola app, gratis, para todo el hogar.

<sub>Precios de lista en EE. UU., 14 de agosto de 2026. [Desglose completo de costes →](https://codewithcj.github.io/SparkyFitness/features/comparison)</sub>

| | **SparkyFitness** | wger | MyFitnessPal | Cronometer | Hevy | Zero | Flo | Garmin Connect | Google Health |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Autoalojado, tus datos siguen siendo tuyos | ⭐ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Sin suscripción ni anuncios | ✅ | ✅ | ❌ | 🟡 | 🟡 | ❌ | ❌ | ✅ | 🟡 |
| Nutrición, fuerza, sueño, ayuno, ciclo y medicación en un solo lugar\* | ⭐ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| Historial completo e informes por rango de fechas personalizado | ✅ gratis | 🟡 | 💰 | 💰 | 💰 | 💰 | 💰 | ✅ | 💰 |
| Sincronización con wearables y plataformas de salud | ✅ más de 8 servicios | ❌ | ✅ | ⭐ | ✅ | 🟡 | 🟡 | 🟡 | ✅ |
| Compartir en familia con permisos granulares | ⭐ 7 permisos | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| Importación CSV y exportación de datos gratuita | ✅ | 🟡 | 💰 | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ❌ |
| Servidor MCP + usa tu propio LLM | ⭐ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

⭐ destacado &nbsp;•&nbsp; ✅ compatible &nbsp;•&nbsp; 🟡 parcial &nbsp;•&nbsp; 💰 solo en plan de pago &nbsp;•&nbsp; ❌ no compatible

<sub>\* Las fases del sueño, la VFC y la glucosa en sangre se importan desde tu reloj, teléfono o glucómetro. SparkyFitness las almacena, analiza y representa en gráficos, pero no las mide por sí mismo.</sub>

> **Esta tabla la ha escrito el propio proyecto que se compara, así que léela con eso en mente.** Revisada el 14 de agosto de 2026 frente a documentación oficial, repositorios y fichas de las tiendas; parte de ella ya está desactualizada. Si alguna celda es incorrecta o injusta con otro proyecto, [abre un issue](https://github.com/CodeWithCJ/SparkyFitness/issues): las correcciones que dejan a SparkyFitness *peor* parado son igual de bienvenidas.

**[Ver la comparación completa →](https://codewithcj.github.io/SparkyFitness/features/comparison)**: 17 apps de las categorías autoalojadas, de nutrición, especializadas y de ecosistemas de dispositivos, además de en qué nos supera cada una.

## Integraciones de salud y dispositivos

SparkyFitness puede sincronizar datos desde varias plataformas de salud y fitness:

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
- **Strava** (probado parcialmente)
- **COROS**
- **Norish**
- **Yazio** (usa una API no oficial)
- **Swiss Food Database**
- **Canadian Nutrient File (Health Canada)**
- **Swedish Food Agency (Livsmedelsverket)**
- **Free Exercise DB** (Github)
- **Wger**

Las integraciones sincronizan automáticamente con tu servidor SparkyFitness datos de actividad como pasos, entrenamientos y sueño, junto con métricas de salud como el peso y las medidas corporales.

## Funciones de IA opcionales (beta)

SparkyAI ofrece una interfaz conversacional para registrar datos y revisar tu progreso.

- Registra comida, ejercicio, datos corporales y pasos mediante el chat
- Sube fotos de comida para registrar las comidas automáticamente
- Conserva el historial de la conversación para hacer seguimiento

Nota: las funciones de IA están actualmente en beta.

## Instalación

Elige una de estas dos formas de ejecutar SparkyFitness:

### 1. Autoalojado

Pon en marcha un servidor SparkyFitness en minutos con Docker Compose:

```bash
# 1. Crea una carpeta nueva
mkdir sparkyfitness && cd sparkyfitness

# 2. Descarga docker-compose.yml
curl -L -o docker-compose.yml https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/docker-compose.prod.yml

# 3. Prepara tu configuración .env (elige una opción):
# Opción A (recomendada): genera un .env personalizado con claves seguras en 1 clic desde el navegador:
# 👉 https://codewithcj.github.io/SparkyFitness/install/env-generator

# Opción B: plantilla mínima: 5 valores; todo lo demás usa los valores por defecto
# que docker-compose ya aplica. Suficiente para la mayoría de instalaciones autoalojadas.
curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.simple.example

# Opción C: referencia completa: todas las variables admitidas, comentadas con su
# valor por defecto. Empieza aquí para SSO, SMTP, una base de datos externa o un proxy inverso.
# curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.example

# 4. Sustituye los marcadores (omite este paso si usaste la Opción A: el generador
# ya los rellenó). El servidor se niega a arrancar mientras sigan con su valor
# original y, de lo contrario, la base de datos se inicializaría con una contraseña publicada.
#   SPARKY_FITNESS_DB_PASSWORD        cualquier contraseña robusta
#   SPARKY_FITNESS_API_ENCRYPTION_KEY openssl rand -hex 32     (64 caracteres hex)
#   BETTER_AUTH_SECRET                openssl rand -base64 32  (44 caracteres)
#   SPARKY_FITNESS_FRONTEND_URL       la URL desde la que abrirás la app

# 5. Inicia la app
docker compose pull && docker compose up -d

# Accede a la aplicación en http://localhost:3004
```

_Nota: para ver todas las opciones de configuración, proxies inversos y métodos de instalación alternativos, visita el [sitio de documentación](https://codewithcj.github.io/SparkyFitness/)._

### 2. En la nube (para usuarios no técnicos)

Si no eres un usuario técnico y prefieres no ejecutar SparkyFitness en tu propio servidor, puedes desplegar una instancia alojada en la nube con uno de los siguientes proveedores.

<a href="https://www.pikapods.com/pods?run=sparkyfitness">
  <img src="https://www.pikapods.com/static/run-button.svg" height="70" width="150" alt="Ejecutar en PikaPods">
</a>
<br>
<a href="https://zenith.hosting/host/sparkyfitness?ref=gh">
  <img src="https://cdn.zenith.hosting/buttons/deploy-with-zenith.svg" height="70" width="150" alt="Desplegar con Zenith">
</a>


> **Nota:** son servicios independientes de terceros. Te animamos a explorar las funciones de cada proveedor para decidir cuál se adapta mejor a tus necesidades.
 

## 🎥 Videotutorial

[![Ver el vídeo](https://img.youtube.com/vi/B13IiL2DeQc/maxresdefault.jpg)](https://www.youtube.com/watch?v=B13IiL2DeQc)

Tutorial rápido de 2 minutos que muestra cómo instalar SparkyFitness (registro de actividad física autoalojado).

## Documentación

Para guías de instalación completas, opciones de configuración y documentación para desarrolladores, visita nuestro [sitio de documentación](https://codewithcj.github.io/SparkyFitness/).

### Enlaces rápidos

- **[Guía de instalación](https://codewithcj.github.io/SparkyFitness/install/docker-compose)** - Despliegue y configuración
- **[Generador interactivo de .env](https://codewithcj.github.io/SparkyFitness/install/env-generator)** - Generador de configuración `.env` en el navegador
- **[Resumen de funciones](https://codewithcj.github.io/SparkyFitness/features)** - Documentación completa de funciones
- **[Flujo de desarrollo](https://codewithcj.github.io/SparkyFitness/developer/getting-started)** - Guía para desarrolladores y proceso de contribución
- **[Información de la app para iOS](https://github.com/CodeWithCJ/SparkyFitness/wiki/Apple-Health-Integration)** e **[información de la app para Android](https://github.com/CodeWithCJ/SparkyFitness/wiki/Android-Mobile-App)**

### ¿Necesitas ayuda?

- Publica en los issues o discusiones de Github.
- Para obtener una respuesta más rápida y ayuda de otros miembros de la comunidad, **[únete a nuestro Discord](https://discord.gg/vcnMT5cPEA)**

## Historial de estrellas

<a href="https://www.star-history.com/?repos=CodeWithCJ%2FSparkyFitness&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&theme=dark&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <img alt="Gráfico del historial de estrellas" src="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
 </picture>
</a>

## Traducciones


**[Traducciones en Weblate](https://weblate.sparkyfitness.com/engage/sparkyfitness)**

<a href="http://weblate.sparkyfitness.com/engage/sparkyfitness/"><img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/svg-badge.svg" alt="Estado de la traducción"></a>



<a href="https://weblate.sparkyfitness.com/engage/sparkyfitness">
<img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/multi-auto.svg" alt="Estado de la traducción" />
</a>

## Actividad del repositorio

![Alt](https://repobeats.axiom.co/api/embed/828203d3070ff56c8873c727b6873b684c4ed399.svg "Imagen de análisis de Repobeats")

## Colaboradores

<a href="https://github.com/CodeWithCJ/SparkyFitness/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=CodeWithCJ/SparkyFitness" width="100%" alt="Colaboradores de SparkyFitness"/>
</a>

## ⚠️ Problemas conocidos / Funciones en beta ⚠️

SparkyFitness está en desarrollo activo.
Pueden producirse cambios incompatibles entre versiones.

- No se recomienda actualizar los contenedores automáticamente
- Revisa siempre las notas de la versión antes de actualizar

Las siguientes funciones están actualmente en beta y puede que no se hayan probado a fondo. Es posible que encuentres errores o funcionalidades incompletas:

- Chatbot de IA
- Acceso para familia y amigos
- Documentación de la API

_Esta es una traducción del README en inglés. Si hay alguna diferencia, la [versión en inglés](../../README.md) es la de referencia._
