import { useEffect, useReducer, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { Components } from "react-markdown";
import type { SkillContent } from "@/store/skillStore";
import { useTranslation } from "@/i18n";
import {
  createReadmeViewState,
  displayedReadme,
  originalReadme,
  readmeViewReducer,
} from "@/lib/readme";
import {
  grantLocalTranslationConsent,
  hasLocalTranslationConsent,
  needsLocalTranslationConsent,
  translateReadmeWithCache,
} from "@/lib/readmeTranslation";
import { ReadmeTranslationError } from "@/lib/readmeTranslationApi";

interface ReadmeViewerProps {
  content: SkillContent;
  translationEnabled?: boolean;
  isLocalSkill?: boolean;
}

export default function ReadmeViewer({
  content,
  translationEnabled = false,
  isLocalSkill = false,
}: ReadmeViewerProps) {
  const { t } = useTranslation();
  const original = originalReadme(content);
  const [state, dispatch] = useReducer(
    readmeViewReducer,
    undefined,
    createReadmeViewState,
  );
  const [showPrivacyConfirmation, setShowPrivacyConfirmation] = useState(false);
  const requestVersion = useRef(0);

  useEffect(() => {
    requestVersion.current += 1;
    dispatch({ type: "reset" });
    setShowPrivacyConfirmation(false);
  }, [content.id, original]);

  const runTranslation = async () => {
    const currentRequest = ++requestVersion.current;
    dispatch({ type: "start" });
    try {
      const result = await translateReadmeWithCache({
        skillId: content.id,
        originalMarkdown: original,
      });
      if (requestVersion.current === currentRequest) {
        dispatch({ type: "success", content: result.translatedMarkdown });
      }
    } catch (error) {
      const code =
        error instanceof ReadmeTranslationError ? error.code : "request-failed";
      if (requestVersion.current === currentRequest) {
        dispatch({ type: "error", code });
      }
    }
  };

  const requestTranslation = () => {
    if (
      needsLocalTranslationConsent(
        isLocalSkill,
        hasLocalTranslationConsent(),
      )
    ) {
      setShowPrivacyConfirmation(true);
      return;
    }
    void runTranslation();
  };

  const confirmLocalTranslation = () => {
    grantLocalTranslationConsent();
    setShowPrivacyConfirmation(false);
    void runTranslation();
  };

  if (!original) {
    return (
      <p className="text-xs text-[--color-muted-foreground]">
        {t("skillDetail.markdownEmpty")}
      </p>
    );
  }

  if (!translationEnabled) {
    return <MarkdownRenderer content={original} />;
  }

  const translated = state.translatedMarkdown;
  const markdown = displayedReadme(original, translated, state.language);

  return (
    <div>
      <div className="absolute right-6 top-5">
        {translated ? (
          <div
            className="inline-flex rounded-md border border-[--color-border] bg-[--color-muted] p-0.5"
            role="group"
            aria-label={t("skillDetail.readmeLanguage")}
          >
            <LanguageButton
              active={state.language === "zh"}
              onClick={() => dispatch({ type: "language", language: "zh" })}
            >
              {t("skillDetail.chinese")}
            </LanguageButton>
            <LanguageButton
              active={state.language === "original"}
              onClick={() => dispatch({ type: "language", language: "original" })}
            >
              {t("skillDetail.original")}
            </LanguageButton>
          </div>
        ) : (
          <button
            type="button"
            disabled={state.status === "loading"}
            onClick={requestTranslation}
            className="inline-flex items-center gap-2 rounded-md border border-[--color-border] bg-[--color-muted] px-3 py-1.5 text-xs font-medium text-[--color-foreground] transition-colors hover:bg-[--color-accent] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state.status === "loading" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {state.status === "loading"
              ? t("skillDetail.translating")
              : state.status === "error"
                ? t("skillDetail.retryTranslation")
                : t("skillDetail.translateToChinese")}
          </button>
        )}
      </div>

      {showPrivacyConfirmation && (
        <div
          className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3"
          role="dialog"
          aria-label={t("skillDetail.translationPrivacyTitle")}
        >
          <p className="text-sm font-medium">
            {t("skillDetail.translationPrivacyTitle")}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[--color-muted-foreground]">
            {t("skillDetail.translationPrivacyBody")}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowPrivacyConfirmation(false)}
              className="rounded-md px-3 py-1.5 text-xs text-[--color-muted-foreground] hover:bg-[--color-accent]"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={confirmLocalTranslation}
              className="rounded-md bg-[--color-primary] px-3 py-1.5 text-xs font-medium text-white"
            >
              {t("skillDetail.continueTranslation")}
            </button>
          </div>
        </div>
      )}

      {state.status === "error" && (
        <p
          className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400"
          role="alert"
        >
          {state.errorCode === "not-configured" ||
          state.errorCode === "invalid-endpoint"
            ? t("skillDetail.translationUnavailable")
            : t("skillDetail.translationError")}
        </p>
      )}

      <MarkdownRenderer content={markdown} />
    </div>
  );
}

function LanguageButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-[--color-card] text-[--color-foreground] shadow-sm"
          : "text-[--color-muted-foreground] hover:text-[--color-foreground]"
      }`}
    >
      {children}
    </button>
  );
}

function MarkdownRenderer({ content }: { content: string }) {
  const components: Components = {
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || "");
      const codeString = String(children).replace(/\n$/, "");
      if (match) {
        return (
          <SyntaxHighlighter
            style={oneDark}
            language={match[1]}
            PreTag="div"
            customStyle={{ margin: 0, borderRadius: "0.375rem", fontSize: "0.8rem" }}
          >
            {codeString}
          </SyntaxHighlighter>
        );
      }
      return (
        <code
          className="rounded bg-[--color-muted] px-1.5 py-0.5 text-xs text-[--color-muted-foreground]"
          {...props}
        >
          {children}
        </code>
      );
    },
  };

  return (
    <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed text-[--color-foreground] [&_a]:text-[--color-primary] [&_a]:underline [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-medium [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li>ul]:mt-0 [&_li>ol]:mt-0 [&_blockquote]:border-l-2 [&_blockquote]:border-[--color-primary]/40 [&_blockquote]:pl-4 [&_blockquote]:text-[--color-muted-foreground] [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-[--color-border] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_td]:border [&_td]:border-[--color-border] [&_td]:px-3 [&_td]:py-2 [&_td]:text-sm [&_pre]:my-3 [&_hr]:border-[--color-border] [&_p]:my-2 [&_img]:max-w-full [&_img]:rounded-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
