import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

// -- Type definitions mirroring the Rust backend --

export interface SkillContent {
  id: string;
  name: string;
  content: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: string | null;
  risk: string | null;
  date_added: string | null;
  source_path: string;
  source: string;
  favorite: boolean | null;
  icon?: string | null;
}

export interface SkillPage {
  skills: Skill[];
  total_count: number;
}

export interface ScanResult {
  skills: Skill[];
  errors: string[];
}

export interface Stats {
  total_count: number;
  categorized_count: number;
  uncategorized_count: number;
  category_counts: { category: string; count: number }[];
  risk_counts: { risk: string; count: number }[];
}

export interface SkillQuery {
  search?: string;
  category?: string;
  risk?: string;
  source?: string;
  sort_field?: "Name" | "DateAdded" | "Category" | "Risk" | "Source";
  sort_direction?: "Asc" | "Desc";
  offset?: number;
  limit?: number;
  favorite_only?: boolean;
  tag_ids?: number[];
}

export interface FilterOptionWithCount {
  value: string;
  count: number;
}

export interface FilterOptions {
  categories: FilterOptionWithCount[];
  risks: FilterOptionWithCount[];
  sources: FilterOptionWithCount[];
}

export interface UpdateSkillRequest {
  id: string;
  name?: string;
  description?: string;
  category?: string;
  risk?: string;
}

export interface BatchCategorizeRequest {
  skill_ids: string[];
  category?: string;
  risk?: string;
}

export interface ImportResult {
  success_count: number;
  errors: string[];
}

export interface SearchHistoryItem {
  id: number;
  query: string;
  created_at: string;
}

export interface RecentView extends Skill {}
// -- Phase 8.2: Tag types --
export interface Tag {
  id: number;
  name: string;
  color: string;
  created_at: string;
  skill_count?: number;
}
export interface AssignTagRequest {
  skill_id: string;
  tag_id: number;
}

// Phase 8.3a: Export types
export interface ExportCsvRequest {
  skill_ids: string[];
  columns: string[];
}

export interface ExportReportRequest {
  skill_ids: string[];
}

// Phase 8.3b: Conflict types
export interface ConflictItem {
  skill_id: string;
  skill_name: string;
  old_category: string;
  old_reason: string | null;
  new_category: string;
  new_reason: string | null;
  categorized_at: string;
}

export interface CategorizationEntry {
  id: number;
  skill_id: string;
  category: string;
  model: string;
  reason: string | null;
  created_at: string;
}

export interface ResolveConflictsRequest {
  resolutions: Record<string, string>;
}

// -- View mode --

export type ViewMode = "grid" | "list";

const VIEW_MODE_KEY = "skillhub_view_mode";

function loadViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_KEY);
    if (stored === "grid" || stored === "list") return stored;
  } catch {}
  return "grid";
}

function saveViewMode(mode: ViewMode) {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {}
}

// -- Store type --

interface SkillStore {
  skills: Skill[];
  selectedSkill: Skill | null;
  stats: Stats | null;
  scanResult: ScanResult | null;
  isLoading: boolean;
  error: string | null;

  // Phase 6 additions
  skillContent: SkillContent | null;
  contentLoading: boolean;
  contentError: string | null;

  // Phase 3 additions
  filterOptions: FilterOptions;
  skillQuery: SkillQuery;
  viewMode: ViewMode;

  // Phase 4 additions
  totalCount: number;
  pageSize: number;
  currentPage: number;

  // Phase 5 additions
  selectionMode: boolean;
  selectedIds: Set<string>;
  editSkill: Skill | null;
  editDialogOpen: boolean;

  // Phase 8 additions
  recentViews: Skill[];
  searchHistory: SearchHistoryItem[];
  searchSuggestions: Skill[];
  // Phase 8.2 additions
  allTags: Tag[];
  skillTags: Tag[];

  // Phase 8.3b: Conflict states
  conflictCount: number;
  conflicts: ConflictItem[];
  categorizationHistory: CategorizationEntry[];

  fetchSkills: () => Promise<void>;
  fetchSkillById: (id: string) => Promise<void>;
  fetchSkillContent: (id: string) => Promise<void>;
  searchSkills: (query: string) => Promise<void>;
  scanSkills: () => Promise<void>;
  fetchStats: () => Promise<void>;

