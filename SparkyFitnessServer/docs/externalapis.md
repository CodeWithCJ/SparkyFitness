# Internal

## Default

```bash
curl -X GET 'http://10.0.0.75:8080/api/foods/barcode/094395000172' \
  --header 'Accept: */*' \
  --header 'Authorization: Bearer {token}'
```

## Specify Provider

```bash
curl -X GET 'http://10.0.0.75:8080/api/foods/barcode/094395000172?providerId={provider id}' \
  --header 'Accept: */*' \
  --header 'Authorization: Bearer {token}'
```

### Response

```json
{
  "source": "openfoodfacts",
  "food": {
    "name": "Cheddar Cheese",
    "brand": "Grafton Village",
    "barcode": "0094395000172",
    "provider_external_id": "0094395000172",
    "provider_type": "openfoodfacts",
    "is_custom": false,
    "default_variant": {
      "serving_size": 28,
      "serving_unit": "g",
      "calories": 110,
      "protein": 6,
      "carbs": 1,
      "fat": 8,
      "saturated_fat": 6,
      "sodium": 190,
      "dietary_fiber": 0,
      "sugars": 0,
      "polyunsaturated_fat": 0,
      "monounsaturated_fat": 0,
      "trans_fat": 0,
      "cholesterol": 25,
      "potassium": 0,
      "vitamin_a": 120,
      "vitamin_c": 0,
      "calcium": 200,
      "iron": 0,
      "is_default": true
    }
  }
}
```

# External calls

## USDA

### Request

```bash
curl -X POST 'https://api.nal.usda.gov/fdc/v1/foods/search?api_key={api key}' \
  --header 'Content-Type: application/json' \
  --data '{
    "query": "094395000172",
    "dataType": ["Branded"]
  }'
```

### Response

