import { useEffect, useState } from 'react'
import { listenSettings, saveSettings } from '../lib/db'
import UserManagement from '../components/UserManagement'
import InvoiceDocument from '../components/InvoiceDocument'

const BILLING_DEFAULTS = {
  businessName: '', address: '', contactEmail: '', contactPhone: '',
  bankName: '', accountHolder: '', accountNumber: '', branchCode: ''
}

const TABS = [
  { key: 'general', label: 'General' },
  { key: 'users', label: 'Users' }
]

// The logo is stored inside the settings document itself (Firestore docs max
// out at 1MB and Firebase Storage isn't on the free plan), so shrink it first.
const LOGO_MAX_W = 480
const LOGO_MAX_H = 200

function resizeLogo(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      // SVGs without a set size can report 0x0; fall back to the max box.
      const w = img.width || LOGO_MAX_W
      const h = img.height || LOGO_MAX_H
      const scale = Math.min(1, LOGO_MAX_W / w, LOGO_MAX_H / h)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(img.src)
      resolve(canvas.toDataURL('image/png')) // PNG keeps transparent backgrounds
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
          <p>{tab === 'general' ? 'Your business details, logo and default rate.' : 'Who can log in to the admin side.'}</p>
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
  const [savedState, setSavedState] = useState(null) // last values from the database
  const [logoError, setLogoError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    const unsub = listenSettings((s) => {
      const next = {
        rate: s.defaultHourlyRate ?? 250,
        billing: { ...BILLING_DEFAULTS, ...s.billing },
        logo: s.logo || ''
      }
      setRate(next.rate)
      setBilling(next.billing)
      setLogo(next.logo)
      setSavedState(next)
    })
    return unsub
  }, [])

  const dirty = savedState && (
    String(rate) !== String(savedState.rate) ||
    logo !== savedState.logo ||
    Object.keys(BILLING_DEFAULTS).some((k) => billing[k] !== savedState.billing[k])
  )

  const setBillingField = (k, v) => setBilling((b) => ({ ...b, [k]: v }))

  const handleLogoFile = async (file) => {
    if (!file) return
    setLogoError('')
    if (!file.type.startsWith('image/')) {
      setLogoError('Please choose an image file (PNG, JPG or SVG).')
      return
    }
    try {
      setLogo(await resizeLogo(file))
    } catch (err) {
      setLogoError(err.message)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleLogoFile(e.dataTransfer.files[0])
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    await saveSettings({ defaultHourlyRate: Number(rate) || 0, billing, logo })
    setSaving(false)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 2000)
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
          <div className="logo-row">
            <label
              className={`logo-drop ${dragging ? 'dragging' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              {logo ? (
                <>
                  <img src={logo} alt="Your logo" />
                  <span className="muted">Click or drop an image to replace</span>
                </>
              ) : (
                <>
                  <strong style={{ color: 'var(--ink)' }}>Upload your logo</strong>
                  <span>Click to choose a file, or drag one here</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => { handleLogoFile(e.target.files[0]); e.target.value = '' }}
              />
            </label>
            {logo && (
              <div className="logo-actions">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setLogo('')}>Remove logo</button>
              </div>
            )}
            {logoError && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>{logoError}</p>}
          </div>
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

        <div className="settings-savebar">
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
    studentName: 'Sam Example',
    accountable: { name: 'Alex', surname: 'Example', email: 'alex@example.com', contact: '082 123 4567' },
    lineItems,
    total: hourly * lineItems.length
  }
}