  // Phase 3 actions
  fetchFilters: () => Promise<void>;
  querySkills: (query: SkillQuery) => Promise<void>;
  setViewMode: (mode: ViewMode) => void;
  setFilter: (partial: Partial<SkillQuery>) => void;
  clearFilters: () => void;

  // Phase 4 actions
  toggleFavorite: (skillId: string, favorite: boolean) => Promise<void>;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;

  // Phase 5 actions
  updateSkill: (request: UpdateSkillRequest) => Promise<void>;
  batchCategorize: (request: BatchCategorizeRequest) => Promise<void>;
  exportSkillsToJson: (skillIds: string[]) => Promise<string>;
  getAllMatchingIds: (query?: SkillQuery) => Promise<string[]>;
  exportCsv: (ids: string[], columns: string[]) => Promise<string>;
  exportReport: (ids: string[]) => Promise<string>;
  importSkillsFromJson: (jsonStr: string) => Promise<ImportResult>;
  toggleSelectionMode: () => void;
  toggleSelection: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  openEditDialog: (skill: Skill) => void;
  closeEditDialog: () => void;


  fetchRecentViews: () => Promise<void>;
  addRecentView: (skillId: string) => Promise<void>;
  fetchSearchHistory: () => Promise<void>;
  addSearchHistory: (query: string) => Promise<void>;
  clearSearchHistory: () => Promise<void>;
  fetchSuggestions: (query: string) => Promise<void>;
  // Phase 8.2 actions
  fetchAllTags: () => Promise<void>;
  createTag: (name: string, color?: string) => Promise<void>;
  deleteTag: (tagId: number) => Promise<void>;
  assignTag: (request: AssignTagRequest) => Promise<void>;
  removeTag: (request: AssignTagRequest) => Promise<void>;
  fetchSkillTags: (skillId: string) => Promise<void>;

  // Phase 8.3b: Conflict actions
  fetchConflictCount: () => Promise<void>;
  fetchConflicts: () => Promise<void>;
  resolveConflicts: (resolutions: Record<string, string>) => Promise<void>;
  resolveConflict: (skillId: string, category: string) => Promise<void>;
  fetchCategorizationHistory: (skillId: string) => Promise<void>;

  clearError: () => void;
}

// -- Default stats (pre-scan state) --

const EMPTY_STATS: Stats = {
  total_count: 0,
  categorized_count: 0,
  uncategorized_count: 0,
  category_counts: [],
  risk_counts: [],
};

const EMPTY_FILTERS: FilterOptions = {
  categories: [],
  risks: [],
  sources: [],
};

// -- Store implementation --

