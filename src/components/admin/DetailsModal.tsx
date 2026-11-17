import React, { useState, useEffect, useRef } from "react";
import { X, Save, Trash2, Loader2 } from "lucide-react";
import { dbClient } from "@/lib/dbClient";
import { ConfirmRecordChangeModal, FieldChangeItem } from "./ConfirmRecordChangeModal";

interface DetailsModalProps {
  open?: boolean;
  onClose: () => void;
  title: string;
  table?: string;
  idField?: string;
  data: Record<string, any> | null;
  labels?: Record<string, string>;
  omitKeys?: string[];
  editable?: boolean;
  onSaved?: (updatedRow?: any) => void;
  onDelete?: () => void;
  extra?: React.ReactNode;
}

const READONLY_KEYS = new Set([
  "id", "created_at", "updated_at", "last_active_at", "calculated_at",
  "ai_analysis", "ai_score", "ai_feedback", "ai_decision", "ai_match_score",
  "match_score", "summary", "parsed_data", "raw_data", "details"
]);

const OMIT = new Set(["avatar_url", "photo_url"]);

export function DetailsModal({
  open = true,
  onClose,
  title,
  table,
  idField = "id",
  data,
  labels,
  omitKeys,
  editable = true,
  onSaved,
  onDelete,
  extra,
}: DetailsModalProps) {
  const [form, setForm] = useState<Record<string, any>>({});
  const [currentData, setCurrentData] = useState<Record<string, any> | null>(data);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pendingChanges, setPendingChanges] = useState<FieldChangeItem[] | null>(null);
  const [preparedPatch, setPreparedPatch] = useState<Record<string, any> | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const lastIdRef = useRef<string | null>(null);
  const activeId = data ? String((data as any)[idField] ?? data?.id ?? "") : null;

  const omitSet = React.useMemo(() => {
    const s = new Set(OMIT);
    (omitKeys || []).forEach((k) => s.add(k));
    return s;
  }, [omitKeys]);

  useEffect(() => {
    if (data) {
      if (activeId !== lastIdRef.current || !isDirty) {
        lastIdRef.current = activeId;
        setCurrentData(data);
        setForm({ ...data });
        setErrors({});
        setMsg(null);
        setIsDirty(false);
      }
    }
  }, [data, activeId, open]);

  if (!open || !data) return null;

  const setField = (k: string, v: any) => {
    setIsDirty(true);
    setForm((s) => ({ ...s, [k]: v }));
    setErrors((s) => {
      const copy = { ...s };
      delete copy[k];
      return copy;
    });
  };

  const handleDelete = async () => {
    if (onDelete) {
      onDelete();
      return;
    }
    if (!table) return;
    if (!confirm(`Удалить запись из таблицы "${table}"? Это действие необратимо.`)) return;
    setDeleting(true);
    setMsg(null);
    const sourceData = currentData || data;
    const idVal = (sourceData as any)[idField] ?? sourceData.id;
    try {
      const res = await fetch(`/api/admin/tables/${encodeURIComponent(table)}/${encodeURIComponent(idVal)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const { error } = await (dbClient as any).from(table).delete().eq(idField, idVal);
        if (error) {
          setDeleting(false);
          setMsg({ kind: "err", text: "Ошибка при удалении: " + error.message });
          return;
        }
      }
      setDeleting(false);
      onSaved?.(null);
      onClose();
    } catch (err: any) {
      setDeleting(false);
      setMsg({ kind: "err", text: "Ошибка при удалении: " + (err.message || String(err)) });
    }
  };

  const labelOf = (k: string) => (labels && labels[k]) || k;

  const handleInitiateSave = () => {
    if (!table) return;
    setMsg(null);
    const patch: Record<string, any> = {};
    const newErrors: Record<string, string> = {};
    const omitSet = new Set(OMIT);
    (omitKeys || []).forEach((k) => omitSet.add(k));

    const sourceData = currentData || data || {};
    const calculatedChanges: FieldChangeItem[] = [];

    for (const [k, v] of Object.entries(form)) {
      if (READONLY_KEYS.has(k)) continue;
      if (omitSet.has(k)) continue;
      const original = (sourceData as any)[k];
      let parsedValue: any = v;

      // Object/array → parse JSON
      if (original !== null && typeof original === "object") {
        const txt = String(v ?? "").trim();
        if (!txt) {
          parsedValue = null;
        } else {
          try {
            parsedValue = JSON.parse(txt);
          } catch {
            newErrors[k] = "Невалидный JSON";
            continue;
          }
        }
      } else if (typeof original === "boolean") {
        parsedValue = Boolean(v);
      } else if (typeof original === "number") {
        if (v === "" || v === null) {
          parsedValue = null;
        } else {
          const n = Number(v);
          if (Number.isNaN(n)) {
            newErrors[k] = "Не число";
            continue;
          }
          parsedValue = n;
        }
      } else {
        parsedValue = v === "" ? null : v;
      }

      const isBlank = (val: any) =>
        val === null ||
        val === undefined ||
        (typeof val === "string" && val.trim() === "");

      const isBothBlank = isBlank(original) && isBlank(parsedValue);

      let sameAsOrig = false;
      if (isBothBlank) {
        sameAsOrig = true;
      } else if (typeof original === "object" && original !== null && typeof parsedValue === "object" && parsedValue !== null) {
        sameAsOrig = JSON.stringify(original) === JSON.stringify(parsedValue);
      } else if (typeof original === "number" || typeof parsedValue === "number") {
        sameAsOrig = Number(original) === Number(parsedValue);
      } else if (typeof original === "boolean" || typeof parsedValue === "boolean") {
        sameAsOrig = Boolean(original) === Boolean(parsedValue);
      } else {
        sameAsOrig = String(original ?? "").trim() === String(parsedValue ?? "").trim();
      }

      if (!sameAsOrig) {
        patch[k] = parsedValue;
        calculatedChanges.push({
          key: k,
          label: labelOf(k),
          oldValue: original,
          newValue: parsedValue,
        });
      }
    }

    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      return;
    }

    if (calculatedChanges.length === 0) {
      setMsg({ kind: "ok", text: "Нет изменений для сохранения" });
      return;
    }

    setPreparedPatch(patch);
    setPendingChanges(calculatedChanges);
  };

  const executeSave = async () => {
    if (!table || !preparedPatch) return;
    setSaving(true);
    setMsg(null);
    const sourceData = currentData || data || {};
    const idVal = (sourceData as any)[idField] ?? sourceData.id;
    let updated: any = null;

    try {
      const adminPwd = sessionStorage.getItem("sysadmin_password") || localStorage.getItem("admin_password") || "wkL35eTm";
      const empToken = localStorage.getItem("employer_auth_token") || localStorage.getItem("employer_token") || "";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-admin-password": adminPwd,
      };
      if (empToken) {
        headers["Authorization"] = `Bearer ${empToken}`;
        headers["x-employer-token"] = empToken;
      }

      const res = await fetch(`/api/admin/table/${encodeURIComponent(table)}/${encodeURIComponent(idVal)}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(preparedPatch),
      });
      const resJson = await res.json().catch(() => ({}));

      if (res.ok && resJson.success !== false) {
        updated = resJson.data || { ...sourceData, ...preparedPatch };
      } else if (resJson?.error) {
        throw new Error(resJson.error);
      } else {
        const { data: sbUpdated, error } = await (dbClient as any)
          .from(table).update(preparedPatch).eq(idField, idVal).select("*").maybeSingle();
        if (error) throw new Error(error.message);
        updated = sbUpdated || { ...sourceData, ...preparedPatch };
      }

      // Update state locally in real time and notify parent
      setCurrentData(updated);
      setForm({ ...updated });
      setIsDirty(false);
      setPendingChanges(null);
      setPreparedPatch(null);
      setSaving(false);
      setMsg({ kind: "ok", text: "Изменения успешно сохранены в базе данных" });
      onSaved?.(updated);
    } catch (e: any) {
      setSaving(false);
      setMsg({ kind: "err", text: e.message || "Ошибка сохранения в базе данных" });
    }
  };

  const entries = Object.entries(form).filter(([k]) => !omitSet.has(k));

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-transparent backdrop-blur-xl p-4 animate-fade-in" onClick={onClose}>
        <div
          className="relative max-w-4xl w-full max-h-[88vh] overflow-auto rounded-3xl border border-white/20 shadow-2xl bg-transparent backdrop-blur-3xl text-white"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-4 border-b border-white/10 bg-transparent backdrop-blur-xl">
            <h3 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent truncate">
              {title}
            </h3>
            <div className="flex items-center gap-2.5">
              {editable && (
                <>
                  <button
                    onClick={handleDelete}
                    disabled={deleting || saving}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-transparent hover:bg-white/10 text-white border border-white/20 text-sm font-bold disabled:opacity-60 transition cursor-pointer"
                  >
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Удалить
                  </button>
                  <button
                    onClick={handleInitiateSave}
                    disabled={saving || deleting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 text-[#17344F] text-sm font-bold disabled:opacity-60 transition shadow-md cursor-pointer"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Сохранить
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-white/10 text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {msg && (
            <div className="px-6 py-2.5 text-sm font-semibold border-b border-white/10 text-white bg-transparent">
              {msg.text}
            </div>
          )}

          <div className="p-6 space-y-4">
            {extra}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {entries.map(([k, v]) => {
                const sourceData = currentData || data || {};
                const original = (sourceData as any)[k];
                const isObj = original !== null && typeof original === "object";
                const isBool = typeof original === "boolean";
                const isNum = typeof original === "number";
                const isDateStr = typeof original === "string" && /^\d{4}-\d{2}-\d{2}T/.test(original);
                const readonly = !editable || READONLY_KEYS.has(k);
                const err = errors[k];
                return (
                  <div key={k} className={`rounded-2xl bg-transparent border ${err ? "border-[#E7C768]" : "border-white/15"} p-3.5 backdrop-blur-md`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-[#E7C768]" title={k}>
                        {labelOf(k)}
                      </div>
                      {readonly && <span className="text-sm text-slate-300">только чтение</span>}
                    </div>
                    {readonly ? (
                      <div className={`mt-1.5 text-sm ${isObj ? "font-mono whitespace-pre-wrap break-all" : "break-words"} text-white font-medium`}>
                        {v === "" || v == null
                          ? "—"
                          : isDateStr
                            ? new Date(String(v)).toLocaleString()
                            : isObj
                              ? String(v)
                              : String(v)}
                      </div>
                    ) : isBool ? (
                      <label className="mt-2 inline-flex items-center gap-2 text-sm text-white cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(v)}
                          onChange={(e) => setField(k, e.target.checked)}
                          className="w-4 h-4 accent-[#E7C768]"
                        />
                        {v ? "Да" : "Нет"}
                      </label>
                    ) : isObj ? (
                      <textarea
                        value={String(v ?? "")}
                        onChange={(e) => setField(k, e.target.value)}
                        rows={4}
                        className="mt-1.5 w-full bg-transparent border border-white/20 rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-[#E7C768]"
                      />
                    ) : (typeof v === "string" && v.length > 80) ? (
                      <textarea
                        value={String(v ?? "")}
                        onChange={(e) => setField(k, e.target.value)}
                        rows={3}
                        className="mt-1.5 w-full bg-transparent border border-white/20 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#E7C768]"
                      />
                    ) : (
                      <input
                        type={isNum ? "number" : "text"}
                        value={v ?? ""}
                        onChange={(e) => setField(k, isNum ? e.target.value : e.target.value)}
                        className="mt-1.5 w-full bg-transparent border border-white/20 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#E7C768]"
                      />
                    )}
                    {err && <div className="mt-1 text-sm text-[#E7C768] font-medium">{err}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation modal before saving changes */}
      {pendingChanges && (
        <ConfirmRecordChangeModal
          open={Boolean(pendingChanges)}
          onClose={() => {
            setPendingChanges(null);
            setPreparedPatch(null);
          }}
          title={`Подтверждение изменения · ${title}`}
          recordName={String((currentData || data)?.name || (currentData || data)?.email || title)}
          changes={pendingChanges}
          onConfirm={executeSave}
          busy={saving}
        />
      )}
    </>
  );
}

export default DetailsModal;
