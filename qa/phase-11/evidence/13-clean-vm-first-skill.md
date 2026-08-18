# Clean VM first-use evidence

## Operation

1. Created a linked VirtualBox clone from the clean Windows 10 base snapshot.
2. Installed the latest QA build from the isolated `Phase11Share` folder.
3. Selected a real Skill folder containing `SKILL.md` through the Desktop UI.
4. Clicked `Scan Now`.

## Result

The real Desktop run displayed `1 Skills found`, with Total Skills = 1 and the
skill visible in the dashboard. The screenshot contains no API key, username,
or full internal path.

Evidence: `13-clean-vm-first-skill.png`.

## Timing

The user confirmed immediately after the run that the complete first-use flow
took less than one minute, including selecting the directory, scanning, and
seeing the first real Skill. This is below the required five-minute threshold.
