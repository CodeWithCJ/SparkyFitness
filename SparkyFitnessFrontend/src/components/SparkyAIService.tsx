import { apiCall } from '@/services/api';
import { FoodOption } from "@/services/Chatbot/Chatbot_types";

interface AIServiceConfig {
  service_name: string;
  api_key: string;
  custom_url?: string;
  model_name?: string;
}

interface FoodSuggestion {
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturated_fat?: number;
  trans_fat?: number;
  monounsaturated_fat?: number;
  polyunsaturated_fat?: number;
  cholesterol?: number;
  sodium?: number;
  potassium?: number;
  dietary_fiber?: number;
  sugars?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  calcium?: number;
  iron?: number;
  meal_type: string;
  food_id?: string;
  is_existing?: boolean;
}

interface MeasurementSuggestion {
  type: 'weight' | 'waist' | 'hips' | 'neck' | 'steps' | 'blood_sugar' | 'blood_pressure_systolic' | 'blood_pressure_diastolic' | 'heart_rate' | 'body_fat' | 'temperature';
  value: number;
  unit: string;
  date: string;
}

interface AIResponse {
  content: string;
  foodSuggestions?: FoodSuggestion[];
  measurementSuggestions?: MeasurementSuggestion[];
  actionType?: 'food' | 'measurement' | 'general';
}

interface ExistingFood {
  id: string;
  name: string;
  brand?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturated_fat?: number;
  trans_fat?: number;
  monounsaturated_fat?: number;
  polyunsaturated_fat?: number;
  cholesterol?: number;
  sodium?: number;
  potassium?: number;
  dietary_fiber?: number;
  sugars?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  calcium?: number;
  iron?: number;
  serving_size: number;
  serving_unit: string;
}

interface NutritionData {
  name: string;
  brand?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturated_fat: number;
  trans_fat: number;
  monounsaturated_fat: number;
  polyunsaturated_fat: number;
  cholesterol: number;
  sodium: number;
  potassium: number;
  dietary_fiber: number;
  sugars: number;
  vitamin_a: number;
  vitamin_c: number;
  calcium: number;
  iron: number;
  serving_size: number;
  serving_unit: string;
}

class SparkyAIService {
  private energyUnit: 'kcal' | 'kJ' = 'kcal'; // Default
  private convertEnergy: (value: number, fromUnit: 'kcal' | 'kJ', toUnit: 'kcal' | 'kJ') => number = (val) => val; // Default passthrough
  private getEnergyUnitString: (unit: 'kcal' | 'kJ') => string = (unit) => unit === 'kcal' ? 'kcal' : 'kJ'; // Default fallback

  constructor(energyUnit?: 'kcal' | 'kJ', convertEnergy?: (value: number, fromUnit: 'kcal' | 'kJ', toUnit: 'kcal' | 'kJ') => number, getEnergyUnitString?: (unit: 'kcal' | 'kJ') => string) {
    if (energyUnit) this.energyUnit = energyUnit;
    if (convertEnergy) this.convertEnergy = convertEnergy;
    if (getEnergyUnitString) this.getEnergyUnitString = getEnergyUnitString;
  }
  private async getActiveService(): Promise<AIServiceConfig | null> {
    try {
      // Assuming user ID is available globally or passed in
      // For now, we'll use a placeholder or assume it's handled by a higher-level component
      // that calls this service.
      // In a real app, you'd likely pass the user ID or get it from a global state/context.
      const data = await apiCall(`/ai-service-settings`, {
        method: 'GET',
      });

      if (!data) {
        console.error('No active AI service found for user.');
        return null;
      }

      return {
        service_name: data.service_type,
        api_key: data.api_key, // Assuming API key is returned directly from backend
        custom_url: data.custom_url,
        model_name: data.model_name
      };
    } catch (error: any) {
      console.error('Error fetching AI service config:', error);
      return null;
    }
  }

