import SkillCard from "@/components/SkillCard";
import type { Skill, ViewMode } from "@/store/skillStore";

interface SkillGridProps {
  skills: Skill[];
  viewMode: ViewMode;
}

/**
 * Simple, non-virtualised grid for the Web build with responsive columns and
 * a uniform gap (virtualisation is unnecessary for the small catalogue).
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {skills.map((skill) => (<SkillCard key={skill.id} skill={skill} />))}
    </div>
  );
}
