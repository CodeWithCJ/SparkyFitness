
import { debug, info, warn, error, UserLoggingLevel } from '@/utils/logging';
import { apiCall } from './api'; // Import apiCall

// Function to fetch current user details from the backend
const fetchCurrentUser = async () => {
  try {
    const user = await apiCall(`/identity/user`);
    return { user };
  } catch (error) {
    console.error("Error fetching current user:", error);
    return { user: null };
  }
};

// Function to fetch family access permissions from the backend
const fetchFamilyAccessPermissions = async (userId: string) => {
  try {
    const data = await apiCall(`/users/accessible-users`);
    return data;
  } catch (error) {
    console.error("Error fetching family access permissions:", error);
    return [];
  }
};

interface AppFeature {
  id: string;
  name: string;
  description: string;
  component?: string;
  route?: string;
  permissions?: string[];
  category: 'food' | 'measurement' | 'goals' | 'reports' | 'settings' | 'ai';
}

interface DatabaseTable {
  name: string;
  description: string;
  columns: { name: string; type: string; required: boolean; description: string; }[];
  relationships: string[];
  rlsPolicies: string[];
}

interface AIContextData {
  currentFeatures: AppFeature[];
  databaseSchema: DatabaseTable[];
  userPermissions: any[];
  commonPatterns: string[];
  lastUpdated: Date;
}

