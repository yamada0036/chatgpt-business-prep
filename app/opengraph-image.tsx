import { ImageResponse } from "next/og"

export const alt = "Prep. Check a public store before claiming a ChatGPT business profile. Not affiliated with OpenAI or Shopify."
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f4f1ea",
          color: "#1c1915",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: "0.16em", textTransform: "uppercase" }}>Prep</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 920 }}>
          <div style={{ fontSize: 64, lineHeight: 1.1, fontWeight: 600 }}>
            Check a public store before you claim a ChatGPT business profile.
          </div>
          <div style={{ fontSize: 28, lineHeight: 1.4 }}>
            Not affiliated with OpenAI or Shopify. This tool does not claim a business and does not promise a recommendation.
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
