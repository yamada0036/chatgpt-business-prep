export type ShanghaiParts = {
  year: string
  month: string
  day: string
  hour: string
  minute: string
}

export function shanghaiParts(date: Date): ShanghaiParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  const bag: Record<string, string> = {}
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") bag[part.type] = part.value
  }
  let hour = bag.hour ?? "00"
  if (hour === "24") hour = "00"
  return {
    year: bag.year ?? "0000",
    month: bag.month ?? "00",
    day: bag.day ?? "00",
    hour,
    minute: bag.minute ?? "00",
  }
}

export function shanghaiStamp(date: Date): string {
  const p = shanghaiParts(date)
  return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}`
}

export function shanghaiLabel(date: Date): string {
  const p = shanghaiParts(date)
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} Asia/Shanghai`
}

export function storeSlug(storeUrl: string): string {
  try {
    const host = new URL(storeUrl).hostname.replace(/^www\./i, "").toLowerCase()
    const slug = host
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
    return slug || "store"
  } catch {
    return "store"
  }
}

export function zipFileName(storeUrl: string, when: Date): string {
  return `chatgpt-business-prep_${storeSlug(storeUrl)}_${shanghaiStamp(when)}.zip`
}
