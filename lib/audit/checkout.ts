import type { AuditRecord } from "@/lib/audit/types"
import { incompleteRowCount } from "@/lib/feed/finalize"
import { renderPack, packFileList } from "@/lib/pack/render"
import { zipFiles } from "@/lib/pack/zip"
import { quotePrice } from "@/lib/pricing"
import { updateAudit, writeVersionFiles } from "@/lib/store/audits"
import { zipFileName } from "@/lib/time"
import { looksLikeEmail } from "@/lib/text"

/**
 * v1 checkout is simulated. A live provider should create a hosted checkout
 * for this exact amountCents and currency, then call the paid branch only
 * from a verified webhook. Do not add a card form to this app.
 */
export async function settleOrder(
  id: string,
  action: "pay" | "fail",
  email?: string,
): Promise<AuditRecord> {
  return updateAudit(id, async (audit) => {
    if (audit.status !== "complete" && audit.status !== "partial") {
      throw new Error("体检还没完成，不能支付。")
    }
    const nextEmail = email?.trim() || audit.contactEmail
    if (action === "pay" && !looksLikeEmail(nextEmail)) {
      throw new Error("付费前需要填写联系邮箱。")
    }
    if (action === "fail") {
      return {
        ...audit,
        contactEmail: nextEmail,
        order: {
          ...audit.order,
          status: "failed",
          chargedCents: null,
          failureReason: "模拟支付失败（测试）。没有扣款，也没有生成准备包。",
        },
      }
    }
    if (audit.order.status === "delivered" || audit.order.status === "paid") return audit
    const breakdown = quotePrice(audit.feedApplicable ? audit.feedRows.length : 0)
    const paidAt = new Date()
    const withOrder: AuditRecord = {
      ...audit,
      contactEmail: nextEmail,
      order: {
        status: "paid",
        breakdown,
        chargedCents: breakdown.totalCents,
        paidAt: paidAt.toISOString(),
      },
    }
    return publishVersion(withOrder, paidAt)
  })
}

export async function publishVersion(audit: AuditRecord, when = new Date()): Promise<AuditRecord> {
  const version = (audit.versions.at(-1)?.version ?? 0) + 1
  const files = renderPack({ ...audit, versions: audit.versions }, version, when)
  const zip = await zipFiles(files)
  await writeVersionFiles(audit.id, version, files, zip)
  const names = packFileList(audit.includeAgentPack)
  return {
    ...audit,
    order: { ...audit.order, status: "delivered" },
    versions: [
      ...audit.versions,
      {
        version,
        createdAt: when.toISOString(),
        zipName: zipFileName(audit.storeUrl, when),
        files: names,
        incompleteRowCount: incompleteRowCount(audit.feedRows),
      },
    ],
  }
}
