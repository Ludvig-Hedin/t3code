# Code Review Control Fix

Date: 2026-04-08

## Status

- Manual `Code Review` header action now opens the popover explicitly instead of relying on nested trigger composition.
- Added a browser regression test covering the popover open flow and dispatch of the review turn.

## Notes

- This is a user-facing fix in the web app header.
- The review trigger still uses the existing review prompt and runtime-mode logic; only the open/dispatch path changed.
