import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useSkillStore } from "@/store/skillStore";

export default function Pagination() {
  const { t } = useTranslation();
  const { totalCount, pageSize, currentPage, setPage, setPageSize, isLoading } = useSkillStore();

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  if (totalPages <= 1) {
    return null;
  }

  // Generate visible page numbers with ellipsis
  const getPageNumbers = (): (number | "ellipsis")[] => {
    const pages: (number | "ellipsis")[] = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }

    // Always show first page
    pages.push(1);

    let start = Math.max(2, currentPage - 2);
    let end = Math.min(totalPages - 1, currentPage + 2);

    // Adjust range
    if (currentPage <= 4) {
      end = Math.min(6, totalPages - 1);
    }
    if (currentPage >= totalPages - 3) {
      start = Math.max(totalPages - 5, 2);
    }

    if (start > 2) pages.push("ellipsis");

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (end < totalPages - 1) pages.push("ellipsis");

    // Always show last page
    pages.push(totalPages);

    return pages;
  };

  const handlePageClick = (page: number) => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    setPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
      {/* Total info */}
      <p className="text-xs text-[--color-muted-foreground]">
        {t("skillList.total").replace("{count}", String(totalCount))}
        {" "}&middot;{" "}
        {t("skillList.page")} {currentPage} {t("skillList.of")} {totalPages}
      </p>

      <div className="flex items-center gap-1">
        {/* First page */}
        <button
          onClick={() => handlePageClick(1)}
          disabled={currentPage === 1 || isLoading}
          className="hidden rounded-md border border-[--color-border] bg-[--color-card] p-1.5 text-[--color-muted-foreground] transition-colors hover:text-[--color-foreground] disabled:cursor-not-allowed disabled:opacity-40 sm:block"
          aria-label="First page"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </button>

        {/* Previous page */}
        <button
          onClick={() => handlePageClick(currentPage - 1)}
          disabled={currentPage === 1 || isLoading}
          className="rounded-md border border-[--color-border] bg-[--color-card] p-1.5 text-[--color-muted-foreground] transition-colors hover:text-[--color-foreground] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        {/* Page numbers (hidden on small screens) */}
        <div className="hidden items-center gap-1 sm:flex">
          {pageNumbers.map((p, i) =>
            p === "ellipsis" ? (
              <span key={`ellipsis-${i}`} className="px-1 text-xs text-[--color-muted-foreground]">
                &hellip;
              </span>
            ) : (
              <button
                key={p}
                onClick={() => handlePageClick(p)}
                disabled={isLoading}
                className={`min-w-[2rem] rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                  p === currentPage
                    ? "border-[--color-primary] bg-[--color-primary] text-white"
                    : "border-[--color-border] bg-[--color-card] text-[--color-foreground] hover:border-[--color-primary]/40"
                }`}
              >
                {p}
              </button>
            )
          )}
        </div>

        {/* Next page */}
        <button
          onClick={() => handlePageClick(currentPage + 1)}
          disabled={currentPage === totalPages || isLoading}
          className="rounded-md border border-[--color-border] bg-[--color-card] p-1.5 text-[--color-muted-foreground] transition-colors hover:text-[--color-foreground] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>

        {/* Last page */}
        <button
          onClick={() => handlePageClick(totalPages)}
          disabled={currentPage === totalPages || isLoading}
          className="hidden rounded-md border border-[--color-border] bg-[--color-card] p-1.5 text-[--color-muted-foreground] transition-colors hover:text-[--color-foreground] disabled:cursor-not-allowed disabled:opacity-40 sm:block"
          aria-label="Last page"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>

        {/* Page size selector */}
        <div className="ml-3 hidden items-center gap-1 sm:flex">
          <span className="text-xs text-[--color-muted-foreground]">{t("skillList.perPage")}</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded-md border border-[--color-border] bg-[--color-card] px-2 py-1 text-xs text-[--color-foreground] outline-none transition-colors hover:border-[--color-primary]/40 focus:border-[--color-primary]"
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>
    </div>
  );
}
