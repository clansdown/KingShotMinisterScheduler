# AGENTS.md - Guidelines for Agentic Coding in KingShotMinisterScheduler

This file provides instructions for AI coding agents (e.g., opencode) working on the KingShotMinisterScheduler repository. It includes code style guidelines, and conventions to maintain consistency. The project is a stand-alone HTML/JavaScript application for scheduling minister/advisor appointments from CSV data.

No linting or testing is required for this project. The agent should not attempt any testing.

## 1. Code Style Guidelines

Follow these rules for consistency. The codebase uses vanilla JavaScript (ES5+) split across multiple files loaded by `index.html`.

### General Principles
- **Readability First**: Code should be self-explanatory. Use descriptive names and structures.
- **Modularity**: Keep functions small (<50 lines). One responsibility per function.
- **Security**: Never expose secrets. Validate user inputs (e.g., CSV data).
- **Performance**: Optimize for client-side (e.g., avoid large loops; use efficient data structures like Maps/Sets).
- **Browser Compatibility**: Support modern browsers (Chrome, Firefox, Safari). Avoid polyfills unless necessary.
- **Code Functionality**: Agents must write fully functional, production-ready code unless the user explicitly requests stubs, placeholders, or incomplete implementations. Avoid TODO comments or non-working code segments—ensure all logic is complete and runnable.

### File Structure
- `index.html`: HTML structure with Bootstrap CSS/JS via CDN, inline scripts for DOMContentLoaded handlers, and modals for user interactions.
- `calculator.js`: Main scheduling logic including assignment/displacement algorithms, UI rendering, modal handlers, and player management functions.
- `parse.js`: CSV parsing utilities, time range processing, and data validation functions.
- `storage.js`: OPFS (Origin Private File System) persistence layer for saving/loading scheduler data.
- `sample.csv`: Test data (ignored by git).
- Avoid new files unless absolutely required.

### Imports and Dependencies
- No ES6 imports (vanilla JS). Load scripts in order: `storage.js`, `parse.js`, `calculator.js`.
- If adding libs (e.g., PapaParse for CSV), use `<script src="...">` in HTML after Bootstrap.
- For styling, include Bootstrap via CDN links in `<head>` (CSS) and before `</body>` (JS).
- Check for existing usage before adding: e.g., search codebase for similar libs.

### Formatting
- **Indentation**: 4 spaces (match editor default).
- **Line Length**: <140 characters.
- **Semicolons**: Always use at end of statements.
- **Braces**: Always use for blocks (e.g., `if (cond) { ... }`).
- **Spacing**: One space around operators (`a + b`), after commas, no trailing spaces.
- **Blank Lines**: One between functions, two between major sections.
- **Quotes**: Single quotes for strings (`'string'`), double for HTML attributes.

### Types and TypeScript
- No TypeScript. Use JSDoc for type annotations.
- Example: `/** @param {Array<Object>} players - Array of player objects with string/number fields */`
- Document ALL params, returns, and complex types (e.g., `{start: string, end: string}`). This includes local variables with complex types.
- Document ALL arrays, including in local variables, with jsdoc types.

### JSDoc - Mandatory for All Declarations

**CRITICAL REQUIREMENT**: Every array and object declaration MUST have an `@type {}` JSDoc comment immediately before it, unless assigned from a well-documented function return value.

**Examples:**

**Required JSDoc for inline arrays/objects:**
```javascript
/** @type {Array<{candidate: PlayerObject, displaced: PlayerObject, slot: {start: string, end: string}}>} */
const displacements = [];

/** @type {Array<WaitingPlayer>} */
const toAdd = [];

/** @type {Set<string>} */
const taken = new Set([...]);

/** @type {Array<{name: string, timestamp: number}>} */
const files = [];
```

**JSDoc NOT required (well-documented return):**
```javascript
// No JSDoc needed - function has @returns {Array<TimeRange>}
const slots = generateTimeSlots();
```

**For object parameters in functions:**
- Use @typedef definitions for complex object types
- Inline @param types for simple object structures
- NEVER use generic `Object` or `Array<Object>` without properties specified

**Examples:**
```javascript
/**
 * @typedef {Object} Appointment
 * @property {string} start - Slot start time in HH:MM.
 * @property {string} end - Slot end time in HH:MM.
 * @property {string} alliance - Player's alliance.
 * @property {string} player - Player's name.
 * @property {string|number} speedups - Speedup info.
 * @property {number} truegold - TrueGold pieces.
 */
```

