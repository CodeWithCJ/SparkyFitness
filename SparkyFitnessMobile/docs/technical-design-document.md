# SparkyFitness Mobile App - Technical Design Document

## 1. Overview

This document outlines the technical design and architecture for the SparkyFitness mobile application. The application will allow users to configure their server details, select health data to track (starting with steps), and sync this data with their personal SparkyFitness server.

The initial version will be for Android, with a technology choice that allows for future expansion to iOS.

## 2. Technology Stack

*   **Framework:** React Native. This is a cross-platform framework that will allow for a single codebase to be used for both Android and iOS in the future, as requested.
*   **Health Data Integration:** `react-native-health-connect`. This library will be used to read health data from Android's Health Connect.
*   **Local Storage:** `AsyncStorage` (built into React Native) will be used for persisting the server URL and API key.
*   **API Client:** `axios` or the built-in `fetch` API for making REST API calls to the SparkyFitness server.

## 3. High-Level Architecture

The application will have a simple, single-screen interface for the initial version.

```mermaid
graph TD
    A[User Launches App] --> B{Configuration Present?};
    B -- No --> C[Settings Screen: Enter URL/API Key];
    B -- Yes --> D[Main Screen];
    C --> E[Save Configuration];
    E --> D;
    D --> F[Select Health Data (Steps Checkbox)];
    D --> G[Select Sync Range (24h, 3d, 7d)];
    D --> H[Sync Button];
    H --> I[Read Health Data via Health Connect];
    I --> J[Aggregate Data by Date];
    J --> K[Send Data to SparkyFitness Server];
    K --> L[Display Sync Status];
    D --> M[Edit/Delete Configuration];
    M --> C;
```

## 4. API Design (Mobile to Server)

The mobile app will communicate with the SparkyFitness server via a REST API.

**Endpoint:** `POST /api/health-data`

**Request Body:**

The body should be an array of data entries. For steps, the server expects the `type` to be `step`.

```json
[
  {
    "type": "step",
    "date": "2025-08-11",
    "value": 10500
  },
  {
    "type": "step",
    "date": "2025-08-10",
    "value": 8200
  }
]
```

**Headers:**

*   `Authorization`: `Bearer <API_KEY>`
*   `Content-Type`: `application/json`

## 5. Data Flow for Sync

1.  User clicks the "Sync" button.
2.  The app reads the saved server URL and API key from local storage.
3.  The app requests permission to read "Steps" data from Health Connect.
4.  User selects a sync duration (24 hours, 3 days, or 7 days) from a dropdown.
5.  If permission is granted, the app fetches the steps data for the selected period.
6.  The app aggregates the step counts, summing them up for each distinct date.
7.  The app constructs a JSON payload with the aggregated steps data, conforming to the server's expected format.
8.  The app sends a `POST` request to `https://<USER_SERVER_URL>/api/health-data` with the payload and API key in the header.
9.  The app displays a success or failure message to the user based on the server's response.

## 6. Project Structure

A new directory `SparkyFitnessMobile` will be created.

```
SparkyFitnessMobile/
├── android/
├── ios/
├── src/
│   ├── components/
│   │   └── SettingsForm.js
│   ├── screens/
│   │   └── MainScreen.js
│   ├── services/
│   │   ├── api.js
│   │   └── storage.js
│   └── App.js
├── docs/
│   └── technical-design-document.md
├── package.json
└── ... (other react-native files)

---

## 7. Health Connect Integration - Revision 1

### 7.1. Problem Analysis

The initial implementation of Health Connect integration was failing to retrieve health data. A thorough analysis revealed the following key issues:

*   **Incorrect Permission Requests:** The application was requesting permissions for different data types in separate, sequential function calls. The Health Connect API is designed to handle all permission requests in a single, consolidated user-facing dialog. This incorrect implementation was causing the permission requests to fail silently.
*   **Lack of State Persistence:** User preferences, such as enabling or disabling data syncing, were not being saved to the device's local storage. This required users to reconfigure their settings every time they launched the app.

### 7.2. Revised Solution

To address these issues and align with best practices for professional app design, the following changes will be implemented:

#### 7.2.1. Consolidated Permission Service

The existing `healthConnectService.js` will be refactored to handle permission requests correctly.

*   A new, flexible function, `requestHealthPermissions(permissions)`, will be created. This function will accept an array of permission strings (e.g., `['Steps', 'ActiveCaloriesBurned']`) and request them in a single API call.
*   The old, separate permission functions (`requestStepsPermission`, `requestActiveCaloriesPermission`) will be deprecated and removed to avoid confusion.

#### 7.2.2. In-Context Permission Requests

Permissions will be requested "in-context," meaning the app will only ask for permission when the user actively tries to use a feature that requires it.

*   The UI will feature distinct controls (e.g., checkboxes) for each type of health data (e.g., "Sync Steps," "Sync Calories").
*   When a user enables one of these controls for the first time, the `requestHealthPermissions` function will be called with the corresponding permission.

#### 7.2.3. State Management with AsyncStorage

User preferences will be persisted to the device's local storage using `@react-native-async-storage/async-storage`.

*   The state of UI controls (e.g., the enabled/disabled status of checkboxes, selected date ranges) will be saved to `AsyncStorage`.
*   When the app launches, it will read these preferences from `AsyncStorage` to restore the user's previous settings.

### 7.3. Revised Data Flow Diagram

The following diagram illustrates the new, improved workflow:

```mermaid
graph TD
    subgraph "User Interaction"
        A[User enables 'Sync Steps' checkbox] --> B{Call requestHealthPermissions(['Steps'])};
        B --> C[System shows permission dialog for Steps];
        C --> D{Save 'Sync Steps' preference to storage};

        E[User enables 'Sync Calories' checkbox] --> F{Call requestHealthPermissions(['ActiveCaloriesBurned'])};
        F --> G[System shows permission dialog for Calories];
        G --> H{Save 'Sync Calories' preference to storage};
    end

    subgraph "App Launch"
        I[App Starts] --> J{Read preferences from AsyncStorage};
        J --> K[Restore UI state e.g., checkboxes];
    end
```