import React, { useState, useEffect } from "react";
import {
  FolderPlus,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Search,
  Upload,
  Key,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Layers,
  Filter,
  Grid,
  List,
  MoveRight,
  HardDrive,
  FileText,
  Video,
  Music,
  Plus,
  X,
  Loader2,
  Edit3,
  CheckSquare,
  Square,
  AlertTriangle,
} from "lucide-react";
import { FileUploadService, getFormattedFileUrl, slugifyFilename } from "../../services/FileUploadService";
import { DropzoneUploader } from "./DropzoneUploader";
import { FilePreviewModal, FileStorageItem } from "./FilePreviewModal";
import { EditFileModal } from "./EditFileModal";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import { BulkMoveModal } from "./BulkMoveModal";
import { BulkDeleteModal } from "./BulkDeleteModal";

interface FileFolder {
  id: number;
  name: string;
  color: string;
  created_at: string;
}

export const ProTalkGallery: React.FC = () => {
  const [files, setFiles] = useState<FileStorageItem[]>([]);
  const [folders, setFolders] = useState<FileFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Multi-selection state
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Modals & UI States
  const [previewFile, setPreviewFile] = useState<FileStorageItem | null>(null);
  const [editingFile, setEditingFile] = useState<FileStorageItem | null>(null);
  const [deletingFile, setDeletingFile] = useState<FileStorageItem | null>(null);
  const [showBulkMoveModal, setShowBulkMoveModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("#99d037");
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenInput, setTokenInput] = useState(() => FileUploadService.getToken());
  const [tokenSavedNotice, setTokenSavedNotice] = useState(false);

  // Layout mode
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [copiedFileId, setCopiedFileId] = useState<number | null>(null);

  const getAdminPwd = () => sessionStorage.getItem("sysadmin_password") || "";

  const fetchFolders = async () => {
    try {
      const res = await fetch("/api/admin/file-folders", {
        headers: { "x-admin-password": getAdminPwd() },
      });
      if (res.ok) {
        const data = await res.json();
        setFolders(data || []);
      }
    } catch (e) {
      console.warn("Failed fetching folders:", e);
    }
  };

  const fetchFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = "/api/admin/files?";
      if (selectedFolderId === null) {
        url += "folder_id=null&";
      } else if (selectedFolderId !== "all") {
        url += `folder_id=${selectedFolderId}&`;
      }
      if (searchQuery.trim()) {
        url += `search=${encodeURIComponent(searchQuery.trim())}&`;
      }

      const res = await fetch(url, {
        headers: { "x-admin-password": getAdminPwd() },
      });
      if (res.ok) {
        const data = await res.json();
        setFiles(data || []);
      } else {
        setError("Не удалось загрузить список файлов из базы.");
      }
    } catch (err: any) {
      setError(`Ошибка загрузки: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFolders();
  }, []);

  useEffect(() => {
    fetchFiles();
    setSelectedIds([]); // reset selection when folder/search changes
  }, [selectedFolderId, searchQuery]);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      const res = await fetch("/api/admin/file-folders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": getAdminPwd(),
        },
        body: JSON.stringify({ name: newFolderName.trim(), color: newFolderColor }),
      });
      if (res.ok) {
        setNewFolderName("");
        setShowCreateFolderModal(false);
        fetchFolders();
      }
    } catch (e) {
      console.error("Error creating folder:", e);
    }
  };

  const handleDeleteFolder = async (folderId: number) => {
    if (!window.confirm("Удалить эту папку? Файлы из неё переместятся в корень.")) return;
    try {
      const res = await fetch(`/api/admin/file-folders/${folderId}`, {
        method: "DELETE",
        headers: { "x-admin-password": getAdminPwd() },
      });
      if (res.ok) {
        if (selectedFolderId === folderId) setSelectedFolderId("all");
        fetchFolders();
        fetchFiles();
      }
    } catch (e) {
      console.error("Error deleting folder:", e);
    }
  };

  // Single Edit Save
  const handleSaveEditFile = async (fileId: number, newName: string, folderId: number | null, description?: string) => {
    const res = await fetch(`/api/admin/files/${fileId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": getAdminPwd(),
      },
      body: JSON.stringify({ name: newName, folder_id: folderId, description }),
    });
    if (!res.ok) {
      throw new Error("Не удалось обновить запись файла в базе данных.");
    }
    fetchFiles();
  };

  // Single Delete Confirm
  const handleConfirmDeleteFile = async (fileId: number) => {
    const res = await fetch(`/api/admin/files/${fileId}`, {
      method: "DELETE",
      headers: { "x-admin-password": getAdminPwd() },
    });
    if (!res.ok) {
      throw new Error("Не удалось удалить запись файла из базы данных.");
    }
    setSelectedIds((prev) => prev.filter((id) => id !== fileId));
    if (previewFile?.id === fileId) setPreviewFile(null);
    fetchFiles();
  };

  // Bulk Move Confirm
  const handleConfirmBulkMove = async (targetFolderId: number | null) => {
    const res = await fetch("/api/admin/files/bulk-move", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": getAdminPwd(),
      },
      body: JSON.stringify({ ids: selectedIds, folder_id: targetFolderId }),
    });
    if (!res.ok) {
      throw new Error("Не удалось переместить выбранные файлы.");
    }
    setSelectedIds([]);
    fetchFiles();
  };

  // Bulk Delete Confirm
  const handleConfirmBulkDelete = async () => {
    const res = await fetch("/api/admin/files/bulk-delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": getAdminPwd(),
      },
      body: JSON.stringify({ ids: selectedIds }),
    });
    if (!res.ok) {
      throw new Error("Не удалось удалить выбранные файлы.");
    }
    setSelectedIds([]);
    fetchFiles();
  };

  const handleMoveFileFromPreview = async (fileId: number, folderId: number | null) => {
    try {
      const res = await fetch(`/api/admin/files/${fileId}/move`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": getAdminPwd(),
        },
        body: JSON.stringify({ folder_id: folderId }),
      });
      if (res.ok) {
        fetchFiles();
        if (previewFile && previewFile.id === fileId) {
          setPreviewFile({ ...previewFile, folder_id: folderId });
        }
      }
    } catch (e) {
      console.error("Error moving file:", e);
    }
  };

  const copyFormattedUrl = (file: FileStorageItem) => {
    const url = `${window.location.origin}${getFormattedFileUrl(file.id, file.name)}`;
    navigator.clipboard.writeText(url);
    setCopiedFileId(file.id);
    setTimeout(() => setCopiedFileId(null), 2000);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === files.length && files.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(files.map((f) => f.id));
    }
  };

  const toggleSelectFile = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSaveToken = () => {
    FileUploadService.setToken(tokenInput);
    setTokenSavedNotice(true);
    setTimeout(() => {
      setTokenSavedNotice(false);
      setShowTokenModal(false);
    }, 1200);
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return "0 Б";
    const k = 1024;
    const sizes = ["Б", "КБ", "МБ", "ГБ"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <div className="w-full space-y-6 text-slate-100 font-sans">
      {/* Top Gallery Header Bar */}
      <div className="p-6 rounded-2xl bg-[#132A40]/40 border border-white/10 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#265582]/50 border border-[#E7C768]/40 flex items-center justify-center text-[#E7C768] shadow-inner">
            <ImageIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
              Галерея файлов
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#E7C768]/20 text-[#E7C768] border border-[#E7C768]/30 font-mono">
                /files/:id/rr-logo.png
              </span>
            </h2>
            <p className="text-xs text-slate-300">
              Хранение, прозрачный PNG слой, адреса ЧПУ латиницей /files/:id/name.png и управление папками
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowTokenModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-semibold transition"
            title="Настройки токена загрузки"
          >
            <Key className="w-4 h-4 text-[#E7C768]" />
            <span>Токен хранилища</span>
          </button>

          <button
            onClick={() => setShowCreateFolderModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-semibold transition"
          >
            <FolderPlus className="w-4 h-4 text-[#E7C768]" />
            <span>Новая папка</span>
          </button>

          <button
            onClick={() => setShowUploadModal(!showUploadModal)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#C8A748] text-[#17344F] font-bold text-xs shadow-md hover:brightness-110 active:scale-95 transition"
          >
            <Upload className="w-4 h-4" />
            <span>{showUploadModal ? "Скрыть загрузку" : "Загрузить файлы"}</span>
          </button>

          <button
            onClick={() => {
              fetchFolders();
              fetchFiles();
            }}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-[#E7C768] border border-white/10 transition"
            title="Обновить список"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expandable Upload Section */}
      {showUploadModal && (
        <div className="p-6 rounded-2xl bg-[#132A40]/40 border border-[#E7C768]/30 backdrop-blur-md shadow-xl animate-fadeIn">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Upload className="w-4 h-4 text-[#E7C768]" /> Загрузка файлов в хранилище
            </h3>
            <button
              onClick={() => setShowUploadModal(false)}
              className="text-slate-400 hover:text-white text-xs"
            >
              Закрыть
            </button>
          </div>
          <DropzoneUploader
            currentFolderId={typeof selectedFolderId === "number" ? selectedFolderId : null}
            folders={folders}
            onUploadSuccess={() => {
              fetchFiles();
            }}
          />
        </div>
      )}

      {/* Main Gallery Area: Folder Sidebar + File Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar: Folder Navigation */}
        <div className="md:col-span-1 space-y-4">
          <div className="p-4 rounded-2xl bg-[#132A40]/40 border border-white/10 backdrop-blur-md space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-[#E7C768]" /> Папки
              </h3>
              <button
                onClick={() => setShowCreateFolderModal(true)}
                className="text-slate-400 hover:text-[#E7C768] p-1 transition"
                title="Создать папку"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1">
              {/* All Files Tab */}
              <button
                onClick={() => setSelectedFolderId("all")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                  selectedFolderId === "all"
                    ? "bg-[#E7C768] text-[#17344F] font-bold shadow"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Layers className="w-4 h-4" /> Все файлы
                </span>
              </button>

              {/* Root / No Folder Tab */}
              <button
                onClick={() => setSelectedFolderId(null)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                  selectedFolderId === null
                    ? "bg-[#E7C768] text-[#17344F] font-bold shadow"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Folder className="w-4 h-4 text-amber-400" /> Корень (без папки)
                </span>
              </button>

              {/* Dynamic Folders */}
              {folders.map((f) => {
                const isSelected = selectedFolderId === f.id;
                return (
                  <div key={f.id} className="group relative flex items-center">
                    <button
                      onClick={() => setSelectedFolderId(f.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                        isSelected
                          ? "bg-[#E7C768] text-[#17344F] font-bold shadow"
                          : "text-slate-300 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        {isSelected ? (
                          <FolderOpen className="w-4 h-4 shrink-0" style={{ color: f.color || "#99d037" }} />
                        ) : (
                          <Folder className="w-4 h-4 shrink-0" style={{ color: f.color || "#99d037" }} />
                        )}
                        <span className="truncate">{f.name}</span>
                      </span>
                    </button>

                    <button
                      onClick={() => handleDeleteFolder(f.id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-rose-400 hover:text-rose-200 transition absolute right-2"
                      title="Удалить папку"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Section: Search, Filters, Selection Bar & Files Grid */}
        <div className="md:col-span-3 space-y-4">
          {/* Controls Bar */}
          <div className="p-4 rounded-2xl bg-[#132A40]/40 border border-white/10 backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Поиск по имени или ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-black/40 border border-white/15 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#E7C768] transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-white text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Multi-Select Toggle All Button */}
            {files.length > 0 && (
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-semibold transition"
                title={selectedIds.length === files.length ? "Снять выбор со всех" : "Выбрать все файлы"}
              >
                {selectedIds.length === files.length ? (
                  <CheckSquare className="w-4 h-4 text-[#E7C768]" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
                <span>
                  {selectedIds.length === files.length ? "Снять выбор" : "Выбрать все"}
                </span>
              </button>
            )}

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-lg text-xs transition ${
                  viewMode === "grid" ? "bg-[#E7C768] text-[#17344F]" : "text-slate-400 hover:text-white"
                }`}
                title="Сетка"
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-lg text-xs transition ${
                  viewMode === "list" ? "bg-[#E7C768] text-[#17344F]" : "text-slate-400 hover:text-white"
                }`}
                title="Список"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Sticky/Floating Bulk Actions Bar */}
          {selectedIds.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#17344F] via-[#1A3D5E] to-[#17344F] border border-[#E7C768]/50 backdrop-blur-xl flex flex-wrap items-center justify-between gap-3 shadow-2xl animate-fadeIn">
              <div className="flex items-center gap-2.5">
                <div className="px-3 py-1 rounded-lg bg-[#E7C768] text-[#17344F] font-bold text-xs flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Выбрано: {selectedIds.length}</span>
                </div>
                <span className="text-xs text-slate-300 hidden sm:inline">
                  Доступны массовые действия с выбранными файлами
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowBulkMoveModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/15 text-xs font-bold transition"
                >
                  <MoveRight className="w-3.5 h-3.5 text-[#E7C768]" />
                  <span>Сменить папку</span>
                </button>

                <button
                  onClick={() => setShowBulkDeleteModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-bold transition shadow"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Удалить ({selectedIds.length})</span>
                </button>

                <button
                  onClick={() => setSelectedIds([])}
                  className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition"
                  title="Отменить выбор"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-4 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-200 text-xs">
              {error}
            </div>
          )}

          {/* Files List / Grid */}
          {loading ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-[#E7C768] animate-spin" />
              <p className="text-xs">Загрузка файлов из галереи...</p>
            </div>
          ) : files.length === 0 ? (
            <div className="p-12 rounded-2xl bg-[#132A40]/20 border border-white/10 text-center text-slate-400 flex flex-col items-center gap-3">
              <ImageIcon className="w-12 h-12 text-slate-500 stroke-1" />
              <div>
                <p className="text-sm font-bold text-white">Файлы не найдены</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Загрузите первый медиа-файл или выберите другую папку.
                </p>
              </div>
              <button
                onClick={() => setShowUploadModal(true)}
                className="mt-2 px-4 py-2 rounded-xl bg-[#265582] hover:bg-[#1E4468] text-white text-xs font-semibold transition"
              >
                Загрузить файл
              </button>
            </div>
          ) : viewMode === "grid" ? (
            /* GRID VIEW */
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {files.map((file) => {
                const isImg = file.mime_type?.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name);
                const isPng = file.mime_type === "image/png" || file.name.toLowerCase().endsWith(".png");
                const isSelected = selectedIds.includes(file.id);
                const slugPath = getFormattedFileUrl(file.id, file.name);

                return (
                  <div
                    key={file.id}
                    onClick={() => setPreviewFile(file)}
                    className={`group relative rounded-2xl bg-[#132A40]/40 hover:bg-[#132A40]/80 border backdrop-blur-md overflow-hidden transition-all duration-200 cursor-pointer shadow-md flex flex-col ${
                      isSelected
                        ? "border-[#E7C768] shadow-lg shadow-[#E7C768]/10 ring-2 ring-[#E7C768]/40"
                        : "border-white/10 hover:border-[#E7C768]/60"
                    }`}
                  >
                    {/* Checkbox Overlay for Multi-selection */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectFile(file.id);
                      }}
                      className={`absolute top-2 left-2 z-10 p-1.5 rounded-lg border backdrop-blur-md transition ${
                        isSelected
                          ? "bg-[#E7C768] text-[#17344F] border-[#E7C768]"
                          : "bg-black/60 hover:bg-black/80 border-white/20 text-white opacity-80 group-hover:opacity-100"
                      }`}
                      title={isSelected ? "Снять выбор" : "Выбрать файл"}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>

                    {/* Media Thumbnail with Transparent PNG Checkerboard */}
                    <div className="relative aspect-square w-full bg-black/40 overflow-hidden flex items-center justify-center">
                      {isImg ? (
                        <div
                          className={`w-full h-full p-2 flex items-center justify-center ${
                            isPng
                              ? "bg-[linear-gradient(45deg,#1e293b_25%,transparent_25%),linear-gradient(-45deg,#1e293b_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1e293b_75%),linear-gradient(-45deg,transparent_75%,#1e293b_75%)] [background-size:12px_12px]"
                              : ""
                          }`}
                        >
                          <img
                            src={file.original_url}
                            alt={file.name}
                            loading="lazy"
                            className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-1 text-slate-400">
                          {file.mime_type?.startsWith("video/") ? (
                            <Video className="w-8 h-8 text-purple-400" />
                          ) : file.mime_type?.startsWith("audio/") ? (
                            <Music className="w-8 h-8 text-amber-400" />
                          ) : (
                            <FileText className="w-8 h-8 text-sky-400" />
                          )}
                          <span className="text-[10px] font-mono">{file.mime_type?.split("/")[1] || "file"}</span>
                        </div>
                      )}

                      {/* Quick Action Overlay Buttons (Edit & Delete on each card!) */}
                      <div className="absolute top-2 right-2 flex items-center gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyFormattedUrl(file);
                          }}
                          className="p-1.5 rounded-lg bg-black/80 hover:bg-black text-white backdrop-blur-md transition shadow"
                          title="Скопировать URL /files/:id/name.png"
                        >
                          {copiedFileId === file.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingFile(file);
                          }}
                          className="p-1.5 rounded-lg bg-black/80 hover:bg-[#E7C768] hover:text-[#17344F] text-white backdrop-blur-md transition shadow"
                          title="Редактировать файл"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingFile(file);
                          }}
                          className="p-1.5 rounded-lg bg-black/80 hover:bg-rose-600 hover:text-white text-rose-300 backdrop-blur-md transition shadow"
                          title="Удалить файл"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* File Card Meta */}
                    <div className="p-3 space-y-1 flex-1 flex flex-col justify-between">
                      <p className="text-xs font-bold text-white truncate" title={file.name}>
                        {file.name}
                      </p>
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between text-[11px] text-slate-300">
                          <span className="truncate max-w-[130px] font-medium text-[#E7C768] flex items-center gap-1" title={`Загрузил: ${file.owner_id || "Система"}`}>
                            <span>👤</span> <span className="truncate">{file.owner_id || "Система"}</span>
                          </span>
                          <span className="font-mono text-[#E7C768] text-[10px]">ID: #{file.id}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span>{formatSize(file.file_size)}</span>
                          <span className="text-emerald-400 font-mono truncate max-w-[90px]" title={slugPath}>
                            {slugPath}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* LIST VIEW */
            <div className="rounded-2xl bg-[#132A40]/40 border border-white/10 backdrop-blur-md overflow-hidden divide-y divide-white/10">
              {files.map((file) => {
                const isSelected = selectedIds.includes(file.id);
                const slugPath = getFormattedFileUrl(file.id, file.name);

                return (
                  <div
                    key={file.id}
                    onClick={() => setPreviewFile(file)}
                    className={`p-3 hover:bg-white/5 transition flex items-center justify-between gap-4 cursor-pointer ${
                      isSelected ? "bg-white/10 border-l-4 border-l-[#E7C768]" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3 truncate">
                      {/* Checkbox */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectFile(file.id);
                        }}
                        className="p-1 rounded-md text-slate-300 hover:text-white"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-[#E7C768]" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-500" />
                        )}
                      </button>

                      <div className="w-9 h-9 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center shrink-0 text-[#E7C768]">
                        {file.mime_type?.startsWith("image/") ? (
                          <ImageIcon className="w-4 h-4" />
                        ) : (
                          <FileText className="w-4 h-4" />
                        )}
                      </div>

                      <div className="truncate">
                        <p className="text-xs font-bold text-white truncate">{file.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
                          <span>ID: #{file.id}</span>
                          <span>•</span>
                          <span className="text-[#E7C768]">👤 {file.owner_id || "Система"}</span>
                          <span>•</span>
                          <span className="text-emerald-400">{slugPath}</span>
                          <span>•</span>
                          <span>{formatSize(file.file_size)}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyFormattedUrl(file);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 text-xs flex items-center gap-1 transition"
                        title="Скопировать URL"
                      >
                        {copiedFileId === file.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span className="hidden sm:inline">
                          {copiedFileId === file.id ? "Скопировано" : "Копировать URL"}
                        </span>
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingFile(file);
                        }}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-[#E7C768] hover:text-[#17344F] text-slate-300 transition"
                        title="Редактировать файл"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingFile(file);
                        }}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-600 hover:text-white text-rose-400 transition"
                        title="Удалить файл"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* File Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onDelete={(file) => {
            setPreviewFile(null);
            setDeletingFile(file);
          }}
          onFileUpdated={(updated) => {
            setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
            setPreviewFile(updated);
          }}
          folders={folders}
          onMoveToFolder={handleMoveFileFromPreview}
        />
      )}

      {/* Single Edit Modal */}
      {editingFile && (
        <EditFileModal
          file={editingFile}
          folders={folders}
          onClose={() => setEditingFile(null)}
          onSave={handleSaveEditFile}
        />
      )}

      {/* Single Delete Confirm Modal */}
      {deletingFile && (
        <DeleteConfirmModal
          file={deletingFile}
          onClose={() => setDeletingFile(null)}
          onConfirm={handleConfirmDeleteFile}
        />
      )}

      {/* Bulk Move Modal */}
      {showBulkMoveModal && (
        <BulkMoveModal
          selectedCount={selectedIds.length}
          folders={folders}
          onClose={() => setShowBulkMoveModal(false)}
          onConfirm={handleConfirmBulkMove}
        />
      )}

      {/* Bulk Delete Modal */}
      {showBulkDeleteModal && (
        <BulkDeleteModal
          selectedCount={selectedIds.length}
          onClose={() => setShowBulkDeleteModal(false)}
          onConfirm={handleConfirmBulkDelete}
        />
      )}

      {/* Modal: Create Folder */}
      {showCreateFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl bg-[#132A40]/90 border border-white/15 p-6 shadow-2xl backdrop-blur-xl text-white space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="font-bold text-base flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-[#99d037]" /> Создание новой папки
              </h3>
              <button
                onClick={() => setShowCreateFolderModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateFolder} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Название папки
                </label>
                <input
                  type="text"
                  required
                  placeholder="Например: Логотипы и баннеры"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full bg-black/40 border border-white/20 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#E7C768]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Цвет иконки
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={newFolderColor}
                    onChange={(e) => setNewFolderColor(e.target.value)}
                    className="w-10 h-10 rounded-xl border border-white/20 bg-transparent cursor-pointer"
                  />
                  <span className="text-xs font-mono text-slate-300">{newFolderColor}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateFolderModal(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#E7C768] text-[#17344F] text-xs font-bold shadow hover:brightness-110"
                >
                  Создать папку
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Token Config */}
      {showTokenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-2xl bg-[#132A40]/90 border border-white/15 p-6 shadow-2xl backdrop-blur-xl text-white space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Key className="w-5 h-5 text-[#E7C768]" /> Токен загрузки файлов
              </h3>
              <button onClick={() => setShowTokenModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p>
                Токен используется для авторизации запросов на сервер{" "}
                <span className="font-mono text-emerald-400">file.pro-talk.ru</span>. Хранится в{" "}
                <span className="font-mono text-[#E7C768]">localStorage</span> вашего браузера.
              </p>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-200">Значение токена</label>
                <textarea
                  rows={3}
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="w-full bg-black/40 border border-white/20 rounded-xl p-3 text-xs font-mono text-white focus:outline-none focus:border-[#E7C768]"
                />
              </div>

              {tokenSavedNotice && (
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Токен успешно сохранен!
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  FileUploadService.resetToken();
                  setTokenInput(FileUploadService.getToken());
                }}
                className="text-xs text-slate-400 hover:text-rose-300 underline"
              >
                Сбросить на значение по умолчанию
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowTokenModal(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 text-slate-300 text-xs font-semibold"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleSaveToken}
                  className="px-4 py-2 rounded-xl bg-[#E7C768] text-[#17344F] text-xs font-bold shadow hover:brightness-110"
                >
                  Сохранить токен
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
