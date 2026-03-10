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
            description: {
              type: 'string',
              description: 'A detailed description of the exercise.',
            },
            equipment: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'A list of equipment required for the exercise.',
            },
            primary_muscles: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Primary muscle groups targeted by the exercise.',
            },
            secondary_muscles: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Secondary muscle groups targeted by the exercise.',
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
            source: {
              type: 'string',
              description: 'The origin of the exercise data (e.g., "Manual", "Wger", "FreeExerciseDB").',
            },
            source_id: {
              type: 'string',
              description: 'The identifier from the external source, if applicable.',
            },
            force: {
              type: 'string',
              nullable: true,
              description: 'The force type of the exercise (e.g., "push", "pull", "static").',
            },
            level: {
              type: 'string',
              nullable: true,
              description: 'The difficulty level (e.g., "beginner", "intermediate", "expert").',
            },
            mechanic: {
              type: 'string',
              nullable: true,
              description: 'The mechanic type (e.g., "compound", "isolation").',
            },
            calories_per_hour: {
              type: 'number',
              nullable: true,
              description: 'Estimated calories burned per hour for this exercise.',
            },
            is_custom: {
              type: 'boolean',
              description: 'Whether the exercise was created by the user.',
            },
            shared_with_public: {
              type: 'boolean',
              description: 'Indicates if the exercise is publicly available.',
            },
            is_quick_exercise: {
              type: 'boolean',
              description: 'Whether the exercise is a quick-log exercise (no sets/reps tracking).',
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
        Food: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'The unique identifier for the food.',
            },
            user_id: {
              type: 'string',
              format: 'uuid',
              description: 'The ID of the user who owns the food.',
            },
            name: {
              type: 'string',
              description: 'The name of the food.',
            },
            default_variant: {
              $ref: '#/components/schemas/FoodVariant',
              description: 'The default nutritional variant for this food.',
            },
            is_public: {
              type: 'boolean',
              description: 'Indicates if the food is publicly available.',
            },
            brand: {
              type: 'string',
              description: 'The brand name of the food.',
            },
            barcode: {
              type: 'string',
              description: 'The barcode of the food.',
            },
            provider_type: {
              type: 'string',
              description: 'The type of provider (e.g., "mealie").',
            },
            provider_external_id: {
              type: 'string',
              description: 'The external ID from the provider.',
            },
            is_custom: {
              type: 'boolean',
              description: 'Indicates if the food is a custom entry created by the user.',
            },
            shared_with_public: {
              type: 'boolean',
              description: 'Indicates if the food is shared with the public.',
            },
            is_quick_food: {
              type: 'boolean',
              description: 'Indicates if the food is marked for quick access.',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the food was created.',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the food was last updated.',
            },
          },
          required: ['id', 'user_id', 'name'],
        },
        FoodVariant: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'The unique identifier for the food variant.',
            },
            food_id: {
              type: 'string',
              format: 'uuid',
              description: 'The ID of the food this variant belongs to.',
            },
            serving_size: {
              type: 'string',
              description: 'The serving size of the variant (e.g., "1 cup").',
            },
            serving_weight: {
              type: 'number',
              description: 'The weight of the serving in grams.',
            },
            data: {
              type: 'object',
              description: 'Nutritional data for this specific variant.',
            },
          },
          required: ['id', 'food_id', 'serving_size', 'serving_weight', 'data'],
        },
        FoodEntryMeal: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'The unique identifier for the food entry meal.',
            },
            user_id: {
              type: 'string',
              format: 'uuid',
              description: 'The ID of the user who owns the food entry meal.',
            },
            meal_template_id: {
              type: 'string',
              format: 'uuid',
              description: 'The ID of the meal template used for this entry, if any.',
            },
            meal_type: {
              type: 'string',
              description: 'The type of meal (e.g., "Breakfast", "Lunch", "Dinner").',
            },
            meal_type_id: {
              type: 'string',
              format: 'uuid',
              description: 'The ID of the meal type.',
            },
            entry_date: {
              type: 'string',
              format: 'date',
              description: 'The date of the food entry meal (YYYY-MM-DD).',
            },
            name: {
              type: 'string',
              description: 'The name of the food entry meal.',
            },
            description: {
              type: 'string',
              description: 'A description of the food entry meal.',
            },
            foods: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  food_id: {
                    type: 'string',
                    format: 'uuid',
                    description: 'The ID of the food item.',
                  },
                  quantity: {
                    type: 'number',
                    description: 'The quantity of the food item.',
                  },
                  unit: {
                    type: 'string',
                    description: 'The unit of measurement for the food item.',
                  },
                },
                required: ['food_id', 'quantity', 'unit'],
              },
              description: 'A list of food items included in the meal.',
            },
            quantity: {
              type: 'number',
              description: 'The total quantity of the meal.',
            },
            unit: {
              type: 'string',
              description: 'The unit of measurement for the meal.',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the food entry meal was created.',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the food entry meal was last updated.',
            },
          },
          required: ['user_id', 'meal_type', 'entry_date', 'name', 'foods', 'quantity', 'unit'],
        },
        MealDayPreset: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'The unique identifier for the meal day preset.',
            },
            user_id: {
              type: 'string',
              format: 'uuid',
              description: 'The ID of the user who owns the meal day preset.',
            },
            name: {
              type: 'string',
              description: 'The name of the meal day preset.',
            },
            description: {
              type: 'string',
              description: 'A description of the meal day preset.',
            },
            meals: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  meal_type: {
                    type: 'string',
                    description: 'The type of meal (e.g., "Breakfast", "Lunch").',
                  },
                  food_ids: {
                    type: 'array',
                    items: {
                      type: 'string',
                      format: 'uuid',
                    },
                    description: 'List of food IDs included in this meal.',
                  },
                },
                required: ['meal_type', 'food_ids'],
              },
              description: 'The meals included in this preset.',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the meal day preset was created.',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the meal day preset was last updated.',
            },
          },
          required: ['user_id', 'name', 'meals'],
        },
        MealPlanTemplate: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'The unique identifier for the meal plan template.',
            },
            user_id: {
              type: 'string',
              format: 'uuid',
              description: 'The ID of the user who owns the meal plan template.',
            },
            name: {
              type: 'string',
              description: 'The name of the meal plan template.',
            },
            description: {
              type: 'string',
              description: 'A description of the meal plan template.',
            },
            day_presets: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  day_of_week: {
                    type: 'string',
                    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
                    description: 'The day of the week for this preset.',
                  },
                  meal_day_preset_id: {
                    type: 'string',
                    format: 'uuid',
                    description: 'The ID of the meal day preset to use for this day.',
                  },
                },
                required: ['day_of_week', 'meal_day_preset_id'],
              },
              description: 'The meal day presets assigned to each day of the week.',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the meal plan template was created.',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the meal plan template was last updated.',
            },
          },
          required: ['user_id', 'name', 'day_presets'],
        },
        MealType: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'The unique identifier for the meal type.',
            },
            user_id: {
              type: 'string',
              format: 'uuid',
              description: 'The ID of the user who owns the meal type (null for system defaults).',
            },
            name: {
              type: 'string',
              description: 'The name of the meal type (e.g., "Breakfast", "Lunch").',
            },
            sort_order: {
              type: 'integer',
              description: 'The order in which meal types should be displayed.',
            },
            is_system_default: {
              type: 'boolean',
              description: 'Indicates if this is a system default meal type.',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the meal type was created.',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the meal type was last updated.',
            },
          },
          required: ['id', 'name', 'sort_order', 'is_system_default'],
        },
        CustomNutrient: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'The unique identifier for the custom nutrient.',
            },
            user_id: {
              type: 'string',
              format: 'uuid',
              description: 'The ID of the user who owns the custom nutrient.',
            },
            name: {
              type: 'string',
              description: 'The name of the custom nutrient.',
            },
            unit: {
              type: 'string',
              description: 'The unit of measurement for the custom nutrient.',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the custom nutrient was created.',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the custom nutrient was last updated.',
            },
          },
          required: ['id', 'user_id', 'name', 'unit'],
        },
        NutrientDisplayPreference: {
          type: 'object',
          properties: {
            user_id: {
              type: 'string',
              format: 'uuid',
              description: 'The ID of the user who owns the preference.',
            },
            view_group: {
              type: 'string',
              description: 'The group for which the preference applies (e.g., "daily", "meal").',
            },
            platform: {
              type: 'string',
              description: 'The platform for which the preference applies (e.g., "web", "mobile").',
            },
            visible_nutrients: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'An array of nutrient names that should be visible.',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the preference was created.',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the preference was last updated.',
            },
          },
          required: ['user_id', 'view_group', 'platform', 'visible_nutrients'],
        },
        ExerciseEntry: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'The unique identifier for the exercise entry.',
            },
            user_id: {
              type: 'string',
              format: 'uuid',
              description: 'The ID of the user who owns the exercise entry.',
            },
            exercise_id: {
              type: 'string',
              format: 'uuid',
              description: 'The ID of the exercise performed.',
            },
            exercise_name: {
              type: 'string',
              description: 'Snapshot of the exercise name at time of logging.',
            },
            calories_per_hour: {
              type: 'number',
              nullable: true,
              description: 'Snapshot of the exercise calories per hour.',
            },
            category: {
              type: 'string',
              nullable: true,
              description: 'Snapshot of the exercise category.',
            },
            duration_minutes: {
              type: 'number',
              description: 'The duration of the exercise in minutes.',
            },
            calories_burned: {
              type: 'number',
              description: 'The number of calories burned during the exercise.',
            },
            entry_date: {
              type: 'string',
              format: 'date',
              description: 'The date of the exercise entry (YYYY-MM-DD).',
            },
            notes: {
              type: 'string',
              description: 'Any additional notes for the exercise entry.',
            },
            sets: {
              type: 'array',
              items: { $ref: '#/components/schemas/WorkoutSet' },
              description: 'Details of sets performed.',
            },
            workout_plan_assignment_id: {
              type: 'string',
              format: 'uuid',
              nullable: true,
              description: 'The ID of the workout plan assignment this entry belongs to.',
            },
            exercise_preset_entry_id: {
              type: 'string',
              format: 'uuid',
              nullable: true,
              description: 'The ID of the exercise preset entry this belongs to.',
            },
            image_url: {
              type: 'string',
              nullable: true,
              description: 'URL to an image associated with the exercise entry.',
            },
            distance: {
              type: 'number',
              nullable: true,
              description: 'Distance covered for cardio exercises.',
            },
            avg_heart_rate: {
              type: 'number',
              nullable: true,
              description: 'Average heart rate during the exercise.',
            },
            sort_order: {
              type: 'integer',
              nullable: true,
              description: 'Ordering of the entry within a day.',
            },
            source: {
              type: 'string',
              nullable: true,
              description: 'Snapshot of the exercise source provider.',
            },
            source_id: {
              type: 'string',
              nullable: true,
              description: 'Snapshot of the exercise source identifier.',
            },
            force: {
              type: 'string',
              nullable: true,
              description: 'Snapshot of the exercise force type.',
            },
            level: {
              type: 'string',
              nullable: true,
              description: 'Snapshot of the exercise difficulty level.',
            },
            mechanic: {
              type: 'string',
              nullable: true,
              description: 'Snapshot of the exercise mechanic type.',
            },
            equipment: {
              type: 'array',
              items: { type: 'string' },
              nullable: true,
              description: 'Snapshot of the exercise equipment.',
            },
            primary_muscles: {
              type: 'array',
              items: { type: 'string' },
              nullable: true,
              description: 'Snapshot of the exercise primary muscles.',
            },
            secondary_muscles: {
              type: 'array',
              items: { type: 'string' },
              nullable: true,
              description: 'Snapshot of the exercise secondary muscles.',
            },
            instructions: {
              type: 'array',
              items: { type: 'string' },
              nullable: true,
              description: 'Snapshot of the exercise instructions.',
            },
            images: {
              type: 'array',
              items: { type: 'string' },
              nullable: true,
              description: 'Snapshot of the exercise image URLs.',
            },
            activity_details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  exercise_entry_id: { type: 'string', format: 'uuid', nullable: true },
                  exercise_preset_entry_id: { type: 'string', format: 'uuid', nullable: true },
                  provider_name: { type: 'string', description: 'The provider name (e.g., "garmin", "strava").' },
                  detail_type: { type: 'string', description: 'The type of detail (e.g., "activity_summary").' },
                  detail_data: { type: 'object', description: 'Provider-specific activity data.' },
                  created_at: { type: 'string', format: 'date-time' },
                  updated_at: { type: 'string', format: 'date-time' },
                },
              },
              description: 'Activity details from external providers.',
            },
            created_by_user_id: {
              type: 'string',
              format: 'uuid',
              nullable: true,
              description: 'The ID of the user who created this entry.',
            },
            updated_by_user_id: {
              type: 'string',
              format: 'uuid',
              nullable: true,
              description: 'The ID of the user who last updated this entry.',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the exercise entry was created.',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the exercise entry was last updated.',
            },
          },
          required: ['user_id', 'exercise_id', 'entry_date'],
        },
        ExercisePresetEntry: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'The unique identifier for the exercise preset entry.',
            },
            user_id: {
              type: 'string',
              format: 'uuid',
              description: 'The ID of the user who owns the entry.',
            },
            workout_preset_id: {
              type: 'string',
              format: 'uuid',
              description: 'The ID of the workout preset this entry originated from.',
            },
            name: {
              type: 'string',
              description: 'The name of the logged workout.',
            },
            description: {
              type: 'string',
              description: 'A description of the logged workout.',
            },
            entry_date: {
              type: 'string',
              format: 'date',
              description: 'The date the workout was logged (YYYY-MM-DD).',
            },
            notes: {
              type: 'string',
              description: 'Additional notes for the logged workout.',
            },
            source: {
              type: 'string',
              description: 'The source of the entry (e.g., "manual", "Garmin Connect").',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the entry was created.',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the entry was last updated.',
            },
            created_by_user_id: {
              type: 'string',
              format: 'uuid',
              nullable: true,
              description: 'The ID of the user who created this entry.',
            },
          },
          required: ['user_id', 'workout_preset_id', 'name', 'entry_date'],
        },
        FastingLog: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'The unique identifier for the fasting log.',
            },
            user_id: {
              type: 'string',
              format: 'uuid',
              description: 'The ID of the user who owns the fasting log.',
            },
            start_time: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the fast started.',
            },
            target_end_time: {
              type: 'string',
              format: 'date-time',
              description: 'The scheduled or target end time for the fast.',
            },
            end_time: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the fast ended (null for active fasts).',
            },
            duration_minutes: {
              type: 'integer',
              description: 'The total duration of the fast in minutes.',
            },
            fasting_type: {
              type: 'string',
              description: 'The type of fast (e.g., "16:8", "20:4", "OMAD").',
            },
            status: {
              type: 'string',
              enum: ['ACTIVE', 'COMPLETED', 'CANCELLED'],
              description: 'The status of the fasting log.',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the log was created.',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the log was last updated.',
            },
          },
          required: ['id', 'user_id', 'start_time', 'fasting_type', 'status'],
        },
        WorkoutPreset: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            is_public: { type: 'boolean' },
            exercises: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  exercise_id: { type: 'string', format: 'uuid' },
                  exercise_name: { type: 'string' },
                  image_url: { type: 'string', nullable: true },
                  sort_order: { type: 'integer', description: 'Ordering of the exercise within the preset.' },
                  sets: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/WorkoutSet' }
                  }
                }
              }
            },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          },
          required: ['id', 'user_id', 'name']
        },
        WorkoutSet: {
          type: 'object',
          properties: {
            id: { type: 'integer', description: 'Internal ID of the set' },
            set_number: { type: 'integer' },
            set_type: { type: 'string', description: 'e.g., "Normal", "Warmup", "Dropset"' },
            reps: { type: 'integer', nullable: true },
            weight: { type: 'number', nullable: true },
            duration: { type: 'integer', nullable: true, description: 'Duration in seconds' },
            rest_time: { type: 'integer', nullable: true, description: 'Rest time in seconds' },
            notes: { type: 'string', nullable: true },
            rpe: { type: 'number', nullable: true, description: 'Rate of Perceived Exertion (exercise entry sets only).' }
          },
          required: ['set_number', 'set_type']
        },
        WorkoutPlanTemplate: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            plan_name: { type: 'string' },
            description: { type: 'string' },
            start_date: { type: 'string', format: 'date-time' },
            end_date: { type: 'string', format: 'date-time', nullable: true },
            is_active: { type: 'boolean' },
            assignments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  day_of_week: { type: 'integer', description: '0-6 (Sunday-Saturday)' },
                  workout_preset_id: { type: 'string', format: 'uuid', nullable: true },
                  workout_preset_name: { type: 'string', nullable: true },
                  exercise_id: { type: 'string', format: 'uuid', nullable: true },
                  exercise_name: { type: 'string', nullable: true },
                  sort_order: { type: 'integer', description: 'Ordering of the assignment within the plan.' },
                  sets: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/WorkoutSet' }
                  }
                }
              }
            },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          },
          required: ['id', 'user_id', 'plan_name', 'start_date', 'is_active']
        },
        WeeklyGoalPlan: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            plan_name: { type: 'string' },
            start_date: { type: 'string', format: 'date' },
            end_date: { type: 'string', format: 'date', nullable: true },
            is_active: { type: 'boolean' },
            monday_preset_id: { type: 'string', format: 'uuid', nullable: true },
            tuesday_preset_id: { type: 'string', format: 'uuid', nullable: true },
            wednesday_preset_id: { type: 'string', format: 'uuid', nullable: true },
            thursday_preset_id: { type: 'string', format: 'uuid', nullable: true },
            friday_preset_id: { type: 'string', format: 'uuid', nullable: true },
            saturday_preset_id: { type: 'string', format: 'uuid', nullable: true },
            sunday_preset_id: { type: 'string', format: 'uuid', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          },
          required: ['id', 'user_id', 'plan_name', 'start_date', 'is_active']
        },
        MoodEntry: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            mood_value: { type: 'integer', description: 'Mood value (e.g., 1-5 or 0-10)' },
            notes: { type: 'string', nullable: true },
            entry_date: { type: 'string', format: 'date' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          },
          required: ['mood_value', 'entry_date']
        },
        SleepEntry: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            entry_date: { type: 'string', format: 'date' },
            bedtime: { type: 'string', format: 'date-time' },
            wake_time: { type: 'string', format: 'date-time' },
            duration_in_seconds: { type: 'integer' },
            time_asleep_in_seconds: { type: 'integer', nullable: true },
            source: { type: 'string' },
            sleep_score: { type: 'number', nullable: true },
            deep_sleep_seconds: { type: 'integer', nullable: true },
            light_sleep_seconds: { type: 'integer', nullable: true },
            rem_sleep_seconds: { type: 'integer', nullable: true },
            awake_sleep_seconds: { type: 'integer', nullable: true },
            average_spo2_value: { type: 'number', nullable: true },
            lowest_spo2_value: { type: 'number', nullable: true },
            highest_spo2_value: { type: 'number', nullable: true },
            average_respiration_value: { type: 'number', nullable: true },
            lowest_respiration_value: { type: 'number', nullable: true },
            highest_respiration_value: { type: 'number', nullable: true },
            awake_count: { type: 'integer', nullable: true },
            avg_sleep_stress: { type: 'number', nullable: true },
            restless_moments_count: { type: 'integer', nullable: true },
            avg_overnight_hrv: { type: 'number', nullable: true },
            body_battery_change: { type: 'number', nullable: true },
            resting_heart_rate: { type: 'number', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          },
          required: ['entry_date', 'bedtime', 'wake_time', 'duration_in_seconds']
        },
        SleepAnalytics: {
          type: 'object',
          properties: {
            date: { type: 'string', format: 'date' },
            totalSleepDuration: { type: 'integer' },
            timeAsleep: { type: 'integer' },
            sleepScore: { type: 'number' },
            earliestBedtime: { type: 'string', format: 'date-time', nullable: true },
            latestWakeTime: { type: 'string', format: 'date-time', nullable: true },
            sleepEfficiency: { type: 'number' },
            sleepDebt: { type: 'number' },
            stagePercentages: {
              type: 'object',
              additionalProperties: { type: 'number' }
            },
            awakePeriods: { type: 'integer' },
            totalAwakeDuration: { type: 'integer' }
          }
        },
        WaterIntake: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            entry_date: { type: 'string', format: 'date' },
            water_ml: { type: 'number', description: 'Water intake in milliliters.' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          },
          required: ['entry_date', 'water_ml']
        },
        WaterContainer: {
          type: 'object',
          properties: {
            id: { type: 'integer', description: 'Auto-incrementing primary key.' },
            user_id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            volume: { type: 'number', description: 'Volume in specified unit.' },
            unit: { type: 'string', description: 'Unit of measurement (e.g., ml, oz, cup).' },
            is_primary: { type: 'boolean' },
            servings_per_container: { type: 'integer' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          },
          required: ['name', 'volume', 'unit']
        },
        CheckInMeasurement: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            entry_date: { type: 'string', format: 'date' },
            weight: { type: 'number', nullable: true },
            body_fat_percentage: { type: 'number', nullable: true },
            neck: { type: 'number', nullable: true, description: 'Neck circumference.' },
            waist: { type: 'number', nullable: true, description: 'Waist circumference.' },
            hips: { type: 'number', nullable: true, description: 'Hip circumference.' },
            steps: { type: 'integer', nullable: true },
            height: { type: 'number', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          },
          required: ['entry_date']
        },
        CustomMeasurementCategory: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            name: { type: 'string', description: 'Stable identifier name for the category.' },
            display_name: { type: 'string', nullable: true, description: 'User-facing display name.' },
            measurement_type: { type: 'string' },
            frequency: { type: 'string', enum: ['All', 'Daily', 'Hourly'], description: 'How often entries can be recorded.' },
            data_type: { type: 'string', enum: ['numeric', 'boolean', 'text'] },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          },
          required: ['name', 'measurement_type', 'frequency']
        },
        CustomMeasurementEntry: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            category_id: { type: 'string', format: 'uuid' },
            value: { type: 'string', description: 'Value as string, castable based on category data_type' },
            entry_date: { type: 'string', format: 'date' },
            entry_hour: { type: 'integer', nullable: true },
            entry_timestamp: { type: 'string', format: 'date-time', nullable: true },
            notes: { type: 'string', nullable: true },
            source: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          },
          required: ['category_id', 'value', 'entry_date']
        },
        UserGoal: {
          type: 'object',
          properties: {
            goal_date: { type: 'string', format: 'date', nullable: true, description: 'The date this goal applies to. Null represents the default goal.' },
            calories: { type: 'number', description: 'Daily calorie target.' },
            protein: { type: 'number', description: 'Protein target in grams.' },
            carbs: { type: 'number', description: 'Carbohydrate target in grams.' },
            fat: { type: 'number', description: 'Fat target in grams.' },
            water_goal_ml: { type: 'number', description: 'Daily water intake goal in milliliters.' },
            saturated_fat: { type: 'number', nullable: true, description: 'Saturated fat target in grams.' },
            polyunsaturated_fat: { type: 'number', nullable: true, description: 'Polyunsaturated fat target in grams.' },
            monounsaturated_fat: { type: 'number', nullable: true, description: 'Monounsaturated fat target in grams.' },
            trans_fat: { type: 'number', nullable: true, description: 'Trans fat target in grams.' },
            cholesterol: { type: 'number', nullable: true, description: 'Cholesterol target in milligrams.' },
            sodium: { type: 'number', nullable: true, description: 'Sodium target in milligrams.' },
            potassium: { type: 'number', nullable: true, description: 'Potassium target in milligrams.' },
            dietary_fiber: { type: 'number', nullable: true, description: 'Dietary fiber target in grams.' },
            sugars: { type: 'number', nullable: true, description: 'Sugar target in grams.' },
            vitamin_a: { type: 'number', nullable: true, description: 'Vitamin A target in micrograms.' },
            vitamin_c: { type: 'number', nullable: true, description: 'Vitamin C target in milligrams.' },
            calcium: { type: 'number', nullable: true, description: 'Calcium target in milligrams.' },
            iron: { type: 'number', nullable: true, description: 'Iron target in milligrams.' },
            protein_percentage: { type: 'number', nullable: true, description: 'Protein as a percentage of total calories.' },
            carbs_percentage: { type: 'number', nullable: true, description: 'Carbs as a percentage of total calories.' },
            fat_percentage: { type: 'number', nullable: true, description: 'Fat as a percentage of total calories.' },
            breakfast_percentage: { type: 'number', nullable: true, description: 'Percentage of daily calories allocated to breakfast.' },
            lunch_percentage: { type: 'number', nullable: true, description: 'Percentage of daily calories allocated to lunch.' },
            dinner_percentage: { type: 'number', nullable: true, description: 'Percentage of daily calories allocated to dinner.' },
            snacks_percentage: { type: 'number', nullable: true, description: 'Percentage of daily calories allocated to snacks.' },
            target_exercise_calories_burned: { type: 'number', nullable: true, description: 'Daily exercise calorie burn target.' },
            target_exercise_duration_minutes: { type: 'integer', nullable: true, description: 'Daily exercise duration target in minutes.' },
            custom_nutrients: { type: 'object', nullable: true, description: 'JSONB object of custom nutrient targets keyed by nutrient definition ID.' }
          }
        },
        GoalPreset: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            preset_name: { type: 'string', description: 'Display name for the preset.' },
            calories: { type: 'number', description: 'Daily calorie target.' },
            protein: { type: 'number', description: 'Protein target in grams.' },
            carbs: { type: 'number', description: 'Carbohydrate target in grams.' },
            fat: { type: 'number', description: 'Fat target in grams.' },
            water_goal_ml: { type: 'number', description: 'Daily water intake goal in milliliters.' },
            saturated_fat: { type: 'number', nullable: true },
            polyunsaturated_fat: { type: 'number', nullable: true },
            monounsaturated_fat: { type: 'number', nullable: true },
            trans_fat: { type: 'number', nullable: true },
            cholesterol: { type: 'number', nullable: true },
            sodium: { type: 'number', nullable: true },
            potassium: { type: 'number', nullable: true },
            dietary_fiber: { type: 'number', nullable: true },
            sugars: { type: 'number', nullable: true },
            vitamin_a: { type: 'number', nullable: true },
            vitamin_c: { type: 'number', nullable: true },
            calcium: { type: 'number', nullable: true },
            iron: { type: 'number', nullable: true },
            protein_percentage: { type: 'number', nullable: true, description: 'Protein as a percentage of total calories.' },
            carbs_percentage: { type: 'number', nullable: true, description: 'Carbs as a percentage of total calories.' },
            fat_percentage: { type: 'number', nullable: true, description: 'Fat as a percentage of total calories.' },
            breakfast_percentage: { type: 'number', nullable: true },
            lunch_percentage: { type: 'number', nullable: true },
            dinner_percentage: { type: 'number', nullable: true },
            snacks_percentage: { type: 'number', nullable: true },
            target_exercise_calories_burned: { type: 'number', nullable: true },
            target_exercise_duration_minutes: { type: 'integer', nullable: true },
            custom_nutrients: { type: 'object', nullable: true, description: 'JSONB object of custom nutrient targets keyed by nutrient definition ID.' }
          },
          required: ['preset_name', 'calories']
        },
        UserPreferences: {
          type: 'object',
          properties: {
            user_id: { type: 'string', format: 'uuid' },
            language: { type: 'string', description: 'UI language code (e.g., "en").' },
            timezone: { type: 'string', description: 'IANA timezone (e.g., "UTC", "America/New_York").' },
            date_format: { type: 'string', description: 'Date display format (e.g., "yyyy-MM-dd").' },
            default_weight_unit: { type: 'string', description: 'Default unit for weight (e.g., "lbs", "kg").' },
            default_measurement_unit: { type: 'string', description: 'Default unit for body measurements (e.g., "in", "cm").' },
            default_distance_unit: { type: 'string', description: 'Default unit for distance (e.g., "km", "mi").' },
            energy_unit: { type: 'string', description: 'Energy display unit (e.g., "kcal", "kJ").' },
            water_display_unit: { type: 'string', description: 'Water display unit (e.g., "ml", "oz").' },
            item_display_limit: { type: 'integer', description: 'Number of items to display in lists.' },
            system_prompt: { type: 'string', description: 'Custom system prompt for AI features.' },
            auto_clear_history: { type: 'string', description: 'Auto-clear history setting (e.g., "never").' },
            logging_level: { type: 'string', description: 'Client-side logging level (e.g., "INFO").' },
            default_food_data_provider_id: { type: 'string', nullable: true, description: 'Default food data provider ID.' },
            default_barcode_provider_id: { type: 'string', nullable: true, description: 'Default barcode data provider ID.' },
            bmr_algorithm: { type: 'string', description: 'BMR calculation algorithm (e.g., "Mifflin-St Jeor").' },
            body_fat_algorithm: { type: 'string', description: 'Body fat calculation algorithm (e.g., "U.S. Navy").' },
            fat_breakdown_algorithm: { type: 'string', description: 'Fat breakdown calculation algorithm (e.g., "AHA Guidelines").' },
            mineral_calculation_algorithm: { type: 'string', description: 'Mineral calculation algorithm (e.g., "RDA Standard").' },
            vitamin_calculation_algorithm: { type: 'string', description: 'Vitamin calculation algorithm (e.g., "RDA Standard").' },
            sugar_calculation_algorithm: { type: 'string', description: 'Sugar calculation algorithm (e.g., "WHO Guidelines").' },
            include_bmr_in_net_calories: { type: 'boolean', description: 'Whether to include BMR in net calorie calculations.' },
            calorie_goal_adjustment_mode: { type: 'string', description: 'How calorie goals are adjusted (e.g., "dynamic", "static").' },
            auto_scale_open_food_facts_imports: { type: 'boolean', description: 'Whether to auto-scale imported Open Food Facts data.' },
            exercise_calorie_percentage: { type: 'number', description: 'Percentage of exercise calories to apply to daily goal.' },
            activity_level: { type: 'string', description: 'User activity level (e.g., "not_much", "moderate", "active").' },
            tdee_allow_negative_adjustment: { type: 'boolean', description: 'Whether to allow negative TDEE adjustments.' }
          }
        },
        OnboardingStatus: {
          type: 'object',
          properties: {
            onboardingComplete: { type: 'boolean', description: 'Whether the user has completed onboarding.' }
          }
        },
        AdaptiveTdeeResult: {
          type: 'object',
          properties: {
            tdee: { type: 'number', description: 'Calculated Total Daily Energy Expenditure in kcal.' },
            confidence: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'], description: 'Confidence level of the calculation.' },
            weightTrend: { type: 'number', nullable: true, description: 'Weekly weight trend in the user\'s weight unit.' },
            isFallback: { type: 'boolean', description: 'Whether the result is a fallback estimate (insufficient data).' },
            fallbackReason: { type: 'string', nullable: true, description: 'Reason for fallback, if applicable.' },
            avgIntake: { type: 'number', nullable: true, description: 'Average daily calorie intake over the calculation window.' },
            daysOfData: { type: 'integer', description: 'Number of days of data used in the calculation.' },
            lastCalculated: { type: 'string', format: 'date-time', description: 'Timestamp of when this value was last calculated.' }
          }
        },
        FamilyAccessEntry: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            owner_user_id: { type: 'string', format: 'uuid', description: 'The ID of the user who owns the data.' },
            family_user_id: { type: 'string', format: 'uuid', nullable: true, description: 'The ID of the family member who has access.' },
            family_email: { type: 'string', format: 'email', description: 'The email of the family member.' },
            access_permissions: { type: 'object', description: 'JSONB object defining access permissions.' },
            access_start_date: { type: 'string', format: 'date-time', description: 'When access was granted.' },
            access_end_date: { type: 'string', format: 'date-time', nullable: true, description: 'When access expires, if set.' },
            is_active: { type: 'boolean', description: 'Whether this access entry is currently active.' },
            status: { type: 'string', description: 'Status of the access entry (e.g., "pending", "accepted").' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        OidcProvider: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            provider_name: { type: 'string' },
            issuer: { type: 'string' },
            client_id: { type: 'string' },
            client_secret: { type: 'string' },
            redirect_uri: { type: 'string' },
            scopes: { type: 'string' },
            discovery_url: { type: 'string' },
            is_active: { type: 'boolean' }
          },
          required: ['provider_name', 'issuer', 'client_id', 'client_secret', 'redirect_uri']
        },
        GarminStatus: {
          type: 'object',
          properties: {
            is_connected: { type: 'boolean' },
            last_sync_at: { type: 'string', format: 'date-time', nullable: true }
          }
        },
        WithingsStatus: {
          type: 'object',
          properties: {
            is_connected: { type: 'boolean' },
            last_sync_at: { type: 'string', format: 'date-time', nullable: true }
          }
        },
        GlobalSettings: {
          type: 'object',
          properties: {
            enable_email_password_login: { type: 'boolean' },
            is_oidc_active: { type: 'boolean' },
            is_mfa_mandatory: { type: 'boolean' },
            allow_user_ai_config: { type: 'boolean' },
            is_email_login_env_configured: { type: 'boolean', description: 'Whether email login is configured via environment variables.' },
            is_oidc_active_env_configured: { type: 'boolean', description: 'Whether OIDC is configured via environment variables.' }
          }
        },
        AppReview: {
          type: 'object',
          properties: {
            rating: { type: 'integer', minimum: 1, maximum: 5 },
            comment: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' }
          },
          required: ['rating']
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'The unique identifier for the user.',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'The user\'s email address.',
            },
            role: {
              type: 'string',
              enum: ['user', 'admin'],
              description: 'The user\'s role in the system.',
            },
            is_active: {
              type: 'boolean',
              description: 'Indicates if the user account is active.',
            },
            full_name: {
              type: 'string',
              nullable: true,
              description: 'The user\'s full name.',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'The date and time when the user account was created.',
            },
            last_login_at: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'The date and time of the user\'s last login.',
            },
          },
          required: ['id', 'email', 'role', 'is_active'],
        },
        FitbitStatus: {
          type: 'object',
          properties: {
            isLinked: {
              type: 'boolean',
              description: 'Indicates if the user has a linked Fitbit account.',
            },
            lastSyncAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'The date and time of the last successful data sync.',
            },
            tokenExpiresAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'The date and time when the Fitbit access token expires.',
            },
          },
        },
      },
    },
    security: [
      {
        cookieAuth: [],
      },
    ],
    tags: [
      { name: 'Identity & Security', description: 'User authentication, registration, profile management, MFA, and access control.' },
      { name: 'Nutrition & Meals', description: 'Food database, diary logging, meal planning, and nutritional preferences.' },
      { name: 'Exercise & Workouts', description: 'Exercise database, workout presets, plan templates, and activity logging.' },
      { name: 'Wellness & Metrics', description: 'Health metrics tracking (weight, measurements, sleep, mood) and fasting.' },
      { name: 'Goals & Personalization', description: 'Personal goal setting, goal presets, and application preferences.' },
      { name: 'External Integrations', description: 'Third-party service connections (Garmin, Withings, OIDC, etc.).' },
      { name: 'System & Admin', description: 'System configuration, administrative tasks, backups, reviews, and versioning.' },
      { name: 'AI & Insights', description: 'AI-powered chat assistance, reports, trends, and analytical insights.' },
      { name: 'SleepScience', description: 'Sleep science endpoints including MCTQ baseline calculation, sleep debt tracking, energy curves, and chronotype analysis.' },
    ],

  },
  apis: ['./routes/*.js', './routes/auth/*.js', './models/*.js', './SparkyFitnessServer.js'], // Paths to files containing OpenAPI definitions
};

const specs = swaggerJsdoc(options);

module.exports = specs;
