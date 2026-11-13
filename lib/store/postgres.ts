import type { AuditRecord } from "@/lib/audit/types"
import { assertTrialSlotId, type MetadataStore } from "@/lib/store/repository"

type SqlRunner = {
  query<T extends Record<string, unknown>>(text: string, values?: unknown[]): Promise<T[]>
}

const CAPTURE_ID = /^[A-Za-z0-9]+$/

function asRecord(payload: unknown): AuditRecord {
  if (typeof payload === "string") return JSON.parse(payload) as AuditRecord
  return payload as AuditRecord
}

export function createPostgresMetadata(runner: SqlRunner): MetadataStore {
  let ready: Promise<void> | null = null

  async function prepare(): Promise<void> {
    if (!ready) {
      ready = (async () => {
        await runner.query(`CREATE TABLE IF NOT EXISTS prep_audits (
          id TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          generation INTEGER NOT NULL DEFAULT 0,
          expires_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`)
        await runner.query(`CREATE TABLE IF NOT EXISTS prep_paypal_captures (
          capture_id TEXT PRIMARY KEY,
          audit_id TEXT NOT NULL
        )`)
        await runner.query(`CREATE TABLE IF NOT EXISTS prep_trial_slots (
          slot_id TEXT PRIMARY KEY,
          audit_id TEXT NOT NULL
        )`)
      })().catch((error: unknown) => {
        ready = null
        throw error
      })
    }
    await ready
  }

  return {
    prepare,
    async get(id) {
      await prepare()
      const rows = await runner.query<{ payload: unknown; generation: number }>(
        "SELECT payload, generation FROM prep_audits WHERE id = $1",
        [id],
      )
      const row = rows[0]
      if (!row) return null
      return { record: asRecord(row.payload), generation: String(row.generation) }
    },
    async upsert(record) {
      await prepare()
      await runner.query(
        `INSERT INTO prep_audits (id, payload, generation, expires_at)
         VALUES ($1, $2::jsonb, 0, $3::timestamptz)
         ON CONFLICT (id) DO UPDATE
         SET payload = EXCLUDED.payload,
             generation = prep_audits.generation + 1,
             expires_at = EXCLUDED.expires_at,
             updated_at = NOW()`,
        [record.id, JSON.stringify(record), record.expiresAt],
      )
    },
    async compareAndSwap(id, record, expectedGeneration) {
      await prepare()
      const rows = await runner.query<{ generation: number }>(
        `UPDATE prep_audits
         SET payload = $1::jsonb,
             generation = generation + 1,
             expires_at = $2::timestamptz,
             updated_at = NOW()
         WHERE id = $3 AND generation = $4
         RETURNING generation`,
        [JSON.stringify(record), record.expiresAt, id, Number(expectedGeneration)],
      )
      return rows.length > 0
    },
    async expiredIds(nowIso) {
      await prepare()
      const rows = await runner.query<{ id: string }>(
        "SELECT id FROM prep_audits WHERE expires_at <= $1::timestamptz",
        [nowIso],
      )
      return rows.map((row) => row.id)
    },
    async remove(ids) {
      if (ids.length === 0) return
      await prepare()
      for (const id of ids) {
        await runner.query("DELETE FROM prep_audits WHERE id = $1", [id])
        await runner.query("DELETE FROM prep_paypal_captures WHERE audit_id = $1", [id])
      }
    },
    async rememberCapture(captureId, auditId) {
      if (!CAPTURE_ID.test(captureId)) return
      await prepare()
      await runner.query(
        `INSERT INTO prep_paypal_captures (capture_id, audit_id)
         VALUES ($1, $2)
         ON CONFLICT (capture_id) DO UPDATE SET audit_id = EXCLUDED.audit_id`,
        [captureId, auditId],
      )
    },
    async auditIdForCapture(captureId) {
      if (!CAPTURE_ID.test(captureId)) return null
      await prepare()
      const rows = await runner.query<{ audit_id: string }>(
        "SELECT audit_id FROM prep_paypal_captures WHERE capture_id = $1",
        [captureId],
      )
      return rows[0]?.audit_id ?? null
    },
    async claimSlot(slotId, auditId) {
      const id = assertTrialSlotId(slotId)
      await prepare()
      const inserted = await runner.query<{ audit_id: string }>(
        `INSERT INTO prep_trial_slots (slot_id, audit_id)
         VALUES ($1, $2)
         ON CONFLICT (slot_id) DO NOTHING
         RETURNING audit_id`,
        [id, auditId],
      )
      if (inserted[0]?.audit_id === auditId) return "owned"
      const current = await runner.query<{ audit_id: string }>(
        "SELECT audit_id FROM prep_trial_slots WHERE slot_id = $1",
        [id],
      )
      return current[0]?.audit_id === auditId ? "owned" : "conflict"
    },
    async releaseSlot(slotId, auditId) {
      const id = assertTrialSlotId(slotId)
      await prepare()
      await runner.query("DELETE FROM prep_trial_slots WHERE slot_id = $1 AND audit_id = $2", [id, auditId])
    },
  }
}

let neonRunner: { url: string; runner: SqlRunner } | null = null

export function databaseUrl(): string {
  return process.env.DATABASE_URL?.trim() ?? ""
}

async function neonMetadataRunner(): Promise<SqlRunner> {
  const url = databaseUrl()
  if (!url) throw new Error("DATABASE_URL is not set.")
  if (neonRunner?.url === url) return neonRunner.runner
  const { neon } = await import("@neondatabase/serverless")
  const sql = neon(url)
  const runner: SqlRunner = {
    async query<T extends Record<string, unknown>>(text: string, values: unknown[] = []) {
      const rows = await sql.query(text, values)
      return rows as T[]
    },
  }
  neonRunner = { url, runner }
  return runner
}

export async function createNeonMetadata(): Promise<MetadataStore> {
  return createPostgresMetadata(await neonMetadataRunner())
}

export function createLazyNeonMetadata(): MetadataStore {
  let pending: Promise<MetadataStore> | null = null
  const load = () => {
    pending ??= createNeonMetadata()
    return pending
  }
  return {
    prepare: async () => (await load()).prepare(),
    get: async (id) => (await load()).get(id),
    upsert: async (record) => (await load()).upsert(record),
    compareAndSwap: async (id, record, expected) => (await load()).compareAndSwap(id, record, expected),
    expiredIds: async (nowIso) => (await load()).expiredIds(nowIso),
    remove: async (ids) => (await load()).remove(ids),
    rememberCapture: async (captureId, auditId) => (await load()).rememberCapture(captureId, auditId),
    auditIdForCapture: async (captureId) => (await load()).auditIdForCapture(captureId),
    claimSlot: async (slotId, auditId) => (await load()).claimSlot(slotId, auditId),
    releaseSlot: async (slotId, auditId) => (await load()).releaseSlot(slotId, auditId),
  }
}