```json
{
  "totalHits": 1,
  "currentPage": 1,
  "totalPages": 1,
  "pageList": [1],
  "foodSearchCriteria": {
    "dataType": ["Branded"],
    "query": "094395000172",
    "generalSearchInput": "094395000172",
    "pageNumber": 1,
    "numberOfResultsPerPage": 50,
    "pageSize": 50,
    "requireAllWords": false,
    "foodTypes": ["Branded"]
  },
  "foods": [
    {
      "fdcId": 2057648,
      "description": "CHEDDAR CHEESE",
      "dataType": "Branded",
      "gtinUpc": "094395000172",
      "publishedDate": "2021-10-28",
      "brandOwner": "Grafton Village Cheese Co, LLC",
      "brandName": "GRAFTON VILLAGE",
      "ingredients": "UNPASTEURIZED MILK, SALT, TRUFFLES (TRUFFLE, WATER, SALT, AROMAS), TRUFFLE OIL (OLIVE OIL, TRUFFLE FLAVOR), CULTURES, ENZYMES.",
      "marketCountry": "United States",
      "foodCategory": "Cheese",
      "modifiedDate": "2017-08-10",
      "dataSource": "LI",
      "packageWeight": "8 oz/227 g",
      "servingSizeUnit": "g",
      "servingSize": 28.0,
      "householdServingFullText": "1 ONZ",
      "tradeChannels": ["NO_TRADE_CHANNEL"],
      "allHighlightFields": "<b>GTIN/UPC</b>: <em>094395000172</em>",
      "score": -402.1905,
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
          "value": 21.4,
          "foodNutrientSourceId": 9,
          "foodNutrientSourceCode": "12",
          "foodNutrientSourceDescription": "Manufacturer's analytical; partial documentation",
          "rank": 600,
          "indentLevel": 1,
          "foodNutrientId": 25591523
        },
        {
          "nutrientId": 1004,
          "nutrientName": "Total lipid (fat)",
          "nutrientNumber": "204",
          "unitName": "G",
          "derivationCode": "LCCS",
          "derivationDescription": "Calculated from value per serving size measure",
          "derivationId": 70,
          "value": 28.6,
          "foodNutrientSourceId": 9,
          "foodNutrientSourceCode": "12",
          "foodNutrientSourceDescription": "Manufacturer's analytical; partial documentation",
          "rank": 800,
          "indentLevel": 1,
          "foodNutrientId": 25591524,
          "percentDailyValue": 12
        },
        {
          "nutrientId": 1005,
          "nutrientName": "Carbohydrate, by difference",
          "nutrientNumber": "205",
          "unitName": "G",
          "derivationCode": "LCCS",
          "derivationDescription": "Calculated from value per serving size measure",
          "derivationId": 70,
          "value": 3.57,
          "foodNutrientSourceId": 9,
          "foodNutrientSourceCode": "12",
          "foodNutrientSourceDescription": "Manufacturer's analytical; partial documentation",
          "rank": 1110,
          "indentLevel": 2,
          "foodNutrientId": 25591525,
          "percentDailyValue": 0
        },
        {
          "nutrientId": 1008,
          "nutrientName": "Energy",
          "nutrientNumber": "208",
          "unitName": "KCAL",
          "derivationCode": "LCCS",
          "derivationDescription": "Calculated from value per serving size measure",
          "derivationId": 70,
          "value": 393,
          "foodNutrientSourceId": 9,
          "foodNutrientSourceCode": "12",
          "foodNutrientSourceDescription": "Manufacturer's analytical; partial documentation",
          "rank": 300,
          "indentLevel": 1,
          "foodNutrientId": 25591526
        },
        {
          "nutrientId": 2000,
          "nutrientName": "Total Sugars",
          "nutrientNumber": "269",
          "unitName": "G",
          "derivationCode": "LCCS",
          "derivationDescription": "Calculated from value per serving size measure",
          "derivationId": 70,
          "value": 0.0,
          "foodNutrientSourceId": 9,
          "foodNutrientSourceCode": "12",
          "foodNutrientSourceDescription": "Manufacturer's analytical; partial documentation",
          "rank": 1510,
          "indentLevel": 3,
          "foodNutrientId": 25591527
        },
        {
          "nutrientId": 1079,
          "nutrientName": "Fiber, total dietary",
          "nutrientNumber": "291",
          "unitName": "G",
          "derivationCode": "LCCD",
          "derivationDescription": "Calculated from a daily value percentage per serving size measure",
          "derivationId": 75,
          "value": 0.0,
          "foodNutrientSourceId": 9,
          "foodNutrientSourceCode": "12",
          "foodNutrientSourceDescription": "Manufacturer's analytical; partial documentation",
          "rank": 1200,
          "indentLevel": 3,
          "foodNutrientId": 25591528,
          "percentDailyValue": 0
        },
        {
          "nutrientId": 1087,
          "nutrientName": "Calcium, Ca",
          "nutrientNumber": "301",
          "unitName": "MG",
          "derivationCode": "LCCD",
          "derivationDescription": "Calculated from a daily value percentage per serving size measure",
          "derivationId": 75,
          "value": 714,
          "foodNutrientSourceId": 9,
          "foodNutrientSourceCode": "12",
          "foodNutrientSourceDescription": "Manufacturer's analytical; partial documentation",
          "rank": 5300,
          "indentLevel": 1,
          "foodNutrientId": 25591529,
          "percentDailyValue": 20
        },
        {
          "nutrientId": 1089,
          "nutrientName": "Iron, Fe",
          "nutrientNumber": "303",
          "unitName": "MG",
          "derivationCode": "LCCD",
          "derivationDescription": "Calculated from a daily value percentage per serving size measure",
          "derivationId": 75,
          "value": 0.0,
          "foodNutrientSourceId": 9,
          "foodNutrientSourceCode": "12",
          "foodNutrientSourceDescription": "Manufacturer's analytical; partial documentation",
          "rank": 5400,
          "indentLevel": 1,
          "foodNutrientId": 25591530,
          "percentDailyValue": 0
        },
        {
          "nutrientId": 1093,
          "nutrientName": "Sodium, Na",
          "nutrientNumber": "307",
          "unitName": "MG",
          "derivationCode": "LCCS",
          "derivationDescription": "Calculated from value per serving size measure",
          "derivationId": 70,
          "value": 679,
          "foodNutrientSourceId": 9,
          "foodNutrientSourceCode": "12",
          "foodNutrientSourceDescription": "Manufacturer's analytical; partial documentation",
          "rank": 5800,
          "indentLevel": 1,
          "foodNutrientId": 25591531,
          "percentDailyValue": 8
        },
        {
          "nutrientId": 1104,
          "nutrientName": "Vitamin A, IU",
          "nutrientNumber": "318",
          "unitName": "IU",
          "derivationCode": "LCCD",
          "derivationDescription": "Calculated from a daily value percentage per serving size measure",
          "derivationId": 75,
          "value": 1430.0,
          "foodNutrientSourceId": 9,
          "foodNutrientSourceCode": "12",
          "foodNutrientSourceDescription": "Manufacturer's analytical; partial documentation",
          "rank": 7500,
          "indentLevel": 1,
          "foodNutrientId": 25591532,
          "percentDailyValue": 8
        },
        {
          "nutrientId": 1162,
          "nutrientName": "Vitamin C, total ascorbic acid",
          "nutrientNumber": "401",
          "unitName": "MG",
          "derivationCode": "LCCD",
          "derivationDescription": "Calculated from a daily value percentage per serving size measure",
          "derivationId": 75,
          "value": 0.0,
          "foodNutrientSourceId": 9,
          "foodNutrientSourceCode": "12",
          "foodNutrientSourceDescription": "Manufacturer's analytical; partial documentation",
          "rank": 6300,
          "indentLevel": 1,
          "foodNutrientId": 25591533,
          "percentDailyValue": 0
        },
        {
          "nutrientId": 1253,
          "nutrientName": "Cholesterol",
          "nutrientNumber": "601",
          "unitName": "MG",
          "derivationCode": "LCCS",
          "derivationDescription": "Calculated from value per serving size measure",
          "derivationId": 70,
          "value": 89.0,
          "foodNutrientSourceId": 9,
          "foodNutrientSourceCode": "12",
          "foodNutrientSourceDescription": "Manufacturer's analytical; partial documentation",
          "rank": 15700,
          "indentLevel": 1,
          "foodNutrientId": 25591534,
          "percentDailyValue": 8
        },
        {
          "nutrientId": 1257,
          "nutrientName": "Fatty acids, total trans",
          "nutrientNumber": "605",
          "unitName": "G",
          "derivationCode": "LCCS",
          "derivationDescription": "Calculated from value per serving size measure",
          "derivationId": 70,
          "value": 0.0,
          "foodNutrientSourceId": 9,
          "foodNutrientSourceCode": "12",
          "foodNutrientSourceDescription": "Manufacturer's analytical; partial documentation",
          "rank": 15400,
          "indentLevel": 1,
          "foodNutrientId": 25591535
        },
        {
          "nutrientId": 1258,
          "nutrientName": "Fatty acids, total saturated",
          "nutrientNumber": "606",
          "unitName": "G",
          "derivationCode": "LCCS",
          "derivationDescription": "Calculated from value per serving size measure",
          "derivationId": 70,
          "value": 21.4,
          "foodNutrientSourceId": 9,
          "foodNutrientSourceCode": "12",
          "foodNutrientSourceDescription": "Manufacturer's analytical; partial documentation",
          "rank": 9700,
          "indentLevel": 1,
          "foodNutrientId": 25591536,
          "percentDailyValue": 30
        }
      ],
      "finalFoodInputFoods": [],
      "foodMeasures": [],
      "foodAttributes": [],
      "foodAttributeTypes": [],
      "foodVersionIds": []
    }
  ],
  "aggregations": {
    "dataType": {
      "Branded": 1
    },
    "nutrients": {}
  }
}
```

