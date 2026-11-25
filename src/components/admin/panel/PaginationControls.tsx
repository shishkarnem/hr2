import React, { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { GLASS_CARD_CLASS } from "./adminConfig";

export const ADMIN_PAGE_SIZE = 20;

export function TablePaginationBar({
  page,
  pageSize = ADMIN_PAGE_SIZE,
  total,
  loading = false,
  onPageChange,
}: {
  page: number;
  pageSize?: number;
  total: number;
  loading?: boolean;
  onPageChange: (nextPage: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);

  if (total === 0) return null;

  return (
    <div
      className={`${GLASS_CARD_CLASS} px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-white`}
    >
      <div className="text-sm text-slate-200">
        Показано <span className="font-bold text-[#F4EE8E]">{start}–{end}</span> из{" "}
        <span className="font-bold text-white">{total}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={loading || page <= 0}
          onClick={() => onPageChange(Math.max(0, page - 1))}
          className="px-3.5 py-2 rounded-xl border border-white/25 hover:border-[#E7C768] text-sm font-semibold text-white disabled:opacity-40 inline-flex items-center gap-1.5 transition cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4 text-[#E7C768]" />
          <span>Предыдущая</span>
        </button>
        <span className="px-3 py-1.5 rounded-xl border border-[#E7C768]/40 text-sm font-semibold text-[#F4EE8E] font-mono">
          {page + 1} / {totalPages}
        </span>
        <button
          type="button"
          disabled={loading || page + 1 >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          className="px-3.5 py-2 rounded-xl border border-white/25 hover:border-[#E7C768] text-sm font-semibold text-white disabled:opacity-40 inline-flex items-center gap-1.5 transition cursor-pointer"
        >
          <span>Следующая</span>
          <ChevronRight className="w-4 h-4 text-[#E7C768]" />
        </button>
      </div>
    </div>
  );
}

export function InfiniteScrollTrigger({
  hasMore,
  loading = false,
  loadedCount,
  total,
  onLoadMore,
  autoLoad = true,
  compact = false,
}: {
  hasMore: boolean;
  loading?: boolean;
  loadedCount: number;
  total?: number;
  onLoadMore: () => void;
  autoLoad?: boolean;
  compact?: boolean;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    if (!autoLoad || !hasMore || loading) return;
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          onLoadMoreRef.current();
        }
      },
      { rootMargin: "120px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [autoLoad, hasMore, loading, loadedCount]);

  if (!hasMore && loadedCount === 0) return null;

  return (
    <div
      ref={sentinelRef}
      className={
        compact
          ? "pt-2 pb-1 flex flex-col items-center gap-2 text-center"
          : "py-3 flex flex-col items-center gap-2 text-center"
      }
    >
      {typeof total === "number" && total > 0 && (
        <div className="text-sm text-slate-300">
          Загружено {loadedCount} из {total}
        </div>
      )}
      {hasMore && (
        <button
          type="button"
          disabled={loading}
          onClick={onLoadMore}
          className="w-full sm:w-auto px-4 py-2 rounded-xl border border-[#E7C768]/50 hover:border-[#E7C768] bg-transparent text-sm font-semibold text-[#F4EE8E] inline-flex items-center justify-center gap-2 disabled:opacity-60 transition cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-[#E7C768]" />
              <span>Загрузка...</span>
            </>
          ) : (
            <span>Показать ещё 20</span>
          )}
        </button>
      )}
    </div>
  );
}
