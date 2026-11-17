import { Router } from 'express';
import { queryAllPg, queryGetPg, queryRunPg } from '../db/protalkDb';

const router = Router();

import { ID_TO_CDN_URL, PATH_TO_CDN_URL } from '../../src/lib/fileCdnMap';

// 1. Короткая ссылка проксирования: /files/:id/:filename? и /file/:id
const handleFileProxy = async (req: any, res: any) => {
  try {
    const param = String(req.params.id || '').trim();
    let file: any = null;

    if (/^\d+$/.test(param)) {
      file = await queryGetPg('SELECT * FROM file_storage WHERE id = $1', [parseInt(param, 10)]);
    } else if (param) {
      file = await queryGetPg('SELECT * FROM file_storage WHERE file_key = $1', [param]);
    }

    let targetUrl = file?.original_url || file?.url;
    if (!targetUrl) {
      const requestPath = req.originalUrl?.split('?')[0] || req.path;
      const lowerPath = requestPath.toLowerCase();
      targetUrl = PATH_TO_CDN_URL[requestPath] || PATH_TO_CDN_URL[lowerPath] || ID_TO_CDN_URL[param];
    }

    if (!targetUrl) {
      return res.status(404).send('File not found');
    }

    res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    return res.redirect(302, targetUrl);
  } catch (err) {
    console.error('File proxy error:', err);
    res.status(500).send('Internal Server Error');
  }
};

router.get('/files/:id/:filename', handleFileProxy);
router.get('/files/:id', handleFileProxy);
router.get('/file/:id', handleFileProxy);

