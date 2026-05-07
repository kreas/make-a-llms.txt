---
name: code-review
description: Review code for DRY violations, prop drilling, proper use of hooks/context, and test coverage.
argument-hint: [file-or-directory]
disable-model-invocation: true
---

Perform a focused code review for architecture and testing quality.

## Scope

If `$ARGUMENTS` is provided, focus on that file or directory. Otherwise, use `git diff --name-only $(git merge-base HEAD main)...HEAD` to get the list of changed files on the current branch.

Filter to source files: `.ts`, `.tsx`, `.js`, `.jsx`

---

## Step 1: DRY Analysis

Look for code that violates Don't Repeat Yourself:

### What to Check

1. **Repeated logic blocks** - Similar code in 2+ places that differs only slightly
2. **Copy-pasted functions** - Functions with minor variations that could be parameterized
3. **Repeated JSX patterns** - Similar UI structures that should be components
4. **Duplicate type definitions** - Types/interfaces defined in multiple files
5. **Inline utilities** - String manipulation, date formatting, array operations that appear multiple times

### Refactoring Recommendations

For each violation, suggest ONE of these approaches:

| Pattern | Solution |
|---------|----------|
| Repeated logic | Extract to `src/lib/utils.ts` or domain-specific utility file |
| Similar functions | Create parameterized function with options object |
| Repeated JSX | Create shared component in `src/components/` |
| Duplicate types | Centralize in `src/lib/types.ts` or feature-specific types file |
| Inline utilities | Add to existing utility file or create new one |

---

## Step 2: Prop Drilling Detection

Identify props passed through multiple component layers without being used.

### Detection Rules

- **3+ levels** = Definite prop drilling problem
- **2 levels** = Review if it will grow
- **Same prop in parent and child** with no transformation = Pass-through candidate

### What to Look For

1. Props passed from grandparent → parent → child unchanged
2. Multiple related props always passed together (should be combined)
3. Callback functions passed down multiple levels
4. State that's accessed by distant descendants

### Solutions to Recommend

| Situation | Solution |
|-----------|----------|
| Data needed by many components | Create React Context |
| Single deeply-nested consumer | Use composition (children pattern) |
| State lifted too high | Co-locate state closer to usage |
| Related props always together | Group into object or use Context |

### Example Context Suggestion

When recommending Context, provide a pattern like:

```typescript
// src/components/feature/FeatureContext.tsx
interface FeatureContextValue {
  // Group related state here
}

const FeatureContext = createContext<FeatureContextValue | null>(null);

export function useFeature() {
  const context = useContext(FeatureContext);
  if (!context) throw new Error('useFeature must be used within FeatureProvider');
  return context;
}

export function FeatureProvider({ children }: { children: React.ReactNode }) {
  // State and logic here
  return <FeatureContext.Provider value={...}>{children}</FeatureContext.Provider>;
}
```

---

## Step 3: Hooks & Context Review

Ensure proper use of React patterns.

### Custom Hooks Check

Look for:

1. **Business logic in components** that should be extracted to custom hooks
2. **Repeated useState + useEffect patterns** across components
3. **Complex state logic** that should use useReducer
4. **Side effects** that could be encapsulated in hooks

### Signs a Custom Hook is Needed

- Component has 5+ useState calls
- Same useEffect pattern in multiple components
- Complex derived state calculations
- API calls or subscriptions inline in component

### Hook Naming Convention

Custom hooks should:
- Start with `use` prefix
- Live in `src/lib/hooks/` for shared hooks
- Live next to component for component-specific hooks
- Have clear, action-oriented names: `useIssueActions`, `useBoardData`, `useKeyboardShortcuts`

### Context Usage Check

Verify:

1. Context is used instead of prop drilling (see Step 2)
2. Context values are memoized to prevent unnecessary re-renders
3. Context is split appropriately (not one giant context)
4. Provider is placed at the right level in the tree

---

## Step 4: Test Coverage Check

**This is critical.** Every code change should have corresponding tests.

### Check for Missing Tests

For each changed file, verify a corresponding test file exists:

| Source File | Expected Test File |
|-------------|-------------------|
| `src/lib/foo.ts` | `src/lib/foo.test.ts` |
| `src/components/Foo.tsx` | `src/components/Foo.test.tsx` |
| `src/lib/hooks/useFoo.ts` | `src/lib/hooks/useFoo.test.ts` |

### What Should Be Tested

1. **Utility functions** - All exports with various inputs
2. **Custom hooks** - Using `@testing-library/react` `renderHook`
3. **Components** - User interactions and rendered output
4. **Reducers** - All action types and edge cases

### Missing Test Report

For each file without tests, output:

```
⚠️  Missing tests: src/lib/foo.ts
   Suggested test file: src/lib/foo.test.ts
   Functions to test:
   - functionA() - lines 10-25
   - functionB() - lines 30-50
```

### Test Quality Check

If tests exist, verify:

1. Tests cover the changed code paths
2. Tests use meaningful descriptions
3. Tests don't just test implementation details
4. Edge cases are covered (null, empty, error states)

---

## Output Format

```
## Code Review Report

### Scope
- Files reviewed: X
- [list of files]

---

### 🔴 DRY Violations

#### 1. [Pattern description]
**Found in:**
- `src/path/file1.tsx:15-30`
- `src/path/file2.tsx:45-60`

**Recommendation:** [specific refactoring suggestion]

---

### 🟠 Prop Drilling Issues

#### 1. `propName` passed through 3 levels
**Path:** `GrandParent` → `Parent` → `Child`

**Recommendation:** Create `FeatureContext` with `useFeature` hook

---

### 🟡 Hooks & Context Improvements

#### 1. [Component/file name]
**Issue:** [description]
**Recommendation:** [extract to hook / use context / etc.]

---

### 🔵 Test Coverage

#### Missing Tests
| File | Needs Test | Priority |
|------|------------|----------|
| `src/lib/foo.ts` | `src/lib/foo.test.ts` | High |

#### Existing Tests - Quality Issues
- `src/lib/bar.test.ts` - Missing edge case for empty input

---

### Summary

| Category | Issues |
|----------|--------|
| DRY Violations | X |
| Prop Drilling | X |
| Hooks/Context | X |
| Missing Tests | X |

### Priority Actions
1. [Most important fix]
2. [Second priority]
3. [Third priority]
```

---

## Step 5: Interactive Fixes

After presenting the report, offer to fix issues one category at a time:

1. **"Fix DRY violations"** - Extract utilities and components
2. **"Fix prop drilling"** - Create Context providers and hooks
3. **"Create missing tests"** - Generate test file scaffolds
4. **"Fix all"** - Apply all recommendations

Wait for user confirmation before each fix. Show the proposed changes before applying.

---

## Integration Notes

This skill is designed to be run frequently during development, not just before PR. Run it:

- After implementing a new feature
- When a file grows beyond 150 lines
- Before running the full `/pr-ready` check
- When you notice similar code in multiple places
