
# AI Command Patterns & Context Guide

## Common User Interaction Patterns

### Food Logging Commands
**User Intent**: Log food intake
**Common Phrases**:
- "I ate 2 slices of pizza"
- "Add 1 cup of rice to lunch"
- "Log breakfast: 2 eggs and toast"
- "I had dominos chicken pizza"

**Expected AI Response**:
1. Extract food items with quantities
2. Determine meal type (breakfast/lunch/dinner/snacks)
3. Get nutrition data from database or AI knowledge
4. Present confirmation dialog with nutrition summary
5. Add to food diary upon confirmation

**Context Date Extraction**:
- "today" → current date
- "yesterday" → previous date  
- "last Sunday" → specific past date
- No date mentioned → assume today

### Measurement Logging Commands
**User Intent**: Record body measurements
**Common Phrases**:
- "My weight is 70kg today"
- "Waist measurement: 32 inches"
- "I weighed 154 pounds this morning"

**Expected AI Response**:
1. Extract measurement type and value
2. Convert units if necessary
3. Save to appropriate measurement table
4. Provide confirmation with trend information

### Goal Setting Commands
**User Intent**: Update nutrition or fitness goals
**Common Phrases**:
- "Set my calorie goal to 1800"
- "I want to consume 120g protein daily"
- "Change my water goal to 10 glasses"

**Expected AI Response**:
1. Identify goal type and target value
2. Update user_goals table
3. Apply to future dates using goal timeline function
4. Confirm changes with previous vs new goals

### Progress Inquiry Commands
**User Intent**: Get progress information
**Common Phrases**:
- "How am I doing today?"
- "Show my calorie progress"
- "What's my weight trend this week?"

**Expected AI Response**:
1. Query relevant data based on request type
2. Calculate progress percentages
3. Provide trend analysis
4. Suggest improvements if applicable

## Database Context for AI Operations

### Food Operations
**Tables**: foods, food_entries, food_variants
**Key Operations**:
- Search foods by name/brand
- Create custom foods when not found
- Calculate nutrition based on quantity
- Handle different serving units

**Nutrition Calculation**:
```
final_nutrition = (food_nutrition / food_serving_size) * user_quantity
```

### Measurement Operations
**Tables**: check_in_measurements, custom_measurements, custom_categories
**Key Operations**:
- Record standard measurements (weight, waist, etc.)
- Handle custom measurement categories
- Convert between units (kg/lbs, cm/inches)
- Track trends over time

### Goal Operations
**Tables**: user_goals
**Key Operations**:
- Retrieve current goals for date
- Update goals with timeline management
- Handle historical vs future goal changes
- Calculate progress percentages

### Family Access Context
**Tables**: family_access
**Permission Checks**:
- Always check `can_access_user_data()` before operations
- Respect permission levels (read vs write)
- Handle permission inheritance rules

## AI Response Templates

### Food Logging Success
```
"Great! I've analyzed your [meal_type] and found:

**[quantity] [food_name]:**
• [calories] calories
• [protein]g protein, [carbs]g carbs, [fat]g fat
• [fiber]g fiber, [sodium]mg sodium

Would you like me to add this to your [meal_type] for [date]?"
```

### Progress Summary
```
"Here's your progress for today:

**Calories:** [consumed]/[goal] ([percentage]%)
**Protein:** [consumed]g/[goal]g ([percentage]%)
**Carbs:** [consumed]g/[goal]g ([percentage]%)
**Fat:** [consumed]g/[goal]g ([percentage]%)

[motivational message based on progress]"
```

### Measurement Confirmation
```
"Recorded your [measurement_type]: [value] [unit]

[Trend information if available]
[Encouragement or suggestions]"
```

## Error Handling Patterns

### Food Not Found
1. Search for similar foods in database
2. Offer to create custom food
3. Ask for more specific information (brand, preparation)
4. Provide nutrition estimation if possible

### Invalid Measurements
1. Check for reasonable ranges
2. Confirm unusual values with user
3. Suggest unit conversion if needed
4. Provide context about normal ranges

### Permission Denied
1. Explain family access limitations
2. Suggest contacting data owner
3. Offer alternative accessible features
4. Maintain privacy without revealing restricted data

## Context Optimization

### Essential Context (Always Load)
- User's current goals
- Today's food entries
- Active family access permissions
- Basic app navigation structure

### On-Demand Context (Load Based on Query)
- **Food queries**: Food database, nutrition facts, meal history
- **Measurement queries**: Historical measurements, trends, goals
- **Report queries**: Analytics data, progress calculations
- **Settings queries**: User preferences, AI configuration

### Performance Considerations
- Cache frequently accessed nutrition data
- Limit historical data queries to reasonable ranges
- Use database functions for complex calculations
- Batch related operations when possible

## Integration Points

### Direct Database Operations
- Food entries creation/modification
- Measurement logging
- Goal updates
- Custom food creation

### UI Refresh Triggers
- Dispatch 'foodDiaryRefresh' event after food logging
- Update measurement charts after new entries
- Refresh progress bars after goal changes
- Update family access status after permission changes

### Notification Patterns
- Success toasts for completed operations
- Error alerts for failed operations
- Confirmation dialogs for destructive actions
- Progress notifications for long operations
