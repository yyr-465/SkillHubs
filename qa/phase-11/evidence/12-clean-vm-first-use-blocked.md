# Clean Windows VM first-use timing

Date: 2026-08-05 (Asia/Shanghai)

## Result

**BLOCKED**. The current host has no accessible Hyper-V VM, VirtualBox, VMware,
or enabled Windows Sandbox. Querying the Windows Sandbox optional feature
requires elevation. A process-scoped temporary `USERPROFILE` is not equivalent
to a clean Windows VM because it shares the host registry, OS account, WebView
runtime, installed software, and trust state.

## Required external condition

Run the signed or release-candidate Windows x64 installer in a genuinely new
Windows VM or new Windows user profile with no prior SkillHub data, then record
the time from first launch until the first real Skill is visible. The target is
no more than five minutes.

## Required evidence sequence

1. Record VM Windows version and SkillHub build/commit.
2. Start a stopwatch immediately before first launch.
3. Launch SkillHub and choose a directory containing a valid `SKILL.md`.
4. Read the scan-scope explanation and click Scan Now.
5. Stop the stopwatch when the first real Skill is visible.
6. Save sanitized screenshots of first launch, directory selection, scan result,
   and first Skill; do not include usernames, absolute paths, credentials, or
   database locations.

