# Safe execution model

SkillHub can run skills, but by design it is **not** a general-purpose
terminal or sandbox. This page explains the exact safety boundary so you know
what a skill can and cannot do on your machine.

## Core rules

1. **Commands are never inferred from Markdown.** Code blocks in a skill's
   `SKILL.md` are documentation only. A command runs only if the skill
   declares an explicit `execution` section in its YAML front matter.
2. **Explicit confirmation is required.** Even with a declaration, you must
   review a preview and confirm before anything starts.
3. **Narrow allowlist, no shell.** Only a small set of executables
   (`echo`, `python`, `python3`, `node`) is accepted, shell
   metacharacters are rejected, and the command is started **without** a shell.
4. **Validated parameters.** The declaration is validated for the command,
   string arguments, a relative non-traversing working directory, and a
   timeout between 1 and 3600 seconds.
5. **Bounded output.** Captured output is capped at 16 KiB with typed
   truncation flags, so a noisy command cannot flood the UI or the audit log.
6. **Timeout and cleanup.** Every run has a timeout; when a run ends — success,
   failure, timeout, cancellation, or application exit — the whole Windows
   process tree is terminated through a Job Object, so no helper processes
   are left behind.
7. **Audit trail.** Each terminal execution writes one sanitized row to the
   local execution audit: fixed safe text, no command arguments, environment,
   or paths are persisted.

## What is NOT supported

- Running arbitrary commands or scripts beyond the allowlist.
- Shell features such as pipes, redirection, `&&`, or environment variables.
- Skills that only contain Markdown code blocks without an explicit
  `execution` declaration — they simply have no Run action.
- General-purpose sandboxing or privilege isolation. SkillHub narrows *what*
  can run, but the allowed executables run with your user privileges.

## Preflight checks

Before a run starts, SkillHub checks that each required executable can be
found. If one is missing, you see an actionable bilingual message telling you
to install it or add it to `PATH` — the failure happens **before** spawn,
not after.

## Version compatibility note

Executions declared with the deprecated `execute_skill` command are not the
supported path; use the confirmation-based `start_skill_execution` flow
described above.

## What this means in practice

- Use SkillHub for skills you have reviewed: document processing, data
  transformation, code generation helpers, and similar narrow tasks.
- Treat every skill as untrusted input until you have read its declaration.
- The execution preview is your checkpoint — read the command before
  confirming.
