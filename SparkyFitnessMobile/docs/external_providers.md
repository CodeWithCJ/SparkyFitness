They're all mounted under `/api/foods/` (since `foodIntegrationRoutes` is mounted via `foodRoutes.js`):

| Provider                  | Method | URL                                         | Required Headers |
| ------------------------- | ------ | ------------------------------------------- | ---------------- |
| FatSecret                 | `GET`  | `/api/foods/fatsecret/search?query=...`     | `x-provider-id`  |
| Open Food Facts           | `GET`  | `/api/foods/openfoodfacts/search?query=...` | —                |
| Open Food Facts (barcode) | `GET`  | `/api/foods/openfoodfacts/:barcode`         | —                |
| Nutritionix               | `GET`  | `/api/foods/nutritionix/search?query=...`   | `x-provider-id`  |
| Mealie                    | `GET`  | `/api/foods/mealie/search?query=...`        | `x-provider-id`  |
| Tandoor                   | `GET`  | `/api/foods/tandoor/search?query=...`       | `x-provider-id`  |
| USDA                      | `GET`  | `/api/foods/usda/search?query=...`          | `x-provider-id`  |

Most providers require an `x-provider-id` header — that's the ID of the user's configured external provider record (from `/api/external-providers/user/:userId`). The middleware uses it to look up the stored API keys/credentials for that provider. Open Food Facts is the exception since it's a free public API.


## Open Food Facts
```
curl -X GET 'http://10.0.0.75:8080/api/foods/openfoodfacts/search?query=pepper' \
  --header 'Accept: */*' \
  --header 'Authorization: Bearer {token}'
```

```ts
interface OpenFoodFactsProduct {
  product_name: string;
  brands?: string;
  serving_quantity?: number;
  nutriments: {
    'energy-kcal_100g'?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
    'saturated-fat_100g'?: number;
    sodium_100g?: number;
    fiber_100g?: number;
    sugars_100g?: number;
  };
  code: string;
}
```

## FatSecret

### Search

```bash
curl -X GET 'http://10.0.0.75:8080/api/foods/fatsecret/search?query=pepper&query=blueberry' \
  --header 'Accept: */*' \
  --header 'x-provider-id: dc38c941-527a-4ebf-9dc4-9b88a65dbd94ex' \
  --header 'Authorization: Bearer {token}'
```

```json
{
  "foods": {
    "food": [
      {
        "food_description": "Per 1019g - Calories: 2599kcal | Fat: 102.24g | Carbs: 421.07g | Protein: 18.76g",
        "food_id": "4162",
        "food_name": "Blueberry Crisp",
        "food_type": "Generic",
        "food_url": "https://foods.fatsecret.com/calories-nutrition/generic/crisp-blueberry"
      },
      {
        "food_description": "Per 1273g - Calories: 2089kcal | Fat: 78.87g | Carbs: 301.24g | Protein: 52.03g",
        "food_id": "376015",
        "food_name": "Blueberry Crepe",
        "food_type": "Generic",
        "food_url": "https://foods.fatsecret.com/calories-nutrition/generic/crepe-blueberry"
      },
      {
        "food_description": "Per 691g - Calories: 498kcal | Fat: 12.11g | Carbs: 86.02g | Protein: 15.73g",
        "food_id": "17473072",
        "food_name": "Blueberry Smoothie",
        "food_type": "Generic",
        "food_url": "https://foods.fatsecret.com/calories-nutrition/generic/blueberry-smoothie"
      },
    ],
    "max_results": "20",
    "page_number": "0",
    "total_results": "1000"
  }
}
```

### Nutrients

```bash
curl -X GET 'http://10.0.0.75:8080/api/foods/fatsecret/nutrients?foodId=4162' \
  --header 'User-Agent: yaak' \
  --header 'Accept: */*' \
  --header 'x-provider-id: dc38c941-527a-4ebf-9dc4-9b88a65dbd94' \
  --header 'Authorization: Bearer {token}'
```

