import InvoiceDocument from './InvoiceDocument'

export default function InvoiceView({ invoice, settings, onClose, onMarkPaid }) {
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header no-print">
          <h3>Invoice — {invoice.studentName}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body print-area">
          <InvoiceDocument invoice={invoice} settings={settings} />
        </div>
        <div className="modal-footer no-print">
          {invoice.status !== 'paid' && (
            <button className="btn btn-accent" onClick={() => onMarkPaid(invoice)}>Mark as paid</button>
          )}
          <button className="btn btn-outline" onClick={() => window.print()}>Print / Save as PDF</button>
        </div>
      </div>
    </div>
  )
}
