# Standalone File Preview Support

> Status note for the preview flow update implemented on 2026-04-08.

## What changed

- Static asset paths for standalone preview HTTP are validated with `fs.realpath` on both the project root and the candidate file so symlink traversal cannot escape the app cwd.
- DOCX text extraction uses async `execFile` (with timeout) instead of blocking `execFileSync`.
- Preview detection now includes standalone root files such as `.html`, `.md`, `.mdx`, `.tsx`, `.jsx`, and `.docx`.
- The preview launcher can serve those files directly without requiring a `package.json` dev script.
- Standalone previews open as browser-type apps, so they still work with the existing preview panel and proxy route.

## User-facing behavior

- If a repo has no runnable app config, the preview panel can now show file-based preview options instead of only the empty-state error.
- HTML files render as live browser previews.
- Markdown files render as a simple readable HTML preview.
- TSX/JSX files render as source previews.
- DOCX files render extracted text when possible.
