import { useEffect, useRef, useState } from 'react'
import { listenSettings, saveSettings } from '../lib/db'
import UserManagement from '../components/UserManagement'
import InvoiceDocument from '../components/InvoiceDocument'
import { DEFAULT_WHATSAPP_MESSAGE, WHATSAPP_PLACEHOLDERS, fillWhatsAppMessage, DEFAULT_INVOICE_THANK_YOU, formatInvoiceNumber } from '../lib/helpers'

const BILLING_DEFAULTS = {
  businessName: '', address: '', contactEmail: '', contactPhone: '',
  bankName: '', accountHolder: '', accountNumber: '', branchCode: '',
  thankYouMessage: DEFAULT_INVOICE_THANK_YOU
}

const TABS = [
  { key: 'general', label: 'General' },
  { key: 'users', label: 'Users' }
]

// Images are stored inside the settings document itself (Firestore docs max
// out at 1MB and Firebase Storage isn't on the free plan), so shrink them first.
// The logo prints at up to 360px wide and PDFs render at 2x, so keep over 2x that
// for it to stay sharp.
const LOGO_SIZE = { maxW: 900, maxH: 360 }
// The watermark prints faintly on white paper, so a white-backed JPEG keeps
// it small enough to sit in the same document as the logo.
const WATERMARK_SIZE = { maxW: 600, maxH: 600, jpeg: true }

function resizeImage(file, { maxW, maxH, jpeg }) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      // SVGs without a set size can report 0x0; fall back to the max box.
      const w = img.width || maxW
      const h = img.height || maxH
      const scale = Math.min(1, maxW / w, maxH / h)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      const ctx = canvas.getContext('2d')
      if (jpeg) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height) }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(img.src)
      // PNG keeps the logo's transparent background.
      resolve(jpeg ? canvas.toDataURL('image/jpeg', 0.85) : canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error("That image couldn't be read. Try a PNG or JPG."))
    img.src = URL.createObjectURL(file)
  })
}

export default function Settings() {
  const [tab, setTab] = useState('general')

  return (
    <div className="settings">
      <div className="content-header" style={{ marginBottom: 14 }}>
        <div>
          <h1>Settings</h1>
          <p>{tab === 'general' ? 'Your business details, logo, watermark, default rate and WhatsApp message.' : 'Who can log in to the admin side.'}</p>
        </div>
      </div>

      <div className="tab-bar" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? 'active' : ''}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' ? <GeneralSettings /> : <UserManagement />}
    </div>
  )
}