  private getDefaultModel(serviceName: string): string {
    const defaultModels: Record<string, string> = {
      'openai': 'gpt-4o',
      'google_gemini': 'gemini-pro',
      'anthropic': 'claude-3-haiku-20240307',
      'mistral': 'mistral-small',
      'groq': 'llama3-8b-8192',
      'grok': 'grok-beta',
      'together': 'meta-llama/Llama-2-7b-chat-hf',
      'openrouter': 'openai/gpt-3.5-turbo',
      'perplexity': 'llama-3.1-sonar-small-128k-online',
      'cohere': 'command-r-plus',
      'huggingface': 'microsoft/DialoGPT-medium',
      'replicate': 'meta/llama-2-70b-chat',
      'vertex': 'gemini-pro',
      'azure_openai': 'gpt-4',
      'ollama': 'llama2'
    };
    return defaultModels[serviceName] || 'gpt-3.5-turbo';
  }


  private extractMeasurementsFromMessage(message: string): MeasurementSuggestion[] {
    const measurements: MeasurementSuggestion[] = [];
    const lowerMessage = message.toLowerCase();
    const today = new Date().toISOString().split('T')[0];

    // Weight patterns
    const weightPatterns = [
      /(?:my\s+)?weight\s+is\s+(\d+(?:\.\d+)?)\s*(kg|lbs?|pounds?)/gi,
      /(\d+(?:\.\d+)?)\s*(kg|lbs?|pounds?)\s+(?:weight|today)/gi,
      /i\s+weigh\s+(\d+(?:\.\d+)?)\s*(kg|lbs?|pounds?)/gi,
      /weighed\s+(\d+(?:\.\d+)?)\s*(kg|lbs?|pounds?)/gi,
    ];

    for (const pattern of weightPatterns) {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        const value = parseFloat(match[1]);
        let unit = match[2].toLowerCase();

        // Normalize units
        if (unit.includes('lb') || unit.includes('pound')) {
          unit = 'lbs';
        } else if (unit === 'kg') {
          unit = 'kg';
        }

        measurements.push({
          type: 'weight',
          value,
          unit,
          date: today
        });
      }
    }

    // Waist patterns
    const waistPatterns = [
      /waist\s+(?:is\s+)?(\d+(?:\.\d+)?)\s*(cm|inches?|in)/gi,
      /(\d+(?:\.\d+)?)\s*(cm|inches?|in)\s+waist/gi,
    ];

