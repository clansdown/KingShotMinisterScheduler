# AGENTS.md - Guidelines for Agentic Coding in KingShotMinisterScheduler

This file provides instructions for AI coding agents (e.g., opencode) working on the KingShotMinisterScheduler repository. It includes code style guidelines, and conventions to maintain consistency. The project is a stand-alone HTML/JavaScript application for scheduling minister/advisor appointments from CSV data.

No linting or testing is required for this project.

## 1. Code Style Guidelines

Follow these rules for consistency. The codebase uses vanilla JavaScript (ES5+) in a single file (`calculator.js`) loaded by `index.html`.

### General Principles
- **Readability First**: Code should be self-explanatory. Use descriptive names and structures.
- **Modularity**: Keep functions small (<50 lines). One responsibility per function.
- **Security**: Never expose secrets. Validate user inputs (e.g., CSV data).
- **Performance**: Optimize for client-side (e.g., avoid large loops; use efficient data structures like Maps/Sets).
- **Browser Compatibility**: Support modern browsers (Chrome, Firefox, Safari). Avoid polyfills unless necessary.
- **Code Functionality**: Agents must write fully functional, production-ready code unless the user explicitly requests stubs, placeholders, or incomplete implementations. Avoid TODO comments or non-working code segments—ensure all logic is complete and runnable.

### File Structure
- `index.html`: HTML structure with Bootstrap CSS/JS via CDN, minimal custom CSS (inline or `<style>`), script tag for `calculator.js`.
- `calculator.js`: All logic. No external dependencies.
- `sample.csv`: Test data (ignored by git).
- Avoid new files unless required (e.g., no separate CSS/JS modules).

### Imports and Dependencies
- No imports (vanilla JS). If adding libs (e.g., PapaParse for CSV), use `<script src="...">` in HTML.
- For styling, include Bootstrap via CDN links in `<head>` (CSS) and before `</body>` (JS).
- Check for existing usage before adding: e.g., search codebase for similar libs.

### Formatting
- **Indentation**: 4 spaces (match editor default).
- **Line Length**: <100 characters.
- **Semicolons**: Always use at end of statements.
- **Braces**: Always use for blocks (e.g., `if (cond) { ... }`).
- **Spacing**: One space around operators (`a + b`), after commas, no trailing spaces.
- **Blank Lines**: One between functions, two between major sections.
- **Quotes**: Single quotes for strings (`'string'`), double for HTML attributes.

### Types and TypeScript
- No TypeScript. Use JSDoc for type annotations.
- Example: `/** @param {Array<Object>} players - Array of player objects with string/number fields */`
- Document params, returns, and complex types (e.g., `{start: string, end: string}`).

### Naming Conventions
- **Variables/Functions**: camelCase (e.g., `parseCsvToObjects`, `playerAlliance`).
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_SLOTS = 48`).
- **Objects/Properties**: camelCase (e.g., `player.availableTimeRanges`).
- **IDs/Selectors**: kebab-case for HTML IDs (e.g., `day1Table`), camelCase for JS variables.
- **Descriptive**: Avoid abbreviations; e.g., `timeSlotStartUtc` not `tsStart`.

### Functions
- **Declaration**: Use `function name(params) { ... }` for named functions.
- **Parameters**: Limit to <5. Use objects for many params (e.g., `options = {}`).
- **Returns**: Explicit return; use early returns for clarity.
- **Arrow Functions**: Use for short, anonymous callbacks (e.g., `players.forEach(player => { ... })`).
- **Documentation**: JSDoc for all functions: `@param`, `@returns`, `@throws` if applicable.

### Variables and Data Structures
- **Declaration**: Use `const` for immutable, `let` for mutable. Avoid `var`.
- **Scope**: Minimize global scope; use IIFEs if needed (rarely).
- **Arrays/Objects**: Use literals (e.g., `[]`, `{}`). Prefer Maps for key-value if keys are dynamic.
- **Strings**: Template literals for interpolation (e.g., `${alliance}/${player}`).

### Error Handling
- **Validation**: Check inputs early (e.g., `if (!csvText) return [];`).
- **Throws**: Use for critical errors (e.g., invalid CSV format).
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
- **Framework**: Use Bootstrap for all possible styling (e.g., buttons, forms, grids, utilities). Include via CDN in `<head>` for CSS and before `</body>` for JS.
- **Layout**: Use Bootstrap rows and columns (`row`, `col-*`) for responsive layouts where applicable (e.g., arrangements of tables, inputs).
- **Structure**: Semantic tags (e.g., `<table>`, `<ul>`). IDs for JS access. Apply Bootstrap classes for styling instead of custom CSS.
- **CSS**: Avoid custom CSS; rely on Bootstrap classes. If needed, use inline or `<style>` sparingly.
- **Accessibility**: Add `alt` for images (none here), `aria-label` if needed. Bootstrap components are accessible by default.

### Security and Best Practices
- **Input Sanitization**: Trim/validate CSV fields. Escape HTML if displaying user data.
- **No Secrets**: Never hardcode keys; use env vars if needed (not applicable here).
- **XSS Prevention**: Use `textContent` for DOM updates.
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

By following these guidelines, agents maintain a clean, maintainable codebase. If rules evolve, update this file.