# Skill: Better GitHub PR Workflow

## Description
Improved workflow for handling GitHub PR reviews and implementations

## Key Lessons

### 1. Git Workflow Improvements
- **Always check remote branch state first**:
  ```bash
  git fetch origin
  git status
  git log --oneline -5 origin/branch-name
  ```

- **Proper rebase workflow**:
  ```bash
  git pull --rebase origin branch-name
  # Resolve conflicts properly
  git add resolved-files
  git rebase --continue
  git push origin branch-name
  ```

### 2. Route Configuration Analysis
- **Check route file structure**:
  ```bash
  # Examine route definitions
  grep -n "router\." routes/file.ts

  # Check mounting configuration
  grep -n "app.use" SparkyFitnessServer.js | grep -i "route-name"
  ```

- **Verify full API paths**:
  - Route prefix in file + mounting path = full API path
  - Test actual paths in browser/dev tools

### 3. Test Organization Best Practices
```javascript
// Better test organization example
describe('Feature: Description', () => {
  describe('Sub-feature: Specific Aspect', () => {
    it('should do X when Y happens', () => {
      // Test implementation
    });

    it('should handle edge case Z', () => {
      // Test implementation
    });
  });
});
```

### 4. Documentation Standards
```javascript
/**
 * Test Suite: [Brief Description]
 * Purpose: Addresses [specific requirement/review feedback]
 * Coverage: [what scenarios are tested]
 */
describe('Test Suite Name', () => {
  // Tests go here
});
```

## Implementation Checklist

- [ ] Check remote branch state before starting
- [ ] Understand complete route structure
- [ ] Organize tests logically with clear names
- [ ] Add documentation explaining test purpose
- [ ] Use proper git workflow (fetch, rebase, resolve, push)
- [ ] Verify API paths match documentation
- [ ] Test edge cases and error scenarios

## Common Pitfalls to Avoid

1. **Force pushing without understanding remote changes**
2. **Not verifying route mounting configurations**
3. **Poorly named tests that don't indicate purpose**
4. **Missing documentation for complex test scenarios**
5. **Not testing both happy paths and error cases**

## Additional Lessons from Water Intake PR

### 1. Clean Branch Strategy
**Problem**: Mixed water intake and goal preset changes in same branch
**Solution**:
```bash
# Create separate clean branches from upstream/main
git checkout -b clean-feature-name upstream/main
# Add only relevant files
git add specific/files/only.ts
git commit -m "feat: specific feature"
git push origin clean-feature-name
```

### 2. API Versioning Best Practices
**Pattern**: Maintain V1 and V2 routes simultaneously
```javascript
// V1 routes (unchanged)
app.use('/api/water-containers', waterContainerRoutes);

// V2 routes (new)
app.use('/api/v2/measurements/water-intake', v2WaterIntakeRoutes);
```

### 3. Test Validation Requirements
**Issue**: Missing required fields cause false test failures
**Fix**: Ensure all schema-required fields are in test data
```javascript
// Before (failing)
.send({ entry_date: '2023-01-01', change_drinks: 1 })

// After (passing)
.send({ entry_date: '2023-01-01', change_drinks: 1, container_id: null })
```

### 4. Error Handling Precision
**Pattern**: Route-level error catching before global handler
```javascript
try {
  await service.call();
} catch (error: unknown) {
  if (error instanceof Error && error.message.startsWith('Forbidden')) {
    res.status(403).json({ error: error.message });
    return; // Don't call next(error)
  }
  next(error); // Let global handler process other errors
}
```

### 5. PR Checklist Compliance
**Template**: Follow repository's PR template exactly
```markdown
## Description
- What problem does this solve? (1-2 sentences)
- How was it implemented? (brief technical approach)

## How to Test
1. Run `pnpm test`
2. Verify X behavior
3. Check Y functionality

## Checklist
- [x] Code quality checks passed
- [x] Tests added and passing
- [x] Documentation updated
```

## PR Review Preparation

### Before Creating PR
1. **Sync with upstream**:
   ```bash
   git fetch upstream
   git checkout -b feature-branch upstream/main
   ```

2. **Verify test coverage**:
   ```bash
   cd SparkyFitnessServer
   pnpm test
   ```

3. **Check file changes**:
   ```bash
   git diff upstream/main..feature-branch --name-only
   ```

