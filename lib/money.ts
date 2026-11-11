const DECIMALS: Record<string, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  AUD: 2,
  NZD: 2,
  CHF: 2,
  CNY: 2,
  HKD: 2,
  SGD: 2,
  JPY: 0,
  KRW: 0,
}

export type MoneyOk = {
  ok: true
  value: string
  currency: string
}

export type MoneyResult = MoneyOk | { ok: false; reason: string }

export function formatMoney(
  input: string,
  options?: { currency?: string; allowZero?: boolean },
): MoneyResult {
  let raw = input.trim()
  if (!raw) return { ok: false, reason: "empty" }
  if (/[eE]/.test(raw)) return { ok: false, reason: "exponent" }

  let currency = options?.currency?.toUpperCase()
  const code = raw.match(/\b([A-Za-z]{3})\b/)
  if (code) {
    currency = code[1].toUpperCase()
    raw = raw.replace(code[0], " ")
  }
  raw = raw.replace(/[$€£¥￥]/g, " ").replace(/\s+/g, "")
  if (!currency || !/^[A-Z]{3}$/.test(currency)) {
    return { ok: false, reason: "currency" }
  }

  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(raw)) {
    raw = raw.replace(/\./g, "").replace(",", ".")
  } else if (/^\d+,\d{1,2}$/.test(raw)) {
    raw = raw.replace(",", ".")
  } else if (raw.includes(",")) {
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) raw = raw.replace(/,/g, "")
    else return { ok: false, reason: "separator" }
  }

  if (!/^\d+(\.\d+)?$/.test(raw)) return { ok: false, reason: "amount" }
  const amount = Number(raw)
  if (!Number.isFinite(amount)) return { ok: false, reason: "amount" }
  if (amount < 0 || (amount === 0 && !options?.allowZero)) {
    return { ok: false, reason: "amount" }
  }

  const frac = raw.includes(".") ? raw.split(".")[1].length : 0
  const decimals = DECIMALS[currency]
  if (decimals === undefined) {
    if (frac > 2) return { ok: false, reason: "decimals" }
    return { ok: true, value: `${raw} ${currency}`, currency }
  }
  if (frac > decimals) return { ok: false, reason: "decimals" }
  const [whole, fraction = ""] = raw.split(".")
  const normalizedWhole = String(Number(whole))
  const value =
    decimals === 0
      ? `${normalizedWhole} ${currency}`
      : `${normalizedWhole}.${fraction.padEnd(decimals, "0")} ${currency}`
  return { ok: true, value, currency }
}

export function moneyCurrency(value: string): string | null {
  const match = /^(\d+)(?:\.(\d+))? ([A-Z]{3})$/.exec(value.trim())
  return match ? match[3] : null
}

export function compareMoney(a: string, b: string): number | null {
  const left = formatMoney(a)
  const right = formatMoney(b, { allowZero: true })
  if (!left.ok || !right.ok || left.currency !== right.currency) return null
  const la = Number(left.value.split(" ")[0])
  const rb = Number(right.value.split(" ")[0])
  if (la === rb) return 0
  return la < rb ? -1 : 1
}
