import { NavLink } from "react-router-dom";
import { Home, Layers, Settings, AlertCircle, BookOpen } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "@/i18n";
import { useSkillStore } from "@/store/skillStore";

const navItems = [
  { to: "/", labelKey: "nav.dashboard", icon: Home },
  { to: "/skills", labelKey: "nav.skills", icon: Layers },
  { to: "/settings", labelKey: "nav.settings", icon: Settings },
  { to: "/error-log", labelKey: "nav.errorLog", icon: AlertCircle },
];

function Sidebar() {
  const { t } = useTranslation();
  const { conflictCount, fetchConflictCount } = useSkillStore();

  useEffect(() => { fetchConflictCount(); }, [fetchConflictCount]);

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-56 border-r border-[--color-border] bg-[--color-background]">
      <div className="flex h-14 items-center gap-2 px-4 border-b border-[--color-border]">
        <BookOpen className="h-5 w-5 text-[--color-primary]" />
        <span className="font-semibold text-sm tracking-tight">{t("app.name")}</span>
      </div>
      <nav className="flex flex-col gap-1 p-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${conflictCount > 0 && item.to === "/" ? "animate-pulse-red " : ""}${
                isActive
                  ? "bg-[--color-primary] text-[--color-primary-foreground]"
                  : "text-[--color-muted-foreground] hover:bg-[--color-accent] hover:text-[--color-accent-foreground]"
              }`
            }
          >
            <item.icon className="h-4 w-4" />
            {t(item.labelKey)}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[--color-background]">
      <Sidebar />
      <main className="ml-56 p-6">{children}</main>
    </div>
  );
}
