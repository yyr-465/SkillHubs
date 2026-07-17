import { useEffect, useRef, useState } from "react";
import { Search, Clock, Trash2 } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useSkillStore } from "@/store/skillStore";
import type { Skill } from "@/store/skillStore";
import { useNavigate } from "react-router-dom";

export default function SearchBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    skillQuery,
    setFilter,
    fetchSuggestions,
    searchSuggestions,
    searchHistory,
    fetchSearchHistory,
    addSearchHistory,
    clearSearchHistory,
    querySkills,
    pageSize,
  } = useSkillStore();

  const [inputValue, setInputValue] = useState(skillQuery.search ?? "");
  const [showDropdown, setShowDropdown] = useState(false);
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(skillQuery.search ?? "");
  }, [skillQuery.search]);

  useEffect(() => {
    fetchSearchHistory();
  }, [fetchSearchHistory]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (value: string) => {
    setInputValue(value);
    setShowDropdown(true);
    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = setTimeout(() => {
      fetchSuggestions(value);
    }, 200);
    setDebounceTimer(timer);
    setFilter({ search: value || undefined });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setShowDropdown(false);
      const val = inputValue.trim();
      if (val) {
        addSearchHistory(val);
      }
      querySkills({
        ...skillQuery,
        search: val || undefined,
        offset: 0,
        limit: pageSize,
      });
    }
    if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  const handleFocus = () => {
    setShowDropdown(true);
    fetchSuggestions(inputValue);
  };

  const handleSuggestionClick = (skill: Skill) => {
    setShowDropdown(false);
    setInputValue(skill.name);
    setFilter({ search: skill.name });
    addSearchHistory(skill.name);
    navigate("/skills/" + skill.id);
  };

  const handleHistoryClick = (query: string) => {
    setInputValue(query);
    setFilter({ search: query });
    addSearchHistory(query);
    setShowDropdown(false);
    querySkills({
      ...skillQuery,
      search: query,
      offset: 0,
      limit: pageSize,
    });
  };

  const handleClearHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearSearchHistory();
  };

  const hasSuggestions = searchSuggestions.length > 0;
  const hasHistory = searchHistory.length > 0;
  const showBoth = hasSuggestions && hasHistory;

  return (
    <div ref={wrapperRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[--color-muted-foreground]" />
      <input
        type="text"
        value={inputValue}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        placeholder={t("skillList.searchPlaceholder")}
        className="w-64 rounded-md border border-[--color-border] bg-[--color-card] py-2 pl-9 pr-3 text-sm text-[--color-foreground] outline-none transition-colors placeholder:text-[--color-muted-foreground] focus:border-[--color-primary]"
      />

      {showDropdown && (hasSuggestions || hasHistory) && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-xl border border-gray-200/80 bg-white/90 p-1 shadow-xl backdrop-blur-xl dark:border-gray-700/60 dark:bg-gray-900/90"
          style={{ backdropFilter: "blur(15px)" }}
        >
          {hasSuggestions && (
            <div className="px-2 pb-1 pt-1.5">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[--color-muted-foreground]">
                {t("searchBar.suggestions")}
              </p>
              <div className="space-y-0.5">
                {searchSuggestions.slice(0, 6).map((skill) => (
                  <button
                    key={skill.id}
                    onClick={() => handleSuggestionClick(skill)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[--color-foreground] transition-colors hover:bg-[--color-accent]"
                  >
                    <Search className="h-3 w-3 shrink-0 text-[--color-muted-foreground]" />
                    <span className="truncate">{skill.name}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-[--color-muted-foreground]">
                      {skill.category || ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {showBoth && (
            <div className="mx-2 border-t border-[--color-border]/40" />
          )}

          {hasHistory && (
            <div className="px-2 pb-1 pt-1.5">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[--color-muted-foreground]">
                  {t("searchBar.history")}
                </p>
                <button
                  onClick={handleClearHistory}
                  className="flex items-center gap-1 text-[10px] text-[--color-muted-foreground] transition-colors hover:text-red-400"
                >
                  <Trash2 className="h-3 w-3" />
                  {t("searchBar.clearHistory")}
                </button>
              </div>
              <div className="space-y-0.5">
                {searchHistory.slice(0, 5).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleHistoryClick(item.query)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[--color-foreground] transition-colors hover:bg-[--color-accent]"
                  >
                    <Clock className="h-3 w-3 shrink-0 text-[--color-muted-foreground]" />
                    <span className="truncate">{item.query}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-[--color-muted-foreground]">
                      {item.created_at}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
