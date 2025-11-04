# SparkyFitness - Contexto del Proyecto

**Versión:** 0.15.8.5
**Repositorio:** https://github.com/CodeWithCJ/SparkyFitness
**Documentación:** https://codewithcj.github.io/SparkyFitness

## Índice

- [Descripción General](#descripción-general)
- [Stack Tecnológico](#stack-tecnológico)
- [Arquitectura](#arquitectura)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Base de Datos](#base-de-datos)
- [Autenticación y Seguridad](#autenticación-y-seguridad)
- [Módulos Principales](#módulos-principales)
- [API REST](#api-rest)
- [Integraciones Externas](#integraciones-externas)
- [Configuración y Variables de Entorno](#configuración-y-variables-de-entorno)
- [Desarrollo y Despliegue](#desarrollo-y-despliegue)
- [Guía para Desarrolladores](#guía-para-desarrolladores)

---

## Descripción General

SparkyFitness es una **aplicación self-hosted de seguimiento fitness** diseñada como alternativa a MyFitnessPal. Proporciona herramientas completas para:

- 🥗 **Seguimiento de Nutrición**: Registro de comidas, búsqueda de alimentos, integración con bases de datos externas
- 💪 **Registro de Ejercicio**: Seguimiento de entrenamientos, planes de ejercicio, progreso
- 📊 **Mediciones Corporales**: Peso, composición corporal, mediciones personalizadas
- 🎯 **Gestión de Objetivos**: Calorías, macros, metas de peso
- 🤖 **Coach AI (SparkyAI)**: Asistente con IA para registro natural y recomendaciones
- 🔗 **Integraciones**: Garmin, Withings, Apple Health
- 👨‍👩‍👧‍👦 **Multi-usuario**: Soporte para familias y acceso compartido

**Estado del Proyecto**: En desarrollo activo. Migrado recientemente de Supabase a PostgreSQL.

---

## Stack Tecnológico

### Backend
- **Runtime**: Node.js 20+
- **Framework**: Express.js 5.1.0
- **Lenguaje**: JavaScript (CommonJS)
- **Base de Datos**: PostgreSQL 15+
- **ORM**: Consultas SQL directas con `pg`
- **Autenticación**: JWT, Session-based (OIDC), API Keys
- **Validación**: express-validator 7.2.1
- **Seguridad**: bcrypt, AES-256-GCM encryption
- **Archivos**: multer 2.0.2
- **Tareas programadas**: node-cron 4.2.1
- **Cliente HTTP**: axios 1.10.0

**Dependencias clave**:
```json
{
  "express": "5.1.0",
  "pg": "8.16.3",
  "jsonwebtoken": "9.0.2",
  "bcrypt": "6.0.0",
  "express-session": "1.18.1",
  "connect-pg-simple": "10.0.0",
  "multer": "2.0.2",
  "node-cron": "4.2.1"
}
```

### Frontend
- **Framework**: React 18.3.1
- **Lenguaje**: TypeScript 5.2+
- **Build Tool**: Vite 7.1.7
- **Router**: React Router 6.26.2
- **UI Components**: Radix UI
- **Estilos**: Tailwind CSS 3.4.11
- **Estado**: TanStack Query 5.56.2 + Context API
- **Formularios**: react-hook-form 7.53.0 + Zod 3.23.8
- **Gráficos**: recharts 2.15.4
- **i18n**: i18next 25.6.0

**Dependencias clave**:
```json
{
  "react": "18.3.1",
  "typescript": "^5.2",
  "vite": "7.1.7",
  "@tanstack/react-query": "5.56.2",
  "react-router-dom": "6.26.2",
  "recharts": "2.15.4",
  "tailwindcss": "3.4.11"
}
```

### Mobile
- **Framework**: React Native
- **Config**: Metro bundler + Babel

### Microservicios
- **Garmin Service**: Python/FastAPI (puerto 8000)

---

## Arquitectura

### Patrón Arquitectónico

**Arquitectura de Tres Capas con Microservicios**:

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend Layer                        │
│  React SPA (TypeScript) + React Native Mobile App       │
│                 Puerto 8080 (dev)                        │
└─────────────────┬───────────────────────────────────────┘
                  │ HTTP/REST API
┌─────────────────▼───────────────────────────────────────┐
│                   Backend Layer                          │
│          Express.js REST API (Node.js)                   │
│                 Puerto 3010                              │
│                                                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Routes    │→ │  Services   │→ │ Repositories │     │
│  │ (HTTP)      │  │ (Lógica)    │  │ (Data)       │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────┬──────────────────────┬────────────────┘
                  │                       │
      ┌───────────▼──────────┐   ┌────────▼──────────┐
      │  Garmin Microservice │   │  PostgreSQL DB    │
      │  FastAPI (Python)    │   │  Row-Level        │
      │  Puerto 8000         │   │  Security (RLS)   │
      └──────────────────────┘   └───────────────────┘
```

### Capa de Seguridad

**Seguridad Multinivel**:
1. **Autenticación**: JWT + Sessions + API Keys
2. **RLS en PostgreSQL**: Seguridad a nivel de base de datos
3. **Middleware**: Validación y autorización en Express
4. **Encriptación**: AES-256-GCM para datos sensibles

### Estructura de Archivos del Backend

```
SparkyFitnessServer/
├── SparkyFitnessServer.js      # Punto de entrada principal
├── openidRoutes.js             # Rutas OpenID Connect
├── middleware/                 # Middleware de Express
│   ├── authMiddleware.js       # JWT/Session/API key auth
│   ├── checkPermissionMiddleware.js
│   └── errorHandler.js
├── routes/                     # Manejadores de rutas (36 archivos)
│   ├── authRoutes.js
│   ├── foodRoutes.js
│   ├── mealRoutes.js
│   ├── exerciseRoutes.js
│   └── ... (32 más)
├── services/                   # Lógica de negocio (29 archivos)
│   ├── authService.js
│   ├── foodCoreService.js
│   ├── mealService.js
│   └── ... (26 más)
├── models/                     # Capa de acceso a datos (33 archivos)
│   ├── userRepository.js
│   ├── food.js
│   ├── mealRepository.js
│   └── ... (30 más)
├── db/                         # Configuración de base de datos
│   ├── poolManager.js          # Gestión de pool de conexiones
│   ├── rls_policies.sql
│   └── migrations/             # 76+ archivos de migración SQL
├── integrations/               # Integraciones de terceros
│   ├── garminconnect/
│   ├── withings/
│   ├── fatsecret/
│   └── ... (7 más)
├── ai/                         # Configuración del servicio de IA
├── security/                   # Utilidades de seguridad
└── utils/                      # Funciones utilitarias
```

---

## Estructura del Proyecto

### Organización de Carpetas

```
/SparkyFitness/
├── SparkyFitnessServer/        # Backend API (Node.js/Express)
│   ├── SparkyFitnessServer.js  # Puerto 3010
│   ├── routes/                 # 36 archivos de rutas (~5,115 LOC)
│   ├── services/               # 29 archivos de servicios
│   ├── models/                 # 33 repositorios
│   └── db/migrations/          # 76+ migraciones SQL
│
├── SparkyFitnessFrontend/      # Frontend React/TypeScript
│   ├── src/
│   │   ├── main.tsx            # Punto de entrada
│   │   ├── components/         # 98 componentes
│   │   ├── pages/              # Componentes de página
│   │   ├── services/           # 48 servicios de cliente API
│   │   ├── contexts/           # Proveedores de contexto
│   │   ├── hooks/              # Hooks personalizados
│   │   └── types/              # 14 archivos de definiciones TypeScript
│   └── vite.config.ts
│
├── SparkyFitnessMobile/        # App móvil React Native
│
├── docs/                       # Sitio de documentación
│
├── docker/                     # Configuración Docker
│   ├── docker-compose.dev.yml
│   ├── docker-compose.prod.yml
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   ├── Dockerfile.garmin_microservice
│   └── nginx.conf
│
├── .env.example
└── db_schema_backup.sql
```

### Puntos de Entrada

**Backend**:
- Archivo principal: `/SparkyFitnessServer/SparkyFitnessServer.js`
- Puerto predeterminado: 3010
- Comando: `npm start` o `node SparkyFitnessServer.js`

**Frontend**:
- Archivo principal: `/SparkyFitnessFrontend/src/main.tsx`
- Puerto dev: 8080
- Comando: `npm run dev`

**Mobile**:
- Archivo principal: `/SparkyFitnessMobile/index.js`
- Comando: `npm start`

---

## Base de Datos

### Arquitectura de Base de Datos

**PostgreSQL 15+** con **Row-Level Security (RLS)**

**Sistema de Dos Usuarios**:
1. **Usuario Owner** (`SPARKY_FITNESS_DB_USER`):
   - Operaciones a nivel de sistema
   - Ejecución de migraciones
   - Sin restricciones RLS

2. **Usuario App** (`SPARKY_FITNESS_APP_DB_USER`):
   - Operaciones de usuarios
   - RLS aplicado
   - Aislamiento de datos por usuario

### Gestión del Pool de Conexiones

**Archivo**: `db/poolManager.js`

```javascript
// Dos pools de conexiones separados
const ownerPool = new Pool({ user: SPARKY_FITNESS_DB_USER });
const appPool = new Pool({ user: SPARKY_FITNESS_APP_DB_USER });

// Aplicación de RLS por usuario
async function getClient(userId) {
  const client = await appPool.connect();
  await client.query('SELECT set_user_id($1)', [userId]);
  return client;
}
```

### Esquemas de Base de Datos

1. **`public`**: Esquema principal de aplicación
2. **`auth`**: Esquema de autenticación (tabla users)
3. **`system`**: Configuración del sistema

### Tablas Principales

#### Gestión de Usuarios
- `auth.users` - Cuentas de usuario
- `user_preferences` - Configuración de usuario
- `user_api_keys` - Claves de autenticación API
- `family_access` - Control de acceso de miembros de familia

#### Alimentos y Nutrición
- `foods` - Base de datos de alimentos
- `food_variants` - Tamaños de porción/variantes
- `food_entries` - Entradas del diario de comidas
- `custom_categories` - Categorías de alimentos definidas por usuario

#### Comidas
- `meals` - Plantillas de comidas
- `meal_plan_entries` - Comidas planificadas
- `meal_plan_templates` - Plantillas semanales de comidas

#### Ejercicio
- `exercises` - Base de datos de ejercicios
- `exercise_entries` - Ejercicios registrados
- `workout_presets` - Rutinas de entrenamiento guardadas
- `workout_plan_templates` - Planes semanales de entrenamiento
- `activity_details` - Métricas de actividad detalladas

#### Mediciones
- `check_in_measurements` - Mediciones corporales
- `custom_measurements` - Tipos de medición personalizados
- `custom_categories` - Categorías de medición

#### Objetivos
- `user_goals` - Objetivos de fitness/nutrición
- `goal_presets` - Plantillas de objetivos predefinidas
- `weekly_goal_plans` - Planificación semanal de objetivos

#### IA y Chat
- `chat_history` - Conversaciones del chat con IA
- `ai_service_settings` - Configuración del servicio de IA

#### Integraciones
- `external_data_providers` - Conexiones de servicios externos (Garmin, Withings, etc.)
- `oidc_providers` - Configuraciones de proveedores OpenID Connect

#### Sistema
- `session` - Almacenamiento de sesiones Express
- `admin_activity_logs` - Log de auditoría de acciones de admin
- `global_settings` - Configuración global de aplicación
- `backup_settings` - Configuración de respaldos
- `onboarding_status` - Progreso de onboarding de usuario

### Políticas RLS (Row-Level Security)

**Archivo**: `db/rls_policies.sql`

**Principios de RLS**:
- Los usuarios solo pueden acceder a sus propios datos
- Items públicos/compartidos accesibles para todos
- Acceso familiar habilita visibilidad entre usuarios
- Override de admin para operaciones del sistema

**Aplicación**:
```sql
-- Función para establecer el ID de usuario en la sesión
CREATE OR REPLACE FUNCTION set_user_id(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_user_id', p_user_id::text, false);
END;
$$ LANGUAGE plpgsql;

-- Ejemplo de política RLS
CREATE POLICY food_entries_select ON food_entries
FOR SELECT
USING (
  user_id = current_setting('app.current_user_id')::uuid OR
  EXISTS (SELECT 1 FROM family_access WHERE family_user_id = current_setting('app.current_user_id')::uuid)
);
```

### Migraciones

**Directorio**: `db/migrations/`

**Total de Migraciones**: 76+ archivos SQL

**Migraciones Clave**:
- `20250703170640_InitialDB.sql` - Creación inicial de esquema
- `20251019013200_merged_schema_and_data.sql` - Esquema consolidado
- `20251022000000_add_onboarding_schema.sql` - Características de onboarding
- Múltiples migraciones para políticas RLS, integración Garmin/Withings

**Ejecución de Migraciones**:
```bash
# Automático al iniciar el servidor
node SparkyFitnessServer.js

# Las migraciones se aplican en orden usando poolManager con usuario owner
```

---

## Autenticación y Seguridad

### Mecanismos de Autenticación

#### 1. Autenticación JWT
**Uso**: Método principal de autenticación

```javascript
// Generación de token
const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

// Header de petición
Authorization: Bearer <jwt_token>
```

**Validación**: Middleware `authenticate()` en `middleware/authMiddleware.js`

#### 2. Autenticación Basada en Sesión (OIDC)
**Uso**: Flujos OpenID Connect

```javascript
// Configuración de sesión
app.use(session({
  store: new (require('connect-pg-simple')(session))({ pool }),
  secret: process.env.SESSION_SECRET,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 horas
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  }
}));
```

**Nombre de Cookie**: `sparky.sid`

#### 3. Autenticación con API Key
**Uso**: Acceso programático

```javascript
// Generación de API key
POST /auth/user/generate-api-key
Body: { "description": "Mi aplicación" }

// Header de petición
Authorization: Bearer <api_key>
```

**Almacenamiento**: Tabla `user_api_keys` con encriptación AES-256-GCM

### Middleware de Autenticación

**Archivo**: `middleware/authMiddleware.js`

```javascript
// Verificar JWT, sesión o API key
async function authenticate(req, res, next) {
  // 1. Verificar JWT token
  // 2. Verificar sesión de OIDC
  // 3. Verificar API key
  // 4. Establecer req.userId
}

// Verificar rol de admin
function isAdmin(req, res, next) {
  // Verificar req.user.role === 'admin'
}

// Verificar permiso específico
function authorize(permission) {
  return (req, res, next) => {
    // Verificar que el usuario tiene el permiso
  };
}
```

### Middleware de Permisos

**Archivo**: `middleware/checkPermissionMiddleware.js`

```javascript
function checkPermissionMiddleware(permission) {
  // 'diary': Requerido para entradas de alimentos/ejercicio
  // 'checkin': Requerido para mediciones
  // Verifica acceso familiar si el usuario accede a datos de otro usuario
}
```

### Seguridad de Contraseñas

**Hash**: bcrypt con salt rounds
```javascript
const hashedPassword = await bcrypt.hash(password, 10);
const isValid = await bcrypt.compare(password, hashedPassword);
```

### Encriptación de Datos Sensibles

**Archivo**: `security/encryption.js`

**Algoritmo**: AES-256-GCM

```javascript
const { encrypt, decrypt } = require('./security/encryption');

// Encriptar API keys
const encryptedKey = encrypt(apiKey);

// Desencriptar para uso
const decryptedKey = decrypt(encryptedKey);
```

**Variable de Entorno**: `SPARKY_FITNESS_API_ENCRYPTION_KEY` (64 caracteres hex)

### OpenID Connect (OIDC)

**Características**:
- Múltiples proveedores OIDC soportados
- Configuración dinámica de proveedores
- Almacenamiento en tabla `oidc_providers`
- Gestión a través del panel de admin

**Archivo de Rutas**: `openidRoutes.js`

**Flujo**:
1. Usuario selecciona proveedor OIDC
2. Redirección a proveedor para autenticación
3. Callback con código de autorización
4. Intercambio de token y creación de sesión
5. Autenticación mediante sesión

### Configuración CORS

```javascript
app.use(cors({
  origin: process.env.SPARKY_FITNESS_FRONTEND_URL,
  credentials: true
}));
```

---

## Módulos Principales

### 1. Seguimiento de Nutrición

**Propósito**: Registrar comidas diarias y rastrear nutrición

**Componentes**:
- Base de datos de alimentos (personalizada + integraciones)
- Entradas del diario de comidas
- Escaneo de código de barras
- Análisis nutricional

**Archivos Clave**:
- Routes: `routes/foodRoutes.js`, `routes/foodEntryRoutes.js`
- Services: `services/foodCoreService.js`
- Models: `models/food.js`, `models/foodEntry.js`

**Integraciones**: FatSecret, Nutritionix, Open Food Facts, Mealie

**Endpoints Principales**:
```
POST   /foods                       # Crear alimento personalizado
GET    /foods/search                # Buscar alimentos
POST   /foods/food-entries          # Registrar entrada de comida
GET    /foods/food-entries/:date    # Obtener diario del día
GET    /foods/fatsecret/search      # Buscar en FatSecret
GET    /foods/nutritionix/search    # Buscar en Nutritionix
GET    /foods/openfoodfacts/barcode/:barcode  # Escaneo de código de barras
```

### 2. Planificación de Comidas

**Propósito**: Planificar comidas con anticipación

**Componentes**:
- Plantillas de comidas
- Planes semanales de comidas
- Plantillas de planes de comidas
- Registrar comidas planificadas en el diario

**Archivos Clave**:
- Routes: `routes/mealRoutes.js`, `routes/mealPlanTemplateRoutes.js`
- Services: `services/mealService.js`
- Models: `models/mealRepository.js`

**Endpoints Principales**:
```
POST   /meals                           # Crear plantilla de comida
GET    /meals                           # Obtener plantillas
POST   /meals/plan                      # Crear entrada de plan de comidas
GET    /meals/plan?startDate=&endDate=  # Obtener plan de comidas
POST   /meals/plan/:id/log-to-diary     # Registrar comida en diario
```

### 3. Registro de Ejercicio

**Propósito**: Rastrear entrenamientos y actividad física

**Componentes**:
- Base de datos de ejercicios
- Entradas de ejercicios
- Presets de entrenamiento
- Plantillas de planes de entrenamiento
- Detalles de actividad (series, repeticiones, peso, distancia, frecuencia cardíaca)

**Archivos Clave**:
- Routes: `routes/exerciseRoutes.js`, `routes/exerciseEntryRoutes.js`
- Services: `services/exerciseService.js`
- Models: `models/exercise.js`, `models/exerciseEntry.js`

**Integración**: Free Exercise DB, WGER

**Endpoints Principales**:
```
GET    /exercises                        # Obtener ejercicios
POST   /exercises                        # Crear ejercicio personalizado
POST   /exercise-entries                 # Registrar ejercicio
GET    /exercise-entries/by-date?selectedDate=  # Obtener entradas
GET    /exercise-entries/history/:exerciseId    # Historial de ejercicio
POST   /exercise-entries/from-preset     # Registrar desde preset
```

### 4. Mediciones Corporales

**Propósito**: Rastrear métricas corporales a lo largo del tiempo

**Componentes**:
- Seguimiento de peso
- Composición corporal (cuello, cintura, caderas)
- Tipos de medición personalizados
- Gráficos de progreso

**Archivos Clave**:
- Routes: `routes/measurementRoutes.js`, `routes/waterContainerRoutes.js`
- Services: `services/measurementService.js`
- Models: `models/measurementRepository.js`

**Endpoints Principales**:
```
POST   /measurements/check-in            # Crear/actualizar mediciones
GET    /measurements/check-in/:date      # Obtener mediciones
POST   /measurements/custom-entries      # Medición personalizada
GET    /measurements/custom-categories   # Categorías personalizadas
POST   /measurements/water-intake        # Registrar ingesta de agua
```

### 5. Seguimiento de Ingesta de Agua

**Propósito**: Monitorear hidratación diaria

**Componentes**:
- Registro de agua
- Contenedores de agua
- Objetivos de hidratación

**Endpoints Principales**:
```
POST   /measurements/water-intake        # Registrar agua
GET    /measurements/water-intake/:date  # Obtener ingesta
POST   /water-containers                 # Crear contenedor
GET    /water-containers/primary         # Obtener contenedor principal
```

### 6. Gestión de Objetivos

**Propósito**: Establecer y rastrear objetivos de fitness

**Componentes**:
- Objetivos de calorías
- Objetivos de macronutrientes
- Objetivos de peso
- Presets de objetivos
- Planes semanales de objetivos

**Archivos Clave**:
- Routes: `routes/goalRoutes.js`, `routes/goalPresetRoutes.js`, `routes/weeklyGoalPlanRoutes.js`
- Services: `services/goalService.js`
- Models: `models/goalRepository.js`

**Endpoints Principales**:
```
GET    /goals?selectedDate=              # Obtener objetivos del usuario
POST   /goals/manage-timeline            # Gestionar línea de tiempo de objetivos
GET    /goal-presets                     # Obtener presets
POST   /weekly-goal-plans                # Crear plan semanal
```

### 7. Coach de Nutrición con IA (SparkyAI)

**Propósito**: Asistente interactivo con IA para registro y orientación

**Componentes**:
- Registro de alimentos en lenguaje natural
- Reconocimiento de imágenes de alimentos
- Registro de ejercicio vía chat
- Historial de chat
- Recomendaciones personalizadas

**Archivos Clave**:
- Routes: `routes/chatRoutes.js`
- Services: `services/chatService.js`
- Models: `models/chatRepository.js`
- Config: `ai/config.js`

**Estado**: Característica Beta

**Endpoints Principales**:
```
POST   /chat                             # Enviar mensaje al chat
GET    /chat/sparky-chat-history         # Obtener historial
POST   /chat/clear-all-history           # Limpiar historial
GET    /chat/ai-service-settings         # Configuración de IA
```

**Proveedores de IA Soportados**:
- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude)
- Google (Gemini)
- Ollama (local)
- OpenRouter

### 8. Integraciones de Dispositivos

**Propósito**: Sincronizar datos de wearables y apps de salud

#### Integración Garmin

**Microservicio**: Python/FastAPI (puerto 8000)

**Archivos Clave**:
- Routes: `routes/garminRoutes.js`
- Integration: `integrations/garminconnect/`

**Endpoints**:
```
POST   /garmin/login                     # Login directo Garmin
POST   /garmin/sync/health_and_wellness  # Sincronizar datos de salud
POST   /garmin/sync/activities_and_workouts  # Sincronizar actividades
GET    /garmin/status                    # Estado de conexión
POST   /garmin/unlink                    # Desvincular cuenta
```

**Datos Sincronizados**:
- Pasos diarios
- Frecuencia cardíaca
- Sueño
- Estrés
- Actividades/Entrenamientos
- Peso
- Hidratación
- Presión arterial

#### Integración Withings

**Tipo**: OAuth 2.0

**Archivos Clave**:
- Routes: `routes/withingsRoutes.js`
- Integration: `integrations/withings/`

**Endpoints**:
```
GET    /withings/authorize               # Iniciar flujo OAuth
POST   /withings/callback                # Callback OAuth
POST   /withings/sync                    # Sincronización manual
GET    /withings/status                  # Estado de conexión
POST   /withings/disconnect              # Desconectar cuenta
```

**Datos Sincronizados**:
- Peso
- Composición corporal (grasa, músculo, agua)
- Presión arterial
- Frecuencia cardíaca

#### Integración Apple Health

**Estado**: Beta

**Archivo**: `integrations/healthData/`

### 9. Multi-usuario y Acceso Familiar

**Propósito**: Seguimiento fitness del hogar

**Componentes**:
- Perfiles de usuario
- Cambio de perfil
- Concesión de acceso a miembros de familia
- Alimentos/comidas compartidas

**Estado**: Característica Beta

**Archivos Clave**:
- Routes: `routes/authRoutes.js`
- Models: `models/userRepository.js`
- Middleware: `middleware/checkPermissionMiddleware.js`

**Tabla**: `family_access`

**Permisos**:
- `diary`: Acceso a entradas de alimentos/ejercicio
- `checkin`: Acceso a mediciones
- `full`: Acceso completo

**Endpoints**:
```
GET    /auth/users/accessible-users      # Obtener usuarios accesibles
POST   /auth/family-access               # Conceder acceso familiar
GET    /auth/access/check-family-access  # Verificar acceso
```

### 10. Reportes y Analíticas

**Propósito**: Visualizar progreso y tendencias

**Componentes**:
- Resúmenes de nutrición
- Tendencias de mediciones corporales
- Gráficos interactivos
- Rangos de fechas personalizados

**Archivos Clave**:
- Routes: `routes/reportRoutes.js`
- Services: `services/reportService.js`
- Models: `models/reportRepository.js`

**Endpoints**:
```
GET    /reports?startDate=&endDate=      # Obtener datos de reportes
GET    /reports/mini-nutrition-trends    # Tendencias mini
GET    /reports/nutrition-trends-with-goals  # Tendencias con objetivos
GET    /reports/exercise-dashboard       # Dashboard de ejercicio
```

### 11. Panel de Administración

**Propósito**: Administración del sistema

**Componentes**:
- Gestión de usuarios
- Configuración OIDC
- Configuración global
- Respaldos de base de datos
- Registro de actividad

**Archivos Clave**:
- Routes: `routes/adminRoutes.js`, `routes/globalSettingsRoutes.js`, `routes/oidcSettingsRoutes.js`, `routes/backupRoutes.js`
- Middleware: `middleware/authMiddleware.js` (isAdmin)

**Endpoints** (Requieren rol admin):
```
GET    /admin/users                      # Obtener todos los usuarios
DELETE /admin/users/:userId              # Eliminar usuario
PUT    /admin/users/:userId/role         # Actualizar rol
GET    /global-settings                  # Configuración global
POST   /oidc-settings                    # Crear proveedor OIDC
POST   /backup/manual                    # Respaldo manual
```

### 12. Internacionalización (i18n)

**Propósito**: Soporte multi-idioma

**Idiomas**: 20+ idiomas soportados

**Implementación**: i18next, react-i18next

**Archivo**: `SparkyFitnessFrontend/src/i18n.ts`

**Idiomas Soportados**:
- Inglés (en)
- Español (es)
- Francés (fr)
- Alemán (de)
- Italiano (it)
- Portugués (pt)
- Holandés (nl)
- Ruso (ru)
- Japonés (ja)
- Chino (zh)
- Y más...

### 13. Temas

**Propósito**: Apariencia UI personalizable

**Modos**: Tema Claro/Oscuro

**Implementación**: next-themes, Tailwind CSS

### 14. Onboarding

**Propósito**: Guiar nuevos usuarios en la configuración

**Componentes**:
- Asistente de configuración
- Configuración de objetivos
- Selección de preferencias

**Archivos Clave**:
- Routes: `routes/onboardingRoutes.js`
- Models: Tabla `onboarding_status`

**Endpoints**:
```
POST   /onboarding                       # Enviar datos de onboarding
GET    /onboarding/status                # Verificar estado
POST   /onboarding/reset                 # Reiniciar onboarding
```

---

## API REST

### Convenciones Generales

**Base URL**: `http://localhost:3010`

**Formato de Respuesta**: JSON

**Autenticación**:
- Header: `Authorization: Bearer <token_or_api_key>`
- Session cookie: `sparky.sid`

**Códigos de Estado HTTP**:
- `200 OK` - Éxito
- `201 Created` - Recurso creado
- `400 Bad Request` - Datos inválidos
- `401 Unauthorized` - No autenticado
- `403 Forbidden` - Sin permiso
- `404 Not Found` - Recurso no encontrado
- `500 Internal Server Error` - Error del servidor

### Organización de Endpoints

Total de **330+ endpoints** organizados en 36 archivos de rutas.

### Grupos de Endpoints Principales

#### Autenticación y Usuarios (`/auth`)
25 endpoints para login, registro, gestión de perfiles, API keys

#### Gestión de Alimentos (`/foods`)
30+ endpoints para CRUD de alimentos, búsqueda, integraciones externas

#### Entradas del Diario de Comidas (`/foods/food-entries`)
10 endpoints para registrar y gestionar comidas diarias

#### Gestión de Comidas (`/meals`)
20+ endpoints para plantillas de comidas y planificación

#### Gestión de Ejercicios (`/exercises`)
25+ endpoints para CRUD de ejercicios, búsqueda, integraciones

#### Entradas de Ejercicio (`/exercise-entries`)
10 endpoints para registrar entrenamientos

#### Objetivos y Planes (`/goals`, `/goal-presets`, `/weekly-goal-plans`)
15+ endpoints para gestión de objetivos

#### Mediciones y Salud (`/measurements`)
35+ endpoints para mediciones corporales, agua, métricas personalizadas

#### Integraciones Externas (`/garmin`, `/withings`, `/external-providers`)
20+ endpoints para sincronización de dispositivos

#### Reportes y Analíticas (`/reports`)
10+ endpoints para visualización de datos y tendencias

#### Administración (`/admin`, `/global-settings`, `/oidc-settings`, `/backup`)
20+ endpoints para administración del sistema

#### Chat con IA (`/chat`)
10 endpoints para SparkyAI

#### Utilidades (`/health`, `/version`)
5+ endpoints para estado y versión del sistema

### Ejemplos de Uso de API

#### Autenticación

**Login**:
```http
POST /auth/login
Content-Type: application/json

{
  "email": "usuario@ejemplo.com",
  "password": "contraseña123"
}

Response:
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "usuario@ejemplo.com",
    "full_name": "Usuario Ejemplo"
  }
}
```

**Obtener Usuario Actual**:
```http
GET /auth/user
Authorization: Bearer <token>

Response:
{
  "id": "uuid",
  "email": "usuario@ejemplo.com",
  "full_name": "Usuario Ejemplo",
  "role": "user"
}
```

#### Alimentos y Nutrición

**Buscar Alimentos**:
```http
GET /foods/search?name=manzana&limit=10
Authorization: Bearer <token>

Response:
{
  "foods": [
    {
      "id": "uuid",
      "name": "Manzana Roja",
      "calories": 95,
      "protein": 0.5,
      "carbs": 25,
      "fat": 0.3,
      "is_public": true
    }
  ]
}
```

**Registrar Entrada de Comida**:
```http
POST /foods/food-entries
Authorization: Bearer <token>
Content-Type: application/json

{
  "food_id": "uuid",
  "serving_qty": 1,
  "meal_type": "breakfast",
  "entry_date": "2025-11-04"
}

Response:
{
  "id": "uuid",
  "food_id": "uuid",
  "serving_qty": 1,
  "meal_type": "breakfast",
  "entry_date": "2025-11-04",
  "total_calories": 95
}
```

**Obtener Diario del Día**:
```http
GET /foods/food-entries?selectedDate=2025-11-04
Authorization: Bearer <token>

Response:
{
  "entries": [
    {
      "id": "uuid",
      "food_name": "Manzana Roja",
      "meal_type": "breakfast",
      "calories": 95,
      ...
    }
  ],
  "totals": {
    "calories": 2000,
    "protein": 150,
    "carbs": 200,
    "fat": 65
  }
}
```

#### Ejercicio

**Buscar Ejercicios**:
```http
GET /exercises/search?searchTerm=sentadilla
Authorization: Bearer <token>

Response:
{
  "exercises": [
    {
      "id": "uuid",
      "name": "Sentadilla con Barra",
      "muscle_group": "legs",
      "equipment": "barbell"
    }
  ]
}
```

**Registrar Ejercicio**:
```http
POST /exercise-entries
Authorization: Bearer <token>
Content-Type: application/json

{
  "exercise_id": "uuid",
  "entry_date": "2025-11-04",
  "details": [
    {
      "set_number": 1,
      "reps": 10,
      "weight": 100,
      "weight_unit": "kg"
    },
    {
      "set_number": 2,
      "reps": 10,
      "weight": 100,
      "weight_unit": "kg"
    }
  ]
}
```

#### Mediciones

**Registrar Peso**:
```http
POST /measurements/check-in
Authorization: Bearer <token>
Content-Type: application/json

{
  "entry_date": "2025-11-04",
  "weight": 75.5,
  "weight_unit": "kg"
}
```

**Registrar Ingesta de Agua**:
```http
POST /measurements/water-intake
Authorization: Bearer <token>
Content-Type: application/json

{
  "entry_date": "2025-11-04",
  "change_drinks": 2,
  "container_id": "uuid"
}
```

#### Chat con IA

**Enviar Mensaje a SparkyAI**:
```http
POST /chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "messages": [
    {
      "role": "user",
      "content": "Registra 2 manzanas y 1 plátano para el desayuno"
    }
  ],
  "action": "food_logging"
}

Response:
{
  "response": "He registrado 2 manzanas (190 cal) y 1 plátano (105 cal) en tu desayuno.",
  "logged_items": [...]
}
```

#### Reportes

**Obtener Resumen de Nutrición**:
```http
GET /reports?startDate=2025-11-01&endDate=2025-11-04
Authorization: Bearer <token>

Response:
{
  "daily_summaries": [...],
  "averages": {
    "calories": 2100,
    "protein": 140,
    "carbs": 230,
    "fat": 70
  },
  "trends": {...}
}
```

### Manejo de Errores

**Formato de Error Estándar**:
```json
{
  "error": "Mensaje de error legible",
  "code": "ERROR_CODE",
  "details": {...}
}
```

**Ejemplos**:
```json
// 401 Unauthorized
{
  "error": "Invalid or expired token"
}

// 400 Bad Request
{
  "error": "Validation failed",
  "details": {
    "email": "Invalid email format",
    "password": "Password must be at least 8 characters"
  }
}

// 404 Not Found
{
  "error": "Food not found"
}
```

---

## Integraciones Externas

### Bases de Datos de Alimentos

#### FatSecret
**Tipo**: API REST
**Archivo**: `integrations/fatsecret/`
**Configuración**: Requiere `client_id` y `client_secret` del proveedor externo
**Endpoints**:
- `GET /foods/fatsecret/search` - Buscar alimentos
- `GET /foods/fatsecret/nutrients` - Obtener información nutricional

#### Nutritionix
**Tipo**: API REST
**Archivo**: `integrations/nutritionix/`
**Configuración**: Requiere `app_id` y `app_key`
**Endpoints**:
- `GET /foods/nutritionix/search` - Buscar alimentos
- `GET /foods/nutritionix/nutrients` - Análisis nutricional
- `GET /foods/nutritionix/item` - Obtener item de marca

#### Open Food Facts
**Tipo**: API pública
**Archivo**: `integrations/openfoodfacts/`
**Configuración**: Sin autenticación requerida
**Endpoints**:
- `GET /foods/openfoodfacts/search` - Buscar alimentos
- `GET /foods/openfoodfacts/barcode/:barcode` - Buscar por código de barras

#### Mealie
**Tipo**: Instancia self-hosted
**Archivo**: `integrations/mealie/`
**Configuración**: URL base y API token
**Endpoints**:
- `GET /foods/mealie/search` - Buscar recetas
- `GET /foods/mealie/details` - Obtener detalles de receta

### Bases de Datos de Ejercicios

#### Free Exercise DB
**Tipo**: API pública
**Archivo**: `integrations/freeexercisedb/`
**Endpoints**:
- `GET /freeexercisedb/search` - Buscar ejercicios
- `POST /freeexercisedb/add` - Agregar ejercicio a usuario

#### WGER
**Tipo**: API pública
**Archivo**: `integrations/wger/`
**Endpoints**:
- `GET /exercises/search-external?providerType=wger` - Buscar ejercicios

### Dispositivos Wearables

#### Garmin Connect
**Tipo**: Microservicio Python/FastAPI
**Puerto**: 8000
**Archivo**: `integrations/garminconnect/`
**Autenticación**: Credenciales de cuenta Garmin

**Datos Sincronizados**:
- Actividades y entrenamientos
- Datos de salud y bienestar (pasos, HR, sueño, estrés)
- Peso
- Hidratación
- Presión arterial

**Sincronización Automática**: Tarea cron cada hora + 2:00 AM diario

#### Withings
**Tipo**: OAuth 2.0
**Archivo**: `integrations/withings/`
**Configuración**: `client_id`, `client_secret`, callback URL

**Datos Sincronizados**:
- Peso
- Composición corporal
- Presión arterial
- Frecuencia cardíaca

**Sincronización Automática**: Tarea cron cada hora

### Configuración de Proveedores Externos

**Tabla**: `external_data_providers`

**Almacenamiento de Credenciales**: API keys encriptadas con AES-256-GCM

**Gestión**:
```http
GET    /external-providers               # Listar proveedores
POST   /external-providers               # Agregar proveedor
PUT    /external-providers/:id           # Actualizar proveedor
DELETE /external-providers/:id           # Eliminar proveedor
```

---

## Configuración y Variables de Entorno

### Archivo de Configuración

**Ubicación**: `.env` (usar `.env.example` como plantilla)

### Variables de Entorno Principales

#### Base de Datos

```bash
# Nombre de la base de datos
SPARKY_FITNESS_DB_NAME=sparkyfitness

# Usuario owner (operaciones del sistema)
SPARKY_FITNESS_DB_USER=sparkyfitness_owner
SPARKY_FITNESS_DB_PASSWORD=contraseña_segura_owner

# Usuario app (operaciones de usuarios con RLS)
SPARKY_FITNESS_APP_DB_USER=sparkyfitness_app
SPARKY_FITNESS_APP_DB_PASSWORD=contraseña_segura_app

# Configuración de conexión
SPARKY_FITNESS_DB_HOST=localhost
SPARKY_FITNESS_DB_PORT=5432
```

#### Servidor

```bash
# Host y puerto del servidor
SPARKY_FITNESS_SERVER_HOST=localhost
SPARKY_FITNESS_SERVER_PORT=3010

# URL del frontend para CORS
SPARKY_FITNESS_FRONTEND_URL=http://localhost:8080

# Ambiente
NODE_ENV=development

# Zona horaria
TZ=America/Mexico_City

# Nivel de logging (INFO, DEBUG, WARN, ERROR)
SPARKY_FITNESS_LOG_LEVEL=INFO
```

#### Seguridad

```bash
# Clave de encriptación (64 caracteres hex)
# Generar con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SPARKY_FITNESS_API_ENCRYPTION_KEY=64_caracteres_hex

# Secreto JWT
JWT_SECRET=secreto_jwt_muy_seguro

# Forzar login con email (deshabilitar OIDC)
SPARKY_FITNESS_FORCE_EMAIL_LOGIN=false
```

#### Administración

```bash
# Email de admin (auto-grant privilegios admin)
SPARKY_FITNESS_ADMIN_EMAIL=admin@ejemplo.com

# Deshabilitar registro de nuevos usuarios
SPARKY_FITNESS_DISABLE_SIGNUP=false
```

#### Email (Restablecimiento de Contraseña)

```bash
# Configuración SMTP
SPARKY_FITNESS_EMAIL_HOST=smtp.gmail.com
SPARKY_FITNESS_EMAIL_PORT=587
SPARKY_FITNESS_EMAIL_SECURE=true
SPARKY_FITNESS_EMAIL_USER=tu_email@gmail.com
SPARKY_FITNESS_EMAIL_PASS=contraseña_aplicacion
SPARKY_FITNESS_EMAIL_FROM=noreply@sparkyfitness.com
```

#### Integraciones

```bash
# Microservicio Garmin
GARMIN_MICROSERVICE_URL=http://localhost:8000
GARMIN_SERVICE_PORT=8000
GARMIN_SERVICE_IS_CN=false
```

### Generación de Claves de Encriptación

```bash
# Generar clave de encriptación (32 bytes = 64 caracteres hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generar secreto JWT
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

---

## Desarrollo y Despliegue

### Requisitos del Sistema

**Backend**:
- Node.js 20+
- PostgreSQL 15+
- npm 10+

**Frontend**:
- Node.js 20+
- npm 10+

**Opcional**:
- Docker 20+
- Docker Compose 2.0+

### Configuración de Desarrollo

#### 1. Clonar Repositorio

```bash
git clone https://github.com/CodeWithCJ/SparkyFitness.git
cd SparkyFitness
```

#### 2. Configurar Base de Datos PostgreSQL

```bash
# Instalar PostgreSQL (Debian/Ubuntu)
sudo apt install postgresql postgresql-contrib

# Crear usuarios de base de datos
sudo -u postgres psql
```

```sql
-- Crear usuario owner
CREATE USER sparkyfitness_owner WITH PASSWORD 'contraseña_segura';
CREATE DATABASE sparkyfitness OWNER sparkyfitness_owner;

-- Crear usuario app
CREATE USER sparkyfitness_app WITH PASSWORD 'contraseña_segura_app';
GRANT CONNECT ON DATABASE sparkyfitness TO sparkyfitness_app;

-- Salir
\q
```

#### 3. Configurar Variables de Entorno

```bash
# Copiar archivo de ejemplo
cp .env.example .env

# Editar .env con tus valores
nano .env
```

#### 4. Instalar Backend

```bash
cd SparkyFitnessServer
npm install

# Ejecutar migraciones automáticamente al iniciar
npm start

# O ejecutar manualmente
node SparkyFitnessServer.js
```

El servidor ejecutará las migraciones automáticamente al iniciar.

#### 5. Instalar Frontend

```bash
cd ../SparkyFitnessFrontend
npm install

# Modo desarrollo
npm run dev

# Acceder en http://localhost:8080
```

#### 6. (Opcional) Microservicio Garmin

```bash
cd ../docker
docker-compose -f docker-compose.dev.yml up garmin-service
```

### Despliegue con Docker (Recomendado)

#### Producción

```bash
# Copiar archivo de configuración
cp docker/.env.example .env

# Editar .env con valores de producción
nano .env

# Iniciar servicios
./docker/docker-helper.sh prod up

# Acceder en http://localhost:3004
```

**Servicios incluidos**:
- Frontend (Nginx) - Puerto 3004
- Backend (Node.js) - Puerto 3010
- Base de Datos (PostgreSQL) - Puerto 5432
- Garmin Service (FastAPI) - Puerto 8000

#### Desarrollo

```bash
# Copiar archivo de configuración
cp docker/.env.example .env

# Iniciar servicios de desarrollo
./docker/docker-helper.sh dev up

# Acceder en http://localhost:8080
```

### Scripts Útiles

```bash
# Backend
npm start              # Iniciar servidor
npm run dev            # Modo desarrollo con nodemon
npm test               # Ejecutar tests

# Frontend
npm run dev            # Servidor de desarrollo
npm run build          # Build de producción
npm run preview        # Previsualizar build

# Docker
./docker/docker-helper.sh dev up      # Desarrollo
./docker/docker-helper.sh prod up     # Producción
./docker/docker-helper.sh dev down    # Detener desarrollo
./docker/docker-helper.sh prod logs   # Ver logs
```

### Tareas Programadas (Cron Jobs)

**Implementación**: node-cron

**Ubicación**: `SparkyFitnessServer.js` (líneas 322-431)

**Tareas**:
1. **Respaldos Diarios**: 2:00 AM diario
2. **Sincronización Withings**: Cada hora
3. **Sincronización Garmin**: Cada hora + 2:00 AM diario
4. **Retención de Respaldos**: Política de 7 días

```javascript
// Ejemplo de configuración cron
const cron = require('node-cron');

// Respaldo diario a las 2 AM
cron.schedule('0 2 * * *', async () => {
  console.log('Ejecutando respaldo automático...');
  await performBackup();
});

// Sincronización Garmin cada hora
cron.schedule('0 * * * *', async () => {
  console.log('Sincronizando datos de Garmin...');
  await syncGarminData();
});
```

### Respaldos

#### Respaldo Manual

```bash
# Via API
curl -X POST http://localhost:3010/backup/manual \
  -H "Authorization: Bearer <admin_token>"

# Via PostgreSQL
pg_dump -U sparkyfitness_owner sparkyfitness > backup.sql
```

#### Restauración

```bash
# Via API (subir archivo)
curl -X POST http://localhost:3010/backup/restore \
  -H "Authorization: Bearer <admin_token>" \
  -F "backupFile=@backup.sql"

# Via PostgreSQL
psql -U sparkyfitness_owner sparkyfitness < backup.sql
```

#### Configuración de Respaldos

```http
POST /backup/settings
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "backupEnabled": true,
  "backupDays": ["0", "1", "2", "3", "4", "5", "6"],
  "backupTime": "02:00",
  "retentionDays": 7
}
```

### Actualización de la Aplicación

**⚠️ IMPORTANTE**: Revise las notas de la versión antes de actualizar. Pueden ocurrir cambios que rompan compatibilidad.

```bash
# 1. Respaldar base de datos
pg_dump -U sparkyfitness_owner sparkyfitness > backup_$(date +%Y%m%d).sql

# 2. Obtener últimos cambios
git pull origin main

# 3. Actualizar dependencias backend
cd SparkyFitnessServer
npm install

# 4. Actualizar dependencias frontend
cd ../SparkyFitnessFrontend
npm install

# 5. Reiniciar servicios
# Las migraciones se ejecutarán automáticamente al iniciar
```

### Monitoreo y Logs

**Niveles de Log**: INFO, DEBUG, WARN, ERROR

**Configuración**: `SPARKY_FITNESS_LOG_LEVEL` en .env

**Ubicación de Logs**: Consola (stdout/stderr)

**Archivo**: `config/logging.js`

```javascript
// Ejemplo de logging
const log = require('./config/logging');

log.info('Usuario autenticado', { userId: user.id });
log.error('Error al procesar petición', { error: err.message });
log.debug('Consulta SQL ejecutada', { query, params });
```

---

## Guía para Desarrolladores

### Agregar un Nuevo Endpoint

#### 1. Crear Archivo de Ruta

```javascript
// routes/miNuevaRuta.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const miServicio = require('../services/miServicio');

// GET /mi-ruta
router.get('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.userId;
    const resultado = await miServicio.obtenerDatos(userId);
    res.json(resultado);
  } catch (error) {
    next(error);
  }
});

// POST /mi-ruta
router.post('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.userId;
    const datos = req.body;
    const resultado = await miServicio.crearDato(userId, datos);
    res.status(201).json(resultado);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
```

#### 2. Crear Servicio

```javascript
// services/miServicio.js
const miRepositorio = require('../models/miRepositorio');

async function obtenerDatos(userId) {
  return await miRepositorio.findByUserId(userId);
}

async function crearDato(userId, datos) {
  // Validación
  if (!datos.nombre) {
    throw new Error('El nombre es requerido');
  }

  return await miRepositorio.create(userId, datos);
}

module.exports = {
  obtenerDatos,
  crearDato
};
```

#### 3. Crear Repositorio

```javascript
// models/miRepositorio.js
const poolManager = require('../db/poolManager');

async function findByUserId(userId) {
  const client = await poolManager.getClient(userId);
  try {
    const result = await client.query(
      'SELECT * FROM mi_tabla WHERE user_id = $1',
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function create(userId, datos) {
  const client = await poolManager.getClient(userId);
  try {
    const result = await client.query(
      'INSERT INTO mi_tabla (user_id, nombre) VALUES ($1, $2) RETURNING *',
      [userId, datos.nombre]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

module.exports = {
  findByUserId,
  create
};
```

#### 4. Registrar Ruta en Servidor

```javascript
// SparkyFitnessServer.js
const miNuevaRuta = require('./routes/miNuevaRuta');

// ...

app.use('/mi-ruta', miNuevaRuta);
```

#### 5. Crear Migración de Base de Datos

```bash
# Crear archivo de migración
touch db/migrations/$(date +%Y%m%d%H%M%S)_crear_mi_tabla.sql
```

```sql
-- db/migrations/20251104120000_crear_mi_tabla.sql

-- Crear tabla
CREATE TABLE IF NOT EXISTS mi_tabla (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX idx_mi_tabla_user_id ON mi_tabla(user_id);

-- Política RLS
ALTER TABLE mi_tabla ENABLE ROW LEVEL SECURITY;

CREATE POLICY mi_tabla_select ON mi_tabla
FOR SELECT
USING (user_id = current_setting('app.current_user_id')::uuid);

CREATE POLICY mi_tabla_insert ON mi_tabla
FOR INSERT
WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

CREATE POLICY mi_tabla_update ON mi_tabla
FOR UPDATE
USING (user_id = current_setting('app.current_user_id')::uuid);

CREATE POLICY mi_tabla_delete ON mi_tabla
FOR DELETE
USING (user_id = current_setting('app.current_user_id')::uuid);

-- Permisos
GRANT SELECT, INSERT, UPDATE, DELETE ON mi_tabla TO sparkyfitness_app;
```

### Agregar Middleware Personalizado

```javascript
// middleware/miMiddleware.js
function miMiddleware(req, res, next) {
  // Tu lógica
  if (!algunaCondicion) {
    return res.status(400).json({ error: 'Condición no cumplida' });
  }

  // Continuar
  next();
}

module.exports = { miMiddleware };
```

**Uso**:
```javascript
const { miMiddleware } = require('../middleware/miMiddleware');
router.get('/', authenticate, miMiddleware, async (req, res) => {
  // ...
});
```

### Trabajar con RLS

**Siempre usar poolManager.getClient(userId)** para operaciones de usuarios:

```javascript
// ✅ CORRECTO - RLS aplicado
const client = await poolManager.getClient(userId);
try {
  const result = await client.query('SELECT * FROM foods WHERE user_id = $1', [userId]);
  // RLS asegura que solo se devuelven los alimentos del usuario
} finally {
  client.release();
}

// ❌ INCORRECTO - RLS no aplicado
const pool = require('../db/connection');
const result = await pool.query('SELECT * FROM foods WHERE user_id = $1', [userId]);
// Posible fuga de datos si la consulta está mal escrita
```

### Agregar Integración Externa

#### 1. Crear Carpeta de Integración

```bash
mkdir integrations/mi_integracion
touch integrations/mi_integracion/index.js
```

#### 2. Implementar Cliente

```javascript
// integrations/mi_integracion/index.js
const axios = require('axios');
const { decrypt } = require('../../security/encryption');

class MiIntegracionClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.mi-integracion.com';
  }

  async buscar(query) {
    const response = await axios.get(`${this.baseUrl}/search`, {
      params: { q: query },
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });
    return response.data;
  }
}

async function crearCliente(providerId, userId) {
  // Obtener configuración del proveedor desde la BD
  const provider = await obtenerProveedor(providerId, userId);
  const apiKey = decrypt(provider.encrypted_api_key);
  return new MiIntegracionClient(apiKey);
}

module.exports = { crearCliente };
```

#### 3. Crear Rutas de Integración

```javascript
// routes/miIntegracionRoutes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { crearCliente } = require('../integrations/mi_integracion');

router.get('/buscar', authenticate, async (req, res, next) => {
  try {
    const { query } = req.query;
    const providerId = req.headers['x-provider-id'];

    const cliente = await crearCliente(providerId, req.userId);
    const resultados = await cliente.buscar(query);

    res.json(resultados);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
```

### Testing

**Configuración**: Jest (configurado pero tests mínimos)

**Crear Tests**:

```javascript
// tests/miServicio.test.js
const miServicio = require('../services/miServicio');

describe('MiServicio', () => {
  test('obtenerDatos devuelve datos del usuario', async () => {
    const userId = 'test-uuid';
    const resultado = await miServicio.obtenerDatos(userId);
    expect(resultado).toBeDefined();
  });
});
```

**Ejecutar Tests**:
```bash
cd SparkyFitnessServer
npm test
```

### Mejores Prácticas

#### Seguridad
- ✅ Siempre validar entrada del usuario
- ✅ Usar poolManager.getClient(userId) para RLS
- ✅ Nunca almacenar contraseñas en texto plano
- ✅ Encriptar API keys con AES-256-GCM
- ✅ Sanitizar queries SQL (usar parámetros $1, $2)
- ✅ Aplicar autenticación en todas las rutas protegidas

#### Base de Datos
- ✅ Usar transacciones para múltiples operaciones
- ✅ Siempre liberar clientes con client.release()
- ✅ Crear índices para columnas frecuentemente consultadas
- ✅ Usar políticas RLS para aislamiento de datos

#### Código
- ✅ Separar responsabilidades (routes → services → repositories)
- ✅ Manejar errores apropiadamente con try/catch
- ✅ Usar async/await en lugar de callbacks
- ✅ Documentar funciones complejas con JSDoc
- ✅ Usar nombres descriptivos de variables

#### API
- ✅ Seguir convenciones RESTful
- ✅ Devolver códigos de estado HTTP apropiados
- ✅ Formato de error consistente
- ✅ Validar parámetros con express-validator
- ✅ Documentar endpoints

### Estructura de Ejemplo Completa

```
feature/
├── migrations/
│   └── 20251104000000_create_feature.sql
├── routes/
│   └── featureRoutes.js
├── services/
│   └── featureService.js
├── models/
│   └── featureRepository.js
├── integrations/
│   └── external_service/
│       └── index.js
└── tests/
    └── feature.test.js
```

### Recursos Adicionales

**Documentación**:
- [Documentación Oficial](https://codewithcj.github.io/SparkyFitness)
- [Repositorio GitHub](https://github.com/CodeWithCJ/SparkyFitness)
- [Issues](https://github.com/CodeWithCJ/SparkyFitness/issues)

**Tecnologías**:
- [Express.js Docs](https://expressjs.com/)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [React Docs](https://react.dev/)
- [TypeScript Docs](https://www.typescriptlang.org/docs/)

---

## Notas Importantes

### Estado del Proyecto

**Desarrollo Activo**: El proyecto está en desarrollo activo con actualizaciones frecuentes.

**Migración Reciente**: Migrado recientemente de Supabase a PostgreSQL self-hosted. Pueden ocurrir cambios que rompan compatibilidad.

**Auto-Actualización**: NO recomendada. Revise las notas de la versión antes de actualizar.

### Características Beta

Las siguientes características están en beta y pueden ser inestables:
- 🤖 Chatbot con IA (SparkyAI)
- 👥 Soporte multi-usuario
- 👨‍👩‍👧‍👦 Acceso familiar y amigos
- 🍎 Integración Apple Health Data

### Problemas Conocidos

- Algunos tests no están implementados
- Documentación API no disponible como OpenAPI/Swagger
- Características beta pueden tener errores

### Contribuciones

Para contribuir al proyecto:
1. Fork del repositorio
2. Crear rama de feature (`git checkout -b feature/mi-caracteristica`)
3. Commit de cambios (`git commit -m 'Agregar mi característica'`)
4. Push a la rama (`git push origin feature/mi-caracteristica`)
5. Abrir Pull Request

---

**Última actualización**: 2025-11-04
**Versión del documento**: 1.0
