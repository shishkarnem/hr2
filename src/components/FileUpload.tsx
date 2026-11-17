import React, { useRef, useId } from "react";
import { useFileUpload } from "../hooks/useFileUpload";
import { Paperclip, Loader2 } from "lucide-react";

interface FileUploadProps {
  onUploaded: (key: string, url: string) => void;
  accept?: string;
  multiple?: boolean;
  className?: string;
  label?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onUploaded,
  accept = "image/*,.pdf,.doc,.docx,.txt",
  multiple = false,
  className = "",
  label,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const { upload, uploading, error } = useFileUpload();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      try {
        const { key, url } = await upload(file);
        onUploaded(key, url);
      } catch (err) {
        console.error("Upload failed:", err);
      }
    }

    // Reset input
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <div className={`inline-block ${className}`}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileChange}
        disabled={uploading}
        style={{ display: "none" }}
        id={inputId}
      />
      <label
        htmlFor={inputId}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 hover:text-indigo-200 text-xs font-medium cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {uploading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Загрузка...</span>
          </>
        ) : (
          <>
            <Paperclip className="w-3.5 h-3.5" />
            <span>{label || "Прикрепить файл"}</span>
          </>
        )}
      </label>
      {error && (
        <div className="text-[10px] text-rose-400 mt-1 font-mono">{error}</div>
      )}
    </div>
  );
};
