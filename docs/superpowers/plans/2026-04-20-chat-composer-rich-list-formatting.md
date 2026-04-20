# 2026-04-20 Chat Composer Rich List Formatting

## Goal

Upgrade the chat composer from plain-text list shortcuts to real rich-text list behavior so bullets and numbered items render with proper indentation and markers like Word or Google Docs.

## Changes

- Switched the composer editor to Lexical rich text with list support instead of the plain-text plugin.
- Added shortcut handling so typing `- ` or `1. ` turns the current paragraph into a real unordered or ordered list item.
- Preserved the existing serialized prompt value so the rest of the chat pipeline still receives plain text with list prefixes.
- Added editor CSS that restores list bullets, numbering, and indentation after Tailwind’s base reset.
- Added unit coverage for the parser helpers and browser coverage for real list-node rendering.

## User-facing impact

- List shortcuts now render as actual bullets and numbers in the composer instead of literal `-` or `1.` text.
- The composer now shows visible indentation and marker styling that matches a word processor-style editing experience.

## Architectural note

- The composer keeps a plain-text state contract while using a structured Lexical document internally, which keeps the rest of the chat flow stable.
- The helper module separates list parsing and shortcut detection from the editor component so the behavior can be tested without mounting the full chat view.
