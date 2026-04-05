# Project Script Recommendations

The Add Action button in the app header now reads `package.json` from the active project workspace and surfaces matching scripts as recommended actions.

## Behavior

- Recommended actions are derived from the `scripts` block in `package.json`.
- Existing actions are filtered out by matching command text, action name, or action id.
- Each recommendation is rendered with a checkbox so multiple actions can be added in one pass.
- If no package manifest or scripts are found, the dialog falls back to the existing custom action form.

## Implementation notes

- Workspace file reads are routed through the server so the browser never accesses the filesystem directly.
- The action icon is inferred from the script name and command using lightweight heuristics.
- The feature is intentionally conservative: it only recommends scripts from the active project workspace and does not auto-create any actions.
