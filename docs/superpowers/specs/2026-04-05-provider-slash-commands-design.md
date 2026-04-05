# Provider-Aware Slash Commands — Design Spec

_Date: 2026-04-05_

## Problem

The T3Code composer currently exposes only 3 hardcoded slash commands: `/model`, `/plan`, `/default`. Users cannot discover or invoke the full set of commands available in the underlying provider CLIs (Codex, Claude Code, Gemini).

## Goal

When a user types `/` in the composer, show all slash commands available for the currently selected provider — below T3Code's own commands. Selecting a provider command inserts it into the composer as text; submitting passes it through to the provider agent, which executes it exactly as it would in the CLI.

## Approach

**Static registry + pass-through.** A new file `providerSlashCommands.ts` holds the full command list for each provider (`codex`, `claudeAgent`, `gemini`). The composer trigger detection is broadened to fire on any `/word`. T3Code-owned commands appear first; provider commands appear below, all filtered by the typed query.

## Files Changed

| File                                                   | Change                                             |
| ------------------------------------------------------ | -------------------------------------------------- |
| `apps/web/src/providerSlashCommands.ts`                | NEW — static registry                              |
| `apps/web/src/composer-logic.ts`                       | Broaden trigger: any `/word` fires `slash-command` |
| `apps/web/src/components/chat/ComposerCommandMenu.tsx` | New `provider-command` item type + icon            |
| `apps/web/src/components/ChatView.tsx`                 | Build provider items in menu, handle selection     |
| `apps/web/src/composer-logic.test.ts`                  | Update test for broadened trigger                  |

## Data Shape

```ts
// providerSlashCommands.ts
export interface ProviderSlashCommandDef {
  name: string; // "clear", "diff", "status" …
  description: string; // shown in the menu dropdown
  hasArgs: boolean; // true → inserts "/name " with trailing space
}

export const PROVIDER_SLASH_COMMANDS: Record<ProviderKind, readonly ProviderSlashCommandDef[]>;
```

Commands that are T3Code-handled (`model`, `plan`, `default`) are excluded from the provider registry — they appear at the top of the list as always.

## Trigger Detection Change

**Before:** `detectComposerTrigger` only fires `slash-command` if the typed query matches one of the 3 hardcoded commands.

**After:** Any `/word` (no whitespace) fires `slash-command`. The menu handles filtering. The `slash-model` special case (`/model ` with a space) is unchanged.

`parseStandaloneComposerSlashCommand` (used for standalone `/plan` / `/default` submit detection) is untouched.

## Menu Rendering

- **Order:** T3Code commands first (`model`, `plan`, `default`), then provider commands
- **Icon:** T3Code commands keep `BotIcon`. Provider commands get `TerminalSquareIcon`
- **Filtering:** Both groups filtered together by the typed query string

## Selection Behaviour

| Item type                      | Action on select                                                      |
| ------------------------------ | --------------------------------------------------------------------- |
| `slash-command` (model)        | Replaces `/mo` with `/model ` → triggers model picker                 |
| `slash-command` (plan/default) | Clears the `/…` text, calls `handleInteractionModeChange`             |
| `provider-command`             | Inserts `/name` (no args) or `/name ` (has args) — cursor lands after |

User then optionally types args and hits send. The provider agent handles the command natively.

## Provider Command Lists

### Codex (22 commands)

`fast`, `personality`, `new`, `clear`, `resume`, `fork`, `quit`, `permissions`, `status`, `copy`, `diff`, `review`, `mention`, `mcp`, `apps`, `agent`, `compact`, `statusline`, `ps`, `init`, `feedback`, `logout`, `experimental`

### Claude Code / claudeAgent (32 commands)

`add-dir`, `agents`, `btw`, `clear`, `compact`, `config`, `context`, `copy`, `cost`, `diff`, `effort`, `exit`, `export`, `feedback`, `help`, `hooks`, `init`, `keybindings`, `login`, `logout`, `mcp`, `memory`, `permissions`, `rewind`, `resume`, `security-review`, `skills`, `stats`, `status`, `theme`, `tools`, `usage`

### Gemini (28 commands)

`about`, `auth`, `bug`, `clear`, `commands`, `compress`, `copy`, `dir`, `docs`, `editor`, `extensions`, `help`, `hooks`, `ide`, `init`, `mcp`, `memory`, `permissions`, `privacy`, `quit`, `restore`, `rewind`, `resume`, `settings`, `skills`, `stats`, `theme`, `tools`, `vim`

## Non-Goals

- T3Code does NOT intercept or implement provider commands natively (no `/clear` wiring to clear the thread, etc.)
- No dynamic fetching of command lists at runtime
- No command argument autocomplete

## Testing

- `detectComposerTrigger` test for `/mo` still passes (any `/word` now triggers, no regression)
- No new unit tests needed: the registry is a plain data constant, the selection path is exercised by the existing menu interaction tests
