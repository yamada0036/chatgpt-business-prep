import type { Eligibility } from "@/lib/audit/types"

export function buildEligibility(input: {
  countryHints: string[]
  schemaTypes: string[]
}): Eligibility {
  const hints = input.countryHints.join(", ")
  const hintText = hints
    ? `Region clues on the public pages: ${hints}. These clues alone do not decide eligibility. `
    : "The public pages do not have enough region clues. "
  const agent = `Cannot tell. Business Agent is currently available only to eligible ecommerce and online service businesses in the United States, and a website is required. ${hintText}This tool will not assert that this store can or cannot publish an agent.`
  const localTypes = input.schemaTypes.filter((type) => /restaurant|localbusiness|foodestablishment/i.test(type))
  const local = localTypes.length
    ? `The public pages include ${localTypes.join(", ")} markup. Local shops and restaurants can currently claim only an existing United States listing. This tool does not claim it for you.`
    : "Local shops and restaurants can currently claim only an existing United States listing. The public pages fetched this time are not enough to tell whether this is a local shop or a restaurant."
  const market = "The official standard file upload is currently aimed at the United States market by default. The CSV from this tool does not write multi-market columns, and it does not treat a currency or a URL as a market choice."
  return { agent, local, market }
}