```json
{
  "food": {
    "food_id": "4162",
    "food_name": "Blueberry Crisp",
    "food_type": "Generic",
    "food_url": "https://foods.fatsecret.com/calories-nutrition/generic/crisp-blueberry",
    "servings": {
      "serving": [
        {
          "serving_id": "13857",
          "serving_description": "1 cup",
          "serving_url": "https://foods.fatsecret.com/calories-nutrition/generic/crisp-blueberry?portionid=13857&portionamount=1.000",
          "metric_serving_amount": "246.000",
          "metric_serving_unit": "g",
          "number_of_units": "1.000",
          "measurement_description": "cup",
          "calories": "627",
          "carbohydrate": "101.62",
          "protein": "4.53",
          "fat": "24.67",
          "saturated_fat": "4.568",
          "polyunsaturated_fat": "7.351",
          "monounsaturated_fat": "11.355",
          "cholesterol": "0",
          "sodium": "780",
          "potassium": "155",
          "fiber": "4.7",
          "sugar": "69.15",
          "vitamin_a": "251",
          "vitamin_c": "12.1",
          "calcium": "123",
          "iron": "2.04"
        },
        {
          "serving_id": "52842",
          "serving_description": "100 g",
          "serving_url": "https://foods.fatsecret.com/calories-nutrition/generic/crisp-blueberry?portionid=52842&portionamount=100.000",
          "metric_serving_amount": "100.000",
          "metric_serving_unit": "g",
          "number_of_units": "100.000",
          "measurement_description": "g",
          "calories": "255",
          "carbohydrate": "41.31",
          "protein": "1.84",
          "fat": "10.03",
          "saturated_fat": "1.857",
          "polyunsaturated_fat": "2.988",
          "monounsaturated_fat": "4.616",
          "cholesterol": "0",
          "sodium": "317",
          "potassium": "63",
          "fiber": "1.9",
          "sugar": "28.11",
          "vitamin_a": "102",
          "vitamin_c": "4.9",
          "calcium": "50",
          "iron": "0.83"
        },
        {
          "serving_id": "14137",
          "serving_description": "1 cubic inch",
          "serving_url": "https://foods.fatsecret.com/calories-nutrition/generic/crisp-blueberry?portionid=14137&portionamount=1.000",
          "metric_serving_amount": "15.000",
          "metric_serving_unit": "g",
          "number_of_units": "1.000",
          "measurement_description": "cubic inch",
          "calories": "38",
          "carbohydrate": "6.20",
          "protein": "0.28",
          "fat": "1.50",
          "saturated_fat": "0.279",
          "polyunsaturated_fat": "0.448",
          "monounsaturated_fat": "0.692",
          "cholesterol": "0",
          "sodium": "48",
          "potassium": "9",
          "fiber": "0.3",
          "sugar": "4.22",
          "vitamin_a": "15",
          "vitamin_c": "0.7",
          "calcium": "7",
          "iron": "0.12"
        },
        {
          "serving_id": "182285",
          "serving_description": "1 oz",
          "serving_url": "https://foods.fatsecret.com/calories-nutrition/generic/crisp-blueberry?portionid=182285&portionamount=1.000",
          "metric_serving_amount": "28.350",
          "metric_serving_unit": "g",
          "number_of_units": "1.000",
          "measurement_description": "oz",
          "calories": "72",
          "carbohydrate": "11.71",
          "protein": "0.52",
          "fat": "2.84",
          "saturated_fat": "0.526",
          "polyunsaturated_fat": "0.847",
          "monounsaturated_fat": "1.309",
          "cholesterol": "0",
          "sodium": "90",
          "potassium": "18",
          "fiber": "0.5",
          "sugar": "7.97",
          "vitamin_a": "29",
          "vitamin_c": "1.4",
          "calcium": "14",
          "iron": "0.24"
        },
        {
          "serving_id": "13762",
          "serving_description": "1 serving (123 g)",
          "serving_url": "https://foods.fatsecret.com/calories-nutrition/generic/crisp-blueberry?portionid=13762&portionamount=1.000",
          "metric_serving_amount": "123.000",
          "metric_serving_unit": "g",
          "number_of_units": "1.000",
          "measurement_description": "serving (123g)",
          "calories": "314",
          "carbohydrate": "50.81",
          "protein": "2.26",
          "fat": "12.34",
          "saturated_fat": "2.284",
          "polyunsaturated_fat": "3.675",
          "monounsaturated_fat": "5.678",
          "cholesterol": "0",
          "sodium": "390",
          "potassium": "77",
          "fiber": "2.3",
          "sugar": "34.58",
          "vitamin_a": "125",
          "vitamin_c": "6.0",
          "calcium": "61",
          "iron": "1.02"
        }
      ]
    }
  }
}
```

## Nutritionix

## Mealie

## Tandoor

## USDA


```ts
export interface UsdaFoodSearchItem {
  fdcId: number;
  description: string;
  brandOwner?: string;
  dataType: string;
  foodCategory: string;
  publicationDate: string;
  foodNutrients: UsdaFoodNutrient[];
  servingSize?: number;
  servingSizeUnit?: string;
}


export interface UsdaFoodNutrient {
  nutrientId: number;
  nutrientName: string;
  nutrientNumber: string;
  unitName: string;
  value: number;
}

export interface UsdaFoodDetails {
  fdcId: number;
  description: string;
  brandOwner?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  calories: number;
  protein: number;
  fat: number;
  carbohydrates: number;
  sugars?: number;
  fiber?: number;
  sodium?: number;
  cholesterol?: number;
  saturatedFat?: number;
  transFat?: number;
  monounsaturatedFat?: number;
  polyunsaturatedFat?: number;
  potassium?: number;
  vitaminA?: number;
  vitaminC?: number;
  calcium?: number;
  iron?: number;
}
```

