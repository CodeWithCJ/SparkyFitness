# User Flows

## App Navigation Structure

```mermaid
graph TD
    App[App Root] --> Tabs[Tab Navigator]
    App --> FoodSearch[FoodSearch Modal]
    App --> FoodEntryAdd[FoodEntryAdd]
    App --> FoodForm[FoodForm]
    App --> FoodScan[FoodScan]
    App --> FoodEntryView[FoodEntryView]
    App --> Logs[Logs]

    Tabs --> Dashboard[Dashboard Tab]
    Tabs --> Diary[Diary Tab]
    Tabs --> AddTab["Add Tab (opens FoodSearch modal)"]
    Tabs --> Sync[Sync Tab]
    Tabs --> Settings[Settings Tab]
```

---

## Dashboard

```mermaid
flowchart TD
    D[Dashboard Screen] --> DateNav{Date Navigation}
    DateNav -->|Tap chevrons| ChangeDate[Change date]
    DateNav -->|Tap date text| Calendar[Calendar picker]
    DateNav -->|Swipe left/right| FlingDate[Fling gesture date change]
    ChangeDate --> D
    Calendar --> D
    FlingDate --> D

    D --> Pull[Pull to refresh]
    Pull -->|Refetch all queries| D

    D --> HasFood{Has food entries?}
    HasFood -->|Yes| CalRing[Calorie Ring + Macro Cards]
    HasFood -->|No| EmptyFood[Empty Food Card]
    EmptyFood -->|Tap| FS[FoodSearch]

    D --> HasExercise{Has exercise data?}
    HasExercise -->|Yes| ExCard[Exercise Progress Card]

    D --> Hydration[Hydration Gauge]
    Hydration -->|Tap +| AddWater[Add water serving]
    Hydration -->|Tap -| RemoveWater[Remove water serving]

    D --> Trends[Health Trends - Steps & Weight Charts]
```

---

## Diary

```mermaid
flowchart TD
    DR[Diary Screen] --> DRDate{Date Navigation}
    DRDate -->|Tap chevrons| DRChange[Change date]
    DRDate -->|Tap date text| DRCal[Calendar picker]
    DRDate -->|Swipe left/right| DRFling[Fling gesture]
    DRChange --> DR
    DRCal --> DR
    DRFling --> DR

    DR --> HasEntries{Has food entries?}
    HasEntries -->|No| DREmpty[Empty state]
    DREmpty -->|Tap 'Add Food'| FS[FoodSearch]

    HasEntries -->|Yes| MealGroups[Food entries grouped by meal type]
    MealGroups --> TapEntry{Tap food entry}
    TapEntry --> FEV[FoodEntryView]

    MealGroups --> SwipeEntry{Swipe entry right}
    SwipeEntry --> DeleteBtn[Reveal Delete button]
    DeleteBtn -->|Tap Delete| DeleteEntry[Delete food entry]

    DR --> HasExercise{Has exercise entries?}
    HasExercise -->|Yes| ExList[Exercise Summary list]
```

---

## Food Search

```mermaid
flowchart TD
    FS[FoodSearch Screen] --> Tabs{Select tab}

    Tabs -->|Search| LocalTab[Local Foods]
    LocalTab --> LocalBrowse[Recent + Top Foods]
    LocalTab --> LocalSearch[Type to search local DB]
    LocalBrowse -->|Tap result| FEA[FoodEntryAdd]
    LocalSearch -->|Tap result| FEA

    Tabs -->|Online| OnlineTab[External Providers]
    OnlineTab --> SelectProvider[Select provider: FatSecret / USDA / OpenFoodFacts / etc.]
    SelectProvider --> OnlineSearch[Type to search]
    OnlineSearch -->|Tap result| FetchCheck{FatSecret item?}
    FetchCheck -->|Yes| FetchDetails[Fetch full nutrient details first]
    FetchCheck -->|No| FEA
    FetchDetails --> FEA

    Tabs -->|Meals| MealsTab[Saved Meals]
    MealsTab --> MealBrowse[Browse all meals]
    MealsTab --> MealSearch[Search meals by name]
    MealBrowse -->|Tap result| FEA
    MealSearch -->|Tap result| FEA

    FS --> PlusBtn["Tap '+' button"]
    PlusBtn --> FFCreate[FoodForm - create-food mode]

    FS --> ScanBtn[Tap scan icon]
    ScanBtn --> FScan[FoodScan]

    FS --> CloseBtn[Tap Close]
    CloseBtn --> Back[Dismiss modal]
```

---

## Food Scan

```mermaid
flowchart TD
    FScan[FoodScan Screen] --> Mode{Select mode}

    Mode -->|Barcode| BC[Barcode Scanner]
    BC -->|Scan detected| Lookup[Lookup barcode via API]
    Lookup --> Found{Result?}
    Found -->|Local food match| FEA[FoodEntryAdd]
    Found -->|External food match| FFCreate[FoodForm - create-food mode]
    Found -->|Not found| Alert[Alert: not found]
    Alert -->|Manual entry| FFCreate

    Mode -->|Nutrition Label| NL[Camera Capture]
    NL -->|Take photo| Extract[AI extracts nutrition data]
    Extract --> FFCreate
```

---

## Food Entry Add

