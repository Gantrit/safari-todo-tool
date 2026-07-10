'use client'

// Client-side PDF export for shift reports (in-app list + public form).
// jspdf is dynamically imported so it never lands in the initial bundle.

export interface PdfImage {
  name: string
  dataUrl: string // always JPEG — see blobToJpegDataUrl
}

export interface PdfReportData {
  modelName: string
  chatterName: string
  shiftDate: string // yyyy-mm-dd
  shiftLabel?: string | null
  timeRange?: string | null
  gross: number
  net: number
  currency: string
  newSubs: number
  renewSubs: number
  massMessageReplies: number
  chatEngagements: number
  massMessageNote?: string | null
  wentWell?: string | null
  wentWrong?: string | null
  subBehavior?: string | null
  images: PdfImage[]
  skippedAttachments?: number // PDFs / failed downloads that couldn't be embedded
}

/** Normalize any browser-decodable image (png/webp/gif/jpg) into a JPEG data URL,
 *  since jsPDF only embeds PNG/JPEG. Returns null for PDFs or undecodable blobs. */
export async function blobToJpegDataUrl(blob: Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    // White backdrop so transparent PNGs don't turn black in JPEG.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    return null
  }
}

export async function downloadShiftReportsPdf(reports: PdfReportData[], filename: string): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 48
  const contentW = pageW - margin * 2
  let y = margin

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage()
      y = margin
    }
  }

  const text = (value: string, size: number, opts: { bold?: boolean; color?: [number, number, number]; gap?: number } = {}) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.setTextColor(...(opts.color || [20, 20, 20]))
    const lines = doc.splitTextToSize(value, contentW) as string[]
    for (const line of lines) {
      ensureSpace(size + 4)
      doc.text(line, margin, y)
      y += size + 4
    }
    y += opts.gap ?? 0
  }

  const note = (label: string, value?: string | null) => {
    if (!value) return
    text(label, 9, { bold: true, color: [110, 110, 110] })
    text(value, 10.5, { gap: 8 })
  }

  reports.forEach((r, idx) => {
    if (idx > 0) {
      doc.addPage()
      y = margin
    }

    const dateLabel = new Date(`${r.shiftDate}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

    text('SHIFT REPORT · SAFARI STUDIOS', 9, { bold: true, color: [160, 130, 70], gap: 2 })
    text(`${r.modelName} — ${r.chatterName}`, 17, { bold: true, gap: 2 })
    text(`${dateLabel}${r.shiftLabel ? ` · ${r.shiftLabel}` : ''}${r.timeRange ? ` · ${r.timeRange}` : ''}`, 10.5, { color: [110, 110, 110], gap: 12 })

    const money = (n: number) => `${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${r.currency}`
    text(`Gross texting & tips: ${money(r.gross)}    ·    Net texting & tips: ${money(r.net)}`, 12, { bold: true, gap: 4 })
    text(`New subs: ${r.newSubs}    ·    Renew subs: ${r.renewSubs}    ·    Mass msg replies: ${r.massMessageReplies}    ·    Chat engagements: ${r.chatEngagements}`, 10.5, { gap: 14 })

    note('MASS MESSAGE', r.massMessageNote)
    note('WENT WELL', r.wentWell)
    note('WENT WRONG', r.wentWrong)
    note('SUB BEHAVIOUR', r.subBehavior)

    if (r.skippedAttachments) {
      text(`${r.skippedAttachments} attachment${r.skippedAttachments === 1 ? '' : 's'} (PDF or unavailable) not embedded — see the report in the app.`, 9, { color: [150, 150, 150], gap: 6 })
    }

    for (const img of r.images) {
      const props = doc.getImageProperties(img.dataUrl)
      const scale = Math.min(contentW / props.width, 1)
      const w = props.width * scale
      let h = props.height * scale
      // Cap a single screenshot to one page height.
      const maxH = pageH - margin * 2
      if (h > maxH) {
        const fit = maxH / h
        h = maxH
        ensureSpace(h)
        doc.addImage(img.dataUrl, 'JPEG', margin, y, w * fit, h)
      } else {
        ensureSpace(h + 8)
        doc.addImage(img.dataUrl, 'JPEG', margin, y, w, h)
      }
      y += h + 10
    }
  })

  doc.save(filename)
}
