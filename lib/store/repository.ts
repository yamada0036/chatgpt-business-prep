import type { AuditRecord } from "@/lib/audit/types"

export type StoredAudit = { record: AuditRecord; generation: string }

export function auditJsonPath(id: string): string {
  return `audits/${id}/audit.json`
}

export function capturePointerPath(captureId: string): string {
  return `captures/${captureId}`
}

export type MetadataStore = {
  prepare(): Promise<void>
  get(id: string): Promise<StoredAudit | null>
  upsert(record: AuditRecord): Promise<void>
  compareAndSwap(id: string, record: AuditRecord, expectedGeneration: string): Promise<boolean>
  expiredIds(nowIso: string): Promise<string[]>
  remove(ids: string[]): Promise<void>
  rememberCapture(captureId: string, auditId: string): Promise<void>
  auditIdForCapture(captureId: string): Promise<string | null>
}

export type ObjectStore = {
  put(pathname: string, body: Buffer, contentType: string): Promise<void>
  get(pathname: string): Promise<Buffer | null>
  deletePrefix(prefix: string): Promise<void>
}

export type AuditRepository = {
  kind: "filesystem" | "durable"
  readAudit(id: string): Promise<AuditRecord | null>
  writeAudit(audit: AuditRecord): Promise<void>
  updateAudit(id: string, mutate: (audit: AuditRecord) => AuditRecord | Promise<AuditRecord>): Promise<AuditRecord>
  writeVersionFiles(id: string, version: number, files: Record<string, string>, zip: Buffer): Promise<void>
  readVersionFile(id: string, version: number, name: string): Promise<Buffer | null>
  rememberCapture(captureId: string, auditId: string): Promise<void>
  auditIdForCapture(captureId: string): Promise<string | null>
}

const FILE_NAME = /^(?:pack\.zip|0[0-4]-[a-z0-9.-]+)$/

export function versionObjectPath(id: string, version: number, name: string): string {
  return `audits/${id}/v${version}/${name}`
}

export function allowedVersionFile(version: number, name: string): boolean {
  return Number.isInteger(version) && version >= 1 && FILE_NAME.test(name)
}

export function contentTypeForPackFile(name: string): string {
  if (name.endsWith(".zip")) return "application/zip"
  if (name.endsWith(".csv")) return "text/csv; charset=utf-8"
  if (name.endsWith(".md")) return "text/markdown; charset=utf-8"
  return "text/plain; charset=utf-8"
}
