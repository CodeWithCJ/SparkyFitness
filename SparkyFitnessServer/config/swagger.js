const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SparkyFitness API',
      version: '1.0.0',
      description: 'API documentation for the SparkyFitness application, providing a comprehensive guide to all available endpoints. Have caution using the API directly, as improper use may lead to data loss or corruption.  Also note that the API is subject to change without notice due to heavy development, so always refer to the latest documentation for up-to-date information. It might have flaw and due to vite/nginx internal proxy actual end point accessed via front end URL might be different than hitting them directly on the server.',
      contact: {
        name: 'SparkyFitness Support',
      },
    },
    servers: [
      {
        url: '/api',
        description: 'Main API Server',
      },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'token',
          description: 'Authentication token is stored in a secure, HTTP-only cookie named "token". Most endpoints require this for access.',
        },
      },
      schemas: {
        Exercise: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'The unique identifier for the exercise.',
            },
            user_id: {
              type: 'string',
              format: 'uuid',
              description: 'The ID of the user who owns the exercise.',
            },
            name: {
              type: 'string',
              description: 'The name of the exercise.',
            },
            category: {
              type: 'string',
              description: 'The category of the exercise (e.g., "Strength", "Cardio").',
            },
            equipment: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'A list of equipment required for the exercise.',
            },
            muscle_groups: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'A list of muscle groups targeted by the exercise.',
            },
            description: {
              type: 'string',
              description: 'A detailed description of the exercise.',
            },
            instructions: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Step-by-step instructions for performing the exercise.',
            },
            images: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'URLs or paths to images demonstrating the exercise.',
            },
            is_public: {
              type: 'boolean',
              description: 'Indicates if the exercise is publicly available.',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the exercise was created.',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the exercise was last updated.',
            },
          },
          required: ['id', 'user_id', 'name', 'category'],
        },
      },
    },
    security: [
      {
        cookieAuth: [],
      },
    ],
    tags: [
      { name: 'Authentication & Users', description: 'Endpoints for user authentication, registration, profile management, and access control.' },
      { name: 'Food & Nutrition', description: 'Endpoints for managing food data, logging food entries, and tracking nutritional information.' },
      { name: 'Exercise & Workouts', description: 'Endpoints for managing exercises, logging workouts, and creating workout plans.' },
      { name: 'Goals', description: 'Endpoints for setting and tracking user goals for nutrition and fitness.' },
      { name: 'Check-in', description: 'Endpoints for logging and monitoring various health metrics like weight, sleep, and mood.' },
      { name: 'Integrations', description: 'Endpoints for connecting with third-party services like Garmin and Withings.' },
      { name: 'Admin & System', description: 'Endpoints for administrative tasks and system-level operations.' },
      { name: 'AI Chat', description: 'Endpoints for interacting with the AI-powered chat service.' },
      { name: 'Reports', description: 'Endpoints for generating and retrieving user reports and analytics.' },
      { name: 'Meal Planning', description: 'Endpoints for creating and managing meal plans and templates.' },
    ],
  },
  apis: ['./routes/*.js', './routes/auth/*.js', './models/*.js', './SparkyFitnessServer.js'], // Paths to files containing OpenAPI definitions
};

const specs = swaggerJsdoc(options);

module.exports = specs;
