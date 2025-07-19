# SparkyFitness - Comprehensive App Documentation

## App Overview
SparkyFitness is a comprehensive nutrition and fitness tracking application built with React, TypeScript, and Supabase. It enables users to track their daily food intake, body measurements, exercise, set goals, and analyze their progress over time.

### Core Purpose
- **Primary Goal**: Help users track and manage their nutrition and fitness journey
- **Target Users**: Individuals and families who want to monitor their health metrics
- **Key Value**: Comprehensive tracking with AI-powered assistance through Sparky Buddy

### Architecture
- **Frontend**: React 18 + TypeScript + Vite
- **UI Framework**: Tailwind CSS + shadcn/ui components
- **Backend**: Supabase (PostgreSQL + Auth + Row Level Security)
- **State Management**: React Context + TanStack Query
- **Routing**: React Router v6
- **AI Integration**: Multiple AI service providers (OpenAI, Google Gemini, Anthropic, etc.)

### User Authentication & Access Control
- **Individual Users**: Full access to their own data
- **Family Access**: Granular permission system allowing family members to access specific data types. Permissions include `calorie` (Food diary), `checkin` (Body measurements), `reports` (Analytics and trends), and `food_list` (Food database).
- **Row Level Security (RLS)**: Implemented at the database level to ensure data privacy and proper access control.

### Main Navigation Structure
The app uses a tabbed interface with the following main sections:
1. **Home (Food Diary)** - Daily nutrition tracking
2. **Meals** - Create, manage, and plan meals
3. **Meal Plans** - Schedule and view meal plans
4. **Check-In** - Body measurements and progress
5. **Measurements** - Historical measurement data and trends
6. **Reports** - Analytics, charts, and progress reports
7. **Foods** - Food database management
8. **Settings** - User preferences, goals, and configuration

### Meal Management
- **Meal Builder**: Create and customize meal templates by combining multiple food items.
- **Meal Templates**: Save and manage frequently consumed meals for quick logging.
- **Meal Planning**: Schedule meals or individual food items for specific dates, supporting single-day or range-based planning.
- **Food Diary Integration**: Log planned meals directly to the food diary, expanding them into individual food entries.

### AI Assistant Integration
- **Sparky Buddy**: AI-powered nutrition and fitness assistant
- **Capabilities**: Food recognition, nutrition analysis, meal suggestions, exercise logging, measurement logging, water intake tracking, and general question answering.
- **Meal Suggestions**: AI can suggest meals based on dietary preferences, goals, and available ingredients.
- **Image Processing**: Can analyze food photos for automatic logging.
- **Multi-Service Support**: Works with various AI providers for flexibility, configurable via user settings.
- **Chat History**: Stores conversation history with metadata for enhanced context and interaction.
