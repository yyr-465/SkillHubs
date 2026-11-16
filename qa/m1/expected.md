# M1 independent fixture expectations

Frozen on 2026-11-16 before any production scan or Web result. Installation numbers below are fixture ordinals and are unrelated to generated manifest IDs.

| Logical source | Physical fixture location | Status | Installations visible from this source |
| --- | --- | --- | ---: |
| Shared user | profile/.agents/skills | scanned | 50 (001–050) |
| Codex user | profile/.codex/skills | scanned | 40 (051–090) |
| Claude Code user | profile/.claude/skills | partial | 35 (091–125) |
| Cursor user | profile/.cursor/skills | partial | 30 (126–155) |
| Shared project | project/.agents/skills | scanned | 20 (156–175) |
| Claude Code project | project/.claude/skills | missing | 0 |
| Cursor project | project/.cursor/skills (ordinary file) | unreadable | 0 |
| Custom | extra-skills | scanned | 25 (176–200) |
| Custom | profile/.agents/skills | scanned | 50 (001–050, same physical root as Shared user) |
| Custom | profile/.agents/skills/overlap | scanned | 10 (001–010, nested root) |

- **200 installation locations** from 50 + 40 + 35 + 30 + 20 + 25 unique files. The two overlapping Custom roots add 60 locators, for **260 total locators**. Installation 001 has two `overlap/skill-001/SKILL.md` locators in distinct logical roots and one `skill-001/SKILL.md` locator under the nested Custom root.
- **198 distinct file contents**. Three files (001, 051, 091) have byte-for-byte matching contents. Each remaining file has distinct bytes.
- **8 scanned sources** out of ten logical roots. Six are scanned, two are partial, one is missing, and one is unreadable.
- **One identical-file candidate:** 001, 051, 091. Member paths in their tool roots are `overlap/skill-001/SKILL.md`, `skill-051/SKILL.md`, and `skill-091/SKILL.md` respectively. Show the common digest and all source locators.
- **Two description candidates:** 001, 051, 091, 126 (fullwidth/mixed-case normalized description with a folded scalar, CRLF and BOM on 126), and 156, 176 (Chinese, folded versus literal YAML). The first group has two file digests and the second group has two. The matching Chinese description is `自动化整理归档项目文档并生成可靠的校验报告 同时保留每项变更的记录以便复核` after collapsing whitespace.
- Installations 011 and 177 share a name, and 012 and 178 share a short description. Neither pair appears as a candidate. Installation 125 preserves `skill-125/skill.MD`. Installation 199 contains URL-shaped metadata that must stay inert in Web.
- Claude Code user has one malformed front matter neighbor and one file larger than 1 MiB. Cursor user has one invalid UTF-8 neighbor. The missing project root and ordinary-file project root each have a root-level diagnostic. The expected total is five diagnostics, with zero omitted. Invalid nested package resources and ignored grouping names produce zero additional diagnostics.
- Include all fixture `SKILL.md`-spelled files in the 2 MiB budget, even deliberately invalid neighbors and files under ignored directories. Compare every source file path and content hash before and after scanning and export failures.
