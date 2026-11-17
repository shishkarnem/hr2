import { useState } from 'react';
import { getUploadService, UploadOptions } from '../services/FileUploadService';

export function useFileUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const service = getUploadService();

  const upload = async (file: File | string, key?: string, options?: UploadOptions) => {
    setUploading(true);
    setProgress(0);
    setError(null);
    try {
      const mergedOptions: UploadOptions = {
        ...options,
        onProgress: (p) => {
          setProgress(p);
          if (options?.onProgress) options.onProgress(p);
        },
      };
      const result = await service.uploadAndStore(file, key, mergedOptions);
      setProgress(100);
      return result;
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setError(msg);
      throw err;
    } finally {
      setUploading(false);
    }
  };

  const getUrl = (key: string) => service.getFileUrl(key);
  const replaceKeys = (text: string) => service.replaceKeysWithUrls(text);

  return {
    upload,
    getUrl,
    replaceKeys,
    uploading,
    progress,
    error,
    service,
  };
}
