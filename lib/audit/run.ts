import type { AuditRecord } from "@/lib/audit/types"
import { composeFromSources, withQuote } from "@/lib/audit/compose"
import { crawlStore, type CrawlOptions, type CrawlResult } from "@/lib/crawl/fetch-store"
import { getConfig } from "@/lib/config"
import { autoMap } from "@/lib/feed/columns"
import { logEvent, updateAudit } from "@/lib/store/audits"

const jobs = new Map<string, Promise<void>>()

export function isAuditRunning(id: string): boolean {
  return jobs.has(id)
}

export function enqueueAudit(id: string, crawlOptions?: CrawlOptions): void {
  const job = runAudit(id, crawlOptions)
    .catch((error) => {
      const message = error instanceof Error ? error.message : "failed"
      logEvent("audit_failed", { id, message })
      return updateAudit(id, (audit) => ({
        ...audit,
        status: "error",
        error: { code: "internal", message: "体检没有完成。可以重试。" },
        steps: audit.steps.map((step) => (step.state === "active" ? { ...step, state: "failed" } : step)),
      })).then(() => undefined)
    })
    .finally(() => {
      jobs.delete(id)
    })
  jobs.set(id, job)
}

export async function runAudit(id: string, crawlOptions?: CrawlOptions): Promise<void> {
  const config = getConfig()
  await updateAudit(id, (audit) => ({
    ...audit,
    status: "running",
    error: undefined,
    steps: [
      { key: "fetch", state: "active" },
      { key: "sheet", state: "pending" },
      { key: "check", state: "pending" },
    ],
  }))
  const started = await updateAudit(id, (audit) => audit)
  logEvent("audit_fetch", { id, host: hostOf(started.storeUrl) })
  const crawl = await crawlStore(started.storeUrl, {
    maxProductPages: config.maxProductPages,
    maxInfoPages: config.maxInfoPages,
    maxVariantsPerProduct: config.maxVariantsPerProduct,
    budgetMs: config.auditBudgetMs,
    fetchTimeoutMs: config.fetchTimeoutMs,
    maxBytes: config.maxBytes,
    allowLoopback: config.allowLoopback,
    includeProducts: started.includeProductFeed,
    ...crawlOptions,
  })
  await updateAudit(id, (audit) => ({
    ...audit,
    pages: crawl.pages,
    crawl: crawl.facts,
    crawledProducts: crawl.products,
    steps: audit.steps.map((step) => (step.key === "fetch" ? { ...step, state: crawl.fatal ? "failed" : "done" } : step)),
  }))
  if (crawl.fatal) {
    await updateAudit(id, (audit) => ({
      ...audit,
      status: "error",
      error: crawl.fatal,
      profile: [],
    }))
    return
  }
  await finishFromCrawl(id, crawl)
}

export async function finishFromCrawl(id: string, crawl?: CrawlResult): Promise<void> {
  await updateAudit(id, async (audit) => {
    const source = crawl ?? crawlFromAudit(audit)
    const sheetState = audit.upload ? "done" : "done"
    if (audit.upload && !audit.upload.mapping) {
      const detected = autoMap(audit.upload.headers)
      if (detected.needsMap && !audit.upload.mapUsed) {
        return {
          ...audit,
          status: "needs_column_map",
          steps: [
            { key: "fetch", state: "done" },
            { key: "sheet", state: "active", detail: "需要你把表格列对应到官方字段名，只能映射一次。" },
            { key: "check", state: "pending" },
          ],
        }
      }
    }
    const composed = composeFromSources({
      includeProductFeed: audit.includeProductFeed,
      outputLanguage: audit.outputLanguage,
      crawl: source,
      upload: audit.upload,
    })
    const next: AuditRecord = {
      ...audit,
      ...composed,
      status: source.partial ? "partial" : "complete",
      partialReason: source.partialReason,
      steps: [
        { key: "fetch", state: "done" },
        { key: "sheet", state: sheetState, detail: audit.upload ? audit.upload.filename : "没有上传商品表" },
        { key: "check", state: "done" },
      ],
    }
    return withQuote(next)
  })
}

function crawlFromAudit(audit: AuditRecord): CrawlResult {
  return {
    pages: audit.pages,
    facts: audit.crawl ?? {
      finalUrl: audit.storeUrl,
      homeFetched: false,
      siteName: "",
      siteNameSource: "",
      description: "",
      descriptionSource: "",
      categories: [],
      categorySource: "",
      logoUrl: "",
      logoSource: "",
      coverUrl: "",
      coverSource: "",
      deliveryUrl: "",
      deliveryExcerpt: "",
      deliveryFetched: false,
      deliveryLinked: false,
      returnUrl: "",
      returnExcerpt: "",
      returnFetched: false,
      returnLinked: false,
      acceptsReturns: null,
      returnDays: null,
      websiteConflicts: [],
      countryHints: [],
      schemaTypes: [],
      currency: "",
    },
    products: audit.crawledProducts,
    sawProductLinks: audit.crawledProducts.length > 0,
    extraNotes: [],
    partial: false,
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ""
  }
}
