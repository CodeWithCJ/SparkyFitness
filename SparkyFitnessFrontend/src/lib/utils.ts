import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDateToYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Months are 0-indexed
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getNutrientUnit(nutrientName: string, currentEnergyUnit: 'kcal' | 'kJ' = 'kcal'): string {
  switch (nutrientName) {
    case 'calories':
      return currentEnergyUnit;
    case 'protein':
    case 'carbs':
    case 'fat':
    case 'saturated_fat':
    case 'polyunsaturated_fat':
    case 'monounsaturated_fat':
    case 'trans_fat':
    case 'dietary_fiber':
    case 'sugars':
      return 'g';
    case 'cholesterol':
    case 'sodium':
    case 'potassium':
    case 'vitamin_c':
    case 'calcium':
    case 'iron':
      return 'mg';
    case 'vitamin_a':
      return 'μg';
    default:
      return '';
  }
}

export function formatNutrientValue(value: number, nutrientName: string, currentEnergyUnit: 'kcal' | 'kJ' = 'kcal', converter?: (value: number, fromUnit: 'kcal' | 'kJ', toUnit: 'kcal' | 'kJ') => number): string {
  let formattedValue: string;
  let finalValue = value;

  switch (nutrientName) {
    case 'calories':
      if (converter) {
        finalValue = converter(value, 'kcal', currentEnergyUnit);
      }
      formattedValue = Math.round(finalValue).toString();
      break;
    case 'vitamin_a':
      formattedValue = Math.round(value).toString();
      break;
    case 'protein':
    case 'carbs':
    case 'fat':
    case 'saturated_fat':
    case 'polyunsaturated_fat':
    case 'monounsaturated_fat':
    case 'trans_fat':
    case 'dietary_fiber':
    case 'sugars':
      formattedValue = value.toFixed(1);
      break;
    case 'cholesterol':
    case 'sodium':
    case 'potassium':
    case 'vitamin_c':
    case 'calcium':
    case 'iron':
      formattedValue = value.toFixed(2);
      break;
    default:
      formattedValue = value.toString();
      break;
  }

  return `${formattedValue}${getNutrientUnit(nutrientName, currentEnergyUnit)}`;
}