class DocumentationService {
  private static instance: DocumentationService;
  private contextCache: AIContextData | null = null;
  private cacheExpiry: Date | null = null;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    // Constructor for singleton. Logging level will be passed to methods.
  }

  static getInstance(): DocumentationService {
    if (!DocumentationService.instance) {
      DocumentationService.instance = new DocumentationService();
    }
    return DocumentationService.instance;
  }

  async getAIContext(queryType?: string, loggingLevel?: UserLoggingLevel): Promise<string> {
    debug(loggingLevel, 'DocumentationService: getAIContext called with queryType:', queryType);
    const contextData = await this.getContextData(loggingLevel);
    info(loggingLevel, 'DocumentationService: Successfully retrieved context data.');
    return this.formatContextForAI(contextData, queryType, loggingLevel);
  }

  private async getContextData(loggingLevel?: UserLoggingLevel): Promise<AIContextData> {
    // Check cache first
    if (this.contextCache && this.cacheExpiry && new Date() < this.cacheExpiry) {
      info(loggingLevel, 'DocumentationService: Returning AI context from cache.');
      return this.contextCache;
    }
    info(loggingLevel, 'DocumentationService: Cache expired or not found, fetching new AI context data.');

    // Auto-detect current features
    debug(loggingLevel, 'DocumentationService: Scanning app features.');
    const features = await this.scanAppFeatures();
    info(loggingLevel, 'DocumentationService: App features scanned successfully.');

    // Get database schema info
    debug(loggingLevel, 'DocumentationService: Getting database schema.');
    const schema = await this.getDatabaseSchema();
    info(loggingLevel, 'DocumentationService: Database schema retrieved successfully.');

    // Get user permissions if authenticated
    debug(loggingLevel, 'DocumentationService: Getting user permissions.');
    const permissions = await this.getUserPermissions(loggingLevel);
    info(loggingLevel, 'DocumentationService: User permissions retrieved successfully.');

    const contextData: AIContextData = {
      currentFeatures: features,
      databaseSchema: schema,
      userPermissions: permissions,
      commonPatterns: this.getCommonPatterns(),
      lastUpdated: new Date()
    };

    // Cache the data
    this.contextCache = contextData;
    this.cacheExpiry = new Date(Date.now() + this.CACHE_DURATION);
    info(loggingLevel, 'DocumentationService: AI context data cached.');

    return contextData;
  }

  private async scanAppFeatures(): Promise<AppFeature[]> {
    // This would ideally scan your React components, but for now return known features
    return [
      {
        id: 'food-diary',
        name: 'Food Diary',
        description: 'Daily food logging with meal types (breakfast, lunch, dinner, snacks)',
        component: 'FoodDiary',
        route: '/',
        permissions: ['calorie'],
        category: 'food'
      },
      {
        id: 'food-search',
        name: 'Food Search',
        description: 'Search and add foods from database with nutrition information',
        component: 'FoodSearch',
        permissions: ['calorie'],
        category: 'food'
      },
      {
        id: 'custom-foods',
        name: 'Custom Foods',
        description: 'Create and manage custom food items with full nutrition profiles',
        component: 'CustomFoodForm',
        permissions: ['calorie'],
        category: 'food'
      },
      {
        id: 'check-in',
        name: 'Body Measurements',
        description: 'Track weight, waist, hips, neck measurements and steps',
        component: 'CheckIn',
        permissions: ['checkin'],
        category: 'measurement'
      },
      {
        id: 'custom-measurements',
        name: 'Custom Measurements',
        description: 'User-defined measurement categories with flexible tracking',
        component: 'CustomMeasurements',
        permissions: ['checkin'],
        category: 'measurement'
      },
      {
        id: 'measurements-history',
        name: 'Measurements History',
        description: 'Historical measurement data with trend visualization',
        component: 'Measurements',
        permissions: ['checkin', 'reports'],
        category: 'measurement'
      },
      {
        id: 'reports',
        name: 'Analytics Reports',
        description: 'Nutrition and measurement trends, progress tracking',
        component: 'Reports',
        permissions: ['reports'],
        category: 'reports'
      },
      {
        id: 'goals-management',
        name: 'Goals Management',
        description: 'Set and track nutrition goals (calories, macros, water)',
        component: 'GoalsSettings',
        permissions: [],
        category: 'goals'
      },
      {
        id: 'family-access',
        name: 'Family Access Control',
        description: 'Granular permission system for family member data access',
        component: 'FamilyAccessManager',
        permissions: [],
        category: 'settings'
      },
      {
        id: 'sparky-ai',
        name: 'Sparky AI Assistant',
        description: 'AI-powered nutrition assistant with food recognition and guidance',
        component: 'SparkyChat',
        permissions: [],
        category: 'ai'
      }
    ];
  }

  private async getDatabaseSchema(): Promise<DatabaseTable[]> {
    // In a real implementation, this could query Supabase for schema info
    return [
      {
        name: 'profiles',
        description: 'User profile information',
        columns: [
          { name: 'id', type: 'uuid', required: true, description: 'Primary key, references auth.users' },
          { name: 'email', type: 'text', required: false, description: 'User email address' },
          { name: 'full_name', type: 'text', required: false, description: 'User display name' }
        ],
        relationships: ['user_goals', 'food_entries', 'check_in_measurements'],
        rlsPolicies: ['Users can only access their own profile']
      },
      {
        name: 'foods',
        description: 'Master food database with nutrition information',
        columns: [
          { name: 'id', type: 'uuid', required: true, description: 'Primary key' },
          { name: 'name', type: 'text', required: true, description: 'Food name' },
          { name: 'calories', type: 'numeric', required: false, description: 'Calories per serving' },
          { name: 'protein', type: 'numeric', required: false, description: 'Protein in grams' },
          { name: 'carbs', type: 'numeric', required: false, description: 'Carbohydrates in grams' },
          { name: 'fat', type: 'numeric', required: false, description: 'Fat in grams' }
        ],
        relationships: ['food_entries', 'food_variants'],
        rlsPolicies: ['Users can access public foods and their own custom foods']
      },
      {
        name: 'food_entries',
        description: 'Daily food consumption log',
        columns: [
          { name: 'id', type: 'uuid', required: true, description: 'Primary key' },
          { name: 'user_id', type: 'uuid', required: true, description: 'Foreign key to profiles' },
          { name: 'food_id', type: 'uuid', required: true, description: 'Foreign key to foods' },
          { name: 'quantity', type: 'numeric', required: true, description: 'Amount consumed' },
          { name: 'meal_type', type: 'text', required: true, description: 'breakfast/lunch/dinner/snacks' },
          { name: 'entry_date', type: 'date', required: true, description: 'Date of consumption' }
        ],
        relationships: ['profiles', 'foods'],
        rlsPolicies: ['Users can only access their own food entries']
      }
    ];
  }

  private async getUserPermissions(loggingLevel?: UserLoggingLevel): Promise<any[]> {
    try {
      const { user } = await fetchCurrentUser();
      if (!user) {
        warn(loggingLevel, 'DocumentationService: No user found, returning empty permissions.');
        return [];
      }
      debug(loggingLevel, 'DocumentationService: User found, fetching family access permissions for user:', user.id);

      // Get family access permissions
      const familyAccess = await fetchFamilyAccessPermissions(user.id);

      info(loggingLevel, 'DocumentationService: Family access permissions retrieved:', familyAccess?.length);
      return familyAccess || [];
    } catch (err) {
      error(loggingLevel, 'DocumentationService: Error getting user permissions:', err);
      return [];
    }
  }

  private getCommonPatterns(): string[] {
    return [
      'Food logging: "I ate 2 slices of pizza" → Extract food, quantity, determine meal type',
      'Measurement: "My weight is 70kg" → Record measurement with unit conversion',
      'Goals: "Set my calorie goal to 1800" → Update user goals with timeline',
      'Progress: "How am I doing today?" → Calculate progress vs goals',
      'AI assistance: Food photo analysis → Extract foods and nutrition data'
    ];
  }

  private formatContextForAI(contextData: AIContextData, queryType?: string, loggingLevel?: UserLoggingLevel): string {
    debug(loggingLevel, 'DocumentationService: Formatting context for AI with queryType:', queryType);
    let context = `# SparkyFitness App Context\n\n`;

    context += `## App Overview\n`;
    context += `SparkyFitness is a nutrition and fitness tracking app with AI assistance.\n`;
    context += `Current features: ${contextData.currentFeatures.length} active features\n`;
    context += `Last updated: ${contextData.lastUpdated.toISOString()}\n\n`;

    // Filter features based on query type
    let relevantFeatures = contextData.currentFeatures;
    if (queryType) {
      relevantFeatures = contextData.currentFeatures.filter(f =>
        f.category === queryType ||
        f.name.toLowerCase().includes(queryType.toLowerCase()) ||
        f.description.toLowerCase().includes(queryType.toLowerCase())
      );
    }

    context += `## Available Features\n`;
    relevantFeatures.forEach(feature => {
      context += `### ${feature.name}\n`;
      context += `- Description: ${feature.description}\n`;
      context += `- Category: ${feature.category}\n`;
      if (feature.permissions && feature.permissions.length > 0) {
        context += `- Required permissions: ${feature.permissions.join(', ')}\n`;
      }
      context += `\n`;
    });

    context += `## Database Operations\n`;
    context += `Available tables for data operations:\n`;
    contextData.databaseSchema.forEach(table => {
      context += `- ${table.name}: ${table.description}\n`;
    });

    context += `\n## Common User Patterns\n`;
    contextData.commonPatterns.forEach(pattern => {
      context += `- ${pattern}\n`;
    });

    if (contextData.userPermissions.length > 0) {
      context += `\n## User Permissions\n`;
      context += `Active family access permissions: ${contextData.userPermissions.length}\n`;
    }

    return context;
  }

  // Method to clear cache when app structure changes
  invalidateCache(loggingLevel?: UserLoggingLevel): void {
    info(loggingLevel, 'DocumentationService: Invalidating AI context cache.');
    this.contextCache = null;
    this.cacheExpiry = null;
  }

  // Method to get context for specific query types
  async getFoodContext(loggingLevel?: UserLoggingLevel): Promise<string> {
    debug(loggingLevel, 'DocumentationService: getFoodContext called.');
    return this.getAIContext('food', loggingLevel);
  }

  async getMeasurementContext(loggingLevel?: UserLoggingLevel): Promise<string> {
    debug(loggingLevel, 'DocumentationService: getMeasurementContext called.');
    return this.getAIContext('measurement', loggingLevel);
  }

  async getReportsContext(loggingLevel?: UserLoggingLevel): Promise<string> {
    debug(loggingLevel, 'DocumentationService: getReportsContext called.');
    return this.getAIContext('reports', loggingLevel);
  }
}

export default DocumentationService;
