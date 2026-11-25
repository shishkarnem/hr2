import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ArticleConstructor from "@/components/ArticleConstructor";
import {
  Plus,
  Trash2,
  X,
  BookOpen,
  Loader2,
  ExternalLink,
  ImageIcon,
  CheckCircle2,
  AlertCircle,
  GraduationCap,
  RefreshCw,
  Pin,
  PinOff,
} from "lucide-react";
import { getBlogPostPath, NEW_DEFAULT_COVER_URL } from "@/components/blog/blogHelpers";
import { ADMIN_PAGE_SIZE, InfiniteScrollTrigger } from "./panel/PaginationControls";

type Post = {
  id: string;
  public_id: string;
  slug: string;
  title: string;
  cover_url: string | null;
  cover_image_url?: string | null;
  content_md: string;
  excerpt: string;
  category?: string;
  rss_category?: string | null;
  is_published: boolean;
  is_pinned?: boolean;
  pinned_at?: string | null;
  created_at: string;
};

function getAdminAuthHeaders(): Record<string, string> {
  const token =
    localStorage.getItem("emp_token") ||
    localStorage.getItem("employer_token") ||
    localStorage.getItem("admin_token") ||
    sessionStorage.getItem("emp_token") ||
    "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function BlogAdmin() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [blogTotal, setBlogTotal] = useState(0);
  const [academyTotal, setAcademyTotal] = useState(0);
  const [pinnedCount, setPinnedCount] = useState(0);
  const [syncingRss, setSyncingRss] = useState(false);
  const [pinBusyId, setPinBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Post | null>(null);
  const [blogNotice, setBlogNotice] = useState<{ message: string; isError?: boolean } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [activeCategoryTab, setActiveCategoryTab] = useState<"blog" | "academy">("blog");

  const fetchTabPosts = async (tab: "blog" | "academy", append = false, currentLength = 0) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const offset = append ? currentLength : 0;
      const res = await fetch(
        `/api/posts?all=true&paginated=1&category=${tab}&limit=${ADMIN_PAGE_SIZE}&offset=${offset}`
      );
      const data = await res.json();
      const items: Post[] = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data)
        ? data
        : [];
      const total = Number(data?.total ?? items.length);
      const nextHasMore = Boolean(data?.hasMore);

      setPosts((prev) => (append ? [...prev, ...items] : items));
      setHasMore(nextHasMore);

      if (tab === "blog") {
        setBlogTotal(total);
        if (typeof data?.pinnedCount === "number") setPinnedCount(data.pinnedCount);
        if (typeof data?.academyTotal === "number") setAcademyTotal(data.academyTotal);
      } else {
        setAcademyTotal(total);
      }
    } catch (e) {
      console.error("Error loading blog posts:", e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchTabPosts(activeCategoryTab, false, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategoryTab]);

  const activeTotal = activeCategoryTab === "academy" ? academyTotal : blogTotal;

  const handleSyncRss = async () => {
    if (syncingRss) return;
    setSyncingRss(true);
    setBlogNotice(null);
    try {
      const headers = getAdminAuthHeaders();
      const res = await fetch("/api/blog/sync-rss", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ limit: 100 }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setBlogNotice({
          message: `RSS синхронизация (${data.sourceDomain || "SAV AI"}): добавлено ${data.added}, обновлено ${data.updated}, без изменений ${data.skipped}`,
        });
        await fetchTabPosts(activeCategoryTab, false, 0);
      } else {
        setBlogNotice({
          message: data.error || "Не удалось синхронизировать RSS-ленту",
          isError: true,
        });
      }
    } catch (e: any) {
      setBlogNotice({ message: e?.message || "Ошибка запроса синхронизации RSS", isError: true });
    } finally {
      setSyncingRss(false);
    }
  };

  const handleTogglePin = async (post: Post, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (pinBusyId) return;
    setPinBusyId(post.id);
    setBlogNotice(null);
    try {
      const headers = getAdminAuthHeaders();
      const res = await fetch(`/api/posts/${post.id}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ pinned: !post.is_pinned }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setBlogNotice({
          message: data.post?.is_pinned
            ? `Статья закреплена (закреплено ${data.pinnedCount} из 10)`
            : `Статья откреплена (закреплено ${data.pinnedCount} из 10)`,
        });
        if (editing?.id === post.id && data.post) {
          setEditing(data.post);
        }
        await fetchTabPosts(activeCategoryTab, false, 0);
      } else {
        setBlogNotice({ message: data.error || "Не удалось изменить закрепление", isError: true });
      }
    } catch (err: any) {
      setBlogNotice({ message: err?.message || "Ошибка запроса", isError: true });
    } finally {
      setPinBusyId(null);
    }
  };

  const createNew = async () => {
    setBlogNotice(null);
    try {
      const headers = getAdminAuthHeaders();
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          title: activeCategoryTab === "academy" ? "Новый раздел Академии" : "Новая статья",
          content_md: "## Введение\n\nТекст вашей новой публикации…",
          category: activeCategoryTab,
          is_published: false,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setEditing(data);
        fetchTabPosts(activeCategoryTab, false, 0);
      } else {
        setBlogNotice({ message: data.error || "Не удалось создать статью", isError: true });
      }
    } catch (e: any) {
      setBlogNotice({ message: e.message || "Ошибка соединения", isError: true });
    }
  };

  const executeRemove = async (id: string) => {
    setConfirmDeleteId(null);
    setBlogNotice(null);
    try {
      const headers = getAdminAuthHeaders();
      const res = await fetch(`/api/posts/${id}`, { method: "DELETE", headers });
      if (res.ok) {
        if (editing?.id === id) setEditing(null);
        fetchTabPosts(activeCategoryTab, false, 0);
        setBlogNotice({ message: "Статья успешно удалена из базы данных" });
      } else {
        const err = await res.json();
        setBlogNotice({ message: err.error || "Ошибка удаления статьи", isError: true });
      }
    } catch (e: any) {
      setBlogNotice({ message: e.message, isError: true });
    }
  };

  return (
    <div className="space-y-5">
      {/* Header section */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent inline-flex items-center gap-2.5">
            {activeCategoryTab === "academy" ? (
              <GraduationCap className="w-6 h-6 text-[#E7C768]" />
            ) : (
              <BookOpen className="w-6 h-6 text-[#E7C768]" />
            )}
            <span>
              {activeCategoryTab === "academy"
                ? "Разделы ИИ-Академии (обучающие статьи)"
                : "Статьи и публикации блога"}
            </span>
          </h2>
          <p className="text-[14px] text-white/85 mt-1">
            {activeCategoryTab === "academy"
              ? "Редактирование обучающих инструкций ИИ-Академии с помощью конструктора статей"
              : `Автоимпорт RSS (SAV AI) каждые 10 минут · Закреплено: ${pinnedCount} из 10`}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
          {activeCategoryTab === "blog" && (
            <button
              type="button"
              onClick={handleSyncRss}
              disabled={syncingRss}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl border border-[#E7C768] bg-transparent backdrop-blur-xl text-white text-[14px] font-semibold hover:brightness-110 disabled:opacity-60 transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 text-[#E7C768] ${syncingRss ? "animate-spin" : ""}`} />
              <span>{syncingRss ? "Синхронизация…" : "Синхронизировать RSS сейчас"}</span>
            </button>
          )}

          <button
            type="button"
            onClick={createNew}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl border border-[#E7C768] bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] text-[14px] font-bold shadow-lg hover:brightness-105 active:scale-95 transition cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#17344F]" />
            <span>{activeCategoryTab === "academy" ? "Добавить раздел" : "Новая статья"}</span>
          </button>
        </div>
      </div>

      {/* Category Tabs: Блог vs ИИ-Академия */}
      <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 border-b border-white/15 pb-3">
        <button
          type="button"
          onClick={() => {
            setActiveCategoryTab("blog");
            setEditing(null);
          }}
          className={`w-full sm:w-auto px-4 py-2.5 rounded-xl text-[14px] font-bold transition flex items-center justify-center sm:justify-start gap-2 cursor-pointer ${
            activeCategoryTab === "blog"
              ? "bg-transparent border border-[#E7C768] text-[#F4EE8E]"
              : "border border-white/20 bg-transparent text-white/85 hover:text-white hover:border-white/45"
          }`}
        >
          <BookOpen className="w-4 h-4 text-[#E7C768]" />
          <span>Статьи блога ({blogTotal})</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveCategoryTab("academy");
            setEditing(null);
          }}
          className={`w-full sm:w-auto px-4 py-2.5 rounded-xl text-[14px] font-bold transition flex items-center justify-center sm:justify-start gap-2 cursor-pointer ${
            activeCategoryTab === "academy"
              ? "bg-transparent border border-[#E7C768] text-[#F4EE8E]"
              : "border border-white/20 bg-transparent text-white/85 hover:text-white hover:border-white/45"
          }`}
        >
          <GraduationCap className="w-4 h-4 text-[#E7C768]" />
          <span>ИИ-Академия ({academyTotal} разделов)</span>
        </button>
      </div>

      {blogNotice && (
        <div className="p-4 rounded-2xl border border-[#E7C768]/50 bg-transparent backdrop-blur-xl text-[14px] flex flex-wrap items-center justify-between gap-3 text-white shadow-lg">
          <div className="flex items-center gap-2 min-w-0">
            {blogNotice.isError ? (
              <AlertCircle className="w-5 h-5 text-[#E7C768] shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-[#E7C768] shrink-0" />
            )}
            <span className="break-words">{blogNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setBlogNotice(null)}
            className="font-bold underline text-[14px] text-[#F4EE8E] hover:text-white transition cursor-pointer shrink-0"
          >
            Закрыть
          </button>
        </div>
      )}

      {/* Main split grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Posts list column */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between text-[14px] text-white/85 px-1">
            <span>
              {activeCategoryTab === "academy" ? "Разделы Академии" : "Все публикации"} ({activeTotal})
            </span>
            {loading && (
              <span className="flex items-center gap-1.5 text-[14px] text-[#E7C768]">
                <Loader2 className="w-4 h-4 animate-spin" /> Обновление…
              </span>
            )}
          </div>

          <div className="space-y-2.5 max-h-[700px] overflow-y-auto pr-1">
            {posts.map((p) => {
              const isSelected = editing?.id === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setEditing(p)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setEditing(p);
                    }
                  }}
                  className={`w-full text-left rounded-2xl border p-3.5 transition backdrop-blur-xl cursor-pointer ${
                    isSelected
                      ? "border-[#E7C768] bg-transparent shadow-lg"
                      : p.is_pinned
                      ? "border-[#E7C768]/60 bg-transparent hover:border-[#E7C768]"
                      : "border-white/20 bg-transparent hover:border-white/45"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-xl bg-transparent border border-white/20 overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {p.cover_url ? (
                        <img
                          src={p.cover_url}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(ev) => {
                            (ev.currentTarget as HTMLImageElement).src = NEW_DEFAULT_COVER_URL;
                          }}
                        />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-[#E7C768]" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-bold text-white truncate">
                        {p.title || "Статья без названия"}
                      </div>
                      <div className="text-[14px] text-white/80 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="tabular-nums">#{p.public_id}</span>
                        <span>·</span>
                        <span className={p.is_published ? "text-[#F4EE8E] font-medium" : "text-white/60"}>
                          {p.is_published ? "Опубликовано" : "Черновик"}
                        </span>
                        {p.is_pinned && (
                          <>
                            <span>·</span>
                            <span className="text-[#F4EE8E] font-semibold">Закреплено</span>
                          </>
                        )}
                      </div>
                    </div>

                    {activeCategoryTab === "blog" && (
                      <button
                        type="button"
                        onClick={(e) => handleTogglePin(p, e)}
                        disabled={pinBusyId === p.id}
                        title={p.is_pinned ? "Открепить статью" : "Закрепить статью (макс. 10)"}
                        className={`p-2 rounded-xl border transition shrink-0 cursor-pointer ${
                          p.is_pinned
                            ? "border-[#E7C768] text-[#F4EE8E] bg-transparent"
                            : "border-white/20 bg-transparent text-white/80 hover:border-[#E7C768] hover:text-[#F4EE8E]"
                        }`}
                      >
                        {pinBusyId === p.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-[#E7C768]" />
                        ) : p.is_pinned ? (
                          <PinOff className="w-4 h-4 text-[#E7C768]" />
                        ) : (
                          <Pin className="w-4 h-4 text-[#E7C768]" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {!loading && posts.length === 0 ? (
              <div className="rounded-2xl border border-white/20 p-6 text-center text-[14px] text-white/85 bg-transparent backdrop-blur-md">
                {activeCategoryTab === "academy"
                  ? "Разделы академии загружаются…"
                  : "Пока нет статей. Нажмите «Синхронизировать RSS сейчас» или «Новая статья»."}
              </div>
            ) : (
              <InfiniteScrollTrigger
                hasMore={hasMore}
                loading={loadingMore}
                loadedCount={posts.length}
                total={activeTotal}
                onLoadMore={() => fetchTabPosts(activeCategoryTab, true, posts.length)}
                compact
              />
            )}
          </div>
        </div>

        {/* Editor column */}
        <div className="lg:col-span-8">
          {editing ? (
            <BlogEditorWrapper
              key={editing.id}
              post={editing}
              onSaved={(p) => {
                setEditing(p);
                setPosts((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...p } : x)));
                fetchTabPosts(activeCategoryTab, false, 0);
              }}
              onTogglePin={() => handleTogglePin(editing)}
              pinBusy={pinBusyId === editing.id}
              onDelete={() => setConfirmDeleteId(editing.id)}
              onClose={() => setEditing(null)}
            />
          ) : (
            <div className="rounded-3xl border border-white/25 bg-transparent backdrop-blur-xl p-10 text-center text-white/90 shadow-xl space-y-3">
              <BookOpen className="w-12 h-12 text-[#E7C768] mx-auto opacity-80" />
              <h3 className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                Выберите статью для редактирования
              </h3>
              <p className="text-[14px] text-white/85 max-w-md mx-auto">
                Выберите готовую статью из списка слева, закрепите до 10 важных публикаций или запустите синхронизацию RSS-ленты.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Viewport-centered confirmation modal with brand blue gradient */}
      {confirmDeleteId &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[950] flex items-center justify-center bg-[#0D2032]/75 backdrop-blur-md p-4"
            onClick={() => setConfirmDeleteId(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-[#17344F] via-[#1E4468] to-[#265582] border border-[#E7C768]/50 rounded-3xl p-6 max-w-md w-full shadow-[0_24px_60px_rgba(0,0,0,0.65)] space-y-4 text-white"
            >
              <h3 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                Удаление статьи
              </h3>
              <p className="text-[14px] text-white">
                Вы действительно хотите удалить эту статью из базы данных блога?
              </p>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(null)}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl border border-white/25 bg-transparent hover:border-[#E7C768] text-white text-[14px] font-bold transition cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => executeRemove(confirmDeleteId)}
                  className="w-full sm:w-auto px-5 py-2 rounded-xl border border-[#E7C768] bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] hover:brightness-105 text-[14px] font-bold transition cursor-pointer"
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function BlogEditorWrapper({
  post,
  onSaved,
  onTogglePin,
  pinBusy,
  onDelete,
  onClose,
}: {
  post: Post;
  onSaved: (p: Post) => void;
  onTogglePin: () => void;
  pinBusy: boolean;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content_md);
  const [coverUrl, setCoverUrl] = useState(post.cover_url || "");
  const [isPublished, setIsPublished] = useState(post.is_published);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ message: string; isError?: boolean } | null>(null);

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const headers = getAdminAuthHeaders();
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          title,
          content_md: content,
          cover_url: coverUrl || null,
          is_published: isPublished,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onSaved(data);
        setNotice({ message: "Статья успешно сохранена в базе данных" });
      } else {
        setNotice({ message: data.error || "Ошибка сохранения статьи", isError: true });
      }
    } catch (e: any) {
      setNotice({ message: e.message || "Ошибка запроса", isError: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {notice && (
        <div className="p-3.5 rounded-2xl border border-[#E7C768]/50 bg-transparent backdrop-blur-xl text-[14px] flex items-center justify-between text-white shadow-lg">
          <div className="flex items-center gap-2">
            {notice.isError ? (
              <AlertCircle className="w-5 h-5 text-[#E7C768]" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-[#E7C768]" />
            )}
            <span>{notice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="font-bold underline text-[14px] text-[#F4EE8E] hover:text-white transition cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      )}

      <ArticleConstructor
        title={title}
        onTitleChange={setTitle}
        content={content}
        onChange={setContent}
        coverUrl={coverUrl}
        onCoverChange={setCoverUrl}
        isPublished={isPublished}
        onPublishedChange={setIsPublished}
        onSave={save}
        saving={saving}
        extraHeaderActions={
          <div className="flex flex-wrap items-center gap-2">
            {post.category !== "academy" && (
              <button
                type="button"
                onClick={onTogglePin}
                disabled={pinBusy}
                className={`px-3 py-1.5 rounded-xl border bg-transparent text-[14px] font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  post.is_pinned
                    ? "border-[#E7C768] text-[#F4EE8E]"
                    : "border-white/25 text-white hover:border-[#E7C768]"
                }`}
              >
                {pinBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#E7C768]" />
                ) : post.is_pinned ? (
                  <PinOff className="w-4 h-4 text-[#E7C768]" />
                ) : (
                  <Pin className="w-4 h-4 text-[#E7C768]" />
                )}
                <span>{post.is_pinned ? "Открепить" : "Закрепить"}</span>
              </button>
            )}

            <a
              href={post.category === "academy" ? `/academy?tab=${post.slug}` : getBlogPostPath(post)}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-xl border border-white/25 bg-transparent hover:border-[#E7C768] text-[14px] font-semibold text-white flex items-center gap-1.5 transition"
              title="Открыть публичную страницу статьи в новой вкладке"
            >
              <ExternalLink className="w-4 h-4 text-[#E7C768]" />
              <span className="hidden sm:inline">
                {post.category === "academy" ? "Открыть в Академии" : "Открыть в блоге"}
              </span>
            </a>

            <button
              type="button"
              onClick={onClose}
              title="Закрыть редактор"
              className="p-1.5 rounded-xl border border-white/25 bg-transparent hover:border-[#E7C768] text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        }
        extraFooterActions={
          <button
            type="button"
            onClick={onDelete}
            className="px-4 py-2 rounded-xl border border-white/25 bg-transparent hover:border-[#E7C768] text-white text-[14px] font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Trash2 className="w-4 h-4 text-[#E7C768]" />
            <span>Удалить статью</span>
          </button>
        }
      />
    </div>
  );
}