    for (const pattern of waistPatterns) {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        const value = parseFloat(match[1]);
        let unit = match[2].toLowerCase();

        if (unit.includes('inch') || unit === 'in') {
          unit = 'inches';
        } else if (unit === 'cm') {
          unit = 'cm';
        }

        measurements.push({
          type: 'waist',
          value,
          unit,
          date: today
        });
      }
    }

    // Steps patterns
    const stepsPatterns = [
      /(\d+)\s+steps/gi,
      /steps\s+(?:is\s+)?(\d+)/gi,
      /walked\s+(\d+)\s+steps/gi,
    ];

    for (const pattern of stepsPatterns) {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        const value = parseInt(match[1]);
        measurements.push({
          type: 'steps',
          value,
          unit: 'steps',
          date: today
        });
      }
    }

    return measurements;
  }

  private async saveMeasurements(measurements: MeasurementSuggestion[]): Promise<boolean> {
    try {
      for (const measurement of measurements) {
        if (measurement.type === 'weight' || measurement.type === 'waist' || measurement.type === 'hips' || measurement.type === 'neck' || measurement.type === 'steps') {
          // Convert to metric for storage
          let valueToStore = measurement.value;
          if (measurement.type === 'weight' && measurement.unit === 'lbs') {
            valueToStore = measurement.value * 0.453592; // Convert lbs to kg
          } else if ((measurement.type === 'waist' || measurement.type === 'hips' || measurement.type === 'neck') && measurement.unit === 'inches') {
            valueToStore = measurement.value * 2.54; // Convert inches to cm
          }

          const dataToSave: any = {
            entry_date: measurement.date,
          };

          // Set the specific measurement field
          if (measurement.type === 'steps') {
            dataToSave.steps = valueToStore;
          } else {
            dataToSave[measurement.type] = valueToStore;
          }

          const response = await apiCall('/measurements/check-in', {
            method: 'POST',
            body: dataToSave,
          });

          if (!response) {
            console.error('Error saving measurement via API.');
            return false;
          }
        }
      }

      return true;
    } catch (error: any) {
      console.error('Error in saveMeasurements:', error);
      return false;
    }
  }

  private createMeasurementResponse(measurements: MeasurementSuggestion[], success: boolean): string {
    if (!success) {
      return "I'm sorry, I couldn't save your measurement data. Please make sure you're signed in and try again.";
    }

    let response = "Great! I've recorded your measurement(s) for today:\n\n";

    for (const measurement of measurements) {
      response += `**${measurement.type.charAt(0).toUpperCase() + measurement.type.slice(1)}:** ${measurement.value} ${measurement.unit}\n`;
    }

    response += "\nYour data has been saved and will be available in your Check-In and Reports sections for tracking progress over time.";

    return response;
  }

  private extractFoodsFromMessage(message: string): Array<{ name: string, quantity: number, unit: string }> {
    const foods: Array<{ name: string, quantity: number, unit: string }> = [];
    const lowerMessage = message.toLowerCase();

    // Enhanced patterns for better food recognition including branded foods
    const foodPatterns = [
      // Pizza patterns (brand specific)
      /(\d+)\s+(slice|slices|piece|pieces)\s+of\s+([a-zA-Z\s]+?)\s+(pizza)/gi,
      /(\d+)\s+([a-zA-Z\s]+?)\s+(pizza)\s+(slice|slices|piece|pieces)/gi,

      // Number + food name patterns
      /(\d+)\s+(idl[yi]s?|idly|idli)/gi,
      /(\d+)\s+(vadai?s?|vada|medu vada)/gi,
      /(\d+)\s+(dosa|dosai|masala dosa)/gi,
      /(\d+)\s+(roti|chapati|naan)/gi,
      /(\d+)\s+(rice|biryani|fried rice)/gi,
      /(\d+)\s+(samosa|samosas)/gi,
      /(\d+)\s+(cup|cups|glass|glasses)\s+of\s+([a-zA-Z\s]+)/gi,
      /(\d+)\s+([a-zA-Z\s]{3,}?)(?:\s+and|\s*$|,)/gi,

      // Word number + food patterns  
      /(one|two|three|four|five|six|seven|eight|nine|ten)\s+(idl[yi]s?|idly|idli)/gi,
      /(one|two|three|four|five|six|seven|eight|nine|ten)\s+(vadai?s?|vada|medu vada)/gi,
      /(one|two|three|four|five|six|seven|eight|nine|ten)\s+(dosa|dosai|masala dosa)/gi,
      /(one|two|three|four|five|six|seven|eight|nine|ten)\s+([a-zA-Z\s]{3,}?)(?:\s+and|\s*$|,)/gi,
    ];

    const numberWords: { [key: string]: number } = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
    };

    for (const pattern of foodPatterns) {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        let quantity = 1;
        let foodName = '';
        let unit = 'piece';

        // Handle pizza patterns specifically
        if (match[0].toLowerCase().includes('pizza')) {
          if (match[1] && (match[3] || match[2])) {
            quantity = isNaN(Number(match[1])) ? numberWords[match[1].toLowerCase()] || 1 : parseInt(match[1]);

            // Extract brand and pizza type
            if (match[3] && match[4] === 'pizza') {
              foodName = `${match[3].trim()} Pizza`;
            } else if (match[2] && match[3] === 'pizza') {
              foodName = `${match[2].trim()} Pizza`;
            }

            unit = match[4] === 'pizza' ? 'slice' : (match[4] || 'slice');
          }
        } else if (match[1] && match[2]) {
          // Handle numeric quantities
          if (isNaN(Number(match[1]))) {
            quantity = numberWords[match[1].toLowerCase()] || 1;
          } else {
            quantity = parseInt(match[1]);
          }
          foodName = match[2].trim();

          // Handle cup/glass measurements
          if (match[3]) {
            foodName = match[3].trim();
            unit = match[2].includes('cup') ? 'cup' : 'glass';
          }
        }

        // Clean and standardize food names
        foodName = this.standardizeFoodName(foodName);

        if (foodName && foodName.length > 2) {
          foods.push({ name: foodName, quantity, unit });
        }
      }
    }

    // Fallback: Look for standalone food names if no patterns matched
    if (foods.length === 0) {
      const commonFoods = ['idly', 'idli', 'vadai', 'vada', 'dosa', 'roti', 'rice', 'biryani', 'samosa', 'pizza'];
      for (const food of commonFoods) {
        if (lowerMessage.includes(food)) {
          // Try to find quantity near the food name
          const foodIndex = lowerMessage.indexOf(food);
          const beforeFood = lowerMessage.substring(Math.max(0, foodIndex - 20), foodIndex);
          const numberMatch = beforeFood.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*$/);

          let quantity = 1;
          if (numberMatch) {
            quantity = isNaN(Number(numberMatch[1])) ? numberWords[numberMatch[1]] || 1 : parseInt(numberMatch[1]);
          }

          foods.push({
            name: this.standardizeFoodName(food),
            quantity,
            unit: food === 'pizza' ? 'slice' : 'piece'
          });
          break;
        }
      }
    }

    return foods;
  }

  private standardizeFoodName(name: string): string {
    const standardNames: { [key: string]: string } = {
      'idly': 'Idli',
      'idli': 'Idli',
      'idlys': 'Idli',
      'idlis': 'Idli',
      'vadai': 'Medu Vada',
      'vada': 'Medu Vada',
      'vadais': 'Medu Vada',
      'vadas': 'Medu Vada',
      'medu vada': 'Medu Vada',
      'dosa': 'Plain Dosa',
      'dosai': 'Plain Dosa',
      'masala dosa': 'Masala Dosa',
      'roti': 'Roti',
      'chapati': 'Chapati',
      'naan': 'Naan',
      'rice': 'Steamed Rice',
      'biryani': 'Chicken Biryani',
      'fried rice': 'Fried Rice',
      'samosa': 'Samosa',
      'samosas': 'Samosa',
      'dominos chicken pizza': 'Dominos Chicken Pizza',
      'chicken pizza': 'Chicken Pizza',
      'pizza': 'Pizza'
    };

    const lowerName = name.toLowerCase().trim();
    return standardNames[lowerName] || name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }

  private async getDetailedNutritionData(foods: Array<{ name: string, quantity: number, unit: string }>) {
    const nutritionData = [];

    for (const food of foods) {
      try {
        // First try to get from our knowledge base
        const knownNutrition = this.getKnownFoodNutrition(food.name);
        if (knownNutrition) {
          nutritionData.push({
            ...knownNutrition,
            requested_quantity: food.quantity,
            requested_unit: food.unit
          });
        } else {
          // Food not found in local knowledge base.
          // The AI call for unknown foods will be handled by SparkyNutritionCoach.
          // For now, add a basic fallback.
          nutritionData.push(this.getBasicFoodNutrition(food.name, food.quantity, food.unit));
        }
      } catch (error) {
        console.error(`Error getting nutrition for ${food.name}:`, error);
        // Add basic fallback on error as well
        nutritionData.push(this.getBasicFoodNutrition(food.name, food.quantity, food.unit));
      }
    }

    return nutritionData;
  }

  private getKnownFoodNutrition(foodName: string) {
    const knownFoods: { [key: string]: any } = {
      'Idli': {
        name: 'Idli',
        serving_size: 1,
        serving_unit: 'piece',
        calories: 39,
        protein: 2.0,
        carbs: 8.0,
        fat: 0.2,
        saturated_fat: 0.1,
        trans_fat: 0.0,
        monounsaturated_fat: 0.05,
        polyunsaturated_fat: 0.05,
        cholesterol: 0,
        sodium: 4,
        potassium: 50,
        dietary_fiber: 0.8,
        sugars: 0.5,
        vitamin_a: 0,
        vitamin_c: 0,
        calcium: 20,
        iron: 0.4
      },
      'Medu Vada': {
        name: 'Medu Vada',
        serving_size: 1,
        serving_unit: 'piece',
        calories: 85,
        protein: 3.5,
        carbs: 8.0,
        fat: 4.5,
        saturated_fat: 0.8,
        trans_fat: 0.1,
        monounsaturated_fat: 2.0,
        polyunsaturated_fat: 1.5,
        cholesterol: 0,
        sodium: 180,
        potassium: 85,
        dietary_fiber: 2.2,
        sugars: 1.0,
        vitamin_a: 5,
        vitamin_c: 2,
        calcium: 35,
        iron: 1.1
      },
      'Plain Dosa': {
        name: 'Plain Dosa',
        serving_size: 1,
        serving_unit: 'piece',
        calories: 133,
        protein: 4.0,
        carbs: 25.0,
        fat: 1.5,
        saturated_fat: 0.3,
        trans_fat: 0.0,
        monounsaturated_fat: 0.5,
        polyunsaturated_fat: 0.6,
        cholesterol: 0,
        sodium: 8,
        potassium: 95,
        dietary_fiber: 2.5,
        sugars: 2.0,
        vitamin_a: 0,
        vitamin_c: 0,
        calcium: 40,
        iron: 1.8
      },
      'Masala Dosa': {
        name: 'Masala Dosa',
        serving_size: 1,
        serving_unit: 'piece',
        calories: 168,
        protein: 5.0,
        carbs: 30.0,
        fat: 3.0,
        saturated_fat: 0.5,
        trans_fat: 0.0,
        monounsaturated_fat: 1.2,
        polyunsaturated_fat: 1.0,
        cholesterol: 0,
        sodium: 165,
        potassium: 285,
        dietary_fiber: 3.8,
        sugars: 3.5,
        vitamin_a: 15,
        vitamin_c: 12,
        calcium: 55,
        iron: 2.2
      },
      'Dominos Chicken Pizza': {
        name: 'Dominos Chicken Pizza',
        serving_size: 1,
        serving_unit: 'slice',
        calories: 280,
        protein: 14.0,
        carbs: 28.0,
        fat: 12.0,
        saturated_fat: 5.5,
        trans_fat: 0.2,
        monounsaturated_fat: 4.0,
        polyunsaturated_fat: 2.0,
        cholesterol: 35,
        sodium: 680,
        potassium: 220,
        dietary_fiber: 2.0,
        sugars: 3.5,
        vitamin_a: 150,
        vitamin_c: 2,
        calcium: 180,
        iron: 2.8
      },
      'Chicken Pizza': {
        name: 'Chicken Pizza',
        serving_size: 1,
        serving_unit: 'slice',
        calories: 270,
        protein: 13.5,
        carbs: 27.0,
        fat: 11.5,
        saturated_fat: 5.0,
        trans_fat: 0.1,
        monounsaturated_fat: 3.8,
        polyunsaturated_fat: 1.8,
        cholesterol: 32,
        sodium: 650,
        potassium: 200,
        dietary_fiber: 1.8,
        sugars: 3.2,
        vitamin_a: 140,
        vitamin_c: 1.5,
        calcium: 160,
        iron: 2.5
      }
    };

    return knownFoods[foodName] || null;
  }


  private getBasicFoodNutrition(foodName: string, quantity: number, unit: string) {
    return {
      name: foodName,
      serving_size: 1,
      serving_unit: 'piece',
      calories: Math.round(this.convertEnergy(80, 'kcal', this.energyUnit)),
      protein: 3.0,
      carbs: 15.0,
      fat: 2.0,
      saturated_fat: 0.5,
      trans_fat: 0.0,
      monounsaturated_fat: 0.8,
      polyunsaturated_fat: 0.6,
      cholesterol: 0,
      sodium: 50,
      potassium: 100,
      dietary_fiber: 2.0,
      sugars: 1.0,
      vitamin_a: 5,
      vitamin_c: 2,
      calcium: 30,
      iron: 1.0,
      requested_quantity: quantity,
      requested_unit: unit
    };
  }

  private createFoodSuggestionsFromNutrition(nutritionData: any[], originalMessage: string): FoodSuggestion[] {
    const mealType = this.determineMealType(originalMessage);
    const suggestions: FoodSuggestion[] = [];

    for (const nutrition of nutritionData) {
      const multiplier = nutrition.requested_quantity || 1;

      suggestions.push({
        name: nutrition.name,
        quantity: nutrition.requested_quantity || 1,
        unit: nutrition.requested_unit || 'piece',
        calories: Math.round(nutrition.calories * multiplier),
        protein: Math.round(nutrition.protein * multiplier * 10) / 10,
        carbs: Math.round(nutrition.carbs * multiplier * 10) / 10,
        fat: Math.round(nutrition.fat * multiplier * 10) / 10,
        saturated_fat: Math.round(nutrition.saturated_fat * multiplier * 10) / 10,
        trans_fat: Math.round(nutrition.trans_fat * multiplier * 10) / 10,
        monounsaturated_fat: Math.round(nutrition.monounsaturated_fat * multiplier * 10) / 10,
        polyunsaturated_fat: Math.round(nutrition.polyunsaturated_fat * multiplier * 10) / 10,
        cholesterol: Math.round(nutrition.cholesterol * multiplier * 10) / 10,
        sodium: Math.round(nutrition.sodium * multiplier * 10) / 10,
        potassium: Math.round(nutrition.potassium * multiplier * 10) / 10,
        dietary_fiber: Math.round(nutrition.dietary_fiber * multiplier * 10) / 10,
        sugars: Math.round(nutrition.sugars * multiplier * 10) / 10,
        vitamin_a: Math.round(nutrition.vitamin_a * multiplier * 10) / 10,
        vitamin_c: Math.round(nutrition.vitamin_c * multiplier * 10) / 10,
        calcium: Math.round(nutrition.calcium * multiplier * 10) / 10,
        iron: Math.round(nutrition.iron * multiplier * 10) / 10,
        meal_type: mealType,
        is_existing: false
      });
    }

    return suggestions;
  }

  private createNutritionResponse(nutritionData: any[], originalMessage: string): string {
    const mealType = this.determineMealType(originalMessage);

    let response = `Great! I've analyzed your ${mealType} and found nutritional information for:\n\n`;

    for (const nutrition of nutritionData) {
      const quantity = nutrition.requested_quantity || 1;
      const totalCals = Math.round(nutrition.calories * quantity);
      const totalProtein = Math.round(nutrition.protein * quantity * 10) / 10;
      const totalCarbs = Math.round(nutrition.carbs * quantity * 10) / 10;
      const totalFat = Math.round(nutrition.fat * quantity * 10) / 10;

      response += `**${quantity} ${nutrition.name}${quantity > 1 ? 's' : ''}:**\n`;
      response += `• ${Math.round(nutrition.calories * quantity)} ${this.getEnergyUnitString(this.energyUnit)}\n`;
      response += `• ${totalProtein}g protein, ${totalCarbs}g carbs, ${totalFat}g fat\n`;
      response += `• ${Math.round(nutrition.dietary_fiber * quantity * 10) / 10}g fiber, ${Math.round(nutrition.sodium * quantity)}mg sodium\n`;
      response += `• ${Math.round(nutrition.calcium * quantity)}mg calcium, ${Math.round(nutrition.iron * quantity * 10) / 10}mg iron\n\n`;
    }

    response += `Would you like me to add these items to your ${mealType} for today?`;

    return response;
  }








  private determineMealType(message: string): string {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('breakfast') || lowerMessage.includes('morning')) {
      return 'breakfast';
    } else if (lowerMessage.includes('lunch') || lowerMessage.includes('noon')) {
      return 'lunch';
    } else if (lowerMessage.includes('dinner') || lowerMessage.includes('evening') || lowerMessage.includes('tonight')) {
      return 'dinner';
    } else if (lowerMessage.includes('snack')) {
      return 'snacks';
    }

    // Check for time references like "last sunday"
    if (lowerMessage.includes('sunday') || lowerMessage.includes('last sunday')) {
      // Default Sunday evening meal to dinner
      return 'dinner';
    }

    // Default based on time of day
    const hour = new Date().getHours();
    if (hour < 11) return 'breakfast';
    if (hour < 16) return 'lunch';
    if (hour < 21) return 'dinner';
    return 'snacks';
  }


  private extractCustomMeasurementsFromMessage(message: string): MeasurementSuggestion[] {
    const measurements: MeasurementSuggestion[] = [];
    const lowerMessage = message.toLowerCase();
    const today = new Date().toISOString().split('T')[0];

    // Blood sugar patterns
    const bloodSugarPatterns = [
      /(?:my\s+)?blood\s+sugar\s+is\s+(\d+(?:\.\d+)?)/gi,
      /(\d+(?:\.\d+)?)\s+(?:blood\s+sugar|glucose|bg)/gi,
      /glucose\s+(?:is\s+)?(\d+(?:\.\d+)?)/gi,
      /bg\s+(?:is\s+)?(\d+(?:\.\d+)?)/gi,
    ];

    // Cholesterol patterns
    const cholesterolPatterns = [
      /(?:my\s+)?cholesterol\s+(?:level\s+)?is\s+(\d+(?:\.\d+)?)/gi,
      /(\d+(?:\.\d+)?)\s+cholesterol/gi,
      /cholesterol\s+(?:level\s+)?(?:is\s+)?(\d+(?:\.\d+)?)/gi,
    ];

    // Blood pressure patterns (systolic/diastolic)
    const bloodPressurePatterns = [
      /(?:my\s+)?blood\s+pressure\s+is\s+(\d+)\/(\d+)/gi,
      /(\d+)\/(\d+)\s+(?:blood\s+pressure|bp)/gi,
      /bp\s+(?:is\s+)?(\d+)\/(\d+)/gi,
    ];

    // Heart rate patterns
    const heartRatePatterns = [
      /(?:my\s+)?heart\s+rate\s+is\s+(\d+)/gi,
      /(\d+)\s+(?:bpm|heart\s+rate)/gi,
      /pulse\s+(?:is\s+)?(\d+)/gi,
    ];

    // Body fat patterns
    const bodyFatPatterns = [
      /(?:my\s+)?body\s+fat\s+is\s+(\d+(?:\.\d+)?)%?/gi,
      /(\d+(?:\.\d+)?)%?\s+body\s+fat/gi,
    ];

    // Temperature patterns
    const temperaturePatterns = [
      /(?:my\s+)?temperature\s+is\s+(\d+(?:\.\d+)?)/gi,
      /(\d+(?:\.\d+)?)\s+(?:degrees?|temp)/gi,
      /temp\s+(?:is\s+)?(\d+(?:\.\d+)?)/gi,
    ];

    // Process blood sugar
    for (const pattern of bloodSugarPatterns) {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        const value = parseFloat(match[1]);
        measurements.push({
          type: 'blood_sugar' as any,
          value,
          unit: 'mg/dL',
          date: today
        });
      }
    }

    // Process cholesterol
    for (const pattern of cholesterolPatterns) {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        const value = parseFloat(match[1]);
        measurements.push({
          type: 'cholesterol' as any,
          value,
          unit: 'mg/dL',
          date: today
        });
      }
    }

    // Process blood pressure
    for (const pattern of bloodPressurePatterns) {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        const systolic = parseFloat(match[1]);
        const diastolic = parseFloat(match[2]);
        measurements.push({
          type: 'blood_pressure_systolic' as any,
          value: systolic,
          unit: 'mmHg',
          date: today
        });
        measurements.push({
          type: 'blood_pressure_diastolic' as any,
          value: diastolic,
          unit: 'mmHg',
          date: today
        });
      }
    }

    // Process heart rate
    for (const pattern of heartRatePatterns) {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        const value = parseFloat(match[1]);
        measurements.push({
          type: 'heart_rate' as any,
          value,
          unit: 'bpm',
          date: today
        });
      }
    }

    // Process body fat
    for (const pattern of bodyFatPatterns) {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        const value = parseFloat(match[1]);
        measurements.push({
          type: 'body_fat' as any,
          value,
          unit: '%',
          date: today
        });
      }
    }

    // Process temperature
    for (const pattern of temperaturePatterns) {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        const value = parseFloat(match[1]);
        measurements.push({
          type: 'temperature' as any,
          value,
          unit: '°F',
          date: today
        });
      }
    }

    return measurements;
  }

  private async saveCustomMeasurements(measurements: MeasurementSuggestion[]): Promise<boolean> {
    try {
      // Mapping of measurement types to category names and units
      const categoryMapping: { [key: string]: { name: string, unit: string } } = {
        'blood_sugar': { name: 'Blood Sugar', unit: 'mg/dL' },
        'cholesterol': { name: 'Cholesterol', unit: 'mg/dL' },
        'blood_pressure_systolic': { name: 'Blood Pressure (Systolic)', unit: 'mmHg' },
        'blood_pressure_diastolic': { name: 'Blood Pressure (Diastolic)', unit: 'mmHg' },
        'heart_rate': { name: 'Heart Rate', unit: 'bpm' },
        'body_fat': { name: 'Body Fat', unit: '%' },
        'temperature': { name: 'Temperature', unit: '°F' }
      };

      for (const measurement of measurements) {
        const categoryInfo = categoryMapping[measurement.type as string];
        if (categoryInfo) {
          // Check if category exists
          let category: { id: string } | null = null;
          try {
            category = await apiCall(`/measurements/custom-categories/${encodeURIComponent(categoryInfo.name)}`, {
              method: 'GET',
            });
          } catch (e: any) {
            if (e.message && e.message.includes('404')) {
              // Category not found, proceed to create
              console.log(`Category "${categoryInfo.name}" not found, creating...`);
            } else {
              console.error(`Error checking for custom category "${categoryInfo.name}":`, e);
              return false;
            }
          }

          if (!category || !category.id) {
            // Create category if it doesn't exist
            try {
              const newCategory = await apiCall('/measurements/custom-categories', {
                method: 'POST',
                body: {
                  name: categoryInfo.name,
                  measurement_type: categoryInfo.unit,
                  frequency: 'All'
                },
              });
              category = newCategory;
            } catch (createError: any) {
              console.error(`Error creating ${categoryInfo.name} category:`, createError);
              return false;
            }
          }

          // Save the measurement
          try {
            await apiCall('/measurements/custom-entries', {
              method: 'POST',
              body: {
                category_id: category.id,
                value: measurement.value,
                entry_date: measurement.date,
                entry_timestamp: new Date().toISOString()
              },
            });
          } catch (saveError: any) {
            console.error(`Error saving ${categoryInfo.name} measurement:`, saveError);
            return false;
          }
        }
      }

      return true;
    } catch (error: any) {
      console.error('Error in saveCustomMeasurements:', error);
      return false;
    }
  }

  public async processMessage(message: string): Promise<AIResponse> {
    try {
      // First, try to extract and save measurements
      const measurements = this.extractMeasurementsFromMessage(message);
      const customMeasurements = this.extractCustomMeasurementsFromMessage(message);

      let measurementSaveSuccess = true;
      if (measurements.length > 0) {
        measurementSaveSuccess = await this.saveMeasurements(measurements);
      }
      if (customMeasurements.length > 0) {
        const customSaveSuccess = await this.saveCustomMeasurements(customMeasurements);
        if (!customSaveSuccess) measurementSaveSuccess = false;
      }

      if (measurements.length > 0 || customMeasurements.length > 0) {
        const allMeasurements = [...measurements, ...customMeasurements];
        return {
          content: this.createMeasurementResponse(allMeasurements, measurementSaveSuccess),
          actionType: 'measurement',
          measurementSuggestions: allMeasurements
        };
      }

      // If no measurements, proceed with AI chat
      const activeService = await this.getActiveService();
      if (!activeService) {
        return { content: "I'm sorry, I couldn't find an active AI service configuration. Please set one up in your settings.", actionType: 'general' };
      }

      // Placeholder for actual AI call
      // In a real scenario, you would make an API call to your backend's /api/chat endpoint
      // using activeService.api_key, activeService.custom_url, activeService.model_name
      // and the user's message.
      // For now, we'll return a generic response.
      return { content: "I'm sorry, I can only process measurements at the moment. AI chat functionality is under development.", actionType: 'general' };

    } catch (error: any) {
      console.error('Error processing message:', error);
      return { content: `An unexpected error occurred: ${error.message}`, actionType: 'general' };
    }
  }

}

export default SparkyAIService;
