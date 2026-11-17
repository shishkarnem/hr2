import { ID_TO_CDN_URL } from "../../src/lib/fileCdnMap";
import { queryPgRaw } from "../db/pgClient";
import { getProTalkDB } from "../db";

export async function seedFileStorage() {
  console.log("[Seed File Storage] Starting seeding of file_storage into PostgreSQL BD ProTalk...");

  // 1. Check current count in PostgreSQL
  const checkRes = await queryPgRaw("SELECT count(*) as count FROM file_storage;");
  const count = Number(checkRes.rows[0]?.count || 0);
  console.log(`[Seed File Storage] Current PostgreSQL row count: ${count}`);

  const numericIds = Object.keys(ID_TO_CDN_URL)
    .filter((k) => /^\d+$/.test(k))
    .map(Number)
    .sort((a, b) => a - b);

  if (count === 0 && numericIds.length > 0) {
    console.log(`[Seed File Storage] Seeding ${numericIds.length} base files (IDs 1..${Math.max(...numericIds)})...`);

    const valuesSql: string[] = [];
    for (const id of numericIds) {
      const url = ID_TO_CDN_URL[String(id)];
      const ext = url.split(".").pop()?.split("?")[0] || "png";
      const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : (ext === "mp4" ? "video/mp4" : (ext === "pdf" ? "application/pdf" : "image/png"));
      const fileName = `file_${id}.${ext}`;
      const name = id === 1 ? "Робот Рекрутер (Логотип)" : (id === 11 ? "Логотип РентРОП" : `Файл #${id}`);
      const fileKey = `key${id.toString().padStart(6, "0")}`;

      valuesSql.push(
        `(${id}, '${fileKey}', '${name.replace(/'/g, "''")}', '${url.replace(/'/g, "''")}', '${url.replace(/'/g, "''")}', '${fileName}', '${mime}', 1024, 169262990, NOW())`
      );
    }

    const insertSql = `
      INSERT INTO file_storage (id, file_key, name, original_url, url, filename, mime_type, file_size, owner_id, created_at)
      OVERRIDING SYSTEM VALUE
      VALUES
      ${valuesSql.join(",\n")}
      ON CONFLICT (id) DO NOTHING;
    `;

    await queryPgRaw(insertSql);
    console.log(`[Seed File Storage] Inserted base files into PostgreSQL file_storage.`);
  }

  // 2. Adjust sequence in PostgreSQL to start after existing IDs (at least 154)
  try {
    const maxRes = await queryPgRaw("SELECT COALESCE(MAX(id), 153) as max_id FROM file_storage;");
    const maxId = Number(maxRes.rows[0]?.max_id || 153);
    const nextSeq = Math.max(maxId + 1, 154);
    await queryPgRaw(`ALTER TABLE file_storage ALTER COLUMN id RESTART WITH ${nextSeq};`);
    console.log(`[Seed File Storage] PostgreSQL sequence for file_storage restart set to ${nextSeq}.`);
  } catch (seqErr: any) {
    console.warn("[Seed File Storage] Sequence update notice:", seqErr.message);
  }

  // Sequences updated directly in PostgreSQL ProTalk BD
}

// Auto-run if executed directly
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes("seedFileStorage")) {
  seedFileStorage()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