export const useSkillStore = create<SkillStore>((set, get) => ({
  skills: [],
  selectedSkill: null,
  stats: null,
  scanResult: null,
  isLoading: false,
  error: null,

  skillContent: null,
  contentLoading: false,
  contentError: null,

  filterOptions: EMPTY_FILTERS,
  skillQuery: {},
  viewMode: loadViewMode(),

  totalCount: 0,
  pageSize: 50,
  currentPage: 1,

  selectionMode: false,
  selectedIds: new Set<string>(),
  editSkill: null,
  editDialogOpen: false,

  recentViews: [],
  searchHistory: [],
  searchSuggestions: [],
  allTags: [],
  skillTags: [],

  conflictCount: 0,
  conflicts: [],
  categorizationHistory: [],

  fetchSkills: async () => {
    set({ isLoading: true, error: null });
    try {
      const skills = await invoke<Skill[]>("get_all_skills");
      set({ skills, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  fetchSkillById: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const skill = await invoke<Skill | null>("get_skill_by_id", { id });
      set({ selectedSkill: skill, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  fetchSkillContent: async (id: string) => {
    set({ contentLoading: true, contentError: null, skillContent: null });
    try {
      const content = await invoke<SkillContent | null>("get_skill_content", { id });
      set({ skillContent: content, contentLoading: false });
    } catch (e) {
      set({ contentError: String(e), contentLoading: false });
    }
  },

  searchSkills: async (query: string) => {
    set({ isLoading: true, error: null });
    try {
      const skills = await invoke<Skill[]>("search_skills", { query });
      set({ skills, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  scanSkills: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await invoke<ScanResult>("scan_skills");
      set({
        skills: result.skills,
        scanResult: result,
        isLoading: false,
      });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  fetchStats: async () => {
    set({ isLoading: true, error: null });
    try {
      const stats = await invoke<Stats>("get_stats");
      set({ stats, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  fetchFilters: async () => {
    try {
      const filterOptions = await invoke<FilterOptions>("get_filters");
      set({ filterOptions });
    } catch (e) {
      // Non-critical; don't show to user
    }
  },

  querySkills: async (query: SkillQuery) => {
    set({ isLoading: true, error: null });
    try {

      const page = await invoke<SkillPage>("query_skills", { query });
      set({ skills: page.skills, totalCount: page.total_count, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  setViewMode: (mode: ViewMode) => {
    saveViewMode(mode);
    set({ viewMode: mode });
  },

  setFilter: (partial: Partial<SkillQuery>) => {
    set((state) => ({
      skillQuery: { ...state.skillQuery, ...partial },
      currentPage: 1,
    }));
  },

  clearFilters: () => {
    set({ skillQuery: {}, currentPage: 1 });
  },

  toggleFavorite: async (skillId: string, favorite: boolean) => {
    set((state) => ({
      skills: state.skills.map((s) =>
        s.id === skillId ? { ...s, favorite } : s
      ),
      selectedSkill:
        state.selectedSkill?.id === skillId
          ? { ...state.selectedSkill, favorite }
          : state.selectedSkill,
    }));
    try {
      await invoke("toggle_favorite", {
        request: { skill_id: skillId, favorite },
      });
    } catch (e) {
      set((state) => ({
        skills: state.skills.map((s) =>
          s.id === skillId ? { ...s, favorite: !favorite } : s
        ),
        selectedSkill:
          state.selectedSkill?.id === skillId
            ? { ...state.selectedSkill, favorite: !favorite }
            : state.selectedSkill,
      }));
    }
  },

  setPage: (page: number) => {
    set({ currentPage: page });
  },

  setPageSize: (size: number) => {
    set({ pageSize: size, currentPage: 1 });
  },

  updateSkill: async (request: UpdateSkillRequest) => {
    try {
      await invoke("update_skill", { request });
      const state = get();
      if (state.selectedSkill?.id === request.id) {
        state.fetchSkillById(request.id);
      }
      state.querySkills({
        ...state.skillQuery,
        offset: (state.currentPage - 1) * state.pageSize,
        limit: state.pageSize,
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  batchCategorize: async (request: BatchCategorizeRequest) => {
    try {
      await invoke("batch_categorize", { request });
      const state = get();
      state.querySkills({
        ...state.skillQuery,
        offset: (state.currentPage - 1) * state.pageSize,
        limit: state.pageSize,
      });
      set({ selectedIds: new Set<string>() });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  exportSkillsToJson: async (skillIds: string[]) => {
    return await invoke<string>("export_skills", { skillIds });
  },

  getAllMatchingIds: async (query?: SkillQuery) => {
    const q = query ?? get().skillQuery;
    return await invoke<string[]>("get_skill_ids_by_query", { query: q });
  },

  exportCsv: async (ids: string[], columns: string[]) => {
    return await invoke<string>("export_skills_csv", {
      request: { skill_ids: ids, columns },
    });
  },

  exportReport: async (ids: string[]) => {
    return await invoke<string>("export_skills_report", {
      request: { skill_ids: ids },
    });
  },

  importSkillsFromJson: async (jsonStr: string) => {
    return await invoke<ImportResult>("import_skills", { jsonStr });
  },

  toggleSelectionMode: () => {
    set((state) => ({
      selectionMode: !state.selectionMode,
      selectedIds: new Set<string>(),
    }));
  },

  toggleSelection: (id: string) => {
    set((state) => {
      const newSet = new Set(state.selectedIds);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return { selectedIds: newSet };
    });
  },

  selectAll: () => {
    set((state) => ({
      selectedIds: new Set(state.skills.map((s) => s.id)),
    }));
  },

  clearSelection: () => {
    set({ selectedIds: new Set<string>() });
  },

  openEditDialog: (skill: Skill) => {
    set({ editSkill: skill, editDialogOpen: true });
  },

  closeEditDialog: () => {
    set({ editSkill: null, editDialogOpen: false });
  },

  fetchRecentViews: async () => {
    try {
      const views = await invoke<Skill[]>("get_recent_views", { limit: 6 });
      set({ recentViews: views });
    } catch (e) {
      // Non-critical
    }
  },

  addRecentView: async (skillId: string) => {
    try {
      await invoke("add_recent_view", { skillId });
    } catch (e) {
      // Non-critical
    }
  },

  fetchSearchHistory: async () => {
    try {
      const history = await invoke<SearchHistoryItem[]>("get_search_history", { limit: 10 });
      set({ searchHistory: history });
    } catch (e) {
      // Non-critical
    }
  },

  addSearchHistory: async (query: string) => {
    try {
      await invoke("add_search_history", { query });
    } catch (e) {
      // Non-critical
    }
  },

  clearSearchHistory: async () => {
    try {
      await invoke("clear_search_history");
      set({ searchHistory: [] });
    } catch (e) {
      // Non-critical
    }
  },

  fetchSuggestions: async (query: string) => {
    if (!query.trim()) {
      set({ searchSuggestions: [] });
      return;
    }
    try {
      const suggestions = await invoke<Skill[]>("search_suggestions", { query, limit: 8 });
      set({ searchSuggestions: suggestions });
    } catch (e) {
      // Non-critical
    }
  },
  // Phase 8.2: Tag actions
  fetchAllTags: async () => {
    try {
      const tags = await invoke<Tag[]>("get_all_tags");
      set({ allTags: tags });
    } catch (e) {
      // Non-critical
    }
  },

  createTag: async (name: string, color?: string) => {
    try {
      await invoke("create_tag", { name, color: color ?? "#6366f1" });
      const tags = await invoke<Tag[]>("get_all_tags");
      set({ allTags: tags });
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  deleteTag: async (tagId: number) => {
    try {
      await invoke("delete_tag", { tagId });
      const tags = await invoke<Tag[]>("get_all_tags");
      set({ allTags: tags });
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  assignTag: async (request: AssignTagRequest) => {
    try {
      await invoke("assign_tag", { request });
      const state = get();
      const tag = state.allTags.find(t => t.id === request.tag_id);
      if (tag && !state.skillTags.some(t => t.id === tag.id)) {
        set({ skillTags: [...state.skillTags, tag] });
      }
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  removeTag: async (request: AssignTagRequest) => {
    try {
      await invoke("remove_tag", { request });
      const tags = await invoke<Tag[]>("get_skill_tags", { skillId: request.skill_id });
      set({ skillTags: tags });
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  fetchSkillTags: async (skillId: string) => {
    try {
      const tags = await invoke<Tag[]>("get_skill_tags", { skillId });
      set({ skillTags: tags });
    } catch (e) {
      // Non-critical
    }
  },

  // Phase 8.3b: Conflict actions

  fetchConflictCount: async () => {
    try {
      const count = await invoke<number>("get_conflict_count");
      console.log("[Store] conflictCount =", count);
      set({ conflictCount: count });
    } catch (e) {
      console.error("[Store] fetchConflictCount failed:", e);
    }
  },

  fetchConflicts: async () => {
    try {
      const conflicts = await invoke<ConflictItem[]>("get_categorization_conflicts");
      set({ conflicts });
    } catch (e) {
      // Non-critical
    }
  },

  resolveConflicts: async (resolutions: Record<string, string>) => {
    try {
      await invoke("resolve_conflicts", { request: { resolutions } });
      const state = get();
      await state.fetchConflicts();
      await state.fetchConflictCount();
    } catch (e) {
      console.error("[Store] resolveConflict failed:", e);
      set({ error: String(e) });
      throw e;
    }
  },

  resolveConflict: async (skillId: string, category: string) => {
    await get().resolveConflicts({ [skillId]: category });
  },

  fetchCategorizationHistory: async (skillId: string) => {
    try {
      const history = await invoke<CategorizationEntry[]>("get_categorization_history", { skillId });
      set({ categorizationHistory: history });
    } catch (e) {
      // Non-critical
    }
  },

  clearError: () => set({ error: null }),
}));

export function useEmptyStats(): Stats {
  return EMPTY_STATS;
}
