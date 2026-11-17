import React, { useEffect, useState } from "react";
import ArticleConstructor from "@/components/ArticleConstructor";
import { Plus, Trash2, X, BookOpen, Loader2, ExternalLink, ImageIcon, CheckCircle2, AlertCircle, GraduationCap } from "lucide-react";

type Post = {
  id: string;
  public_id: string;
  slug: string;
  title: string;
  cover_url: string | null;
  content_md: string;
  excerpt: string;
  category?: string;
  is_published: boolean;
  created_at: string;
};

export default function BlogAdmin() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Post | null>(null);
  const [blogNotice, setBlogNotice] = useState<{ message: string; isError?: boolean } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [activeCategoryTab, setActiveCategoryTab] = useState<"blog" | "academy">("blog");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/posts?all=true");
      const data = await res.json();
      setPosts(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Error loading blog posts:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createNew = async () => {
    setBlogNotice(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        load();
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
      const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
      if (res.ok) {
        if (editing?.id === id) setEditing(null);
        load();
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
            <span>{activeCategoryTab === "academy" ? "Разделы ИИ-Академии (7 обучающих статей)" : "Статьи и публикации блога"}</span>
          </h2>
          <p className="text-sm text-slate-300 mt-1">
            {activeCategoryTab === "academy"
              ? "Редактирование 7 ключевых обучающих инструкций ИИ-Академии с помощью конструктора статей"
              : "Создание, редактирование и публикация экспертных статей в корпоративном блоге компании"}
          </p>
        </div>

        <button
          type="button"
          onClick={createNew}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] text-sm font-bold shadow-lg hover:brightness-105 active:scale-95 transition cursor-pointer"
        >
          <Plus className="w-4 h-4 text-[#17344F]" />
          <span>{activeCategoryTab === "academy" ? "Добавить раздел" : "Новая статья"}</span>
        </button>
      </div>

      {/* Category Tabs: Блог vs ИИ-Академия */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <button
          type="button"
          onClick={() => { setActiveCategoryTab("blog"); setEditing(null); }}
          className={`px-4 py-2 rounded-xl text-[14px] font-bold transition flex items-center gap-2 cursor-pointer ${
            activeCategoryTab === "blog"
              ? "bg-transparent border border-[#E7C768] text-[#F4EE8E] shadow-[0_0_12px_rgba(231,199,104,0.2)]"
              : "border border-white/15 text-slate-300 hover:text-white hover:bg-white/5"
          }`}
        >
          <BookOpen className="w-4 h-4 text-[#E7C768]" />
          <span>Статьи блога ({posts.filter(p => !p.category || p.category === "blog").length})</span>
        </button>
        <button
          type="button"
          onClick={() => { setActiveCategoryTab("academy"); setEditing(null); }}
          className={`px-4 py-2 rounded-xl text-[14px] font-bold transition flex items-center gap-2 cursor-pointer ${
            activeCategoryTab === "academy"
              ? "bg-transparent border border-[#E7C768] text-[#F4EE8E] shadow-[0_0_12px_rgba(231,199,104,0.2)]"
              : "border border-white/15 text-slate-300 hover:text-white hover:bg-white/5"
          }`}
        >
          <GraduationCap className="w-4 h-4 text-[#E7C768]" />
          <span>ИИ-Академия ({posts.filter(p => p.category === "academy").length} разделов)</span>
        </button>
      </div>

      {blogNotice && (
        <div className="p-4 rounded-2xl border border-white/20 bg-transparent backdrop-blur-xl text-sm flex items-center justify-between gap-3 text-white shadow-lg">
          <div className="flex items-center gap-2">
            {blogNotice.isError ? (
              <AlertCircle className="w-5 h-5 text-[#E7C768]" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-[#E7C768]" />
            )}
            <span>{blogNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setBlogNotice(null)}
            className="font-bold underline text-sm text-[#E7C768] hover:text-white transition cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      )}

      {/* Main split grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Posts list column */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between text-sm text-slate-300 px-1">
            <span>
              {activeCategoryTab === "academy" ? "Разделы Академии" : "Все публикации"} (
              {posts.filter(p => activeCategoryTab === "academy" ? p.category === "academy" : (!p.category || p.category === "blog")).length}
              )
            </span>
            {loading && (
              <span className="flex items-center gap-1.5 text-xs text-[#E7C768]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Обновление…
              </span>
            )}
          </div>

          <div className="space-y-2.5 max-h-[700px] overflow-y-auto pr-1">
            {posts
              .filter(p => activeCategoryTab === "academy" ? p.category === "academy" : (!p.category || p.category === "blog"))
              .map((p) => {
              const isSelected = editing?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setEditing(p)}
                  className={`w-full text-left rounded-2xl border p-3.5 transition backdrop-blur-xl cursor-pointer ${
                    isSelected
                      ? "border-[#E7C768] bg-white/10 shadow-lg"
                      : "border-white/15 bg-transparent hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-xl bg-transparent border border-white/15 overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {p.cover_url ? (
                        <img src={p.cover_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-white truncate">
                        {p.title || "Статья без названия"}
                      </div>
                      <div className="text-xs text-slate-300 mt-1 flex items-center gap-2">
                        <span>#{p.public_id}</span>
                        <span>•</span>
                        <span className={p.is_published ? "text-[#E7C768] font-semibold" : "text-slate-400"}>
                          {p.is_published ? "Опубликовано" : "Черновик"}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}

            {!loading && posts.filter(p => activeCategoryTab === "academy" ? p.category === "academy" : (!p.category || p.category === "blog")).length === 0 && (
              <div className="rounded-2xl border border-white/15 p-6 text-center text-sm text-slate-300 bg-transparent backdrop-blur-md">
                {activeCategoryTab === "academy" ? "Разделы академии загружаются…" : "Пока нет статей. Нажмите «Новая статья» выше."}
              </div>
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
                load();
              }}
              onDelete={() => setConfirmDeleteId(editing.id)}
              onClose={() => setEditing(null)}
            />
          ) : (
            <div className="rounded-3xl border border-white/20 bg-transparent backdrop-blur-xl p-10 text-center text-slate-300 shadow-xl space-y-3">
              <BookOpen className="w-12 h-12 text-[#E7C768] mx-auto opacity-70" />
              <h3 className="text-lg font-bold text-white">Выберите статью для редактирования</h3>
              <p className="text-sm text-slate-300 max-w-md mx-auto">
                Выберите готовую статью из списка слева или создайте новую публикацию через верхнюю кнопку.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
              Удаление статьи
            </h3>
            <p className="text-sm text-slate-200">
              Вы действительно хотите удалить эту статью из базы данных блога?
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 rounded-xl border border-white/20 bg-transparent hover:bg-white/10 text-white text-sm font-bold transition cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => executeRemove(confirmDeleteId)}
                className="px-4 py-2 rounded-xl border border-white/30 bg-white/10 hover:bg-white/20 text-white text-sm font-bold transition cursor-pointer"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BlogEditorWrapper({
  post,
  onSaved,
  onDelete,
  onClose,
}: {
  post: Post;
  onSaved: (p: Post) => void;
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
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
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
        setNotice({ message: "Статья успешно сохранена в базе данных!" });
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
        <div className="p-3.5 rounded-2xl border border-white/20 bg-transparent backdrop-blur-xl text-sm flex items-center justify-between text-white shadow-lg">
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
            className="font-bold underline text-sm text-[#E7C768] hover:text-white transition cursor-pointer"
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
          <div className="flex items-center gap-2">
            <a
              href={post.category === "academy" ? `/academy?tab=${post.slug}` : `/blog/post${post.public_id}`}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-xl border border-white/15 bg-transparent hover:bg-white/10 text-sm font-semibold text-white flex items-center gap-1.5 transition"
              title="Открыть публичную страницу статьи в новой вкладке"
            >
              <ExternalLink className="w-4 h-4 text-[#E7C768]" />
              <span className="hidden sm:inline">{post.category === "academy" ? "Открыть в Академии" : "Открыть в блоге"}</span>
            </a>

            <button
              type="button"
              onClick={onClose}
              title="Закрыть редактор"
              className="p-1.5 rounded-xl border border-white/15 bg-transparent hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        }
        extraFooterActions={
          <button
            type="button"
            onClick={onDelete}
            className="px-4 py-2 rounded-xl border border-white/25 bg-transparent hover:bg-white/10 text-white text-sm font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Trash2 className="w-4 h-4 text-[#E7C768]" />
            <span>Удалить статью</span>
          </button>
        }
      />
    </div>
  );
}
