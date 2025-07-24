# SparkyFitness AI Coding Agent Instructions

## Architecture Overview

**Full-stack fitness tracking application** - self-hosted alternative to MyFitnessPal with AI-powered nutrition assistance.

- **Frontend**: React 18 + TypeScript + Vite (`src/`)
- **Backend**: Node.js/Express (`SparkyFitnessServer/`)
- **Database**: PostgreSQL with Row Level Security (RLS)
- **UI**: Tailwind CSS + shadcn/ui components
- **State**: React Context + TanStack Query
- **AI**: Multi-provider support (OpenAI, Anthropic, Google, etc.)

## Development Workflow

### Running the Application
```bash
# Frontend development server (port 8080)
npm run dev

# Backend server (port 3010)  
npm run start-backend

# Docker development (local builds)
./docker/docker-helper.sh dev up

# Docker production (DockerHub images)
./docker/docker-helper.sh prod up
```

### Key Configuration Files
- **Vite config** (`vite.config.ts`): API proxy setup (`/api` → `localhost:3010`)
- **Environment**: Root `.env` file (loaded by backend at `path.resolve(__dirname, '../.env')`)
- **Docker**: `docker/` directory contains organized Docker configuration
  - `docker-compose.dev.yml` - Local development builds with volume mounts
  - `docker-compose.prod.yml` - Production DockerHub images
  - `docker-helper.sh` - Comprehensive management script with help system
  - `nginx.conf.template` - Parameterized nginx configuration with envsubst
  - `.env.example` - Template for environment variables

### Docker Helper Script
The `docker-helper.sh` script provides easy management:
```bash
# Show all available commands
./docker/docker-helper.sh help

# Development environment
./docker/docker-helper.sh dev up     # Start all services
./docker/docker-helper.sh dev logs   # View logs
./docker/docker-helper.sh dev clean  # Clean volumes and images

# Production environment  
./docker/docker-helper.sh prod up    # Start production services
./docker/docker-helper.sh prod down  # Stop and remove containers
```

## Critical Architecture Patterns

### Repository Pattern (Backend)
All database operations use repository pattern in `SparkyFitnessServer/models/`:
```javascript
// Example: userRepository.js
const pool = require('../db/connection');

async function createUser(userId, email, hashedPassword, full_name) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Multiple related inserts in transaction
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### External Provider Integration
Modular integration system in `SparkyFitnessServer/integrations/`:
- **Food providers**: OpenFoodFacts, Nutritionix, FatSecret
- **Exercise data**: Wger integration
- **Health data**: Apple Health integration
- **Encryption**: All API keys encrypted at rest using `security/encryption.js`

### Frontend Context Providers
Key contexts in `src/contexts/`:
- **PreferencesContext**: User settings, goals, theme, AI provider config
- **ChatbotVisibilityContext**: AI assistant state management

### Database Schema Conventions
- **UUID primary keys** for all tables (`gen_random_uuid()`)
- **Audit fields**: `created_at`, `updated_at` on all tables
- **RLS policies**: Users only access their own data
- **Transaction patterns**: Multi-table operations wrapped in transactions

## AI Integration Patterns

### Multi-Provider AI Support
```javascript
// SparkyFitnessServer/ai/config.js
function getDefaultModel(serviceType) {
  switch (serviceType) {
    case 'openai': return 'gpt-4o-mini';
    case 'anthropic': return 'claude-3-5-sonnet-20241022';
    case 'google': return 'gemini-pro';
    // ...
  }
}
```

### Chat System Architecture
- **Backend**: `routes/chatRoutes.js` handles AI provider routing
- **Frontend**: `DraggableChatbotButton` component for UI
- **Storage**: Chat history with metadata in PostgreSQL
- **Capabilities**: Food logging, image analysis, exercise tracking, measurements

## Data Flow Patterns

### Meal Planning System
1. **Templates** (`meal_plan_templates`) → **Scheduled Plans** (`meal_plans`) → **Food Diary Entries** (`food_diary`)
2. Complex meal expansion logic in `mealPlanTemplateRepository.js`
3. Date-range planning support with single-day granularity

### Family Access Control
- **Granular permissions**: `calorie`, `checkin`, `reports`, `food_list`
- **RLS enforcement**: Database-level security policies
- **Access patterns**: `familyAccessRepository.js` manages relationship permissions

### External API Error Handling
Consistent error patterns across integrations:
```javascript
try {
  const response = await fetch(searchUrl, { method: 'GET' });
  if (!response.ok) {
    const errorText = await response.text();
    log('error', "API error:", errorText);
    throw new Error(`API error: ${errorText}`);
  }
  return await response.json();
} catch (error) {
  log('error', `Error with query "${query}":`, error);
  throw error;
}
```

## Development Conventions

### API Response Patterns
- **Success**: JSON data directly
- **Error**: `{ error: "message" }` with appropriate HTTP status
- **Auth**: JWT tokens in Authorization header
- **CORS**: Configured for frontend URL in environment

### Database Migration Strategy
- **Auto-migrations**: `utils/dbMigrations.js` runs on server startup
- **Version tracking**: Migrations applied based on version numbers
- **Schema changes**: Always backward compatible during development

### Component Architecture
- **shadcn/ui** for base components
- **Custom components** in `src/components/`
- **Page-level** components in `src/pages/`
- **Shared utilities** in `src/utils/`

### Environment-Specific Behavior
- **Development**: Vite proxy, hot reload, debug logging
- **Docker**: Production builds, environment variable injection
- **Database**: Connection pooling, transaction management

## Key Files for Understanding
- **Server entry**: `SparkyFitnessServer/SparkyFitnessServer.js` (route registration, middleware setup)
- **Frontend entry**: `src/App.tsx` (context providers, query client setup)
- **Documentation site**: `docs/` - Comprehensive Nuxt Content documentation (https://codewithcj.github.io/SparkyFitness)

## Documentation Structure

### Developer Documentation
The developer documentation has been consolidated into focused guides at `docs/content/3.developer/`:

1. **`1.getting-started.md`** - Complete setup, installation, and quick start guide
2. **`2.architecture.md`** - System architecture, patterns, and project structure  
3. **`3.contributing.md`** - Development workflow, guidelines, and PR process
4. **`4.database.md`** - Database schema, migrations, and operations
5. **`5.api-reference.md`** - OpenAPI specification and endpoint documentation
6. **`6.troubleshooting.md`** - Comprehensive debugging guide and common solutions

### Documentation Site Features
- **Live site**: https://codewithcj.github.io/SparkyFitness hosted on GitHub Pages
- **Technology**: Nuxt Content + Docus theme for optimal developer experience
- **Navigation**: Auto-generated navigation with numerical ordering
- **Search**: Full-text search across all documentation
- **Mobile-friendly**: Responsive design for all devices
