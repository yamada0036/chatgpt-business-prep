const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function assertAuditId(id: string): string {
  if (!ID_RE.test(id)) throw new Error("bad id")
  return id
}
