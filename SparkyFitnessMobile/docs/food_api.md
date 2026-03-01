# Food API

## GET /api/foods

Gets recent and top foods. This endpoint is used for the "Recent" tab in the Add Food Entry screen.

## GET /api/foods/foods-paginated

`routes/foodCrudRoutes.js:256`

Searches for foods based on searchTerm. foodFilter is unused.

### Query Parameters

| Param | Type | Description |
|---|---|---|
| searchTerm | string | Text to search for |
| foodFilter | string | Filter to apply to the food list (unused) |
| currentPage | integer | Page number for pagination |
| itemsPerPage | integer | Number of items per page |
| sortBy | string | Field to sort by (name:asc\|desc) |

### Response (200)

```json
{
  "foods": [ /* array of Food objects */ ],
  "totalCount": 42
}
```

## POST /api/food-entries/


### Required fields
- `meal_type_id` (uuid) — or `meal_type` (string name, e.g. "Breakfast") as a fallback
- `quantity` (number)
- `unit` (string)
- `entry_date` (date, YYYY-MM-DD)

### Two modes of use

**1. Linked to an existing food** — provide:
- `food_id` (uuid)
- `variant_id` (uuid)
- Nutrition data is auto-snapshotted from the food/variant
- Note that we will need the variant id

**2. Standalone entry (no food_id)** — provide nutrition data directly:
- `food_name` (string, required)
- `calories` (number, required)
- `brand_name`, `serving_size`, `serving_unit`
- `protein`, `carbs`, `fat`
- `saturated_fat`, `polyunsaturated_fat`, `monounsaturated_fat`, `trans_fat`
- `cholesterol`, `sodium`, `potassium`, `dietary_fiber`, `sugars`
- `vitamin_a`, `vitamin_c`, `calcium`, `iron`, `glycemic_index`
- `custom_nutrients` (object)

### Optional fields (both modes)
- `user_id` (uuid) — for creating on behalf of another user
- `meal_id` (uuid) — if part of a meal
- `food_entry_meal_id` (uuid) — if part of a logged meal group
- `meal_plan_template_id` (uuid)

### Response (201)

```json
{
  "id": "15ff0d7d-aa8e-4a1e-bc78-cc5e0269e869",
  "user_id": "999838ee-15ce-4c24-ac56-875c5e9416a9",
  "food_id": "94b12152-4b3b-4a90-af9c-df6900efe5a5",
  "quantity": 100,
  "unit": "g",
  "entry_date": "2026-02-24T06:00:00.000Z",
  "created_at": "2026-02-24T11:27:50.252Z",
  "variant_id": "86687b55-7d88-4d19-8bda-31ae4ee9b810",
  "meal_plan_template_id": null,
  "created_by_user_id": "999838ee-15ce-4c24-ac56-875c5e9416a9",
  "food_name": "Sprite Bottle, 2 Liters",
  "brand_name": "Coca-Cola",
  "serving_size": 100,
  "serving_unit": "g",
  "calories": 39,
  "protein": 0,
  "carbs": 11,
  "fat": 0,
  "saturated_fat": null,
  "polyunsaturated_fat": null,
  "monounsaturated_fat": null,
  "trans_fat": null,
  "cholesterol": null,
  "sodium": null,
  "potassium": null,
  "dietary_fiber": null,
  "sugars": null,
  "vitamin_a": null,
  "vitamin_c": null,
  "calcium": null,
  "iron": null,
  "glycemic_index": null,
  "updated_by_user_id": "999838ee-15ce-4c24-ac56-875c5e9416a9",
  "meal_id": null,
  "food_entry_meal_id": null,
  "custom_nutrients": {},
  "meal_type_id": "d7bbfb6c-a5fb-48e0-9444-718bd20e7885"
}
```


## POST /api/foods

```json
{
  "name": "Protein Shake",
  "brand": "Homemade",
  "user_id": "some-uuid-here",
  "is_custom": true,
  "is_quick_food": true,
  "barcode": null,
  "provider_external_id": null,
  "provider_type": null,
  "serving_size": 1,
  "serving_unit": "serving",
  "calories": 250,
  "protein": 30,
  "carbs": 15,
  "fat": 8,
  "saturated_fat": 2,
  "polyunsaturated_fat": null,
  "monounsaturated_fat": null,
  "trans_fat": 0,
  "cholesterol": null,
  "sodium": null,
  "potassium": null,
  "dietary_fiber": null,
  "sugars": 5,
  "vitamin_a": null,
  "vitamin_c": null,
  "calcium": null,
  "iron": null,
  "is_default": true,
  "glycemic_index": null,
  "custom_nutrients": {}
}
```