import type { JsonBlob } from "@/lib/store/blob-meta"
import type { ObjectStore } from "@/lib/store/repository"

export function blobEnvReady(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim() || process.env.BLOB_STORE_ID?.trim())
}

async function blobApi() {
  return import("@vercel/blob")
}

function missingBlob(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "name" in error && error.name === "BlobNotFoundError")
}

/** Private Vercel Blob. Callers stream or buffer the bytes after their own auth check. */
export function createVercelObjectStore(): ObjectStore {
  return {
    async put(pathname, body, contentType) {
      const { put } = await blobApi()
      await put(pathname, body, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType,
        cacheControlMaxAge: 60,
      })
    },
    async get(pathname) {
      const { get } = await blobApi()
      try {
        const result = await get(pathname, { access: "private", useCache: false })
        if (!result || result.statusCode !== 200 || !result.stream) return null
        return Buffer.from(await new Response(result.stream).arrayBuffer())
      } catch (error) {
        if (missingBlob(error)) return null
        throw error
      }
    },
    async deletePrefix(prefix) {
      await deleteBlobPrefix(prefix)
    },
  }
}

async function deleteBlobPrefix(prefix: string): Promise<void> {
  const { list, del } = await blobApi()
  let cursor: string | undefined
  do {
    const page = await list({ prefix, cursor, limit: 1000 })
    if (page.blobs.length > 0) await del(page.blobs.map((blob) => blob.url))
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
}

/** Audit JSON and capture pointers in the same private Blob store as the pack files. */
export function createVercelJsonBlob(): JsonBlob {
  return {
    async read(pathname) {
      const { get, head } = await blobApi()
      let etag = ""
      try {
        etag = (await head(pathname)).etag
      } catch (error) {
        if (missingBlob(error)) return null
        throw error
      }
      try {
        const result = await get(pathname, { access: "private", useCache: false })
        if (!result || result.statusCode !== 200 || !result.stream) return null
        const text = await new Response(result.stream).text()
        return { text, etag }
      } catch (error) {
        if (missingBlob(error)) return null
        throw error
      }
    },
    async write(pathname, text, contentType, options) {
      const { put } = await blobApi()
      await put(pathname, text, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType,
        cacheControlMaxAge: 60,
        ifMatch: options?.ifMatch,
      })
    },
    removePrefix: deleteBlobPrefix,
    async list(prefix) {
      const { list } = await blobApi()
      const pathnames: string[] = []
      let cursor: string | undefined
      do {
        const page = await list({ prefix, cursor, limit: 1000 })
        pathnames.push(...page.blobs.map((blob) => blob.pathname))
        cursor = page.hasMore ? page.cursor : undefined
      } while (cursor)
      return pathnames
    },
  }
}
