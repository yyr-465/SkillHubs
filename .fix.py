import re

# ===== TagManager =====
f = r"D:\ChatGPT\Codex\skillhubs\SkillHub\src\components\TagManager\index.tsx"
lines = open(f, encoding="utf-8").readlines()
out = []
for l in lines:
    out.append(l)
    if 'import TagBadge' in l and 'Trash2' not in str(out):
        out.append('import { Trash2 } from "lucide-react";\n')
    if 'onCreateTag: (name: string, color: string) => void;' in l:
        out.append('  onDeleteTag: (tagId: number) => void;\n')
out2 = []
for l in out:
    out2.append(l)
    if l.strip() == 'onCreateTag,' and not any('onDeleteTag' in x for x in out2):
        out2.append('  onDeleteTag,\n')
# Replace the TagBadge in the available section with wrapped version + delete button
content = "".join(out2)
old_block = '{unassignedTags.map((tag) => (\n                <TagBadge\n                  key={tag.id}\n                  name={tag.name}\n                  color={tag.color}\n                  size="sm"\n                  onClick={async () => {\n                    setAssignError(null);\n                    try {\n                      await onAssign(tag.id);\n                    } catch (e) {\n                      setAssignError(String(e));\n                    }\n                  }}\n                />\n              ))}'
new_block = '{unassignedTags.map((tag) => (\n                <span key={tag.id} className="inline-flex items-center gap-0.5 group">\n                  <TagBadge\n                    name={tag.name}\n                    color={tag.color}\n                    size="sm"\n                    onClick={async () => {\n                      setAssignError(null);\n                      try {\n                        await onAssign(tag.id);\n                      } catch (e) {\n                        setAssignError(String(e));\n                      }\n                    }}\n                  />\n                  <button\n                    onClick={(e) => { e.stopPropagation(); onDeleteTag(tag.id); }}\n                    className="flex h-4 w-4 items-center justify-center rounded-full text-[--color-muted-foreground] opacity-0 transition-opacity hover:text-red-400 hover:bg-red-500/10 group-hover:opacity-100"\n                    title="Delete tag"\n                  >\n                    <Trash2 className="h-3 w-3" />\n                  </button>\n                </span>\n              ))}'
if old_block in content:
    content = content.replace(old_block, new_block)
    print("TagManager: replaced TagBadge")
else:
    print("TagManager: old_block NOT FOUND, checking...")
    idx = content.find('unassignedTags.map')
    if idx >= 0:
        print(f"  Found at pos {idx}, showing context:")
        print(repr(content[idx:idx+400]))
    else:
        print("  unassignedTags.map NOT FOUND in file")

with open(f, "w", encoding="utf-8") as fp:
    fp.write(content)
print("TagManager done")

# ===== SkillDetail =====
f2 = r"D:\ChatGPT\Codex\skillhubs\SkillHub\src\pages\SkillDetail\index.tsx"
content2 = open(f2, encoding="utf-8").read()
# Remove duplicate onDeleteTag (keep only the first one)
count = content2.count('onDeleteTag=')
if count > 1:
    # Find all occurrences and keep only the first
    parts = content2.split('onDeleteTag=')
    content2 = parts[0] + 'onDeleteTag=' + ''.join(parts[1:]).replace('onDeleteTag=', '', count - 2)
    print(f"SkillDetail: deduplicated {count} onDeleteTag occurrences")
elif count == 0:
    # Add it
    content2 = content2.replace(
        'onClose={() => setShowTagManager(false)}',
        'onDeleteTag={async (tagId) => { await deleteTag(tagId); }}\n          onClose={() => setShowTagManager(false)}'
    )
    print("SkillDetail: added onDeleteTag")

with open(f2, "w", encoding="utf-8") as fp:
    fp.write(content2)
print("SkillDetail done")
print("ALL DONE")
