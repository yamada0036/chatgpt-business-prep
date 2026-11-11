/** PayPal Orders API wants a decimal string with two digits for USD, not integer cents. */
export function centsToPayPalValue(cents: number): string {
  if (!Number.isInteger(cents) || cents <= 0 || cents > 99_999_999) {
    throw new Error("The checkout amount is not a positive cent total.")
  }
  const whole = Math.floor(cents / 100)
  const fraction = String(cents % 100).padStart(2, "0")
  return `${whole}.${fraction}`
}

/** Accept only the canonical `49.00` form. `49`, `49.0`, and `49.000` do not match. */
export function payPalValueToCents(value: string): number | null {
  const match = /^(\d+)\.(\d{2})$/.exec(value)
  if (!match) return null
  const cents = Number(match[1]) * 100 + Number(match[2])
  if (!Number.isSafeInteger(cents)) return null
  return cents
}
