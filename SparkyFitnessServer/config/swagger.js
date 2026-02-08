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
              items: {
                type: 'object',
                properties: {
                  reps: {
                    type: 'number',
                  },
                  weight: {
                    type: 'number',
                  },
                  duration: {
                    type: 'number',
                  },
                },
              },
              description: 'Details of sets performed (reps, weight, duration).',
            },
            reps: {
              type: 'number',
              description: 'Total repetitions (if not detailed in sets).',
            },
            weight: {
              type: 'number',
              description: 'Weight used (if not detailed in sets).',
            },
            workout_plan_assignment_id: {
              type: 'string',
              format: 'uuid',
              description: 'The ID of the workout plan assignment this entry belongs to.',
            },
            image_url: {
              type: 'string',
              format: 'url',
              description: 'URL to an image associated with the exercise entry.',
            },
            distance: {
              type: 'number',
              description: 'Distance covered for cardio exercises.',
            },
            avg_heart_rate: {
              type: 'number',
              description: 'Average heart rate during the exercise.',
            },
            activity_details: {
              type: 'object',
              description: 'Additional activity-specific details (JSONB).',
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
              enum: ['ACTIVE', 'COMPLETED'],
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
            notes: { type: 'string', nullable: true }
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
            source: { type: 'string' },
            sleep_score: { type: 'integer', nullable: true },
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
            total_volume: { type: 'number' },
            servings_count: { type: 'number' },
            container_id: { type: 'string', format: 'uuid', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          },
          required: ['entry_date', 'total_volume']
        },
        WaterContainer: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            volume: { type: 'number', description: 'Volume in specified unit' },
            unit: { type: 'string', description: 'ml, oz, etc.' },
            is_primary: { type: 'boolean' },
            servings_per_container: { type: 'number' },
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
            waist_circumference: { type: 'number', nullable: true },
            hip_circumference: { type: 'number', nullable: true },
            chest_circumference: { type: 'number', nullable: true },
            thigh_circumference: { type: 'number', nullable: true },
            bicep_circumference: { type: 'number', nullable: true },
            neck_circumference: { type: 'number', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          },
          required: ['entry_date']
        },
        CustomMeasurementCategory: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid', nullable: true },
            category_name: { type: 'string' },
            unit: { type: 'string', nullable: true },
            data_type: { type: 'string', enum: ['numeric', 'boolean', 'text'] },
            measurement_type: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          },
          required: ['category_name', 'data_type']
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
            goal_date: { type: 'string', format: 'date', nullable: true },
            calories: { type: 'number' },
            protein: { type: 'number' },
            carbs: { type: 'number' },
            fat: { type: 'number' },
            water_goal_ml: { type: 'number' },
            protein_percentage: { type: 'number' },
            carbs_percentage: { type: 'number' },
            fat_percentage: { type: 'number' },
            target_exercise_calories_burned: { type: 'number', nullable: true },
            target_exercise_duration_minutes: { type: 'integer', nullable: true }
          }
        },
        GoalPreset: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            preset_name: { type: 'string' },
            calories: { type: 'number' },
            protein: { type: 'number' },
            carbs: { type: 'number' },
            fat: { type: 'number' },
            water_goal: { type: 'number' },
            protein_percentage: { type: 'number' },
            carbs_percentage: { type: 'number' },
            fat_percentage: { type: 'number' }
          },
          required: ['preset_name', 'calories']
        },
        UserPreferences: {
          type: 'object',
          properties: {
            user_id: { type: 'string', format: 'uuid' },
            language: { type: 'string' },
            theme: { type: 'string' },
            timezone: { type: 'string' },
            unit_system: { type: 'string', enum: ['metric', 'imperial'] },
            meal_calorie_distribution: { type: 'object' }
          }
        },
        OnboardingStatus: {
          type: 'object',
          properties: {
            onboarding_complete: { type: 'boolean' }
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
            is_mfa_mandatory: { type: 'boolean' }
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
      '/admin/auth/settings/mfa-mandatory': {
        get: {
          tags: ['Identity & Security'],
          summary: 'Get global MFA mandatory setting',
          description: 'Retrieves the current global setting for mandatory Multi-Factor Authentication. Requires admin privileges.',
          security: [{ cookieAuth: [] }],
          responses: {
            '200': {
              description: 'Successfully retrieved MFA mandatory setting.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      isMfaMandatory: {
                        type: 'boolean',
                        description: 'Indicates if MFA is globally mandatory.',
                      },
                    },
                  },
                },
              },
            },
            '401': { description: 'Unauthorized: Authentication token missing or invalid.' },
            '403': { description: 'Forbidden: User does not have admin privileges.' },
            '500': { description: 'Internal Server Error.' },
          },
        },
        put: {
          tags: ['Identity & Security'],
          summary: 'Update global MFA mandatory setting',
          description: 'Updates the global setting for mandatory Multi-Factor Authentication. Requires admin privileges.',
          security: [{ cookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    isMfaMandatory: {
                      type: 'boolean',
                      description: 'New value for the global MFA mandatory setting.',
                    },
                  },
                  required: ['isMfaMandatory'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Global MFA mandatory setting updated successfully.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'Global MFA mandatory setting updated to true.',
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Bad Request: Invalid input data.' },
            '401': { description: 'Unauthorized: Authentication token missing or invalid.' },
            '403': { description: 'Forbidden: User does not have admin privileges.' },
            '500': { description: 'Internal Server Error.' },
          },
        },
      },
      '/admin/auth/users/{userId}/mfa/reset': {
        post: {
          tags: ['Identity & Security'],
          summary: 'Reset a user\'s MFA',
          description: 'Allows an administrator to reset Multi-Factor Authentication for a specific user. Requires admin privileges.',
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: 'path',
              name: 'userId',
              required: true,
              schema: {
                type: 'string',
                format: 'uuid',
              },
              description: 'The unique identifier of the user whose MFA is to be reset.',
            },
          ],
          responses: {
            '200': {
              description: 'User MFA reset successfully.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'MFA for user {userId} has been reset.',
                      },
                    },
                  },
                },
              },
            },
            '401': { description: 'Unauthorized: Authentication token missing or invalid.' },
            '403': { description: 'Forbidden: User does not have admin privileges.' },
            '404': { description: 'Not Found: User not found.' },
            '500': { description: 'Internal Server Error.' },
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
      { name: 'Fitness & Workouts', description: 'Exercise database, workout presets, plan templates, and activity logging.' },
      { name: 'Wellness & Metrics', description: 'Health metrics tracking (weight, measurements, sleep, mood) and fasting.' },
      { name: 'Goals & Personalization', description: 'Personal goal setting, goal presets, and application preferences.' },
      { name: 'External Integrations', description: 'Third-party service connections (Garmin, Withings, OIDC, etc.).' },
      { name: 'System & Admin', description: 'System configuration, administrative tasks, backups, reviews, and versioning.' },
      { name: 'AI & Insights', description: 'AI-powered chat assistance, reports, trends, and analytical insights.' },
    ],

  },
  apis: ['./routes/*.js', './routes/auth/*.js', './models/*.js', './SparkyFitnessServer.js'], // Paths to files containing OpenAPI definitions
};

const specs = swaggerJsdoc(options);

module.exports = specs;
