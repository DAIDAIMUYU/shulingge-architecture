import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

import { resolveSafePath } from "@shulingge/vault-core";

const require = createRequire(import.meta.url);
const initSqlJs = require("sql.js") as (options?: {
  locateFile?: (file: string) => string;
}) => Promise<SqlJsStatic>;

interface SqlJsDatabase {
  run(sql: string, params?: unknown[]): SqlJsDatabase;
  exec(sql: string, params?: Record<string, unknown>): Array<{ values: unknown[][] }>;
  export(): Uint8Array;
  close(): void;
}

interface SqlJsStatic {
  Database: new (data?: Uint8Array) => SqlJsDatabase;
}

const SQL_SCHEMA = `
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  project_id TEXT NOT NULL,
  novel_id TEXT,
  path TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
CREATE INDEX IF NOT EXISTS idx_documents_project_id ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_documents_novel_id ON documents(novel_id);
`;

let sqlJsPromise: ReturnType<typeof initSqlJs> | null = null;

export async function loadDatabase(vaultRoot: string) {
  const SQL = await getSqlJs();
  const indexPath = resolveSafePath(vaultRoot, ".index/cache.sqlite");

  try {
    const bytes = await readFile(indexPath);
    const database = new SQL.Database(bytes);
    database.run(SQL_SCHEMA);
    return { database, indexPath };
  } catch {
    const database = new SQL.Database();
    database.run(SQL_SCHEMA);
    return { database, indexPath };
  }
}

export async function persistDatabase(
  database: SqlJsDatabase,
  indexPath: string,
): Promise<void> {
  await writeFile(indexPath, Buffer.from(database.export()));
}

async function getSqlJs() {
  if (!sqlJsPromise) {
    const sqlJsEntry = require.resolve("sql.js");
    const sqlJsDistDir = path.dirname(sqlJsEntry);
    sqlJsPromise = initSqlJs({
      locateFile: (file: string) => path.join(sqlJsDistDir, file),
    });
  }

  return sqlJsPromise;
}
