/**
 * Сервис загрузки медиа-файлов на хостинг ProTalk с сохранением прозрачности (альфа-канал PNG)
 * и автоматической регистрацией в базе данных ProTalk (PostgreSQL).
 */

export interface ProTalkUploadResult {
  url: string;
  original_url?: string;
  original_name?: string;
  mime_type?: string;
  size?: number;
  db_record?: any;
}

export interface UploadOptions {
  folder_id?: number | null;
  custom_name?: string;
  token?: string;
  owner_id?: string;
  description?: string;
  onProgress?: (percent: number) => void;
}

const STORAGE_KEY = "protalk_upload_token";
const DEFAULT_TOKEN = "YGteXX1vXVluYlh3GHAXLVsoEzcRMC49MCcdHwESNBEMUh5fKCIfNHINdUo1AxQYaGtdWGtjUgVvAH9YAmk";
const UPLOAD_URL = "https://file.pro-talk.ru/tgf";
const FILESTORE_UP_URL = "https://filestore.pro-talk.ru/up";

export class FileUploadService {
  /**
   * Получить текущий токен ProTalk
   */
  static getToken(): string {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_TOKEN;
  }

  /**
   * Сохранить новый токен ProTalk
   */
  static setToken(token: string): void {
    localStorage.setItem(STORAGE_KEY, token.trim());
  }

