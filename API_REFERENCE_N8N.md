# SparkyFitness API Reference for n8n Workflows

**Version:** 0.15.8.5
**Base URL:** `http://localhost:3010` (development) | `http://your-server:3010` (production)
**Documentation:** https://codewithcj.github.io/SparkyFitness

---

## Table of Contents

- [Authentication](#authentication)
- [Common Patterns](#common-patterns)
- [API Endpoints by Category](#api-endpoints-by-category)
  - [1. Authentication & Users](#1-authentication--users)
  - [2. Foods Management](#2-foods-management)
  - [3. Food Diary Entries](#3-food-diary-entries)
  - [4. Meals Management](#4-meals-management)
  - [5. Exercises Management](#5-exercises-management)
  - [6. Exercise Entries](#6-exercise-entries)
  - [7. Goals Management](#7-goals-management)
  - [8. Measurements & Health](#8-measurements--health)
  - [9. Water Tracking](#9-water-tracking)
  - [10. AI Chat (SparkyAI)](#10-ai-chat-sparkyai)
  - [11. Garmin Integration](#11-garmin-integration)
  - [12. Withings Integration](#12-withings-integration)
  - [13. Reports & Analytics](#13-reports--analytics)
  - [14. Administration](#14-administration)
  - [15. Utilities](#15-utilities)
- [Webhook Examples](#webhook-examples)
- [n8n Workflow Templates](#n8n-workflow-templates)
- [Error Handling](#error-handling)
- [Rate Limiting & Best Practices](#rate-limiting--best-practices)

---

## Authentication

### Authentication Methods

SparkyFitness API supports three authentication methods:

#### 1. JWT Token (Recommended for workflows)

**Obtaining a JWT Token:**

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid-here",
    "email": "user@example.com",
    "full_name": "John Doe",
    "role": "user"
  }
}
```

**Token Expiration:** 24 hours

**Usage in n8n:**
- Store token in n8n credentials or workflow variables
- Add header: `Authorization: Bearer {token}`

#### 2. API Key (Best for automated workflows)

**Generating an API Key:**

```http
POST /auth/user/generate-api-key
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "description": "n8n automation workflow"
}
```

**Response:**
```json
{
  "id": "uuid",
  "api_key": "sk_live_abc123...",
  "description": "n8n automation workflow",
  "created_at": "2025-11-04T10:00:00Z"
}
```

**Usage in n8n:**
- Store API key securely in n8n credentials
- Add header: `Authorization: Bearer {api_key}`
- API keys don't expire but can be revoked

#### 3. Session-based (OIDC) - Not recommended for n8n

Use JWT or API Key authentication for n8n workflows.

### n8n Authentication Setup

**Method 1: Using HTTP Request Node with Predefined Credentials**

1. Go to Credentials in n8n
2. Create "Header Auth" credential
3. Set header name: `Authorization`
4. Set header value: `Bearer YOUR_API_KEY_HERE`

**Method 2: Using Workflow Variables**

```javascript
// Set in workflow settings or first node
$vars.apiKey = 'YOUR_API_KEY_HERE';
$vars.baseUrl = 'http://localhost:3010';

// Use in HTTP Request nodes
Headers: {
  "Authorization": `Bearer {{$vars.apiKey}}`
}
```

---

## Common Patterns

### Date Formats

**Standard Date Format:** `YYYY-MM-DD`

```javascript
// In n8n Function node
const today = new Date().toISOString().split('T')[0];
// Returns: "2025-11-04"

const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
// Returns: "2025-11-03"
```

### Meal Types

Valid meal types for food entries:
- `breakfast`
- `lunch`
- `dinner`
- `snack`

### Units

**Weight Units:** `kg`, `lbs`
**Distance Units:** `cm`, `in`, `m`, `km`, `mi`
**Volume Units:** `ml`, `l`, `oz`, `cup`

### Pagination

Most list endpoints support pagination:

```javascript
// Query parameters
{
  "currentPage": 1,
  "itemsPerPage": 20
}
```

### User Context

To access data for a specific user (requires family access permission):

**Header:** `x-target-user-id: {userId}`

---

## API Endpoints by Category

## 1. Authentication & Users

### 1.1 User Login

**Purpose:** Authenticate user and obtain JWT token

```http
POST /auth/login
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Success Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "full_name": "John Doe",
    "role": "user"
  }
}
```

**n8n Usage:**
```javascript
// Store token for subsequent requests
$vars.authToken = $json.token;
$vars.userId = $json.user.id;
```

---

### 1.2 Register New User

**Purpose:** Create a new user account

```http
POST /auth/register
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "password": "securePassword123",
  "full_name": "Jane Doe"
}
```

**Success Response (201):**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "uuid",
    "email": "newuser@example.com",
    "full_name": "Jane Doe"
  }
}
```

---

### 1.3 Get Current User

**Purpose:** Retrieve authenticated user information

```http
GET /auth/user
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "full_name": "John Doe",
  "role": "user",
  "created_at": "2025-01-01T00:00:00Z"
}
```

---

### 1.4 Generate API Key

**Purpose:** Create API key for programmatic access

```http
POST /auth/user/generate-api-key
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "description": "n8n workflow automation"
}
```

**Success Response (201):**
```json
{
  "id": "uuid",
  "api_key": "sk_live_abc123def456...",
  "description": "n8n workflow automation",
  "created_at": "2025-11-04T10:00:00Z"
}
```

**Important:** Store the API key securely. It won't be shown again.

---

### 1.5 Get Accessible Users

**Purpose:** Get list of users accessible (for multi-user/family features)

```http
GET /auth/users/accessible-users
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "users": [
    {
      "id": "uuid-1",
      "full_name": "John Doe",
      "email": "john@example.com",
      "relation": "self"
    },
    {
      "id": "uuid-2",
      "full_name": "Jane Doe",
      "email": "jane@example.com",
      "relation": "family"
    }
  ]
}
```

---

### 1.6 Update User Profile

**Purpose:** Update user profile information

```http
PUT /auth/profiles
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "full_name": "John Updated Doe",
  "phone_number": "+1234567890",
  "date_of_birth": "1990-01-01",
  "gender": "male"
}
```

**Success Response (200):**
```json
{
  "message": "Profile updated successfully",
  "profile": {
    "id": "uuid",
    "full_name": "John Updated Doe",
    "phone_number": "+1234567890",
    "date_of_birth": "1990-01-01",
    "gender": "male"
  }
}
```

---

## 2. Foods Management

### 2.1 Search Foods

**Purpose:** Search foods by name

```http
GET /auth/foods/search?name={searchTerm}&limit={limit}
Authorization: Bearer {token}
```

**Query Parameters:**
- `name` (required): Search term
- `limit` (optional): Max results (default: 50)
- `exactMatch` (optional): Boolean for exact matching
- `checkCustom` (optional): Include custom foods

**Example:**
```http
GET /foods/search?name=apple&limit=10
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "foods": [
    {
      "id": "uuid-1",
      "name": "Apple, Red Delicious",
      "brand": null,
      "calories": 95,
      "protein": 0.5,
      "carbs": 25,
      "fat": 0.3,
      "fiber": 4,
      "serving_size": "1 medium (182g)",
      "is_public": true,
      "user_id": null
    },
    {
      "id": "uuid-2",
      "name": "Apple Juice",
      "brand": "Tropicana",
      "calories": 110,
      "protein": 0,
      "carbs": 28,
      "fat": 0,
      "serving_size": "240ml",
      "is_public": true,
      "user_id": null
    }
  ]
}
```

**n8n Example:**
```javascript
// Function node to prepare search
const searchTerm = $input.item.json.foodName || 'chicken';
return {
  queryParams: {
    name: searchTerm,
    limit: 10
  }
};
```

---

### 2.2 Get Food by ID

**Purpose:** Retrieve detailed information about a specific food

```http
GET /foods/{foodId}
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "id": "uuid",
  "name": "Chicken Breast, Grilled",
  "brand": null,
  "calories": 165,
  "protein": 31,
  "carbs": 0,
  "fat": 3.6,
  "fiber": 0,
  "serving_size": "100g",
  "serving_unit": "g",
  "is_public": true,
  "user_id": null,
  "variants": [
    {
      "id": "variant-uuid-1",
      "serving_size": "100g",
      "serving_unit": "g",
      "multiplier": 1
    },
    {
      "id": "variant-uuid-2",
      "serving_size": "1 breast (172g)",
      "serving_unit": "breast",
      "multiplier": 1.72
    }
  ]
}
```

---

### 2.3 Create Custom Food

**Purpose:** Create a custom food item

```http
POST /foods
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "My Custom Recipe",
  "calories": 250,
  "protein": 15,
  "carbs": 30,
  "fat": 8,
  "fiber": 5,
  "serving_size": "1 serving",
  "serving_unit": "serving",
  "is_public": false,
  "notes": "My special recipe"
}
```

**Success Response (201):**
```json
{
  "id": "uuid",
  "name": "My Custom Recipe",
  "calories": 250,
  "protein": 15,
  "carbs": 30,
  "fat": 8,
  "fiber": 5,
  "serving_size": "1 serving",
  "is_public": false,
  "user_id": "user-uuid",
  "created_at": "2025-11-04T10:00:00Z"
}
```

---

### 2.4 Update Food

**Purpose:** Update an existing food item (only custom foods owned by user)

```http
PUT /foods/{foodId}
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Updated Recipe Name",
  "calories": 260,
  "protein": 16
}
```

**Success Response (200):**
```json
{
  "message": "Food updated successfully",
  "food": {
    "id": "uuid",
    "name": "Updated Recipe Name",
    "calories": 260,
    "protein": 16
  }
}
```

---

### 2.5 Delete Food

**Purpose:** Delete a custom food item

```http
DELETE /foods/{foodId}?forceDelete={boolean}
Authorization: Bearer {token}
```

**Query Parameters:**
- `forceDelete` (optional): Force deletion even if referenced in entries

**Success Response (200):**
```json
{
  "message": "Food deleted successfully"
}
```

---

### 2.6 Search FatSecret Database

**Purpose:** Search foods in FatSecret external database

```http
GET /foods/fatsecret/search?query={searchTerm}
Authorization: Bearer {token}
x-provider-id: {providerId}
```

**Headers:**
- `x-provider-id`: FatSecret provider ID (from external_data_providers table)

**Success Response (200):**
```json
{
  "foods": [
    {
      "food_id": "12345",
      "food_name": "Banana",
      "food_description": "Per 100g - Calories: 89kcal | Fat: 0.33g | Carbs: 22.84g | Protein: 1.09g",
      "brand_name": null
    }
  ]
}
```

---

### 2.7 Search Nutritionix Database

**Purpose:** Search foods in Nutritionix external database

```http
GET /foods/nutritionix/search?query={searchTerm}&providerId={providerId}
Authorization: Bearer {token}
```

**Query Parameters:**
- `query` (required): Search term
- `providerId` (required): Nutritionix provider ID

**Success Response (200):**
```json
{
  "common": [
    {
      "food_name": "banana",
      "serving_unit": "medium",
      "serving_qty": 1,
      "photo": {
        "thumb": "https://..."
      }
    }
  ],
  "branded": []
}
```

---

### 2.8 Barcode Search

**Purpose:** Search food by barcode using Open Food Facts

```http
GET /foods/openfoodfacts/barcode/{barcode}
Authorization: Bearer {token}
```

**Example:**
```http
GET /foods/openfoodfacts/barcode/737628064502
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "product": {
    "product_name": "Product Name",
    "brands": "Brand Name",
    "nutriments": {
      "energy-kcal_100g": 200,
      "proteins_100g": 10,
      "carbohydrates_100g": 30,
      "fat_100g": 5,
      "fiber_100g": 3
    },
    "serving_size": "100g"
  }
}
```

---

## 3. Food Diary Entries

### 3.1 Get Food Diary for Date

**Purpose:** Retrieve all food entries for a specific date

```http
GET /foods/food-entries?selectedDate={date}
Authorization: Bearer {token}
```

**Query Parameters:**
- `selectedDate` (required): Date in format YYYY-MM-DD

**Example:**
```http
GET /foods/food-entries?selectedDate=2025-11-04
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "entries": [
    {
      "id": "uuid-1",
      "food_id": "food-uuid",
      "food_name": "Scrambled Eggs",
      "meal_type": "breakfast",
      "serving_qty": 2,
      "serving_size": "1 large egg",
      "calories": 180,
      "protein": 12,
      "carbs": 2,
      "fat": 14,
      "entry_date": "2025-11-04",
      "created_at": "2025-11-04T08:00:00Z"
    },
    {
      "id": "uuid-2",
      "food_id": "food-uuid-2",
      "food_name": "Oatmeal",
      "meal_type": "breakfast",
      "serving_qty": 1,
      "serving_size": "1 cup cooked",
      "calories": 150,
      "protein": 5,
      "carbs": 27,
      "fat": 3,
      "entry_date": "2025-11-04",
      "created_at": "2025-11-04T08:15:00Z"
    }
  ],
  "totals": {
    "breakfast": {
      "calories": 330,
      "protein": 17,
      "carbs": 29,
      "fat": 17
    },
    "lunch": {
      "calories": 0,
      "protein": 0,
      "carbs": 0,
      "fat": 0
    },
    "dinner": {
      "calories": 0,
      "protein": 0,
      "carbs": 0,
      "fat": 0
    },
    "snack": {
      "calories": 0,
      "protein": 0,
      "carbs": 0,
      "fat": 0
    },
    "total": {
      "calories": 330,
      "protein": 17,
      "carbs": 29,
      "fat": 17
    }
  }
}
```

---

### 3.2 Log Food Entry

**Purpose:** Add a food entry to the diary

```http
POST /foods/food-entries
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "food_id": "food-uuid-here",
  "serving_qty": 1.5,
  "variant_id": "variant-uuid-optional",
  "meal_type": "lunch",
  "entry_date": "2025-11-04",
  "notes": "Optional notes"
}
```

**Success Response (201):**
```json
{
  "id": "uuid",
  "food_id": "food-uuid",
  "food_name": "Chicken Breast",
  "serving_qty": 1.5,
  "meal_type": "lunch",
  "entry_date": "2025-11-04",
  "calories": 247.5,
  "protein": 46.5,
  "carbs": 0,
  "fat": 5.4,
  "created_at": "2025-11-04T12:00:00Z"
}
```

**n8n Workflow Example:**
```javascript
// Function node to prepare food entry
const entryData = {
  food_id: $input.item.json.foodId,
  serving_qty: $input.item.json.quantity || 1,
  meal_type: $input.item.json.mealType || 'lunch',
  entry_date: new Date().toISOString().split('T')[0]
};

return { json: entryData };
```

---

### 3.3 Update Food Entry

**Purpose:** Update an existing food entry

```http
PUT /foods/food-entries/{entryId}
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "serving_qty": 2,
  "meal_type": "dinner",
  "notes": "Updated portion"
}
```

**Success Response (200):**
```json
{
  "message": "Food entry updated successfully",
  "entry": {
    "id": "uuid",
    "serving_qty": 2,
    "meal_type": "dinner",
    "calories": 330
  }
}
```

---

### 3.4 Delete Food Entry

**Purpose:** Remove a food entry from the diary

```http
DELETE /foods/food-entries/{entryId}
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "message": "Food entry deleted successfully"
}
```

---

### 3.5 Get Daily Nutrition Summary

**Purpose:** Get nutrition totals for a specific date

```http
GET /foods/food-entries/nutrition/today?date={date}
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "date": "2025-11-04",
  "totals": {
    "calories": 2100,
    "protein": 150,
    "carbs": 220,
    "fat": 70,
    "fiber": 35
  },
  "by_meal": {
    "breakfast": { "calories": 500, "protein": 30, "carbs": 60, "fat": 15 },
    "lunch": { "calories": 700, "protein": 50, "carbs": 70, "fat": 25 },
    "dinner": { "calories": 800, "protein": 60, "carbs": 80, "fat": 25 },
    "snack": { "calories": 100, "protein": 10, "carbs": 10, "fat": 5 }
  }
}
```

---

### 3.6 Copy Food Entries

**Purpose:** Copy food entries from one meal/date to another

```http
POST /foods/food-entries/copy
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "sourceDate": "2025-11-03",
  "sourceMealType": "breakfast",
  "targetDate": "2025-11-04",
  "targetMealType": "breakfast"
}
```

**Success Response (200):**
```json
{
  "message": "Food entries copied successfully",
  "copiedCount": 3,
  "entries": [...]
}
```

---

### 3.7 Copy from Yesterday

**Purpose:** Quick copy of yesterday's meal to today

```http
POST /foods/food-entries/copy-yesterday
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "mealType": "breakfast",
  "targetDate": "2025-11-04"
}
```

**Success Response (200):**
```json
{
  "message": "Meal copied from yesterday",
  "copiedCount": 2
}
```

---

## 4. Meals Management

### 4.1 Get Meal Templates

**Purpose:** Retrieve all meal templates

```http
GET /meals?filter={filter}&search={searchTerm}
Authorization: Bearer {token}
```

**Query Parameters:**
- `filter` (optional): `all`, `user`, `public`
- `search` (optional): Search term

**Success Response (200):**
```json
{
  "meals": [
    {
      "id": "uuid",
      "name": "Power Breakfast",
      "description": "High protein breakfast",
      "is_public": false,
      "user_id": "user-uuid",
      "foods": [
        {
          "food_id": "food-uuid-1",
          "food_name": "Eggs",
          "serving_qty": 3
        },
        {
          "food_id": "food-uuid-2",
          "food_name": "Oatmeal",
          "serving_qty": 1
        }
      ],
      "total_calories": 480,
      "total_protein": 35,
      "total_carbs": 45,
      "total_fat": 18
    }
  ]
}
```

---

### 4.2 Create Meal Template

**Purpose:** Create a new meal template

```http
POST /meals
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "My Healthy Lunch",
  "description": "Balanced lunch meal",
  "is_public": false,
  "foods": [
    {
      "food_id": "food-uuid-1",
      "serving_qty": 1,
      "variant_id": "variant-uuid-optional"
    },
    {
      "food_id": "food-uuid-2",
      "serving_qty": 2
    }
  ]
}
```

**Success Response (201):**
```json
{
  "id": "uuid",
  "name": "My Healthy Lunch",
  "description": "Balanced lunch meal",
  "is_public": false,
  "foods": [...],
  "total_calories": 650,
  "total_protein": 45,
  "total_carbs": 70,
  "total_fat": 20
}
```

---

### 4.3 Get Meal by ID

**Purpose:** Retrieve specific meal template details

```http
GET /meals/{mealId}
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "id": "uuid",
  "name": "Power Breakfast",
  "description": "High protein breakfast",
  "is_public": false,
  "user_id": "user-uuid",
  "foods": [
    {
      "food_id": "food-uuid",
      "food_name": "Scrambled Eggs",
      "serving_qty": 3,
      "calories": 270,
      "protein": 18,
      "carbs": 3,
      "fat": 21
    }
  ],
  "created_at": "2025-10-01T10:00:00Z"
}
```

---

### 4.4 Update Meal Template

**Purpose:** Update an existing meal template

```http
PUT /meals/{mealId}
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Updated Meal Name",
  "description": "New description",
  "foods": [
    {
      "food_id": "food-uuid-1",
      "serving_qty": 2
    }
  ]
}
```

**Success Response (200):**
```json
{
  "message": "Meal updated successfully",
  "meal": {...}
}
```

---

### 4.5 Delete Meal Template

**Purpose:** Delete a meal template

```http
DELETE /meals/{mealId}
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "message": "Meal deleted successfully"
}
```

---

### 4.6 Get Meal Plan

**Purpose:** Get planned meals for a date range

```http
GET /meals/plan?startDate={startDate}&endDate={endDate}
Authorization: Bearer {token}
```

**Query Parameters:**
- `startDate` (required): Start date YYYY-MM-DD
- `endDate` (required): End date YYYY-MM-DD

**Success Response (200):**
```json
{
  "plan_entries": [
    {
      "id": "uuid",
      "meal_id": "meal-uuid",
      "meal_name": "Power Breakfast",
      "plan_date": "2025-11-05",
      "meal_type": "breakfast",
      "notes": "Prep the night before"
    },
    {
      "id": "uuid-2",
      "meal_id": "meal-uuid-2",
      "meal_name": "Chicken Salad",
      "plan_date": "2025-11-05",
      "meal_type": "lunch",
      "notes": null
    }
  ]
}
```

---

### 4.7 Create Meal Plan Entry

**Purpose:** Add a meal to the meal plan

```http
POST /meals/plan
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "meal_id": "meal-uuid",
  "plan_date": "2025-11-05",
  "meal_type": "lunch",
  "notes": "Optional prep notes"
}
```

**Success Response (201):**
```json
{
  "id": "uuid",
  "meal_id": "meal-uuid",
  "meal_name": "Chicken Salad",
  "plan_date": "2025-11-05",
  "meal_type": "lunch",
  "notes": "Optional prep notes"
}
```

---

### 4.8 Log Meal Plan to Diary

**Purpose:** Log a planned meal to the food diary

```http
POST /meals/plan/{planEntryId}/log-to-diary
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "target_date": "2025-11-04"
}
```

**Success Response (200):**
```json
{
  "message": "Meal logged to diary successfully",
  "logged_entries": [
    {
      "id": "food-entry-uuid",
      "food_name": "Chicken Breast",
      "meal_type": "lunch",
      "entry_date": "2025-11-04"
    }
  ]
}
```

---

## 5. Exercises Management

### 5.1 Search Exercises

**Purpose:** Search exercises by name

```http
GET /exercises/search?searchTerm={term}&equipmentFilter={equipment}&muscleGroupFilter={muscle}
Authorization: Bearer {token}
```

**Query Parameters:**
- `searchTerm` (optional): Search term
- `equipmentFilter` (optional): Filter by equipment
- `muscleGroupFilter` (optional): Filter by muscle group

**Success Response (200):**
```json
{
  "exercises": [
    {
      "id": "uuid",
      "name": "Barbell Squat",
      "description": "Compound leg exercise",
      "muscle_group": "legs",
      "equipment": "barbell",
      "is_public": true,
      "user_id": null,
      "image_url": "https://..."
    }
  ]
}
```

---

### 5.2 Get All Exercises (Paginated)

**Purpose:** Get exercises with pagination and filters

```http
GET /exercises?currentPage={page}&itemsPerPage={perPage}&searchTerm={term}
Authorization: Bearer {token}
```

**Query Parameters:**
- `currentPage` (optional): Page number (default: 1)
- `itemsPerPage` (optional): Items per page (default: 20)
- `searchTerm` (optional): Search term
- `categoryFilter` (optional): Category filter
- `equipmentFilter` (optional): Equipment filter
- `muscleGroupFilter` (optional): Muscle group filter

**Success Response (200):**
```json
{
  "exercises": [...],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 100,
    "itemsPerPage": 20
  }
}
```

---

### 5.3 Get Exercise by ID

**Purpose:** Get detailed information about a specific exercise

```http
GET /exercises/{exerciseId}
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "id": "uuid",
  "name": "Barbell Squat",
  "description": "Place barbell on shoulders, squat down keeping back straight",
  "muscle_group": "legs",
  "equipment": "barbell",
  "difficulty": "intermediate",
  "is_public": true,
  "user_id": null,
  "images": [
    {
      "url": "https://...",
      "type": "primary"
    }
  ],
  "instructions": [
    "Step 1: Position barbell",
    "Step 2: Squat down",
    "Step 3: Push back up"
  ]
}
```

---

### 5.4 Create Custom Exercise

**Purpose:** Create a custom exercise

```http
POST /exercises
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "My Custom Exercise",
  "description": "Description of the exercise",
  "muscle_group": "chest",
  "equipment": "dumbbell",
  "difficulty": "beginner",
  "instructions": ["Step 1", "Step 2"]
}
```

**Success Response (201):**
```json
{
  "id": "uuid",
  "name": "My Custom Exercise",
  "description": "Description of the exercise",
  "muscle_group": "chest",
  "equipment": "dumbbell",
  "user_id": "user-uuid",
  "created_at": "2025-11-04T10:00:00Z"
}
```

---

### 5.5 Update Exercise

**Purpose:** Update an existing exercise (custom exercises only)

```http
PUT /exercises/{exerciseId}
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Updated Exercise Name",
  "description": "Updated description"
}
```

**Success Response (200):**
```json
{
  "message": "Exercise updated successfully",
  "exercise": {...}
}
```

---

### 5.6 Delete Exercise

**Purpose:** Delete a custom exercise

```http
DELETE /exercises/{exerciseId}?forceDelete={boolean}
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "message": "Exercise deleted successfully"
}
```

---

### 5.7 Get Equipment List

**Purpose:** Get list of available equipment types

```http
GET /exercises/equipment
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "equipment": [
    "barbell",
    "dumbbell",
    "kettlebell",
    "resistance_band",
    "bodyweight",
    "machine",
    "cable"
  ]
}
```

---

### 5.8 Get Muscle Groups

**Purpose:** Get list of muscle groups

```http
GET /exercises/muscle-groups
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "muscle_groups": [
    "chest",
    "back",
    "shoulders",
    "arms",
    "legs",
    "core",
    "cardio"
  ]
}
```

---

## 6. Exercise Entries

### 6.1 Get Exercise Entries by Date

**Purpose:** Get all exercise entries for a specific date

```http
GET /exercise-entries/by-date?selectedDate={date}
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "entries": [
    {
      "id": "uuid",
      "exercise_id": "exercise-uuid",
      "exercise_name": "Barbell Squat",
      "entry_date": "2025-11-04",
      "notes": "Felt strong today",
      "details": [
        {
          "set_number": 1,
          "reps": 10,
          "weight": 100,
          "weight_unit": "kg"
        },
        {
          "set_number": 2,
          "reps": 10,
          "weight": 100,
          "weight_unit": "kg"
        },
        {
          "set_number": 3,
          "reps": 8,
          "weight": 110,
          "weight_unit": "kg"
        }
      ],
      "created_at": "2025-11-04T14:00:00Z"
    }
  ]
}
```

---

### 6.2 Log Exercise Entry

**Purpose:** Log an exercise workout

```http
POST /exercise-entries
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "exercise_id": "exercise-uuid",
  "entry_date": "2025-11-04",
  "notes": "Optional workout notes",
  "details": [
    {
      "set_number": 1,
      "reps": 12,
      "weight": 50,
      "weight_unit": "kg",
      "rest_seconds": 60
    },
    {
      "set_number": 2,
      "reps": 10,
      "weight": 55,
      "weight_unit": "kg",
      "rest_seconds": 60
    },
    {
      "set_number": 3,
      "reps": 8,
      "weight": 60,
      "weight_unit": "kg"
    }
  ]
}
```

**Alternative for Cardio:**
```json
{
  "exercise_id": "running-uuid",
  "entry_date": "2025-11-04",
  "details": [
    {
      "duration_seconds": 1800,
      "distance": 5,
      "distance_unit": "km",
      "calories_burned": 300,
      "avg_heart_rate": 145
    }
  ]
}
```

**Success Response (201):**
```json
{
  "id": "uuid",
  "exercise_id": "exercise-uuid",
  "exercise_name": "Bench Press",
  "entry_date": "2025-11-04",
  "details": [...],
  "created_at": "2025-11-04T14:30:00Z"
}
```

**n8n Example:**
```javascript
// Function node to prepare exercise entry
const entryData = {
  exercise_id: $input.item.json.exerciseId,
  entry_date: new Date().toISOString().split('T')[0],
  details: [
    {
      set_number: 1,
      reps: $input.item.json.reps || 10,
      weight: $input.item.json.weight || 50,
      weight_unit: "kg"
    }
  ]
};

return { json: entryData };
```

---

### 6.3 Update Exercise Entry

**Purpose:** Update an existing exercise entry

```http
PUT /exercise-entries/{entryId}
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "notes": "Updated notes",
  "details": [
    {
      "set_number": 1,
      "reps": 12,
      "weight": 55,
      "weight_unit": "kg"
    }
  ]
}
```

**Success Response (200):**
```json
{
  "message": "Exercise entry updated successfully",
  "entry": {...}
}
```

---

### 6.4 Delete Exercise Entry

**Purpose:** Delete an exercise entry

```http
DELETE /exercise-entries/{entryId}
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "message": "Exercise entry deleted successfully"
}
```

---

### 6.5 Get Exercise History

**Purpose:** Get historical entries for a specific exercise

```http
GET /exercise-entries/history/{exerciseId}?limit={limit}
Authorization: Bearer {token}
```

**Query Parameters:**
- `limit` (optional): Number of entries to return (default: 10)

**Success Response (200):**
```json
{
  "exercise_id": "exercise-uuid",
  "exercise_name": "Barbell Squat",
  "history": [
    {
      "id": "uuid-1",
      "entry_date": "2025-11-04",
      "max_weight": 110,
      "total_reps": 28,
      "total_volume": 2940,
      "details": [...]
    },
    {
      "id": "uuid-2",
      "entry_date": "2025-11-01",
      "max_weight": 105,
      "total_reps": 30,
      "total_volume": 3000,
      "details": [...]
    }
  ]
}
```

---

### 6.6 Get Exercise Progress

**Purpose:** Get progress data for an exercise over time

```http
GET /exercise-entries/progress/{exerciseId}?startDate={start}&endDate={end}
Authorization: Bearer {token}
```

**Query Parameters:**
- `startDate` (optional): Start date YYYY-MM-DD
- `endDate` (optional): End date YYYY-MM-DD

**Success Response (200):**
```json
{
  "exercise_id": "exercise-uuid",
  "exercise_name": "Bench Press",
  "progress": [
    {
      "date": "2025-10-01",
      "max_weight": 80,
      "total_volume": 2400,
      "avg_reps": 10
    },
    {
      "date": "2025-10-15",
      "max_weight": 85,
      "total_volume": 2550,
      "avg_reps": 10
    },
    {
      "date": "2025-11-01",
      "max_weight": 90,
      "total_volume": 2700,
      "avg_reps": 10
    }
  ],
  "trends": {
    "weight_increase_percentage": 12.5,
    "volume_increase_percentage": 12.5
  }
}
```

---

## 7. Goals Management

### 7.1 Get User Goals

**Purpose:** Get user goals for a specific date

```http
GET /goals?selectedDate={date}
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "goals": {
    "calorie_goal": 2000,
    "protein_goal": 150,
    "carbs_goal": 200,
    "fat_goal": 65,
    "fiber_goal": 30,
    "water_goal_ml": 2000,
    "weight_goal_kg": 75,
    "start_date": "2025-11-01",
    "end_date": null
  }
}
```

---

### 7.2 Manage Goal Timeline

**Purpose:** Create or update user goals starting from a specific date

```http
POST /goals/manage-timeline
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "p_start_date": "2025-11-04",
  "calorie_goal": 2100,
  "protein_goal": 160,
  "carbs_goal": 210,
  "fat_goal": 70,
  "fiber_goal": 35,
  "water_goal_ml": 2500,
  "weight_goal_kg": 73
}
```

**Success Response (200):**
```json
{
  "message": "Goals updated successfully",
  "goals": {
    "calorie_goal": 2100,
    "protein_goal": 160,
    "carbs_goal": 210,
    "fat_goal": 70,
    "start_date": "2025-11-04"
  }
}
```

**n8n Usage Example:**
```javascript
// Calculate macros based on body weight and goals
const bodyWeight = 75; // kg
const goalType = "muscle_gain"; // or "weight_loss", "maintenance"

let calories, protein, carbs, fat;

switch(goalType) {
  case "muscle_gain":
    calories = bodyWeight * 35;
    protein = bodyWeight * 2.2;
    fat = bodyWeight * 1;
    carbs = (calories - (protein * 4) - (fat * 9)) / 4;
    break;
  case "weight_loss":
    calories = bodyWeight * 25;
    protein = bodyWeight * 2;
    fat = bodyWeight * 0.8;
    carbs = (calories - (protein * 4) - (fat * 9)) / 4;
    break;
  default: // maintenance
    calories = bodyWeight * 30;
    protein = bodyWeight * 1.8;
    fat = bodyWeight * 0.9;
    carbs = (calories - (protein * 4) - (fat * 9)) / 4;
}

return {
  json: {
    p_start_date: new Date().toISOString().split('T')[0],
    calorie_goal: Math.round(calories),
    protein_goal: Math.round(protein),
    carbs_goal: Math.round(carbs),
    fat_goal: Math.round(fat)
  }
};
```

---

### 7.3 Get Goal Presets

**Purpose:** Get saved goal presets

```http
GET /goal-presets
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "presets": [
    {
      "id": "uuid",
      "name": "Muscle Gain",
      "calorie_goal": 2500,
      "protein_goal": 180,
      "carbs_goal": 280,
      "fat_goal": 70
    },
    {
      "id": "uuid-2",
      "name": "Weight Loss",
      "calorie_goal": 1800,
      "protein_goal": 140,
      "carbs_goal": 150,
      "fat_goal": 60
    }
  ]
}
```

---

### 7.4 Create Goal Preset

**Purpose:** Save a goal preset for quick reuse

```http
POST /goal-presets
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "My Custom Goal",
  "calorie_goal": 2200,
  "protein_goal": 165,
  "carbs_goal": 220,
  "fat_goal": 70
}
```

**Success Response (201):**
```json
{
  "id": "uuid",
  "name": "My Custom Goal",
  "calorie_goal": 2200,
  "protein_goal": 165,
  "carbs_goal": 220,
  "fat_goal": 70
}
```

---

## 8. Measurements & Health

### 8.1 Log Check-in Measurement

**Purpose:** Log body measurements (weight, dimensions, etc.)

```http
POST /measurements/check-in
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "entry_date": "2025-11-04",
  "weight": 75.5,
  "weight_unit": "kg",
  "neck": 38,
  "waist": 85,
  "hips": 95,
  "body_fat_percentage": 18.5,
  "notes": "Morning weight"
}
```

**Success Response (200):**
```json
{
  "id": "uuid",
  "entry_date": "2025-11-04",
  "weight": 75.5,
  "weight_unit": "kg",
  "neck": 38,
  "waist": 85,
  "hips": 95,
  "body_fat_percentage": 18.5,
  "created_at": "2025-11-04T07:00:00Z"
}
```

---

### 8.2 Get Check-in by Date

**Purpose:** Get measurements for a specific date

```http
GET /measurements/check-in/{date}
Authorization: Bearer {token}
```

**Example:**
```http
GET /measurements/check-in/2025-11-04
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "id": "uuid",
  "entry_date": "2025-11-04",
  "weight": 75.5,
  "weight_unit": "kg",
  "neck": 38,
  "waist": 85,
  "hips": 95,
  "body_fat_percentage": 18.5,
  "notes": "Morning weight"
}
```

---

### 8.3 Get Measurements Range

**Purpose:** Get measurements for a date range

```http
GET /measurements/check-in-measurements-range/{startDate}/{endDate}
Authorization: Bearer {token}
```

**Example:**
```http
GET /measurements/check-in-measurements-range/2025-10-01/2025-11-04
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "measurements": [
    {
      "entry_date": "2025-10-01",
      "weight": 77,
      "waist": 87,
      "body_fat_percentage": 19
    },
    {
      "entry_date": "2025-10-15",
      "weight": 76,
      "waist": 86,
      "body_fat_percentage": 18.7
    },
    {
      "entry_date": "2025-11-04",
      "weight": 75.5,
      "waist": 85,
      "body_fat_percentage": 18.5
    }
  ]
}
```

---

### 8.4 Update Check-in

**Purpose:** Update an existing measurement

```http
PUT /measurements/check-in/{id}
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "entry_date": "2025-11-04",
  "weight": 75.3,
  "notes": "Corrected weight"
}
```

**Success Response (200):**
```json
{
  "message": "Measurement updated successfully",
  "measurement": {...}
}
```

---

### 8.5 Delete Check-in

**Purpose:** Delete a measurement entry

```http
DELETE /measurements/check-in/{id}
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "message": "Measurement deleted successfully"
}
```

---

### 8.6 Get Most Recent Measurement

**Purpose:** Get the most recent measurement of a specific type

```http
GET /measurements/most-recent/{measurementType}
Authorization: Bearer {token}
```

**Measurement Types:** `weight`, `body_fat_percentage`, `waist`, `hips`, `neck`

**Example:**
```http
GET /measurements/most-recent/weight
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "measurement_type": "weight",
  "value": 75.5,
  "unit": "kg",
  "entry_date": "2025-11-04",
  "id": "uuid"
}
```

---

### 8.7 Submit Health Data (API Key Auth)

**Purpose:** Bulk submit health data from external sources

```http
POST /measurements/health-data
Authorization: Bearer {api_key}
Content-Type: application/json
```

**Request Body:**
```json
{
  "data": [
    {
      "type": "weight",
      "value": 75.5,
      "unit": "kg",
      "timestamp": "2025-11-04T07:00:00Z"
    },
    {
      "type": "steps",
      "value": 10000,
      "timestamp": "2025-11-04T23:59:59Z"
    },
    {
      "type": "heart_rate",
      "value": 72,
      "unit": "bpm",
      "timestamp": "2025-11-04T12:00:00Z"
    }
  ],
  "source": "garmin"
}
```

**Success Response (200):**
```json
{
  "message": "Health data submitted successfully",
  "processed": 3,
  "failed": 0
}
```

---

### 8.8 Get Custom Measurement Categories

**Purpose:** Get user-defined measurement categories

```http
GET /measurements/custom-categories
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "categories": [
    {
      "id": "uuid",
      "name": "Blood Pressure",
      "unit": "mmHg",
      "type": "numeric"
    },
    {
      "id": "uuid-2",
      "name": "Mood",
      "type": "text"
    }
  ]
}
```

---

### 8.9 Create Custom Measurement Category

**Purpose:** Create a custom measurement type

```http
POST /measurements/custom-categories
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Blood Glucose",
  "unit": "mg/dL",
  "type": "numeric",
  "description": "Blood sugar levels"
}
```

**Success Response (201):**
```json
{
  "id": "uuid",
  "name": "Blood Glucose",
  "unit": "mg/dL",
  "type": "numeric",
  "description": "Blood sugar levels"
}
```

---

### 8.10 Log Custom Measurement

**Purpose:** Log a custom measurement entry

```http
POST /measurements/custom-entries
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "category_id": "category-uuid",
  "entry_date": "2025-11-04",
  "value": "120",
  "notes": "After breakfast",
  "source": "manual"
}
```

**Success Response (201):**
```json
{
  "id": "uuid",
  "category_id": "category-uuid",
  "entry_date": "2025-11-04",
  "value": "120",
  "notes": "After breakfast",
  "created_at": "2025-11-04T09:00:00Z"
}
```

---

## 9. Water Tracking

### 9.1 Log Water Intake

**Purpose:** Log water consumption

```http
POST /measurements/water-intake
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "entry_date": "2025-11-04",
  "change_drinks": 2,
  "container_id": "container-uuid"
}
```

**Success Response (200):**
```json
{
  "id": "uuid",
  "entry_date": "2025-11-04",
  "total_drinks": 5,
  "total_ml": 2500,
  "container_id": "container-uuid",
  "container_size_ml": 500
}
```

**n8n Example:**
```javascript
// Log water automatically at scheduled times
return {
  json: {
    entry_date: new Date().toISOString().split('T')[0],
    change_drinks: 1,
    container_id: $vars.defaultContainerId
  }
};
```

---

### 9.2 Get Water Intake by Date

**Purpose:** Get water intake for a specific date

```http
GET /measurements/water-intake/{date}
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "id": "uuid",
  "entry_date": "2025-11-04",
  "total_drinks": 5,
  "total_ml": 2500,
  "goal_ml": 2000,
  "percentage_of_goal": 125,
  "entries": [
    {
      "timestamp": "2025-11-04T08:00:00Z",
      "drinks": 1,
      "ml": 500
    },
    {
      "timestamp": "2025-11-04T12:00:00Z",
      "drinks": 2,
      "ml": 1000
    }
  ]
}
```

---

### 9.3 Update Water Intake

**Purpose:** Update water intake for a date

```http
PUT /measurements/water-intake/{id}
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "change_drinks": -1
}
```

**Success Response (200):**
```json
{
  "message": "Water intake updated",
  "total_drinks": 4,
  "total_ml": 2000
}
```

---

### 9.4 Delete Water Intake

**Purpose:** Delete water intake entry

```http
DELETE /measurements/water-intake/{id}
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "message": "Water intake deleted successfully"
}
```

---

### 9.5 Get Water Containers

**Purpose:** Get user's water containers

```http
GET /water-containers
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "containers": [
    {
      "id": "uuid",
      "name": "My Water Bottle",
      "size_ml": 500,
      "is_primary": true
    },
    {
      "id": "uuid-2",
      "name": "Large Bottle",
      "size_ml": 1000,
      "is_primary": false
    }
  ]
}
```

---

### 9.6 Create Water Container

**Purpose:** Create a new water container

```http
POST /water-containers
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "My Gym Bottle",
  "size_ml": 750,
  "is_primary": false
}
```

**Success Response (201):**
```json
{
  "id": "uuid",
  "name": "My Gym Bottle",
  "size_ml": 750,
  "is_primary": false
}
```

---

### 9.7 Get Primary Container

**Purpose:** Get the user's primary water container

```http
GET /water-containers/primary
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "id": "uuid",
  "name": "My Water Bottle",
  "size_ml": 500,
  "is_primary": true
}
```

---

## 10. AI Chat (SparkyAI)

### 10.1 Send Chat Message

**Purpose:** Send message to SparkyAI chatbot

```http
POST /chat
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "messages": [
    {
      "role": "user",
      "content": "Log 2 eggs and 1 banana for breakfast"
    }
  ],
  "action": "food_logging",
  "service_config": {
    "provider": "openai",
    "model": "gpt-4"
  }
}
```

**Actions:** `food_logging`, `exercise_logging`, `general_chat`

**Success Response (200):**
```json
{
  "response": "I've logged 2 eggs (180 calories) and 1 banana (105 calories) to your breakfast. Total: 285 calories.",
  "logged_items": [
    {
      "type": "food_entry",
      "id": "uuid",
      "food_name": "Eggs",
      "calories": 180
    },
    {
      "type": "food_entry",
      "id": "uuid-2",
      "food_name": "Banana",
      "calories": 105
    }
  ]
}
```

**n8n Workflow Example:**
```javascript
// Process natural language food logging
const userMessage = $input.item.json.message || "Log chicken and rice for lunch";

return {
  json: {
    messages: [
      {
        role: "user",
        content: userMessage
      }
    ],
    action: "food_logging"
  }
};
```

---

### 10.2 Get Chat History

**Purpose:** Retrieve chat conversation history

```http
GET /chat/sparky-chat-history
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "history": [
    {
      "id": "uuid",
      "message_type": "user",
      "content": "Log 2 eggs for breakfast",
      "timestamp": "2025-11-04T08:00:00Z"
    },
    {
      "id": "uuid-2",
      "message_type": "assistant",
      "content": "I've logged 2 eggs to your breakfast",
      "timestamp": "2025-11-04T08:00:01Z"
    }
  ]
}
```

---

### 10.3 Clear Chat History

**Purpose:** Clear all chat history

```http
POST /chat/clear-all-history
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "message": "Chat history cleared successfully"
}
```

---

### 10.4 Get AI Service Settings

**Purpose:** Get configured AI service settings

```http
GET /chat/ai-service-settings
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "settings": [
    {
      "id": "uuid",
      "provider": "openai",
      "model": "gpt-4",
      "api_key_configured": true,
      "is_active": true
    }
  ]
}
```

---

## 11. Garmin Integration

### 11.1 Garmin Login

**Purpose:** Authenticate with Garmin Connect

```http
POST /garmin/login
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "garmin@example.com",
  "password": "garmin_password"
}
```

**Success Response (200):**
```json
{
  "message": "Login successful",
  "requires_mfa": false,
  "status": "connected"
}
```

**If MFA Required:**
```json
{
  "message": "MFA required",
  "requires_mfa": true,
  "client_state": "state-token-here"
}
```

---

### 11.2 Garmin Resume Login (MFA)

**Purpose:** Complete login with MFA code

```http
POST /garmin/resume_login
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "client_state": "state-token-from-login",
  "mfa_code": "123456"
}
```

**Success Response (200):**
```json
{
  "message": "MFA successful",
  "status": "connected"
}
```

---

### 11.3 Sync Garmin Health Data

**Purpose:** Sync health and wellness data from Garmin

```http
POST /garmin/sync/health_and_wellness
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "startDate": "2025-11-01",
  "endDate": "2025-11-04",
  "metricTypes": ["weight", "steps", "heart_rate", "sleep", "stress", "hydration"]
}
```

**Metric Types:**
- `weight` - Body weight
- `steps` - Daily steps
- `heart_rate` - Heart rate data
- `sleep` - Sleep data
- `stress` - Stress levels
- `hydration` - Water intake
- `blood_pressure` - Blood pressure readings

**Success Response (200):**
```json
{
  "message": "Health data synced successfully",
  "synced": {
    "weight": 3,
    "steps": 4,
    "heart_rate": 4,
    "sleep": 4
  },
  "date_range": {
    "start": "2025-11-01",
    "end": "2025-11-04"
  }
}
```

**n8n Scheduled Sync Example:**
```javascript
// Daily sync of Garmin data
const today = new Date().toISOString().split('T')[0];
const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

return {
  json: {
    startDate: yesterday,
    endDate: today,
    metricTypes: ["weight", "steps", "heart_rate", "sleep"]
  }
};
```

---

### 11.4 Sync Garmin Activities

**Purpose:** Sync activities and workouts from Garmin

```http
POST /garmin/sync/activities_and_workouts
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "startDate": "2025-11-01",
  "endDate": "2025-11-04",
  "activityType": "all"
}
```

**Activity Types:** `all`, `running`, `cycling`, `swimming`, `strength`, etc.

**Success Response (200):**
```json
{
  "message": "Activities synced successfully",
  "synced_count": 5,
  "activities": [
    {
      "activity_id": "123456",
      "activity_type": "running",
      "start_time": "2025-11-04T06:00:00Z",
      "duration_seconds": 1800,
      "distance_meters": 5000,
      "calories": 350
    }
  ]
}
```

---

### 11.5 Get Garmin Status

**Purpose:** Check Garmin connection status

```http
GET /garmin/status
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "connected": true,
  "email": "garmin@example.com",
  "last_sync": "2025-11-04T08:00:00Z",
  "auto_sync_enabled": true
}
```

---

### 11.6 Unlink Garmin

**Purpose:** Disconnect Garmin account

```http
POST /garmin/unlink
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "message": "Garmin account unlinked successfully"
}
```

---

## 12. Withings Integration

### 12.1 Authorize Withings

**Purpose:** Initiate Withings OAuth flow

```http
GET /withings/authorize
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "authorization_url": "https://account.withings.com/oauth2_user/authorize2?..."
}
```

**n8n Usage:**
- Redirect user to authorization_url
- User authorizes and is redirected to callback URL
- Callback handles token exchange automatically

---

### 12.2 Withings OAuth Callback

**Purpose:** Handle OAuth callback (usually automatic)

```http
POST /withings/callback
Content-Type: application/json
```

**Request Body:**
```json
{
  "code": "auth_code_from_withings",
  "state": "state_token"
}
```

**Success Response (200):**
```json
{
  "message": "Withings connected successfully",
  "status": "connected"
}
```

---

### 12.3 Sync Withings Data

**Purpose:** Manually trigger Withings data sync

```http
POST /withings/sync
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "message": "Withings data synced successfully",
  "synced": {
    "weight": 3,
    "body_composition": 3,
    "blood_pressure": 2
  }
}
```

---

### 12.4 Get Withings Status

**Purpose:** Check Withings connection status

```http
GET /withings/status
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "connected": true,
  "last_sync": "2025-11-04T07:00:00Z",
  "auto_sync_enabled": true
}
```

---

### 12.5 Disconnect Withings

**Purpose:** Disconnect Withings account

```http
POST /withings/disconnect
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "message": "Withings disconnected successfully"
}
```

---

## 13. Reports & Analytics

### 13.1 Get Comprehensive Reports

**Purpose:** Get detailed reports for a date range

```http
GET /reports?startDate={start}&endDate={end}&userId={userId}
Authorization: Bearer {token}
```

**Query Parameters:**
- `startDate` (required): Start date YYYY-MM-DD
- `endDate` (required): End date YYYY-MM-DD
- `userId` (optional): User ID (for multi-user access)

**Success Response (200):**
```json
{
  "date_range": {
    "start": "2025-11-01",
    "end": "2025-11-04"
  },
  "nutrition": {
    "daily_averages": {
      "calories": 2050,
      "protein": 145,
      "carbs": 215,
      "fat": 68
    },
    "daily_summaries": [
      {
        "date": "2025-11-01",
        "calories": 2100,
        "protein": 150,
        "carbs": 220,
        "fat": 70
      }
    ]
  },
  "exercise": {
    "total_workouts": 3,
    "total_exercises": 12,
    "most_frequent_exercises": [
      {
        "name": "Barbell Squat",
        "count": 3
      }
    ]
  },
  "body_measurements": {
    "weight_change": -1.5,
    "start_weight": 77,
    "end_weight": 75.5
  }
}
```

---

### 13.2 Get Nutrition Trends

**Purpose:** Get nutrition trends with goal comparison

```http
GET /reports/nutrition-trends-with-goals?startDate={start}&endDate={end}
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "trends": [
    {
      "date": "2025-11-01",
      "actual": {
        "calories": 2100,
        "protein": 150,
        "carbs": 220,
        "fat": 70
      },
      "goals": {
        "calories": 2000,
        "protein": 150,
        "carbs": 200,
        "fat": 65
      },
      "adherence": {
        "calories": 105,
        "protein": 100,
        "carbs": 110,
        "fat": 107.7
      }
    }
  ],
  "summary": {
    "avg_calorie_adherence": 102.5,
    "days_on_target": 3,
    "days_total": 4
  }
}
```

---

### 13.3 Get Exercise Dashboard

**Purpose:** Get exercise analytics and dashboard data

```http
GET /reports/exercise-dashboard?startDate={start}&endDate={end}&equipment={eq}&muscle={muscle}
Authorization: Bearer {token}
```

**Query Parameters:**
- `startDate` (required): Start date
- `endDate` (required): End date
- `equipment` (optional): Filter by equipment
- `muscle` (optional): Filter by muscle group
- `exercise` (optional): Specific exercise ID

**Success Response (200):**
```json
{
  "summary": {
    "total_workouts": 12,
    "total_exercises": 45,
    "total_volume_kg": 35000,
    "avg_workout_duration_minutes": 45
  },
  "by_muscle_group": {
    "legs": {
      "workouts": 4,
      "exercises": 15,
      "volume_kg": 15000
    },
    "chest": {
      "workouts": 3,
      "exercises": 12,
      "volume_kg": 8000
    }
  },
  "progress": [
    {
      "exercise_name": "Barbell Squat",
      "max_weight_start": 100,
      "max_weight_end": 110,
      "improvement_percentage": 10
    }
  ]
}
```

---

### 13.4 Get Mini Nutrition Trends

**Purpose:** Get compact nutrition trends (for widgets/dashboards)

```http
GET /reports/mini-nutrition-trends?startDate={start}&endDate={end}
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "chart_data": [
    {
      "date": "2025-11-01",
      "calories": 2100
    },
    {
      "date": "2025-11-02",
      "calories": 2050
    }
  ],
  "averages": {
    "calories": 2075,
    "protein": 147,
    "carbs": 217,
    "fat": 69
  }
}
```

---

## 14. Administration

### 14.1 Get All Users (Admin)

**Purpose:** Get list of all users

```http
GET /admin/users?limit={limit}&offset={offset}&searchTerm={term}
Authorization: Bearer {admin_token}
```

**Success Response (200):**
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "full_name": "John Doe",
      "role": "user",
      "is_active": true,
      "created_at": "2025-01-01T00:00:00Z"
    }
  ],
  "total": 50,
  "limit": 50,
  "offset": 0
}
```

---

### 14.2 Update User Role (Admin)

**Purpose:** Change user role

```http
PUT /admin/users/{userId}/role
Authorization: Bearer {admin_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "role": "admin"
}
```

**Roles:** `user`, `admin`

**Success Response (200):**
```json
{
  "message": "User role updated successfully",
  "user": {
    "id": "uuid",
    "role": "admin"
  }
}
```

---

### 14.3 Update User Status (Admin)

**Purpose:** Activate/deactivate user account

```http
PUT /admin/users/{userId}/status
Authorization: Bearer {admin_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "isActive": false
}
```

**Success Response (200):**
```json
{
  "message": "User status updated successfully"
}
```

---

### 14.4 Delete User (Admin)

**Purpose:** Delete user account and all associated data

```http
DELETE /admin/users/{userId}
Authorization: Bearer {admin_token}
```

**Success Response (200):**
```json
{
  "message": "User deleted successfully"
}
```

---

### 14.5 Get Global Settings (Admin)

**Purpose:** Get application-wide settings

```http
GET /global-settings
Authorization: Bearer {admin_token}
```

**Success Response (200):**
```json
{
  "settings": {
    "signup_enabled": true,
    "require_email_verification": false,
    "default_calorie_goal": 2000,
    "default_protein_goal": 150
  }
}
```

---

### 14.6 Update Global Settings (Admin)

**Purpose:** Update global application settings

```http
PUT /global-settings
Authorization: Bearer {admin_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "signup_enabled": false,
  "require_email_verification": true
}
```

**Success Response (200):**
```json
{
  "message": "Settings updated successfully",
  "settings": {...}
}
```

---

### 14.7 Create Manual Backup (Admin)

**Purpose:** Trigger database backup

```http
POST /backup/manual
Authorization: Bearer {admin_token}
```

**Success Response (200):**
```json
{
  "message": "Backup created successfully",
  "backup_file": "backup_20251104_120000.sql",
  "size_mb": 15.3
}
```

---

### 14.8 Get Backup Settings (Admin)

**Purpose:** Get backup configuration

```http
GET /backup/settings
Authorization: Bearer {admin_token}
```

**Success Response (200):**
```json
{
  "backupEnabled": true,
  "backupDays": ["0", "1", "2", "3", "4", "5", "6"],
  "backupTime": "02:00",
  "retentionDays": 7
}
```

---

## 15. Utilities

### 15.1 Health Check

**Purpose:** Check API health status

```http
GET /health
```

**No authentication required**

**Success Response (200):**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-04T10:00:00Z",
  "uptime_seconds": 86400,
  "database": "connected",
  "version": "0.15.8.5"
}
```

---

### 15.2 Get Current Version

**Purpose:** Get application version

```http
GET /version/current
```

**No authentication required**

**Success Response (200):**
```json
{
  "version": "0.15.8.5",
  "build_date": "2025-11-01",
  "git_commit": "7e61d91"
}
```

---

### 15.3 Get Latest GitHub Release

**Purpose:** Check for updates

```http
GET /version/latest-github
```

**Success Response (200):**
```json
{
  "latest_version": "0.15.9.0",
  "release_url": "https://github.com/CodeWithCJ/SparkyFitness/releases/tag/v0.15.9.0",
  "release_notes": "Bug fixes and improvements"
}
```

---

## Webhook Examples

### Example 1: Food Logging Webhook

Receive food logging events via webhook:

```javascript
// n8n Webhook node receives:
{
  "event": "food_entry.created",
  "data": {
    "id": "uuid",
    "user_id": "user-uuid",
    "food_name": "Chicken Breast",
    "calories": 165,
    "meal_type": "lunch",
    "entry_date": "2025-11-04"
  },
  "timestamp": "2025-11-04T12:00:00Z"
}

// Process in n8n Function node:
const entry = $input.item.json.data;

if (entry.calories > 500) {
  // Send notification for high-calorie meal
  return {
    json: {
      alert: true,
      message: `High calorie meal logged: ${entry.food_name} (${entry.calories} cal)`
    }
  };
}
```

### Example 2: Weight Tracking Webhook

```javascript
// Webhook receives weight update
{
  "event": "measurement.weight_updated",
  "data": {
    "user_id": "user-uuid",
    "weight": 75.5,
    "unit": "kg",
    "change_from_last": -0.5,
    "entry_date": "2025-11-04"
  }
}

// Check if goal weight reached
const currentWeight = $input.item.json.data.weight;
const goalWeight = 75; // Fetch from user goals

if (currentWeight <= goalWeight) {
  // Send congratulations notification
  return {
    json: {
      goal_reached: true,
      message: "Congratulations! You've reached your goal weight!"
    }
  };
}
```

---

## n8n Workflow Templates

### Template 1: Daily Nutrition Summary Email

**Trigger:** Schedule (Every day at 8 PM)

**Workflow:**
1. **Schedule Trigger** - Cron: `0 20 * * *`
2. **HTTP Request** - Get today's nutrition
   ```
   GET /foods/food-entries/nutrition/today?date={{$today}}
   Authorization: Bearer {{$vars.apiKey}}
   ```
3. **HTTP Request** - Get user goals
   ```
   GET /goals?selectedDate={{$today}}
   Authorization: Bearer {{$vars.apiKey}}
   ```
4. **Function** - Calculate adherence
   ```javascript
   const nutrition = $input.item.json;
   const goals = $('Get Goals').item.json.goals;

   const calorieAdherence = (nutrition.totals.calories / goals.calorie_goal * 100).toFixed(1);
   const proteinAdherence = (nutrition.totals.protein / goals.protein_goal * 100).toFixed(1);

   return {
     json: {
       date: nutrition.date,
       calories: nutrition.totals.calories,
       calorie_goal: goals.calorie_goal,
       calorie_adherence: calorieAdherence,
       protein: nutrition.totals.protein,
       protein_goal: goals.protein_goal,
       protein_adherence: proteinAdherence
     }
   };
   ```
5. **Send Email** - Format and send summary

---

### Template 2: Automatic Garmin Sync

**Trigger:** Schedule (Every hour)

**Workflow:**
1. **Schedule Trigger** - Cron: `0 * * * *`
2. **Function** - Calculate date range
   ```javascript
   const now = new Date();
   const yesterday = new Date(now - 86400000);

   return {
     json: {
       startDate: yesterday.toISOString().split('T')[0],
       endDate: now.toISOString().split('T')[0]
     }
   };
   ```
3. **HTTP Request** - Sync health data
   ```
   POST /garmin/sync/health_and_wellness
   Authorization: Bearer {{$vars.apiKey}}
   Body: {
     "startDate": "{{$json.startDate}}",
     "endDate": "{{$json.endDate}}",
     "metricTypes": ["weight", "steps", "heart_rate", "sleep"]
   }
   ```
4. **HTTP Request** - Sync activities
   ```
   POST /garmin/sync/activities_and_workouts
   Authorization: Bearer {{$vars.apiKey}}
   Body: {
     "startDate": "{{$json.startDate}}",
     "endDate": "{{$json.endDate}}",
     "activityType": "all"
   }
   ```
5. **IF** - Check for errors
6. **Send Notification** - If sync failed

---

### Template 3: Smart Meal Planning

**Trigger:** Webhook or Schedule

**Workflow:**
1. **Webhook/Schedule Trigger**
2. **HTTP Request** - Get user goals
3. **HTTP Request** - Get meal templates
4. **Function** - Select meals matching goals
   ```javascript
   const goals = $('Get Goals').item.json.goals;
   const meals = $('Get Meals').item.json.meals;

   // Filter meals within calorie range
   const breakfast = meals.filter(m =>
     m.total_calories >= goals.calorie_goal * 0.25 * 0.9 &&
     m.total_calories <= goals.calorie_goal * 0.25 * 1.1
   );

   return {
     json: {
       breakfast: breakfast[Math.floor(Math.random() * breakfast.length)],
       // Similar for lunch and dinner
     }
   };
   ```
5. **Loop** - For each selected meal
6. **HTTP Request** - Create meal plan entry
   ```
   POST /meals/plan
   Body: {
     "meal_id": "{{$json.meal_id}}",
     "plan_date": "{{$tomorrow}}",
     "meal_type": "{{$json.meal_type}}"
   }
   ```

---

### Template 4: Exercise Progress Tracker

**Trigger:** Schedule (Weekly on Monday)

**Workflow:**
1. **Schedule Trigger** - Cron: `0 9 * * 1`
2. **Function** - Calculate last week dates
   ```javascript
   const today = new Date();
   const lastMonday = new Date(today - 7 * 86400000);
   const lastSunday = new Date(today - 1 * 86400000);

   return {
     json: {
       startDate: lastMonday.toISOString().split('T')[0],
       endDate: lastSunday.toISOString().split('T')[0]
     }
   };
   ```
3. **HTTP Request** - Get exercise report
   ```
   GET /reports/exercise-dashboard?startDate={{$json.startDate}}&endDate={{$json.endDate}}
   Authorization: Bearer {{$vars.apiKey}}
   ```
4. **Function** - Format weekly summary
   ```javascript
   const report = $input.item.json.summary;

   return {
     json: {
       subject: "Your Weekly Workout Summary",
       body: `
         Great work last week!

         Workouts completed: ${report.total_workouts}
         Total exercises: ${report.total_exercises}
         Total volume: ${report.total_volume_kg}kg
         Avg workout time: ${report.avg_workout_duration_minutes} minutes
       `
     }
   };
   ```
5. **Send Email/Notification**

---

### Template 5: Goal Achievement Tracker

**Trigger:** Schedule (Daily at 11 PM)

**Workflow:**
1. **Schedule Trigger** - Cron: `0 23 * * *`
2. **HTTP Request** - Get daily nutrition
3. **HTTP Request** - Get user goals
4. **Function** - Check goal achievement
   ```javascript
   const nutrition = $('Nutrition').item.json.totals;
   const goals = $('Goals').item.json.goals;

   const achievements = [];

   // Check calorie goal (within 5%)
   const calorieDiff = Math.abs(nutrition.calories - goals.calorie_goal);
   if (calorieDiff <= goals.calorie_goal * 0.05) {
     achievements.push("✅ Calorie goal achieved!");
   }

   // Check protein goal
   if (nutrition.protein >= goals.protein_goal) {
     achievements.push("✅ Protein goal achieved!");
   }

   // Check if all macros met
   const allMacrosMet =
     nutrition.protein >= goals.protein_goal &&
     Math.abs(nutrition.carbs - goals.carbs_goal) <= goals.carbs_goal * 0.1 &&
     Math.abs(nutrition.fat - goals.fat_goal) <= goals.fat_goal * 0.1;

   return {
     json: {
       achievements: achievements,
       perfect_day: allMacrosMet,
       streak_check: true
     }
   };
   ```
5. **IF** - Check if perfect day
6. **Update Streak Counter** - (Store in n8n variable or external DB)
7. **Send Notification** - Congratulate user

---

### Template 6: Water Intake Reminder

**Trigger:** Schedule (Every 2 hours during waking hours)

**Workflow:**
1. **Schedule Trigger** - Cron: `0 8-22/2 * * *`
2. **HTTP Request** - Get today's water intake
   ```
   GET /measurements/water-intake/{{$today}}
   Authorization: Bearer {{$vars.apiKey}}
   ```
3. **Function** - Check if goal met
   ```javascript
   const intake = $input.item.json;
   const goal = intake.goal_ml || 2000;
   const current = intake.total_ml || 0;
   const percentage = (current / goal * 100).toFixed(0);

   if (percentage < 80) {
     return {
       json: {
         send_reminder: true,
         message: `You're at ${percentage}% of your water goal. Time to hydrate! 💧`,
         remaining_ml: goal - current
       }
     };
   }

   return { json: { send_reminder: false } };
   ```
4. **IF** - If reminder needed
5. **Send Push Notification**

---

## Error Handling

### Common Error Responses

#### 400 Bad Request
```json
{
  "error": "Validation failed",
  "details": {
    "email": "Invalid email format",
    "password": "Password must be at least 8 characters"
  }
}
```

#### 401 Unauthorized
```json
{
  "error": "Invalid or expired token"
}
```

#### 403 Forbidden
```json
{
  "error": "Insufficient permissions",
  "required_permission": "admin"
}
```

#### 404 Not Found
```json
{
  "error": "Resource not found",
  "resource": "food",
  "id": "uuid"
}
```

#### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "message": "An unexpected error occurred"
}
```

### n8n Error Handling Pattern

```javascript
// In n8n HTTP Request node, enable "Continue On Fail"
// Then add Error Handler branch:

const error = $input.item.json;

if (error.statusCode === 401) {
  // Token expired, refresh and retry
  return { json: { action: "refresh_token" } };
}

if (error.statusCode === 429) {
  // Rate limited, wait and retry
  return { json: { action: "wait_retry", wait_seconds: 60 } };
}

// Log error and notify
return {
  json: {
    action: "notify_error",
    error: error.error || error.message,
    endpoint: $input.item.url
  }
};
```

---

## Rate Limiting & Best Practices

### Rate Limits

SparkyFitness API currently does not enforce strict rate limits, but follow these best practices:

- **Bulk operations:** Max 100 items per request
- **Pagination:** Use reasonable page sizes (20-50 items)
- **Scheduled sync:** Don't sync more than once per hour
- **Concurrent requests:** Limit to 10 concurrent requests

### Best Practices for n8n Workflows

#### 1. Use API Keys for Automation
```javascript
// Store API key securely in n8n credentials
// Never hardcode API keys in workflows
```

#### 2. Implement Retry Logic
```javascript
// In HTTP Request node settings:
// - Enable "Retry On Fail"
// - Set retry times: 3
// - Set retry wait time: 1000ms (exponential backoff)
```

#### 3. Cache Frequently Used Data
```javascript
// Cache user goals, meal templates, etc.
// Refresh cache every 24 hours
const cache = $vars.cache || {};
const cacheAge = Date.now() - (cache.timestamp || 0);

if (cacheAge > 86400000) { // 24 hours
  // Refresh cache
  const goals = await fetchGoals();
  $vars.cache = {
    goals: goals,
    timestamp: Date.now()
  };
}
```

#### 4. Batch Operations When Possible
```javascript
// Instead of multiple single requests:
const entries = [entry1, entry2, entry3];

// Use loop with batch processing:
const batches = [];
for (let i = 0; i < entries.length; i += 10) {
  batches.push(entries.slice(i, i + 10));
}

// Process each batch
for (const batch of batches) {
  await processBatch(batch);
  await sleep(1000); // Rate limiting
}
```

#### 5. Use Webhooks for Real-time Data
```javascript
// Instead of polling every minute:
// Set up webhook endpoint in n8n
// Configure SparkyFitness to send events to webhook
```

#### 6. Handle Timezones Properly
```javascript
// Always use user's timezone
const userTimezone = 'America/New_York';
const now = new Date().toLocaleString('en-US', {
  timeZone: userTimezone
});
const date = now.split(',')[0]; // Get date part
```

#### 7. Validate Data Before Sending
```javascript
// Validate before making API request
function validateFoodEntry(entry) {
  if (!entry.food_id) return false;
  if (!entry.serving_qty || entry.serving_qty <= 0) return false;
  if (!['breakfast', 'lunch', 'dinner', 'snack'].includes(entry.meal_type)) return false;
  return true;
}

if (!validateFoodEntry($input.item.json)) {
  throw new Error('Invalid food entry data');
}
```

#### 8. Log Important Operations
```javascript
// Log to n8n or external logging service
console.log({
  timestamp: new Date().toISOString(),
  operation: 'food_entry_created',
  user_id: $vars.userId,
  entry_id: $json.id,
  status: 'success'
});
```

---

## Additional Resources

- **API Documentation:** https://codewithcj.github.io/SparkyFitness/developer/api-reference
- **GitHub Repository:** https://github.com/CodeWithCJ/SparkyFitness
- **Project Context:** See `PROJECT_CONTEXT.md`
- **Bruno Collection:** See `bruno-collection/` directory

---

**Document Version:** 1.0
**Last Updated:** 2025-11-04
**API Version:** 0.15.8.5
