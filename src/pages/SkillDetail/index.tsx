import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, FileText, FolderOpen, Globe, Loader2, Pencil, Calendar, History, Bot, User, Play, Share2, Check, ShieldCheck } from "lucide-react";
import { useSkillStore } from "@/store/skillStore";
import { useTranslation } from "@/i18n";
import CategoryBadge from "@/components/CategoryBadge";
import RiskBadge from "@/components/RiskBadge";
import FavoriteButton from "@/components/FavoriteButton";
import SkillIcon from "@/components/SkillIcon";
import SkillEditor from "@/components/SkillEditor";
import TagBadge from "@/components/TagBadge";
import TagManager from "@/components/TagManager";
import ExecutionPanel from "@/components/ExecutionPanel";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { Components } from "react-markdown";
import { IS_TAURI } from "@/lib/runtime";

export default function SkillDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [showTagManager, setShowTagManager] = useState(false);
  const [showExecutionPanel, setShowExecutionPanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const {
    selectedSkill: skill,
    isLoading,
    error,
    fetchSkillById,
    openEditDialog,
    editSkill,
    editDialogOpen,
    closeEditDialog,
    skillContent,
    contentLoading,
    contentError,
    fetchSkillContent,
    deleteTag,
    addRecentView,
    allTags,
    skillTags,
    fetchAllTags,
    fetchSkillTags,
    assignTag,
    removeTag,
    createTag,
    categorizationHistory,
    fetchCategorizationHistory,
    prepareExecution,
    resetExecution,
  } = useSkillStore();

  useEffect(() => {
    if (id) {
      fetchSkillById(id);
      fetchSkillContent(id);
      fetchSkillTags(id);
    }
  }, [id, fetchSkillById, fetchSkillContent, fetchSkillTags]);

  useEffect(() => {
    if (id) fetchCategorizationHistory(id);
  }, [id, fetchCategorizationHistory]);

  useEffect(() => {
    if (skill?.id) {
      addRecentView(skill.id);
    }
  }, [skill?.id, addRecentView]);

  if (isLoading) { return ( <div className="flex flex-col gap-6"> <StickyBackLink label={t("skillDetail.back")} /> <div className="flex items-center justify-center py-24"> <Loader2 className="h-6 w-6 animate-spin text-[--color-muted-foreground]" /> </div> </div> ); }
  if (error) { return ( <div className="flex flex-col gap-6"> <StickyBackLink label={t("skillDetail.back")} /> <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"> {error} </div> </div> ); }
  if (!skill) { return ( <div className="flex flex-col gap-6"> <StickyBackLink label={t("skillDetail.back")} /> <div className="flex items-center justify-center py-12 text-sm text-[--color-muted-foreground]"> {t("skillDetail.notFound")} </div> </div> ); }

  const sourceLabel = skill.source === "agentic-awesome" ? t("skillDetail.agenticAwesome") : t("skillDetail.codexSystem");
  const handleCategoryClick = () => { if (skill.category) { navigate("/skills?category=" + encodeURIComponent(skill.category)); } };
  const handleRiskClick = () => { if (skill.risk) { navigate("/skills?risk=" + encodeURIComponent(skill.risk)); } };
  const handleExecute = () => {
    resetExecution();
    setShowExecutionPanel(true);
    void prepareExecution(skill.id);
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      try {
        const input = document.createElement("input");
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
        setCopied(true);
      } catch {
        // Clipboard unavailable; the URL remains in the address bar.
      }
    }
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6">
      <StickyBackLink label={t("skillDetail.back")} />
      <div className="rounded-lg border border-[--color-border] bg-[--color-card] p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <SkillIcon icon={skill.icon} size="lg" />
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-semibold">{skill.name}</h1>
                  <FavoriteButton skillId={skill.id} favorite={skill.favorite} size="md" />
                  {IS_TAURI && (
                    <button onClick={() => openEditDialog(skill)} className="rounded-md p-1.5 text-[--color-muted-foreground] transition-colors hover:text-[--color-foreground] hover:bg-[--color-accent]" title={t("skillList.edit")}><Pencil className="h-4 w-4" /></button>
                  )}
                  {IS_TAURI && (
                    <button onClick={handleExecute} className="rounded-md p-1.5 text-[--color-muted-foreground] transition-colors hover:text-[--color-foreground] hover:bg-[--color-accent]" title={t("skillDetail.execute")}><Play className="h-4 w-4" /></button>
                  )}
                  {!IS_TAURI && (
                    <button onClick={handleShare} className="inline-flex items-center gap-1.5 rounded-md p-1.5 text-[--color-muted-foreground] transition-colors hover:text-[--color-foreground] hover:bg-[--color-accent]" title={t("web.share")}>
                      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Share2 className="h-4 w-4" />}
                    </button>
                  )}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[--color-muted-foreground]">{skill.description || t("skillDetail.noDescription")}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <CategoryBadge category={skill.category} onClick={handleCategoryClick} />
          <RiskBadge risk={skill.risk} onClick={handleRiskClick} />
        </div>
      </div>

      {!IS_TAURI && (
        <div className="rounded-lg border border-[--color-border] bg-[--color-card] p-4">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[--color-muted-foreground]">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t("web.safetyNote")}
          </h3>
          <p className="text-xs leading-relaxed text-[--color-muted-foreground]">{t("web.readOnly")}</p>
        </div>
      )}

      {IS_TAURI && (
      <div className="rounded-lg border border-[--color-border] bg-[--color-card] p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-medium text-[--color-muted-foreground] uppercase tracking-wider">{t("skillDetail.tags")}</h3>
          <button onClick={() => { fetchAllTags(); setShowTagManager(true); }} className="text-xs text-[--color-primary] hover:underline">+ {t("tagManager.edit")}</button>
        </div>
        {skillTags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {skillTags.map(tag => (<TagBadge key={tag.id} name={tag.name} color={tag.color} />))}
          </div>
        ) : (
          <p className="text-xs text-[--color-muted-foreground]">{t("tagManager.noTags")}</p>
        )}
      </div>
      )}

      {categorizationHistory.length > 0 && (
        <div className="rounded-lg border border-[--color-border] bg-[--color-card] p-4">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[--color-muted-foreground]">
            <History className="h-3.5 w-3.5" />
            {t("skillDetail.categoryHistory")}
          </h3>
          <div className="space-y-2">
            {categorizationHistory.slice(0, 5).map((entry, i) => (
              <div key={entry.id} className={`flex items-center gap-3 rounded-md px-3 py-2 text-xs ${i === 0 ? "bg-[--color-primary]/10 text-[--color-primary]" : i === 1 ? "bg-[--color-muted]/30" : ""}`}>
                {entry.model === "manual" ? (
                  <User className="h-3.5 w-3.5 text-[--color-muted-foreground]" />
                ) : (
                  <Bot className="h-3.5 w-3.5 text-[--color-muted-foreground]" />
                )}
                <span className="flex-1">
                  <span className="font-medium">[{entry.category}]</span>
                  {entry.reason && <span className="ml-1 text-[--color-muted-foreground]">{entry.reason}</span>}
                </span>
                <span className="text-[--color-muted-foreground]">
                  {entry.created_at.substring(5, 16).replace("T", " ")}
                </span>
                {i === 0 && (
                  <span className="rounded bg-[--color-primary]/20 px-1.5 py-0.5 text-[10px] font-medium text-[--color-primary]">
                    {t("skillDetail.currentCategory")}
                  </span>
                )}
                {i === 1 && (
                  <span className="rounded bg-[--color-muted]/40 px-1.5 py-0.5 text-[10px] text-[--color-muted-foreground]">
                    {t("skillDetail.oldCategory")}
                  </span>
                )}
              </div>
            ))}
            {categorizationHistory.length > 5 && (
              <p className="text-center text-[10px] text-[--color-muted-foreground]">
                +{categorizationHistory.length - 5} {t("skillDetail.moreHistory")}
              </p>
            )}
          </div>
        </div>
      )}

      {IS_TAURI && (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InfoCard icon={FolderOpen} label={t("skillDetail.source")} value={sourceLabel} />
        <InfoCard icon={Globe} label={t("skillDetail.sourceScope")} value={t("skillDetail.configuredDirectory")} />
      </div>
      )}

      <div className="rounded-lg border border-[--color-border] bg-[--color-card] p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-[--color-muted-foreground]"><Calendar className="h-3 w-3" />{t("skillDetail.dateAdded")}</h2>
            <p className="text-sm">{skill.date_added || "\u2014"}</p>
          </div>
          <div>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-[--color-muted-foreground]">{t("skillDetail.skillId")}</h2>
            <code className="inline-block rounded bg-[--color-muted] px-2 py-1 text-xs text-[--color-muted-foreground]">{skill.id}</code>
            <p className="mt-1 text-xs text-[--color-muted-foreground]">{t("skillDetail.idExplanation")}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[--color-border] bg-[--color-card] p-6">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-[--color-muted-foreground]" />
          <h2 className="text-xs font-medium uppercase tracking-wider text-[--color-muted-foreground]">{t("skillDetail.markdown")}</h2>
        </div>
        {contentLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[--color-muted-foreground]" /></div>
        ) : contentError ? (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{t("skillDetail.loadError")}</div>
        ) : skillContent && skillContent.content.length > 0 ? (
          <MarkdownRenderer content={skillContent.content} />
        ) : (
          <p className="text-xs text-[--color-muted-foreground]">{t("skillDetail.markdownEmpty")}</p>
        )}
      </div>

      {IS_TAURI && editSkill?.id === skill.id && (<SkillEditor skill={editSkill} open={editDialogOpen} onClose={closeEditDialog} />)}
      {IS_TAURI && showTagManager && id && (
        <TagManager
          skillId={id}
          skillTags={skillTags}
          allTags={allTags}
          onAssign={async (tagId) => { await assignTag({ skill_id: id, tag_id: tagId }); }}
          onRemove={async (tagId) => { await removeTag({ skill_id: id, tag_id: tagId }); }}
          onCreateTag={async (name, color) => { await createTag(name, color); }}
          onDeleteTag={async (tagId) => { await deleteTag(tagId); }}
          onClose={() => setShowTagManager(false)}
        />
      )}
      {IS_TAURI && showExecutionPanel && (
        <ExecutionPanel skillId={skill.id} onClose={() => setShowExecutionPanel(false)} />
      )}
    </div>
  );
}

