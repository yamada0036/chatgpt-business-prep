import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import type { AuditRecord } from "@/lib/audit/types"
import { getConfig } from "@/lib/config"

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const locks = new Map<string, Promise<unknown>>()

export function assertAuditId(id: string): string {
  if (!ID_RE.test(id)) throw new Error("bad id")
  return id
}

function dirFor(id: string): string {
  return path.join(getConfig().dataDir, "audits", assertAuditId(id))
}

export async function writeAudit(audit: AuditRecord): Promise<void> {
  const dir = dirFor(audit.id)
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, "audit.json")
  const tmp = path.join(dir, "audit.json.tmp")
  await writeFile(tmp, JSON.stringify(audit), "utf8")
  await rename(tmp, file)
}

export async function readAudit(id: string): Promise<AuditRecord | null> {
  try {
    assertAuditId(id)
  } catch {
    return null
  }
  await purgeExpired()
  try {
    const raw = await readFile(path.join(dirFor(id), "audit.json"), "utf8")
    return JSON.parse(raw) as AuditRecord
  } catch {
    return null
  }
}

export async function updateAudit(
  id: string,
  mutate: (audit: AuditRecord) => AuditRecord | Promise<AuditRecord>,
): Promise<AuditRecord> {
  const previous = locks.get(id) ?? Promise.resolve()
  const run = previous.catch(() => undefined).then(async () => {
    const current = await readAudit(id)
    if (!current) throw new Error("missing")
    const next = await mutate(current)
    await writeAudit(next)
    return next
  })
  locks.set(id, run)
  return run
}

export async function writeVersionFiles(
  id: string,
  version: number,
  files: Record<string, string>,
  zip: Buffer,
): Promise<void> {
  const dir = path.join(dirFor(id), `v${version}`)
  await mkdir(dir, { recursive: true })
  await Promise.all(
    Object.entries(files).map(([name, contents]) => writeFile(path.join(dir, name), contents, "utf8")),
  )
  await writeFile(path.join(dir, "pack.zip"), zip)
}

export async function readVersionFile(id: string, version: number, name: string): Promise<Buffer | null> {
  if (!Number.isInteger(version) || version < 1) return null
  if (name !== "pack.zip" && !/^0[0-4]-[a-z0-9.-]+$/.test(name)) return null
  try {
    return await readFile(path.join(dirFor(id), `v${version}`, name))
  } catch {
    return null
  }
}

async function purgeExpired(): Promise<void> {
  const root = path.join(getConfig().dataDir, "audits")
  let entries: string[] = []
  try {
    entries = await readdir(root)
  } catch {
    return
  }
  const now = Date.now()
  await Promise.all(
    entries.map(async (entry) => {
      if (!ID_RE.test(entry)) return
      try {
        const raw = await readFile(path.join(root, entry, "audit.json"), "utf8")
        const audit = JSON.parse(raw) as AuditRecord
        if (Date.parse(audit.expiresAt) <= now) await rm(path.join(root, entry), { recursive: true, force: true })
      } catch {
        /* ignore unreadable folders */
      }
    }),
  )
}

export function logEvent(event: string, fields: Record<string, string | number | boolean | undefined>): void {
  const safe: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    if (/password|otp|passcode|cvv|pan|card|secret|ssn|证件/i.test(key)) continue
    if (typeof value === "string" && /\b(?:\d[ -]*?){13,19}\b/.test(value)) continue
    safe[key] = value
  }
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...safe }))
}