```bash
curl -X GET 'http://10.0.0.75:8080/api/foods/usda/search?query=blueberry' \
  --header 'User-Agent: yaak' \
  --header 'Accept: */*' \
  --header 'x-provider-id: 76fdb9f8-ff9c-48fb-aeea-df5a2feb3973' \
  --header 'Authorization: Bearer {token}'
```
```json
{
  "foods": [
    {
      "fdcId": 2116605,
      "description": "BLUEBERRY",
      "dataType": "Branded",
      "gtinUpc": "070920005263",
      "publishedDate": "2021-10-28",
      "brandOwner": "Conagra Brands, Inc.",
      "brandName": "KNOTT'S BERRY FARM",
      "ingredients": "SUGAR, BLUEBERRIES, FRUIT PECTIN, CITRIC ACID.",
      "marketCountry": "United States",
      "foodCategory": "Jam, Jelly & Fruit Spreads",
      "modifiedDate": "2018-02-21",
      "dataSource": "LI",
      "packageWeight": "10 oz/284 g",
      "servingSizeUnit": "g",
      "servingSize": 20,
      "householdServingFullText": "1 Tbsp",
      "tradeChannels": [
        "NO_TRADE_CHANNEL"
      ],
      "allHighlightFields": "<b>Ingredients</b>: SUGAR, <em>BLUEBERRIES</em>, FRUIT PECTIN, CITRIC ACID.",
      "score": 1152.7708,
      "microbes": [],
      "foodNutrients": [
        {
          "nutrientId": 1003,
          "nutrientName": "Protein",
          "nutrientNumber": "203",
          "unitName": "G",
          "derivationCode": "LCCS",
          "derivationDescription": "Calculated from value per serving size measure",
          "derivationId": 70,
          "value": 0,
          "foodNutrientSourceId": 9,
          "foodNutrientSourceCode": "12",
          "foodNutrientSourceDescription": "Manufacturer's analytical; partial documentation",
          "rank": 600,
          "indentLevel": 1,
          "foodNutrientId": 25592372
        },
        {
          "nutrientId": 1004,
          "nutrientName": "Total lipid (fat)",
          "nutrientNumber": "204",
          "unitName": "G",
          "derivationCode": "LCCD",
          "derivationDescription": "Calculated from a daily value percentage per serving size measure",
          "derivationId": 75,
          "value": 0,
          "foodNutrientSourceId": 9,
          "foodNutrientSourceCode": "12",
          "foodNutrientSourceDescription": "Manufacturer's analytical; partial documentation",
          "rank": 800,
          "indentLevel": 1,
          "foodNutrientId": 25592373,
          "percentDailyValue": 0
        },
        {
          "nutrientId": 1005,
          "nutrientName": "Carbohydrate, by difference",
          "nutrientNumber": "205",
          "unitName": "G",
          "derivationCode": "LCCS",
          "derivationDescription": "Calculated from value per serving size measure",
          "derivationId": 70,
          "value": 65,
          "foodNutrientSourceId": 9,
          "foodNutrientSourceCode": "12",
          "foodNutrientSourceDescription": "Manufacturer's analytical; partial documentation",
          "rank": 1110,
          "indentLevel": 2,
          "foodNutrientId": 25592374,
          "percentDailyValue": 4
        },
        {
          "nutrientId": 1008,
          "nutrientName": "Energy",
          "nutrientNumber": "208",
          "unitName": "KCAL",
          "derivationCode": "LCCS",
          "derivationDescription": "Calculated from value per serving size measure",
          "derivationId": 70,
          "value": 250,
          "foodNutrientSourceId": 9,
          "foodNutrientSourceCode": "12",
          "foodNutrientSourceDescription": "Manufacturer's analytical; partial documentation",
          "rank": 300,
          "indentLevel": 1,
          "foodNutrientId": 25592375
        },
        {
          "nutrientId": 2000,
          "nutrientName": "Total Sugars",
          "nutrientNumber": "269",
          "unitName": "G",
          "derivationCode": "LCCS",
          "derivationDescription": "Calculated from value per serving size measure",
          "derivationId": 70,
          "value": 60,
          "foodNutrientSourceId": 9,
          "foodNutrientSourceCode": "12",
          "foodNutrientSourceDescription": "Manufacturer's analytical; partial documentation",
          "rank": 1510,
          "indentLevel": 3,
          "foodNutrientId": 25592376
        },
        {
          "nutrientId": 1093,
          "nutrientName": "Sodium, Na",
          "nutrientNumber": "307",
          "unitName": "MG",
          "derivationCode": "LCCD",
          "derivationDescription": "Calculated from a daily value percentage per serving size measure",
          "derivationId": 75,
          "value": 0,
          "foodNutrientSourceId": 9,
          "foodNutrientSourceCode": "12",
          "foodNutrientSourceDescription": "Manufacturer's analytical; partial documentation",
          "rank": 5800,
          "indentLevel": 1,
          "foodNutrientId": 25592377,
          "percentDailyValue": 0
        }
      ],
      "finalFoodInputFoods": [],
      "foodMeasures": [],
      "foodAttributes": [],
      "foodAttributeTypes": [],
      "foodVersionIds": []
    }
  ]
}
```