function StickyBackLink({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-20 bg-[--color-background] py-3">
      <Link to="/skills" className="flex w-fit items-center gap-2 text-sm text-[--color-muted-foreground] transition-colors hover:text-[--color-foreground]">
        <ArrowLeft className="h-4 w-4" />{label}
      </Link>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[--color-border] bg-[--color-card] p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[--color-primary]/10"><Icon className="h-4 w-4 text-[--color-primary]" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[--color-muted-foreground]">{label}</p>
          <p className="truncate text-sm font-medium">{value}</p>
        </div>
      </div>
    </div>
  );
}

function MarkdownRenderer({ content }: { content: string }) {
  const components: Components = {
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || "");
      const codeString = String(children).replace(/\n$/, "");
      if (match) {
        return (<SyntaxHighlighter style={oneDark} language={match[1]} PreTag="div" customStyle={{ margin: 0, borderRadius: "0.375rem", fontSize: "0.8rem" }}>{codeString}</SyntaxHighlighter>);
      }
      return (<code className="rounded bg-[--color-muted] px-1.5 py-0.5 text-xs text-[--color-muted-foreground]" {...props}>{children}</code>);
    },
  };
  return (
    <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed text-[--color-foreground] [&_a]:text-[--color-primary] [&_a]:underline [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-medium [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li>ul]:mt-0 [&_li>ol]:mt-0 [&_blockquote]:border-l-2 [&_blockquote]:border-[--color-primary]/40 [&_blockquote]:pl-4 [&_blockquote]:text-[--color-muted-foreground] [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-[--color-border] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_td]:border [&_td]:border-[--color-border] [&_td]:px-3 [&_td]:py-2 [&_td]:text-sm [&_pre]:my-3 [&_hr]:border-[--color-border] [&_p]:my-2">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{content}</ReactMarkdown>
    </div>
  );
}
