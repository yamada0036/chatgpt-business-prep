import JSZip from "jszip"

export async function zipFiles(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip()
  for (const [name, contents] of Object.entries(files)) {
    zip.file(name, contents)
  }
  const out = await zip.generateAsync({ type: "nodebuffer" })
  return out
}
