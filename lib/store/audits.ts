import type { AuditRecord } from "@/lib/audit/types"
import { createBlobMetadata } from "@/lib/store/blob-meta"
import { createDurableRepository } from "@/lib/store/durable"
import { createFilesystemRepository } from "@/lib/store/filesystem"
import { assertAuditId } from "@/lib/store/audits-id"
import type { AuditRepository } from "@/lib/store/repository"
import { blobEnvReady, createVercelJsonBlob, createVercelObjectStore } from "@/lib/store/vercel-blob"

const filesystem = createFilesystemRepository()
let override: AuditRepository | null = null
let production: AuditRepository | null = null

export { assertAuditId }

export class StorageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StorageError"
  }
}

export function durableEnvReady(): boolean {
  return blobEnvReady()
}

function unconfiguredRepository(): AuditRepository {
  const fail = async () => {
    throw new StorageError(
      "The audit could not be saved because private Blob storage is not configured. Nothing was stored on the local disk.",
    )
  }
  return {
    kind: "filesystem",
    readAudit: async () => null,
    writeAudit: fail,
    updateAudit: fail,
    writeVersionFiles: fail,
    readVersionFile: async () => null,
    rememberCapture: fail,
    auditIdForCapture: async () => null,
    claimTrialSlot: fail,
    releaseTrialSlot: fail,
  }
}

export function activeRepository(): AuditRepository {
  if (override) return override
  if (blobEnvReady()) {
    production ??= createDurableRepository({
      metadata: createBlobMetadata(createVercelJsonBlob()),
      objects: createVercelObjectStore(),
    })
    return production
  }
  if (process.env.VERCEL) return unconfiguredRepository()
  return filesystem
}

export function setAuditStoreForTests(store: AuditRepository | null): void {
  override = store
  production = null
}

export function paidStorageBlocker(): string | null {
  if (activeRepository().kind === "durable") return null
  if (process.env.VERCEL) {
    return "Paid checkout cannot start because BLOB_READ_WRITE_TOKEN is not set for this deployment. No PayPal order was created."
  }
  return "Paid checkout cannot start because packs are still stored on the local filesystem (PREP_DATA_DIR). That disk is wiped on a Vercel deploy. Set BLOB_READ_WRITE_TOKEN for a private Vercel Blob store. No PayPal order was created."
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

export async function claimTrialSlot(slotId: string, auditId: string): Promise<"owned" | "conflict"> {
  return activeRepository().claimTrialSlot(slotId, auditId)
}

export async function releaseTrialSlot(slotId: string, auditId: string): Promise<void> {
  return activeRepository().releaseTrialSlot(slotId, auditId)
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