## Open Food Facts

### Request

```bash
curl -X GET 'https://world.openfoodfacts.org/api/v2/product/094395000172.json' \
  --header 'Accept: */*'
```

### Response

```json
{
  "code": "0094395000172",
  "product": {
    "brands": "Grafton Village",
    "code": "0094395000172",
    "nutriments": {
      "calcium": 0.714,
      "calcium_100g": 0.714,
      "calcium_serving": 0.2,
      "calcium_unit": "g",
      "calcium_value": 0.714,
      "carbohydrates": 3.57,
      "carbohydrates_100g": 3.57,
      "carbohydrates_serving": 1,
      "carbohydrates_unit": "g",
      "carbohydrates_value": 3.57,
      "cholesterol": 0.089,
      "cholesterol_100g": 0.089,
      "cholesterol_serving": 0.0249,
      "cholesterol_unit": "g",
      "cholesterol_value": 0.089,
      "energy": 1644,
      "energy-kcal": 393,
      "energy-kcal_100g": 393,
      "energy-kcal_serving": 110,
      "energy-kcal_unit": "kcal",
      "energy-kcal_value": 393,
      "energy_100g": 1644,
      "energy_serving": 460,
      "energy_unit": "kJ",
      "energy_value": 1644,
      "fat": 28.57,
      "fat_100g": 28.57,
      "fat_serving": 8,
      "fat_unit": "g",
      "fat_value": 28.57,
      "fiber": 0,
      "fiber_100g": 0,
      "fiber_serving": 0,
      "fiber_unit": "g",
      "fiber_value": 0,
      "iron": 0,
      "iron_100g": 0,
      "iron_serving": 0,
      "iron_unit": "g",
      "iron_value": 0,
      "nova-group": 4,
      "nova-group_100g": 4,
      "nova-group_serving": 4,
      "nova-group_unit": "",
      "nova-group_value": 4,
      "proteins": 21.43,
      "proteins_100g": 21.43,
      "proteins_serving": 6,
      "proteins_unit": "g",
      "proteins_value": 21.43,
      "salt": 1.6975,
      "salt_100g": 1.6975,
      "salt_serving": 0.475,
      "salt_unit": "g",
      "salt_value": 1.6975,
      "saturated-fat": 21.43,
      "saturated-fat_100g": 21.43,
      "saturated-fat_serving": 6,
      "saturated-fat_unit": "g",
      "saturated-fat_value": 21.43,
      "sodium": 0.679,
      "sodium_100g": 0.679,
      "sodium_serving": 0.19,
      "sodium_unit": "g",
      "sodium_value": 0.679,
      "sugars": 0,
      "sugars_100g": 0,
      "sugars_serving": 0,
      "sugars_unit": "g",
      "sugars_value": 0,
      "trans-fat": 0,
      "trans-fat_100g": 0,
      "trans-fat_serving": 0,
      "trans-fat_unit": "g",
      "trans-fat_value": 0,
      "vitamin-a": 0.0004287,
      "vitamin-a_100g": 0.0004287,
      "vitamin-a_serving": 0.00012,
      "vitamin-a_unit": "g",
      "vitamin-a_value": 0.0004287,
      "vitamin-c": 0,
      "vitamin-c_100g": 0,
      "vitamin-c_serving": 0,
      "vitamin-c_unit": "g",
      "vitamin-c_value": 0
    },
    "nutrition_data": "on",
    "nutrition_data_per": "100g",
    "nutrition_data_prepared_per": "100g",
    "product_name": "Cheddar Cheese",
    "serving_quantity": 28,
    "serving_size": "1 ONZ (28 g)"
  },
  "status": 1,
  "status_verbose": "product found"
}
```
