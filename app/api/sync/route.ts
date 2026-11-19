import { supabaseServer } from "@/lib/supabase-server";

// The database copy of the notes (with their folders and templates) and the error log.
// The browser saves everything locally first and sends changes here until they're stored.
// Behind the app's login like every /api route; only this server holds the secret key.

const TABLES = ["notes", "folders", "templates"] as const;
type Table = (typeof TABLES)[number];
const LABEL_COLUMN: Record<Table, "title" | "name"> = { notes: "title", folders: "name", templates: "name" };
const PAGE = 1000;

export type RemoteRow = { id: string; data: Record<string, unknown>; updated_at: number; deleted: boolean };
export type PullResponse = Record<Table, RemoteRow[]>;
export type LogRow = { key: string; tool: string; kind: string; message: string; detail: string; count: number; first: number; last: number };
export type PushBody = {
  puts?: Partial<Record<Table, (Record<string, unknown> & { id: string; updatedAt: number })[]>>;
  deletes?: { table: Table; id: string; at: number }[];
  log?: LogRow[];
  /** Delete database log entries last seen at or before this time (the log was cleared). */
  clearLogBefore?: number;
};

type DbError = { code?: string; message: string } | null;

/** A readable answer for a database error; a missing table means schema.sql hasn't been run. */
function failure(error: NonNullable<DbError>) {
  if (error.code === "PGRST205" || error.code === "42P01") {
    return Response.json({ error: "The database tables don't exist yet: run supabase/schema.sql in the Supabase SQL editor.", code: "not-set-up" }, { status: 503 });
  }
  return Response.json({ error: `Database error: ${error.message}` }, { status: 502 });
}

const notConfigured = () =>
  Response.json({ error: "Supabase isn't configured (SUPABASE_URL / SUPABASE_SECRET_KEY in .env.local).", code: "not-set-up" }, { status: 503 });

/** Everything in the database, deleted records included (so other browsers learn about deletes). */
export async function GET() {
  const db = supabaseServer();
  if (!db) return notConfigured();
  const out = {} as PullResponse;
  for (const table of TABLES) {
    out[table] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db.from(table).select("id, data, updated_at, deleted").order("id").range(from, from + PAGE - 1);
      if (error) return failure(error);
      out[table].push(...(data as RemoteRow[]));
      if (data.length < PAGE) break;
    }
  }
  return Response.json(out, { headers: { "cache-control": "no-store" } });
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isTable = (v: unknown): v is Table => TABLES.includes(v as Table);

/** Saves changed records, deletes, and error log entries. */
export async function POST(request: Request) {
  const db = supabaseServer();
  if (!db) return notConfigured();
  let body: PushBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const now = new Date().toISOString();

  for (const table of TABLES) {
    const records = (body.puts?.[table] ?? []).filter((r) => isObj(r) && typeof r.id === "string" && typeof r.updatedAt === "number");
    if (!records.length) continue;
    const rows = records.map((r) => ({
      id: r.id,
      [LABEL_COLUMN[table]]: String(r[LABEL_COLUMN[table]] ?? ""),
      data: r,
      updated_at: r.updatedAt,
      deleted: false,
      synced_at: now,
    }));
    const { error } = await db.from(table).upsert(rows, { onConflict: "id" });
    if (error) return failure(error);
  }

  const deletes = (body.deletes ?? []).filter((d) => isObj(d) && isTable(d.table) && typeof d.id === "string");
  for (const table of TABLES) {
    const mine = deletes.filter((d) => d.table === table);
    if (!mine.length) continue;
    // Kept as a deleted marker rather than removed, so another browser deletes its copy too.
    const rows = mine.map((d) => ({ id: d.id, [LABEL_COLUMN[table]]: "", data: {}, updated_at: Number(d.at) || Date.now(), deleted: true, synced_at: now }));
    const { error } = await db.from(table).upsert(rows, { onConflict: "id" });
    if (error) return failure(error);
  }

  if (typeof body.clearLogBefore === "number") {
    const { error } = await db.from("error_log").delete().lte("last_at", new Date(body.clearLogBefore).toISOString());
    if (error) return failure(error);
  }
  const log = (body.log ?? []).filter((e) => isObj(e) && typeof e.key === "string");
  if (log.length) {
    const rows = log.map((e) => ({
      key: e.key,
      tool: String(e.tool),
      kind: String(e.kind),
      message: String(e.message),
      detail: String(e.detail ?? ""),
      count: Number(e.count) || 1,
      first_at: new Date(Number(e.first) || Date.now()).toISOString(),
      last_at: new Date(Number(e.last) || Date.now()).toISOString(),
      synced_at: now,
    }));
    const { error } = await db.from("error_log").upsert(rows, { onConflict: "key" });
    if (error) return failure(error);
  }

  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