### Naming Conventions
- **Variables/Functions**: camelCase (e.g., `parseCsvToObjects`, `playerAlliance`).
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_SLOTS = 48`).
- **Objects/Properties**: camelCase (e.g., `player.availableTimeRanges`).
- **IDs/Selectors**: kebab-case for HTML IDs (e.g., `day1Table`), camelCase for JS variables.
- **Descriptive**: Avoid abbreviations; e.g., `timeSlotStartUtc` not `tsStart`.

### Naming Clarity - Self-Documenting Code

**CRITICAL REQUIREMENT**: Variable and function names must be maximally descriptive. Avoid all abbreviations and single-letter names except for loop counters in trivial contexts.

**Naming Rules:**

1. **Variables**: Use full descriptive names
   - ❌ `p`, `a`, `h`, `m`, `tsStart`
   - ✅ `player`, `appointment`, `hour`, `minute`, `timeSlotStart`

2. **Loop Indices**: Use descriptive names in nested or complex logic
   - ❌ `i`, `j` (in complex nested loops)
   - ✅ `candidateIndex`, `assignedIndex` (in displacement logic)

3. **Boolean Flags**: Use `is/has/can` prefixes
   - ❌ `hasAssig`, `isConstr`, `addedToOtherDay`
   - ✅ `hasAssignment`, `hasConstructionAssignment`, `hasValidDayAssignment`

4. **Functions**: Use verb-noun pattern indicating action
   - ❌ `getAppointments`, `filter`, `parse`
   - ✅ `getMinisterAppointments`, `filterQualifiedPlayers`, `parseCsvToObjects`

5. **Avoid ambiguous names**:
   - ❌ `taken`, `changed`, `candidate` (context-dependent)
   - ✅ `takenSlots`, `scheduleChanged`, `spilloverCandidate`

### Function Modularity - Keep Functions Small

**CRITICAL REQUIREMENT**: Functions must not exceed 50 lines of actual code (excluding comments). If a function grows larger, immediately refactor it into smaller, single-purpose functions.

**Refactoring Guidelines:**

1. **One Responsibility Per Function**: Each function should do one thing well.
   - ❌ `submitAddPlayer()` (287 lines) does: form parsing, validation, allocation, scheduling, UI updates
   - ✅ Split into: `parseFormData()`, `validatePlayer()`, `allocateSpeedups()`, `schedulePlayer()`, `updateUI()`

2. **Extract Logical Sections**: If a function has distinct logical sections (4+ lines each), extract them:
   - Identify: "This section handles X"
   - Extract to: `handleXSection()`

3. **Common Patterns to Extract**:
   - DOM creation/manipulation
   - Data transformation/conversion
   - Condition checking/validation
   - Loop processing with complex logic

**Example Refactoring:**

**Before (75+ lines):**
```javascript
function scheduleSpilloverDay(schedulerData, spilloverDay, players = null) {
    // Lines 400-420: Candidate aggregation
    const spilloverCandidates = [];
    const seenPlayers = new Set();
    [constructDay, researchDay, 4].forEach(sourceDay => {
        // ... 20 lines of aggregation logic
    });
    // Lines 430-458: Assignment loop with multiple checks
    // ... 28 lines of assignment logic
    // Lines 461-472: Waiting list management
    // ... 11 lines of waiting list logic
}
```

**After (extract helper functions):**
```javascript
function scheduleSpilloverDay(schedulerData, spilloverDay, players = null) {
    const candidates = players || aggregateSpilloverCandidates(schedulerData, spilloverDay);
    const unscheduled = assignSpilloverCandidates(candidates, schedulerData, spilloverDay);
    addUnscheduledToWaitingList(unscheduled, schedulerData, spilloverDay);
}

