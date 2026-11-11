import type { AuditRecord } from "@/lib/audit/types"
import { createDurableRepository } from "@/lib/store/durable"
import { createFilesystemRepository } from "@/lib/store/filesystem"
import { createLazyNeonMetadata, databaseUrl } from "@/lib/store/postgres"
import { assertAuditId } from "@/lib/store/audits-id"
import type { AuditRepository } from "@/lib/store/repository"
import { blobEnvReady, createVercelObjectStore } from "@/lib/store/vercel-blob"

const filesystem = createFilesystemRepository()
let override: AuditRepository | null = null
let production: AuditRepository | null = null

export { assertAuditId }

export function durableEnvReady(): boolean {
  return blobEnvReady() && Boolean(databaseUrl())
}

export function activeRepository(): AuditRepository {
  if (override) return override
  if (durableEnvReady()) {
    production ??= createDurableRepository({
      metadata: createLazyNeonMetadata(),
      objects: createVercelObjectStore(),
    })
    return production
  }
  return filesystem
}

export function setAuditStoreForTests(store: AuditRepository | null): void {
  override = store
  production = null
}

export function paidStorageBlocker(): string | null {
  if (activeRepository().kind === "durable") return null
  const blob = blobEnvReady()
  const database = Boolean(databaseUrl())
  if (!blob && !database) {
    return "Paid checkout cannot start because packs are still stored on the local filesystem (PREP_DATA_DIR). That disk is wiped on a Vercel deploy. Set BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID for a private Vercel Blob store, and DATABASE_URL for order metadata. No PayPal order was created."
  }
  if (!blob) {
    return "Paid checkout cannot start because BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID is missing. Pack files would not survive a deploy. No PayPal order was created."
  }
  return "Paid checkout cannot start because DATABASE_URL is missing. Order status would not survive a deploy. No PayPal order was created."
}

export async function writeAudit(audit: AuditRecord): Promise<void> {
  await activeRepository().writeAudit(audit)
}

export async function readAudit(id: string): Promise<AuditRecord | null> {
  return activeRepository().readAudit(id)
}

export async function updateAudit(
  id: string,
  mutate: (audit: AuditRecord) => AuditRecord | Promise<AuditRecord>,
): Promise<AuditRecord> {
  return activeRepository().updateAudit(id, mutate)
}

export async function writeVersionFiles(
  id: string,
  version: number,
  files: Record<string, string>,
  zip: Buffer,
): Promise<void> {
  await activeRepository().writeVersionFiles(id, version, files, zip)
}

export async function readVersionFile(id: string, version: number, name: string): Promise<Buffer | null> {
  return activeRepository().readVersionFile(id, version, name)
}

export async function rememberCapture(captureId: string, auditId: string): Promise<void> {
  await activeRepository().rememberCapture(captureId, auditId)
}

export async function auditIdForCapture(captureId: string): Promise<string | null> {
  return activeRepository().auditIdForCapture(captureId)
}

export function logEvent(event: string, fields: Record<string, string | number | boolean | undefined>): void {
  const safe: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    if (/password|otp|passcode|cvv|pan|card|secret|ssn|webhook|sig|token|证件/i.test(key)) continue
    if (typeof value === "string" && /\b(?:\d[ -]*?){13,19}\b/.test(value)) continue
    safe[key] = value
  }
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...safe }))
}