function GeneralSettings() {
  const [rate, setRate] = useState('')
  const [billing, setBilling] = useState(BILLING_DEFAULTS)
  const [logo, setLogo] = useState('')
  const [watermark, setWatermark] = useState('')
  const [whatsappMessage, setWhatsappMessage] = useState('')
  const [savedState, setSavedState] = useState(null) // last values from the database
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    const unsub = listenSettings((s) => {
      const next = {
        rate: s.defaultHourlyRate ?? 250,
        billing: { ...BILLING_DEFAULTS, ...s.billing },
        logo: s.logo || '',
        watermark: s.watermark || '',
        whatsappMessage: s.whatsappMessage || DEFAULT_WHATSAPP_MESSAGE
      }
      setRate(next.rate)
      setBilling(next.billing)
      setLogo(next.logo)
      setWatermark(next.watermark)
      setWhatsappMessage(next.whatsappMessage)
      setSavedState(next)
    })
    return unsub
  }, [])

  const dirty = savedState && (
    String(rate) !== String(savedState.rate) ||
    logo !== savedState.logo ||
    watermark !== savedState.watermark ||
    whatsappMessage !== savedState.whatsappMessage ||
    Object.keys(BILLING_DEFAULTS).some((k) => billing[k] !== savedState.billing[k])
  )

  const setBillingField = (k, v) => setBilling((b) => ({ ...b, [k]: v }))

  const messageRef = useRef(null)
  const insertPlaceholder = (key) => {
    const el = messageRef.current
    const start = el?.selectionStart ?? whatsappMessage.length
    const end = el?.selectionEnd ?? whatsappMessage.length
    setWhatsappMessage(whatsappMessage.slice(0, start) + key + whatsappMessage.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + key.length, start + key.length)
    })
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    try {
      await saveSettings({ defaultHourlyRate: Number(rate) || 0, billing, logo, watermark, whatsappMessage })
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
    } catch (err) {
      setSaveError(/size/i.test(err.message)
        ? 'The logo and watermark images are too large together. Try a smaller or simpler image.'
        : `Your changes couldn't be saved: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (!savedState) return <div className="empty-state">Loading…</div>

  return (
    <div className="settings-general">
      <form className="panel" onSubmit={handleSave}>
        <section className="settings-section">
          <div className="settings-section-intro">
            <h3>Logo</h3>
            <p>Appears at the top of every invoice. PNG with a transparent background works best.</p>
          </div>
          <ImageUpload name="logo" image={logo} onChange={setLogo} size={LOGO_SIZE} />
        </section>

        <section className="settings-section">
          <div className="settings-section-intro">
            <h3>Attendance watermark</h3>
            <p>Printed faintly behind the table on attendance registers and blank sheets. If you don't upload one, your logo is used.</p>
          </div>
          <ImageUpload name="watermark" image={watermark} onChange={setWatermark} size={WATERMARK_SIZE} />
        </section>

        <section className="settings-section">
          <div className="settings-section-intro">
            <h3>Business details</h3>
            <p>Shown in the "From" section of invoices, so clients know who the invoice is from.</p>
          </div>
          <div>
            <div className="field">
              <label htmlFor="s-name">Business / trading name</label>
              <input id="s-name" value={billing.businessName} onChange={(e) => setBillingField('businessName', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="s-address">Address</label>
              <input id="s-address" value={billing.address} onChange={(e) => setBillingField('address', e.target.value)} />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="s-email">Contact email</label>
                <input id="s-email" type="email" value={billing.contactEmail} onChange={(e) => setBillingField('contactEmail', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="s-phone">Contact phone</label>
                <input id="s-phone" value={billing.contactPhone} onChange={(e) => setBillingField('contactPhone', e.target.value)} />
              </div>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-intro">
            <h3>Banking details</h3>
            <p>Printed on unpaid invoices so clients can pay by EFT. Hidden once an invoice is marked paid.</p>
          </div>
          <div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="s-bank">Bank name</label>
                <input id="s-bank" value={billing.bankName} onChange={(e) => setBillingField('bankName', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="s-holder">Account holder</label>
                <input id="s-holder" value={billing.accountHolder} onChange={(e) => setBillingField('accountHolder', e.target.value)} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="s-acc">Account number</label>
                <input id="s-acc" value={billing.accountNumber} onChange={(e) => setBillingField('accountNumber', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="s-branch">Branch code</label>
                <input id="s-branch" value={billing.branchCode} onChange={(e) => setBillingField('branchCode', e.target.value)} />
              </div>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-intro">
            <h3>Invoice closing message</h3>
            <p>Printed at the bottom of every invoice. Leave it empty to show nothing.</p>
          </div>
          <div>
            <div className="field">
              <label htmlFor="s-thanks">Message</label>
              <textarea
                id="s-thanks"
                rows={3}
                value={billing.thankYouMessage}
                onChange={(e) => setBillingField('thankYouMessage', e.target.value)}
              />
            </div>
            <div className="placeholder-row">
              <button type="button" className="btn-link" onClick={() => setBillingField('thankYouMessage', DEFAULT_INVOICE_THANK_YOU)}>
                Reset to default
              </button>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-intro">
            <h3>Rates</h3>
            <p>Pre-fills the rate when you register a new student. Each student's rate can still be changed on their profile.</p>
          </div>
          <div>
            <div className="field" style={{ maxWidth: 220, marginBottom: 0 }}>
              <label htmlFor="s-rate">Default hourly rate</label>
              <input id="s-rate" type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-intro">
            <h3>WhatsApp message</h3>
            <p>Sent with the invoice PDF when you press "Send on WhatsApp". Click a detail below to add it where your cursor is.</p>
          </div>
          <div>
            <div className="field">
              <label htmlFor="s-whatsapp">Message</label>
              <textarea
                id="s-whatsapp"
                ref={messageRef}
                rows={6}
                value={whatsappMessage}
                onChange={(e) => setWhatsappMessage(e.target.value)}
              />
            </div>
            <div className="placeholder-row">
              {WHATSAPP_PLACEHOLDERS.map((p) => (
                <button key={p.key} type="button" className="pill" onClick={() => insertPlaceholder(p.key)}>
                  {p.label}
                </button>
              ))}
              <button type="button" className="btn-link" onClick={() => setWhatsappMessage(DEFAULT_WHATSAPP_MESSAGE)}>
                Reset to default
              </button>
            </div>
            <div className="whatsapp-preview">
              <div className="whatsapp-preview-label">How it will look</div>
              <div className="whatsapp-bubble">
                {fillWhatsAppMessage(whatsappMessage, sampleInvoice(rate), { billing })}
              </div>
            </div>
          </div>
        </section>

        <div className="settings-savebar">
          {saveError && <span style={{ color: 'var(--red)', fontSize: 13 }}>{saveError}</span>}
          {dirty && !saving && <span className="unsaved">You have unsaved changes</span>}
          <button className="btn btn-accent" disabled={saving || (!dirty && !justSaved)}>
            {saving ? 'Saving…' : justSaved ? 'Saved ✓' : 'Save changes'}
          </button>
        </div>
      </form>

      <aside className="invoice-preview" aria-label="Invoice preview">
        <div className="invoice-preview-head">
          <h3>Invoice preview</h3>
          <p>Updates as you type. The client and sessions are examples.</p>
        </div>
        <div className="invoice-preview-page">
          <InvoiceDocument invoice={sampleInvoice(rate)} settings={{ billing, logo }} />
        </div>
      </aside>
    </div>
  )
}

// Example invoice for the preview: this month, three one-hour lessons at the
// default rate, billed to a made-up parent.
function sampleInvoice(rate) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const hourly = Number(rate) || 0
  const pad = (n) => String(n).padStart(2, '0')
  const lineItems = [5, 12, 19].map((day) => ({
    date: `${year}-${pad(month + 1)}-${pad(day)}`,
    label: 'Individual session',
    durationHours: 1,
    rate: hourly,
    amount: hourly
  }))
  return {
    year,
    month,
    status: 'unpaid',
    invoiceNumber: formatInvoiceNumber(2026, 3),
    studentName: 'Sam Example',
    accountable: { name: 'Alex', surname: 'Example', email: 'alex@example.com', contact: '082 123 4567' },
    lineItems,
    total: hourly * lineItems.length
  }
}

// Click-or-drop image picker, used for the logo and the watermark.
function ImageUpload({ name, image, onChange, size }) {
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  const handleFile = async (file) => {
    if (!file) return
    setError('')
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (PNG, JPG or SVG).')
      return
    }
    try {
      onChange(await resizeImage(file, size))
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  return (
    <div className="logo-row">
      <label
        className={`logo-drop ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {image ? (
          <>
            <img src={image} alt={`Your ${name}`} />
            <span className="muted">Click or drop an image to replace</span>
          </>
        ) : (
          <>
            <strong style={{ color: 'var(--ink)' }}>Upload your {name}</strong>
            <span>Click to choose a file, or drag one here</span>
          </>
        )}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => { handleFile(e.target.files[0]); e.target.value = '' }}
        />
      </label>
      {image && (
        <div className="logo-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange('')}>Remove {name}</button>
        </div>
      )}
      {error && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>{error}</p>}
    </div>
  )
}