// 2. Получение списка файлов с фильтрацией и папками
router.get('/api/admin/files', async (req, res) => {
  try {
    const { folder_id, search } = req.query;
    const pgFiles = await queryAllPg('SELECT * FROM file_storage ORDER BY id DESC');
    let files = pgFiles || [];

    if (folder_id === 'null' || folder_id === 'root') {
      files = files.filter((f) => f.folder_id === null || f.folder_id === undefined);
    } else if (folder_id) {
      files = files.filter((f) => String(f.folder_id) === String(folder_id));
    }

    if (search) {
      const q = String(search).toLowerCase();
      files = files.filter(
        (f) => (f.name && f.name.toLowerCase().includes(q)) || (f.file_key && f.file_key.toLowerCase().includes(q))
      );
    }

    res.json(files);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// 3. Регистрация нового загруженного файла (чистый PG)
router.post(['/api/admin/files/register', '/api/files/register'], async (req, res) => {
  try {
    const { name, original_url, mime_type, file_size, folder_id, description, owner_id } = req.body;

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let fileKey = '';
    for (let i = 0; i < 8; i++) fileKey += chars.charAt(Math.floor(Math.random() * chars.length));

    const parseNumericOwner = (val: any) => {
      const s = String(val || '').trim();
      const digits = /^\d+$/.test(s) ? s : s.replace(/\D/g, '');
      return digits && digits.length <= 18 ? Number(digits) : 169262990;
    };
    const numericOwnerId = parseNumericOwner(owner_id);

    const created = await queryGetPg(
      `INSERT INTO file_storage (file_key, name, original_url, url, filename, mime_type, file_size, size_bytes, folder_id, description, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *;`,
      [
        fileKey,
        name || 'Без названия',
        original_url,
        original_url,
        name || 'file.png',
        mime_type || 'image/png',
        file_size || 0,
        file_size || 0,
        folder_id ? Number(folder_id) : null,
        description || '',
        numericOwnerId,
      ]
    );

    res.json(created);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// 3b. Загрузка base64 скриншота экрана напрямую в PG ProTalk
router.post(['/api/files/upload-base64', '/api/admin/files/upload-base64'], async (req, res) => {
  try {
    const { dataUrl, base64, name, description, folder_id, owner_id } = req.body;
    const rawData = dataUrl || base64;
    if (!rawData) {
      return res.status(400).json({ error: 'dataUrl is required' });
    }

    const matches = String(rawData).match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    const mimeType = matches ? matches[1] : 'image/png';
    const base64Data = matches ? matches[2] : rawData;
    const buffer = Buffer.from(base64Data, 'base64');

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let fileKey = '';
    for (let i = 0; i < 8; i++) fileKey += chars.charAt(Math.floor(Math.random() * chars.length));

    const fileName = `${name || 'screenshot'}_${Date.now()}.png`.replace(/[^a-zA-Z0-9._-]/g, '_');
    const safeKey = fileKey.replace(/[^a-zA-Z0-9_-]/g, '');

    const rawOwnerStr = String(owner_id || '').trim();
    const ownerDigits = /^\d+$/.test(rawOwnerStr) ? rawOwnerStr : rawOwnerStr.replace(/\D/g, '');
    const numericOwnerId = ownerDigits && ownerDigits.length <= 18 ? Number(ownerDigits) : 169262990;

    const created = await queryGetPg(
      `INSERT INTO file_storage (file_key, name, original_url, url, filename, mime_type, file_size, size_bytes, folder_id, description, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *;`,
      [
        fileKey,
        name || 'Скриншот экрана',
        `/files/${safeKey}/${fileName}`,
        `/files/${safeKey}/${fileName}`,
        fileName,
        mimeType,
        buffer.length,
        buffer.length,
        folder_id ? Number(folder_id) : null,
        description || 'Скриншот интерфейса',
        numericOwnerId,
      ]
    );

    const fileId = created?.id;
    const publicUrl = fileId ? `/files/${fileId}/${fileName}` : `/files/${safeKey}/${fileName}`;

    if (fileId) {
      await queryRunPg('UPDATE file_storage SET original_url = $1, url = $1 WHERE id = $2', [publicUrl, Number(fileId)]);
    }

    res.json({
      ok: true,
      url: publicUrl,
      id: fileId,
      file_key: fileKey,
      file_size: buffer.length,
      name: fileName,
      db_record: created ? { ...created, original_url: publicUrl, url: publicUrl } : created,
    });
  } catch (err: any) {
    console.error('[upload-base64] error:', err);
    res.status(500).json({ error: err.message || 'upload_failed' });
  }
});

// 4. Обновление файла (переименование, изменение папки, описание)
router.patch('/api/admin/files/:id', async (req, res) => {
  try {
    const { name, folder_id, description } = req.body;
    const fileId = Number(req.params.id);

    if (name !== undefined) {
      await queryRunPg('UPDATE file_storage SET name = $1 WHERE id = $2', [name, fileId]);
    }
    if (folder_id !== undefined) {
      await queryRunPg('UPDATE file_storage SET folder_id = $1 WHERE id = $2', [folder_id ? Number(folder_id) : null, fileId]);
    }
    if (description !== undefined) {
      await queryRunPg('UPDATE file_storage SET description = $1 WHERE id = $2', [description || '', fileId]);
    }

    const updated = await queryGetPg('SELECT * FROM file_storage WHERE id = $1', [fileId]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// 4b. Перемещение файла в папку
router.patch('/api/admin/files/:id/move', async (req, res) => {
  try {
    const { folder_id } = req.body;
    const targetFolder = folder_id ? Number(folder_id) : null;
    await queryRunPg('UPDATE file_storage SET folder_id = $1 WHERE id = $2', [targetFolder, Number(req.params.id)]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// 4c. Замена содержимого файла на новый (с проверкой совпадения имени)
router.post('/api/admin/files/:id/replace', async (req, res) => {
  try {
    const fileId = Number(req.params.id);
    const { original_url, file_size, mime_type, name } = req.body;

    const existing: any = await queryGetPg('SELECT * FROM file_storage WHERE id = $1', [fileId]);
    if (!existing) {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    if (name && existing.name && name.trim().toLowerCase() !== existing.name.trim().toLowerCase()) {
      return res.status(400).json({ error: `Имя нового файла «${name}» должно совпадать с текущим именем «${existing.name}»` });
    }

    if (!original_url) {
      return res.status(400).json({ error: 'Не указана ссылка на новый файл' });
    }

    await queryRunPg(
      'UPDATE file_storage SET original_url = $1, url = $1, file_size = $2, size_bytes = $2, mime_type = $3 WHERE id = $4',
      [original_url, file_size || existing.file_size, mime_type || existing.mime_type, fileId]
    );

    const updated = await queryGetPg('SELECT * FROM file_storage WHERE id = $1', [fileId]);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// 5. Удаление файла из базы по ID
router.delete('/api/admin/files/:id', async (req, res) => {
  try {
    await queryRunPg('DELETE FROM file_storage WHERE id = $1', [Number(req.params.id)]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// 5b. Массовое удаление файлов по массиву ID
router.post('/api/admin/files/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Array of ids is required' });
    }
    const numIds = ids.map((id) => Number(id)).filter((n) => !Number.isNaN(n));
    const placeholders = numIds.map((_, i) => `$${i + 1}`).join(',');
    await queryRunPg(`DELETE FROM file_storage WHERE id IN (${placeholders})`, numIds);
    res.json({ success: true, count: numIds.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// 5c. Массовое перемещение файлов в папку по массиву ID
router.post('/api/admin/files/bulk-move', async (req, res) => {
  try {
    const { ids, folder_id } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Array of ids is required' });
    }
    const numIds = ids.map((id) => Number(id)).filter((n) => !Number.isNaN(n));
    const targetFolder = folder_id ? Number(folder_id) : null;
    const placeholders = numIds.map((_, i) => `$${i + 2}`).join(',');
    await queryRunPg(`UPDATE file_storage SET folder_id = $1 WHERE id IN (${placeholders})`, [targetFolder, ...numIds]);
    res.json({ success: true, count: numIds.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// 6. Управление папками (напрямую из PostgreSQL BD ProTalk)
router.get('/api/admin/file-folders', async (_req, res) => {
  try {
    const folders = await queryAllPg('SELECT * FROM file_folders ORDER BY name ASC');
    res.json(folders || []);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/admin/file-folders', async (req, res) => {
  try {
    const { name, color } = req.body;
    const safeColor = color || '#E7C768';
    const created = await queryGetPg(
      'INSERT INTO file_folders (name, color) VALUES ($1, $2) RETURNING *',
      [name, safeColor]
    );
    res.json({ success: true, folder: created });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/api/admin/file-folders/:id', async (req, res) => {
  try {
    const folderId = Number(req.params.id);
    await queryRunPg('UPDATE file_storage SET folder_id = NULL WHERE folder_id = $1', [folderId]);
    await queryRunPg('DELETE FROM file_folders WHERE id = $1', [folderId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
