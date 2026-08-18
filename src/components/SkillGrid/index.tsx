import SkillCard from "@/components/SkillCard";
import type { Skill, ViewMode } from "@/store/skillStore";

interface SkillGridProps {
  skills: Skill[];
  viewMode: ViewMode;
}

/**
 * Simple, non-virtualised grid for the Web build: exactly 4 columns with a
 * fixed, uniform gap (virtualisation is unnecessary for the small catalogue
 * and produced uneven row spacing).
 */
export default function SkillGrid({ skills, viewMode }: SkillGridProps) {
  if (viewMode === "list") {
    return (
      <div className="flex flex-col gap-3">
        {skills.map((skill) => (<SkillCard key={skill.id} skill={skill} />))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-4 gap-4">
      {skills.map((skill) => (<SkillCard key={skill.id} skill={skill} />))}
    </div>
  );
}