function aggregateSpilloverCandidates(schedulerData, excludeDay) { /* ... */ }
function assignSpilloverCandidates(candidates, schedulerData, spilloverDay) { /* ... */ }
function addUnscheduledToWaitingList(unscheduled, schedulerData, spilloverDay) { /* ... */ }
```

### Functions
- **Declaration**: Use `function name(params) { ... }` for named functions.
- **Parameters**:
  - Limit to <5. Use objects for many params (e.g., `options = {}`).
  - Document complex object parameters with @typedef.
- **Returns**:
  - Explicit return; use early returns for clarity.
  - Always document with `@returns` (even for void functions).
- **Throws**:
  - Document with `@throws` for ANY error-throwing function.
  - Must be present if function contains `throw error` or throws from other calls.
- **Arrow Functions**: Use for short, anonymous callbacks (e.g., `players.forEach(player => { ... })`).
- **Documentation**:
  - JSDoc for ALL functions without exception.
  - Required tags: `@param`, `@returns`, `@throws` (if applicable).
  - No undocumented functions allowed in codebase.

### Variables and Data Structures
- **Declaration**: Use `const` for immutable, `let` for mutable. Avoid `var`.
- **Scope**: Minimize global scope; use IIFEs if needed (rarely).
- **Arrays/Objects**: Use literals (e.g., `[]`, `{}`). Prefer Maps for key-value if keys are dynamic.
- **Strings**: Template literals for interpolation (e.g., `${alliance}/${player}`).
- **Type Annotations**: All array/object literals MUST have preceding @type JSDoc comments.

### Error Handling
- **Validation**: Check inputs early (e.g., `if (!csvText) return [];`).
- **Throws**: Use for critical errors (e.g., invalid CSV format). ALWAYS document with @throws.
- **User Feedback**: For UI, update DOM with messages (e.g., alert or div text).
- **Logging**: Use `console.log` for debug, remove in production. No production logs.

### Comments and Documentation
- **No Inline Comments**: Avoid `// comment` unless explaining complex logic. Code should be clear.
- **Section Comments**: Use block comments (`/* */`) to indicate major code sections (e.g., `/* Data Processing Section */`). Keep concise and place above sections for clarity.
- **JSDoc Only**: Use for all functions/variables with properly typed annotations. All complex types must be explicitly typed with properties (e.g., `{name: string, age: number}`), not generic `Object` or `Array<Object>`. Include `@param`, `@returns`, `@throws` if applicable. Example:
  ```
  /**
   * Parses CSV text into objects.
   * @param {string} csvText - Raw CSV data.
   * @returns {Array<{alliance: string, player: string}>} Parsed players with alliance and player fields.
   */
  ```
- **README Updates**: Update `README.md` for new features; keep concise.

### HTML/CSS
- **Framework**: Use Bootstrap 5 for all styling via CDN. Include in `<head>` for CSS and before `</body>` for JS bundle.
- **Modals**: All dialog interactions use Bootstrap modals with data-bs-dismiss, event handlers, and inline onclick/change attributes for dynamic behavior.
- **Layout**: Use Bootstrap rows and columns (`row`, `col-*`) for responsive layouts where applicable (e.g., arrangements of tables, inputs, modal forms).
- **Structure**: Semantic tags (e.g., `<table>`, `<ul>`, `<modal>`). IDs for JS access. Apply Bootstrap classes for styling instead of custom CSS.
- **CSS**: Avoid custom CSS; rely on Bootstrap classes. If needed, use inline or `<style>` sparingly.
- **Accessibility**: Add `aria-label` for inputs and buttons without visible labels. Bootstrap components are accessible by default.

### Security and Best Practices
- **Input Sanitization**: Trim/validate CSV fields. Escape HTML if displaying user data.
- **No Secrets**: Never hardcode keys; use env vars if needed (not applicable here).
- **XSS Prevention**: Use `textContent` for DOM updates, never innerHTML with untrusted data.
- **Performance**: Limit DOM manipulations; batch updates.

### Cursor Rules
- None found (no `.cursor/rules/` or `.cursorrules`).

### Copilot Rules
- None found (no `.github/copilot-instructions.md`).

### Version Control
- **Git Handling**: Agents must NEVER commit, push, or perform git operations. The user handles all version control. Agents should only make code changes; do not use git commands.
- **Commits**: Small, descriptive (e.g., "Add CSV parsing with quote handling").
- **Branches**: Use feature branches (e.g., `feature/add-tests`).
- **PRs**: Self-review.

## Code Review Checklist

Before submitting any code changes, verify:

### JSDoc Requirements
- [ ] Every function has JSDoc with @param, @returns
- [ ] Every function that throws has @throws
- [ ] Every inline array/object has @type comment
- [ ] All complex types use @typedef or inline property definitions

### Naming Requirements
- [ ] No single-letter variables except trivial loop counters
- [ ] No abbreviated names (tsStart, hasAssig, isConstr)
- [ ] Boolean flags use is/has/can prefix
- [ ] Function names use verb-noun descriptive pattern

### Function Size Requirements
- [ ] No function exceeds 50 lines (excluding comments)
- [ ] Each function has single, clear responsibility
- [ ] Complex logic extracted into helper functions

### Code Clarity Requirements
- [ ] Variable names are self-documenting
- [ ] No magic numbers or unexplained values
- [ ] Logic sections are clearly separated
- [ ] Early returns used to reduce nesting

By following these guidelines, agents maintain a clean, maintainable codebase. If rules evolve, update this file.