### Creating PR
- Use clear, concise title
- Follow PR template structure
- Reference related issues (#123)
- Add testing instructions
- Specify PR type (feature/bug/refactor)

### After PR Creation
- Monitor CI/CD pipeline
- Respond to review comments promptly
- Update PR description if scope changes
- Rebase if main branch moves forward

## Critical Lessons from Water Intake PR Review

### 1. Security-First Middleware Ordering 🔴
**Critical Security Vulnerability Found**: Middleware execution order matters!

**Wrong Order (VULNERABLE)**:
```typescript
router.use(checkPermissionMiddleware('checkin'));
router.use(onBehalfOfMiddleware);
```
**Problem**: Permission check runs before impersonation middleware, causing `req.originalUserId` to be undefined, bypassing permission checks for family access.

**Correct Order (SECURE)**:
```typescript
router.use(onBehalfOfMiddleware);
router.use(checkPermissionMiddleware('checkin'));
```
**Impact**: Ensures permission checks use the correct user context when acting on behalf of others.

### 2. Complete Audit Trails 🟡
**Issue**: Missing actor information in update/delete operations

**Before (INCOMPLETE)**:
```typescript
await measurementService.updateWaterIntake(req.userId, id, data);
```
**Problem**: Audit logs only show the target user, not who performed the action.

**After (COMPLETE)**:
```typescript
await measurementService.updateWaterIntake(
  req.userId,              // Actor (who is doing it)
  req.originalUserId || req.userId,  // Target (who it's for)
  id,
  data
);
```
**Impact**: Proper audit trail shows "Admin updated child's water intake" vs just "Child updated water intake"

### 3. TypeScript Import Consistency 🟡
**Pattern**: Always use ES6 imports in TypeScript files

**Avoid**:
```typescript
const module = require('../../module');
```

**Use**:
```typescript
import module from '../../module';
```
**Benefits**: Better type inference, consistency, modern syntax

### 4. Service Layer Parameter Consistency 🟡
**Pattern**: Standardize `(actor, target, ...rest)` parameter order

**Problem**: Inconsistent ordering causes maintenance errors:
- `getWaterIntake(actor, target)` ✅
- `updateWaterIntake(target, actor)` ❌

**Solution**: Always use `(actor, target, ...)` pattern throughout service layer

### 5. Comprehensive Swagger Documentation 📚
**Pattern**: Include examples and complete response schemas

**Before (MINIMAL)**:
```yaml
responses:
  200:
    description: Success
  403:
    description: Forbidden
```

**After (COMPLETE)**:
```yaml
responses:
  200:
    description: Water intake entry retrieved successfully.
    content:
      application/json:
        schema:
          type: object
          properties:
            id:
              type: string
              format: uuid
            water_ml:
              type: number
              example: 250
  403:
    description: Forbidden - user doesn't have permission.
    content:
      application/json:
        schema:
          type: object
          properties:
            error:
              type: string
              example: "Forbidden: access denied."
```
**Impact**: Better API documentation, easier integration for frontend teams

### 6. Test Data Completeness 🧪
**Pattern**: Include all schema-required fields in tests

**Problem**: Missing fields cause false test failures:
```javascript
// Fails validation before reaching service mock
.send({ entry_date: '2023-01-01', change_drinks: 1 })
```

**Solution**: Provide all required fields (even if null):
```javascript
// Passes validation, reaches service mock
.send({ entry_date: '2023-01-01', change_drinks: 1, container_id: null })
```

## Review Checklist for Security-Critical PRs

### Security Review
- [ ] Middleware order verified (impersonation before permission checks)
- [ ] All service calls include actor/target user IDs for auditing
- [ ] Permission checks cover all endpoints (GET, POST, PUT, DELETE)
- [ ] Family access scenarios tested

### Code Quality Review
- [ ] TypeScript imports used consistently
- [ ] Service layer parameter order standardized
- [ ] Error handling consistent across endpoints
- [ ] Swagger documentation complete with examples

### Testing Review
- [ ] All schema-required fields included in tests
- [ ] Edge cases covered (null values, empty strings, etc.)
- [ ] Both success and error paths tested
- [ ] 100% test coverage for new functionality

### Documentation Review
- [ ] PR description follows template
- [ ] Testing instructions provided
- [ ] Related issues referenced
- [ ] Breaking changes documented (if any)