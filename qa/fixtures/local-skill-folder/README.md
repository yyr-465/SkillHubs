# Local Skill Folder acceptance fixture

Select this directory with SkillHub Web's **Load local Skill folder** action.

- Five valid Skills appear in the temporary local Catalog.
- `api-review/SKILL.md` deliberately uses the same display name as the default Catalog's API Design Review Skill, with different README content.
- `shared/SKILL.md` and `deep/shared/SKILL.md` deliberately have the same display name and different README content.
- `invalid/SKILL.md` has no valid front matter and should be skipped.
- All files are inert Markdown examples. They contain no credentials and declare no executable commands.

The fixture is outside `web-catalog/skills/` and must not be added to the public Catalog.