```mermaid
flowchart TD
    FEA[FoodEntryAdd Screen] --> Variant{Multiple variants?}
    Variant -->|Yes| PickVariant[Select variant / serving size]
    Variant -->|No| Qty

    PickVariant --> Qty[Adjust quantity]
    Qty --> AdjustNutrition{Adjust nutrition?}
    AdjustNutrition -->|Tap pencil icon| FFAdjust[FoodForm - adjust-entry-nutrition]
    FFAdjust -->|Returns adjusted values| FEA
    AdjustNutrition -->|No| MealType

    FEA --> External{External food?}
    External -->|Yes| SaveToggle[Toggle 'Save to Database']
    External -->|No| MealType

    FEA --> MealType[Select meal type]
    FEA --> Date[Select date via calendar]

    MealType --> Submit[Tap 'Add Food']
    Date --> Submit
    SaveToggle --> Submit
    Submit --> Validate{Valid?}
    Validate -->|qty > 0 and meal selected| Save[Create food entry via API]
    Validate -->|Invalid| ShowError[Show validation error]
    Save --> PopToTop[Return to Dashboard / Diary]
```

---

## Food Form

```mermaid
flowchart TD
    FF[FoodForm Screen] --> CheckMode{Mode?}

    CheckMode -->|create-food| Create[Create Food Mode]
    Create --> FillForm[Fill name, brand, macros, micros, serving size]
    FillForm --> CreateQty[Adjust quantity]
    CreateQty --> CreateMeal[Select meal type]
    CreateMeal --> CreateDate[Select date]
    CreateDate --> CreateSubmit[Tap submit]
    CreateSubmit --> SaveFood[Save food to database]
    SaveFood --> CreateEntry[Create food entry]
    CreateEntry --> PopToTop[Return to Dashboard / Diary]

    CheckMode -->|adjust-entry-nutrition| Adjust[Adjust Nutrition Mode]
    Adjust --> EditValues[Edit pre-filled nutrition values]
    EditValues --> UpdateSubmit[Tap 'Update Values']
    UpdateSubmit --> ReturnValues[Pass adjusted values back to caller]
    ReturnValues --> Caller{Return to?}
    Caller -->|FoodEntryAdd| FEA[FoodEntryAdd with updated nutrition]
    Caller -->|FoodEntryView| FEV[FoodEntryView with updated nutrition]
```

---

## Food Entry View / Edit

```mermaid
flowchart TD
    FEV[FoodEntryView Screen] --> ViewMode[View Mode: read-only display]
    ViewMode --> EditBtn{Tap Edit?}
    EditBtn -->|Yes| EditMode[Edit Mode]
    EditBtn -->|No| GoBack[Go back to Diary]

    EditMode --> EditQty[Adjust quantity]
    EditMode --> EditVariant{Multiple variants?}
    EditVariant -->|Yes| ChangeVariant[Change variant]
    ChangeVariant -->|Clears adjusted nutrition| EditMode

    EditMode --> EditNutrition{Tap nutrition card?}
    EditNutrition -->|Yes| FFAdjust[FoodForm - adjust-entry-nutrition]
    FFAdjust -->|Returns adjusted values| EditMode

    EditMode --> EditMeal[Change meal type]
    EditMode --> EditDate[Change date via calendar]

    EditMode --> Done[Tap Done]
    Done --> Changed{Any changes?}
    Changed -->|Yes| UpdateAPI[Update food entry via API]
    Changed -->|No| ExitEdit[Exit edit mode]
    UpdateAPI --> ExitEdit

    EditMode --> Delete[Tap Delete Entry]
    Delete --> Confirm{Confirm delete?}
    Confirm -->|Yes| DeleteAPI[Delete via API]
    DeleteAPI --> GoBack
    Confirm -->|No| EditMode
```

---

## Water Intake

```mermaid
flowchart TD
    HG[Hydration Gauge] --> HasContainer{Primary container configured?}
    HasContainer -->|No| ContainerAlert[Alert: configure on server]
    HasContainer -->|Yes| Display[Show water bottle fill level + current / goal]

    Display --> TapPlus{Tap +}
    TapPlus --> AddServing["Add 1 serving (optimistic UI update)"]
    AddServing --> SyncAPI[Sync with server]
    SyncAPI --> Display

    Display --> TapMinus{Tap -}
    TapMinus --> AtZero{Already at 0?}
    AtZero -->|Yes| Disabled[Button disabled]
    AtZero -->|No| RemoveServing["Remove 1 serving (optimistic UI update)"]
    RemoveServing --> SyncAPI
```

---

## End-to-End: Adding a Food Entry

This combines the most common path through the app.

```mermaid
flowchart TD
    Start([User wants to log food]) --> Entry{Entry point?}

    Entry -->|Tab bar 'Add'| FS[FoodSearch]
    Entry -->|Dashboard empty card| FS
    Entry -->|Diary 'Add Food'| FS

    FS --> SearchMethod{How to find food?}
    SearchMethod -->|Search local| LocalResult[Tap local result]
    SearchMethod -->|Search online| OnlineResult[Tap external result]
    SearchMethod -->|Browse meals| MealResult[Tap meal]
    SearchMethod -->|Scan barcode| ScanResult{Scan result}
    SearchMethod -->|Scan label| LabelResult[AI extraction]
    SearchMethod -->|Manual '+' button| ManualCreate

    LocalResult --> FEA[FoodEntryAdd]
    OnlineResult --> FEA
    MealResult --> FEA
    ScanResult -->|Local match| FEA
    ScanResult -->|External match| ManualCreate[FoodForm create-food]
    ScanResult -->|Not found| ManualCreate
    LabelResult --> ManualCreate

    FEA --> Configure1[Pick variant + quantity + meal + date]
    Configure1 --> Save1[Add Food]
    Save1 --> Done([Entry created - return to app])

    ManualCreate --> FillNutrition[Fill nutrition details + meal + date]
    FillNutrition --> Save2[Submit]
    Save2 --> Done
```
