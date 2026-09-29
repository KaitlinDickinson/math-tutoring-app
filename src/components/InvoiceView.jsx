import { useEffect, useRef, useState } from 'react'
import InvoiceDocument from './InvoiceDocument'
import {
  fillWhatsAppMessage, whatsAppLink, whatsAppNumber, invoiceFileName, invoicePdfBlob, downloadBlob
} from '../lib/helpers'

// Phones and tablets can attach the PDF straight into WhatsApp via the share
// sheet. Computers can't pass a file to WhatsApp, so there we download the
// PDF and open the chat with the message filled in.
const canShareFiles = (file) =>
  navigator.maxTouchPoints > 0 && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })

export default function InvoiceView({ invoice, settings, onClose, onMarkPaid }) {
  const docRef = useRef(null)
  const [pdf, setPdf] = useState(null)
  const [pdfError, setPdfError] = useState(false)
  const [shareNote, setShareNote] = useState('')

  // Build the PDF as soon as the invoice opens. iPad Safari only allows the
  // share sheet straight after a tap, so it has to be ready before then.
  useEffect(() => {
    let cancelled = false
    setPdf(null)
    setPdfError(false)
    invoicePdfBlob(docRef.current)
      .then((blob) => { if (!cancelled) setPdf(blob) })
      .catch(() => { if (!cancelled) setPdfError(true) })
    return () => { cancelled = true }
  }, [invoice, settings])

  const phone = invoice.accountable?.contact
  const filename = invoiceFileName(invoice)

  const handleWhatsApp = async () => {
    const text = fillWhatsAppMessage(settings?.whatsappMessage, invoice, settings)
    const file = new File([pdf], filename, { type: 'application/pdf' })
    navigator.clipboard?.writeText(text).catch(() => {})

    if (canShareFiles(file)) {
      try {
        await navigator.share({ files: [file], text })
        setShareNote("If the message didn't come through with the PDF, it's copied: just paste it into the chat.")
      } catch (err) {
        if (err.name !== 'AbortError') setShareNote("Sharing didn't work on this device. Try Download PDF instead.")
      }
      return
    }

    downloadBlob(pdf, filename)
    window.open(whatsAppLink(phone, text), '_blank', 'noopener')
    setShareNote(
      whatsAppNumber(phone)
        ? 'The PDF has downloaded. Drag it into the WhatsApp chat that just opened, then press send.'
        : "The PDF has downloaded. There's no valid phone number on this invoice, so choose the contact in WhatsApp, then attach the PDF."
    )
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header no-print">
          <h3>Invoice — {invoice.studentName}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body print-area">
          <div ref={docRef} style={{ background: '#fff' }}>
            <InvoiceDocument invoice={invoice} settings={settings} />
          </div>
        </div>
        {(shareNote || pdfError) && (
          <div className="no-print" style={{ padding: '0 20px' }}>
            <div className={`settings-message ${pdfError ? 'error' : 'ok'}`} style={{ margin: '0 0 12px' }}>
              {pdfError ? "The PDF couldn't be created. Use Print / Save as PDF instead." : shareNote}
            </div>
          </div>
        )}
        <div className="modal-footer no-print">
          {invoice.status !== 'paid' && (
            <button className="btn btn-accent" onClick={() => onMarkPaid(invoice)}>Mark as paid</button>
          )}
          <button className="btn btn-whatsapp" onClick={handleWhatsApp} disabled={!pdf}>
            {pdf || pdfError ? 'Send on WhatsApp' : 'Preparing PDF…'}
          </button>
          <button className="btn btn-outline" onClick={() => downloadBlob(pdf, filename)} disabled={!pdf}>Download PDF</button>
          <button className="btn btn-outline" onClick={() => window.print()}>Print</button>
        </div>
      </div>
    </div>
  )
}
