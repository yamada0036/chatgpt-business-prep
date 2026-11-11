export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let i = 0
  let quoted = false
  while (i < source.length) {
    const char = source[i]
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        quoted = false
        i += 1
        continue
      }
      cell += char
      i += 1
      continue
    }
    if (char === '"') {
      quoted = true
      i += 1
      continue
    }
    if (char === ",") {
      row.push(cell)
      cell = ""
      i += 1
      continue
    }
    if (char === "\n") {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
      i += 1
      continue
    }
    cell += char
    i += 1
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((entry) => entry.some((value) => value.trim() !== ""))
}

export function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((row) => row.map((value) => escapeCell(value ?? "")).join(","))
  return `\uFEFF${lines.join("\r\n")}\r\n`
}