  /**
   * Сбросить токен на токен по умолчанию
   */
  static resetToken(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Выполнить HTTP POST с поддержкой отслеживания прогресса загрузки
   */
  private static async sendWithProgress(
    url: string,
    formData: FormData,
    headers: Record<string, string>,
    onProgress?: (percent: number) => void
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);

      Object.entries(headers).forEach(([k, v]) => {
        xhr.setRequestHeader(k, v);
      });

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && e.total > 0) {
            const pct = Math.min(90, Math.round((e.loaded / e.total) * 90));
            onProgress(pct);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const parsed = JSON.parse(xhr.responseText);
            resolve(parsed);
          } catch {
            resolve({ url: xhr.responseText });
          }
        } else {
          reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText || "Upload error"}`));
        }
      };

      xhr.onerror = () => {
        reject(new Error("Network error during upload"));
      };

      xhr.send(formData);
    });
  }

  /**
   * Загрузка объекта File на сервер ProTalk (возвращает ProTalkUploadResult)
   */
  static async uploadFileResult(file: File, options: UploadOptions = {}): Promise<ProTalkUploadResult> {
    const token = options.token || this.getToken();
    const formData = new FormData();
    formData.append("file", file);

    const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
    const isImage = file.type?.startsWith("image/") || isPng;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "X-Upload-Token": token,
    };

    if (isPng || isImage) {
      headers["X-Preserve-Alpha"] = "true";
    }

    let responseUrl = "";
    const isLargeFile = file.size > 18 * 1024 * 1024;

    // Prioritize filestore.pro-talk.ru/up for images (alpha channel) AND large files (>18MB, Telegram Bot limit is 20MB)
    const preferFilestore = isImage || isLargeFile;
    const primaryUrl = preferFilestore ? FILESTORE_UP_URL : UPLOAD_URL;
    const secondaryUrl = preferFilestore ? UPLOAD_URL : FILESTORE_UP_URL;

    if (options.onProgress) options.onProgress(5);

    try {
      const data = await this.sendWithProgress(primaryUrl, formData, headers, options.onProgress);
      responseUrl = data?.url || data?.file_url || data?.link || "";
    } catch (err) {
      console.warn("[FileUploadService] Primary upload failed, trying secondary fallback...", err);
      if (isLargeFile && secondaryUrl === UPLOAD_URL) {
        throw new Error(
          `Не удалось загрузить крупный файл (${(file.size / 1024 / 1024).toFixed(1)} МБ) на Filestore, а Telegram-хостинг ограничен 20 МБ.`
        );
      }
      try {
        const fallbackData = await this.sendWithProgress(secondaryUrl, formData, headers, options.onProgress);
        responseUrl = fallbackData?.url || fallbackData?.file_url || fallbackData?.link || "";
      } catch (err2) {
        throw new Error(`Не удалось загрузить файл: ${err2 instanceof Error ? err2.message : String(err2)}`);
      }
    }

    if (!responseUrl) {
      throw new Error("Сервер не вернул URL созданного файла.");
    }

    if (options.onProgress) options.onProgress(95);

    // Регистрация загруженного файла в PostgreSQL BD ProTalk
    const dbRecord = await this.registerInDatabase({
      name: options.custom_name || file.name,
      original_url: responseUrl,
      mime_type: file.type || "image/png",
      file_size: file.size,
      folder_id: options.folder_id ?? null,
      owner_id: options.owner_id,
      description: options.description,
    });

    if (options.onProgress) options.onProgress(100);

    const formattedUrl = dbRecord && dbRecord.id
      ? this.getFormattedUrl(dbRecord)
      : responseUrl;

    return {
      url: formattedUrl,
      original_url: responseUrl,
      original_name: file.name,
      mime_type: file.type,
      size: file.size,
      db_record: dbRecord,
    };
  }

  /**
   * Загрузка объекта File на сервер ProTalk (состояние с прямой строкой URL для утилит)
   */
  static async uploadFromFile(file: File, options: UploadOptions = {}): Promise<string> {
    const res = await this.uploadFileResult(file, options);
    return res.url;
  }

  /**
   * Загрузка по прямой сетевой ссылке (URL)
   */
  static async uploadFromUrl(url: string, options: UploadOptions = {}): Promise<ProTalkUploadResult> {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Не удалось скачать файл по ссылке.");

    const blob = await res.blob();
    const filename = url.split("/").pop()?.split("?")[0] || "downloaded_file.png";
    const file = new File([blob], filename, { type: blob.type || "image/png" });

    return this.uploadFileResult(file, options);
  }

  /**
   * Загрузка Blob объекта
   */
  static async uploadFromBlob(blob: Blob, filename: string = "file.png", options: UploadOptions = {}): Promise<ProTalkUploadResult> {
    const file = new File([blob], filename, { type: blob.type || "image/png" });
    return this.uploadFileResult(file, options);
  }

  /**
   * Загрузка Base64 данных
   */
  static async uploadFromBase64(base64Data: string, filename: string = "image.png", options: UploadOptions = {}): Promise<ProTalkUploadResult> {
    const arr = base64Data.split(",");
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : "image/png";
    const bstr = atob(arr[1] || arr[0]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    const blob = new Blob([u8arr], { type: mime });
    return this.uploadFromBlob(blob, filename, options);
  }

  /**
   * Массовая (пакетная) загрузка массива файлов
   */
  static async uploadBatch(
    files: File[],
    options: UploadOptions = {},
    onProgress?: (completed: number, total: number, currentFile?: File) => void
  ): Promise<ProTalkUploadResult[]> {
    const results: ProTalkUploadResult[] = [];
    for (let i = 0; i < files.length; i++) {
      if (onProgress) onProgress(i, files.length, files[i]);
      try {
        const res = await this.uploadFileResult(files[i], options);
        results.push(res);
      } catch (err) {
        console.error(`Ошибка загрузки файла ${files[i].name}:`, err);
      }
    }
    if (onProgress) onProgress(files.length, files.length);
    return results;
  }

  /**
   * Регистрация записи файла в базе данных PostgreSQL BD ProTalk
   */
  private static async registerInDatabase(data: {
    name: string;
    original_url: string;
    mime_type: string;
    file_size: number;
    folder_id: number | null;
    owner_id?: string;
    description?: string;
  }) {
    try {
      const pwd = sessionStorage.getItem("sysadmin_password") || "";
      const res = await fetch("/api/admin/files/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": pwd,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn("Failed to register file in local DB:", e);
      return null;
    }
  }

  /**
   * Генератор случайных 8-символьных ключей
   */
  static generateKey(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let key = "";
    for (let i = 0; i < 8; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
    return key;
  }

  /**
   * Формирование красивого URL адреса вида /files/:id/rr-logo.png
   */
  static getFormattedUrl(file: { id: number | string; name?: string }): string {
    const slug = slugifyFilename(file.name || '');
    return `/files/${file.id}/${slug}`;
  }

  /**
   * Замена коротких прокси ссылок вида /file/:key или /files/:id на прямые URL из ProTalk
   */
  static async replaceKeysWithUrls(text: string): Promise<string> {
    const keyMatches = text.match(/\/(file|files)\/([A-Za-z0-9_-]+)/g);
    if (!keyMatches) return text;

    let updatedText = text;
    for (const match of keyMatches) {
      const keyOrId = match.split("/").pop() || "";
      try {
        const res = await fetch(`/api/admin/files?search=${keyOrId}`);
        if (res.ok) {
          const files = await res.json();
          if (files && files.length > 0 && files[0].original_url) {
            updatedText = updatedText.replaceAll(match, files[0].original_url);
          }
        }
      } catch (e) {
        console.error("Failed replacing key with url:", e);
      }
    }
    return updatedText;
  }

  // Instance methods for compatibility with getUploadService()
  addFile(id: string, url: string): void {
    // Registry no-op method for MarkdownEditor tracking
  }

  async uploadAndStore(fileInput: File | string, keyOverride?: string, options?: UploadOptions): Promise<{ url: string; key: string }> {
    let resultUrl = "";
    let fileKey = keyOverride || FileUploadService.generateKey();

    if (typeof fileInput === "string") {
      if (fileInput.startsWith("data:")) {
        const res = await FileUploadService.uploadFromBase64(fileInput, "image.png", options);
        resultUrl = res.url;
        if (res.db_record?.file_key) fileKey = res.db_record.file_key;
      } else {
        const res = await FileUploadService.uploadFromUrl(fileInput, options);
        resultUrl = res.url;
        if (res.db_record?.file_key) fileKey = res.db_record.file_key;
      }
    } else {
      const res = await FileUploadService.uploadFileResult(fileInput, options);
      resultUrl = res.url;
      if (res.db_record?.file_key) fileKey = res.db_record.file_key;
    }

    return { url: resultUrl, key: fileKey };
  }

  async uploadFileResult(file: File, options: UploadOptions = {}): Promise<ProTalkUploadResult> {
    return FileUploadService.uploadFileResult(file, options);
  }

  async uploadFromFile(file: File, options: UploadOptions = {}): Promise<string> {
    return FileUploadService.uploadFromFile(file, options);
  }

  async uploadFromBlob(blob: Blob, filename: string = "file.png", options: UploadOptions = {}): Promise<string> {
    const res = await FileUploadService.uploadFromBlob(blob, filename, options);
    return res.url;
  }

  async uploadFromUrl(url: string, options: UploadOptions = {}): Promise<string> {
    const res = await FileUploadService.uploadFromUrl(url, options);
    return res.url;
  }

  getFileUrl(fileOrKey: { id: number | string; name?: string } | string, filename?: string): string {
    if (typeof fileOrKey === "object") {
      return FileUploadService.getFormattedUrl(fileOrKey);
    }
    if (typeof fileOrKey === "number" || /^\d+$/.test(fileOrKey)) {
      return `/files/${fileOrKey}/${slugifyFilename(filename || '')}`;
    }
    return `/file/${fileOrKey}`;
  }

  async replaceKeysWithUrls(text: string): Promise<string> {
    return FileUploadService.replaceKeysWithUrls(text);
  }
}

/**
 * Транслитерация кириллицы в латиницу
 */
export function transliterate(text: string): string {
  const map: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu',
    'я': 'ya',
    'А': 'a', 'Б': 'b', 'В': 'v', 'Г': 'g', 'Д': 'd', 'Е': 'e', 'Ё': 'yo', 'Ж': 'zh',
    'З': 'z', 'И': 'i', 'Й': 'y', 'К': 'k', 'Л': 'l', 'М': 'm', 'Н': 'n', 'О': 'o',
    'П': 'p', 'Р': 'r', 'С': 's', 'Т': 't', 'У': 'u', 'Ф': 'f', 'Х': 'h', 'Ц': 'ts',
    'Ч': 'ch', 'Ш': 'sh', 'Щ': 'shch', 'Ъ': '', 'Ы': 'y', 'Ь': '', 'Э': 'e', 'Ю': 'yu',
    'Я': 'ya'
  };
  return text.split('').map(c => map[c] !== undefined ? map[c] : c).join('');
}

/**
 * Преобразование имени файла в латиницу и ЧПУ (slugify with extension)
 */
export function slugifyFilename(filename: string): string {
  if (!filename) return 'file.png';
  const lastDot = filename.lastIndexOf('.');
  let name = filename;
  let ext = '';
  if (lastDot > 0 && lastDot < filename.length - 1) {
    name = filename.substring(0, lastDot);
    ext = filename.substring(lastDot).toLowerCase();
  } else if (!filename.includes('.')) {
    ext = '.png';
  }

  const trans = transliterate(name);
  const slug = trans
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');

  return (slug || 'file') + ext;
}

/**
 * Получить URL вида /files/:id/rr-logo.png
 */
export function getFormattedFileUrl(id: number | string, filename?: string): string {
  const slug = slugifyFilename(filename || '');
  return `/files/${id}/${slug}`;
}

const serviceInstance = new FileUploadService();

export function getUploadService(): FileUploadService {
  return serviceInstance;
}
