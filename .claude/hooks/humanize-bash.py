#!/usr/bin/env python3
"""PostToolUse hook — translate raw Bash commands into human-readable descriptions.
Outputs a systemMessage shown inline in Clean mode after each Bash tool call.
"""

import json
import re
import sys


def strip_shell_wrapper(cmd: str) -> str:
    """Strip /bin/zsh -lc, /bin/bash -c wrappers and outer quotes."""
    cmd = re.sub(r'^/bin/(?:zsh|bash|sh)\s+-\S+\s+', '', cmd).strip()
    if len(cmd) >= 2 and cmd[0] == cmd[-1] and cmd[0] in ('"', "'"):
        cmd = cmd[1:-1]
    return cmd.strip()


def humanize(cmd: str) -> str:
    cmd = strip_shell_wrapper(cmd)

    # sed -n 'A,Bp' FILE
    m = re.match(r"sed\s+-n\s+'?(\d+),(\d+)p'?\s+(.+?)(?:\s*[|;].+)?$", cmd)
    if m:
        s, e, path = m.group(1), m.group(2), m.group(3).strip()
        return f"Read lines {s}–{e} of `{path.split('/')[-1]}`"

    # cat FILE
    m = re.match(r"cat\s+(\S+)", cmd)
    if m:
        path = m.group(1).strip()
        return f"Read `{path.split('/')[-1]}`"

    # ripgrep / grep
    m = re.match(r"(?:rg|grep)\s+(.+)", cmd)
    if m:
        return _humanize_rg(m.group(1))

    # git
    m = re.match(r"git\s+(.+)", cmd)
    if m:
        return _humanize_git(m.group(1).strip())

    # npm / pnpm / bun / yarn
    m = re.match(r"(npm|pnpm|bun|yarn)\s+(.+)", cmd)
    if m:
        mgr, rest = m.group(1), m.group(2).strip()
        if rest.startswith("run "):
            words = rest[4:].strip().split()
            if not words:
                return f"Run `{mgr} run`"
            script = words[0]
            return f"Run `{mgr} run {script}`"
        if re.match(r"i(?:nstall)?(?:\s|$)|add\s", rest):
            return f"Install dependencies via `{mgr}`"
        return f"Run `{mgr} {rest[:60]}`"

    # ls
    m = re.match(r"ls\s+(.*)", cmd)
    if m:
        target = m.group(1).strip() or "current directory"
        return f"List files in `{target}`"

    # pwd (possibly compound)
    if re.match(r"^pwd\b", cmd):
        rest_after_pwd = re.sub(r"^pwd\s*&&\s*", "", cmd)
        if rest_after_pwd != cmd:
            remainder = humanize(rest_after_pwd)
            if remainder:
                remainder = remainder[0].lower() + remainder[1:]
                return f"Show current directory, then {remainder}"
            return "Show current directory"
        return "Show current directory"

    # compound &&
    if "&&" in cmd:
        parts = [p.strip() for p in cmd.split("&&") if p.strip()]
        described = [humanize(p) for p in parts]
        return "; ".join(described)

    # fallback — show cleaned command (no ellipsis, wrapped via markdown code block)
    return f"`{cmd}`"


def _humanize_rg(args: str) -> str:
    # rg --files — list matching files
    if "--files" in args:
        globs = re.findall(r"""-g\s+'([^']+)'|-g\s+"([^"]+)"|-g\s+(\S+)""", args)
        flat = [g for triple in globs for g in triple if g]
        if flat:
            patterns = ", ".join(f"`{g}`" for g in flat[:4])
            return f"List files matching {patterns}"
        return "List files in project"

    # extract quoted pattern (first one wins)
    pattern_m = re.search(r'"([^"]*)"', args) or re.search(r"'([^']*)'", args)
    if pattern_m:
        pattern = pattern_m.group(1)
    else:
        tokens = args.lstrip("-").split()
        pattern = tokens[0] if tokens else ""
    if len(pattern) > 60:
        pattern = pattern[:57] + "…"

    # target paths
    path_m = re.findall(
        r'(?:^|\s)((?:apps|packages|src|lib|components|routes|web|server)\S*)',
        args
    )
    paths = [p for p in path_m if not p.startswith("-")]

    if paths:
        path_str = ", ".join(f"`{p}`" for p in paths[:3])
        if len(paths) > 3:
            path_str += f" (+{len(paths) - 3} more)"
    else:
        path_str = "codebase"

    excl = " (skip `node_modules`)" if "node_modules" in args else ""
    limit = ""
    head_m = re.search(r'\|\s*head\s+-n?\s*(\d+)', args)
    if head_m:
        limit = f", first {head_m.group(1)} results"

    search_for = f" for `{pattern}`" if pattern else ""
    return f"Search {path_str}{search_for}{excl}{limit}"


def _humanize_git(args: str) -> str:
    sub = args.split()[0] if args else ""
    simple = {
        "log":    "Show recent git commits",
        "diff":   "Show git diff",
        "status": "Show git status",
        "blame":  "Show git blame",
        "show":   "Show git object",
        "branch": "List git branches",
        "stash":  "Manage git stash",
        "fetch":  "Fetch from remote",
        "pull":   "Pull latest changes",
        "push":   "Push commits to remote",
        "rebase": "Rebase branch",
        "merge":  "Merge branch",
        "tag":    "Manage git tags",
    }
    if sub in simple:
        return simple[sub]
    m = re.match(r"commit\s+-m\s+[\"']?(.{0,50})", args)
    if m:
        return f"Commit: \"{m.group(1).rstrip('\"\'')}\""
    if sub == "add":
        files = args[4:].strip() or "."
        return f"Stage `{files}` for commit"
    if sub == "checkout":
        target = args[9:].strip() or "branch"
        return f"Switch to `{target}`"
    return f"Run `git {args[:60]}`"


def main():
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        sys.exit(0)

    if payload.get("tool_name") != "Bash":
        sys.exit(0)

    command = payload.get("tool_input", {}).get("command", "")
    if not command:
        sys.exit(0)

    description = humanize(command)
    print(json.dumps({"systemMessage": f"→ {description}"}))


if __name__ == "__main__":
    main()
