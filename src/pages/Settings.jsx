import { useEffect, useState } from 'react'
import { listenSettings, saveSettings } from '../lib/db'

const BILLING_DEFAULTS = {
  businessName: '', address: '', contactEmail: '', contactPhone: '',
  bankName: '', accountHolder: '', accountNumber: '', branchCode: ''
}

export default function Settings() {
  const [rate, setRate] = useState('')
  const [billing, setBilling] = useState(BILLING_DEFAULTS)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const unsub = listenSettings((s) => {
      setRate(s.defaultHourlyRate ?? 250)
      setBilling({ ...BILLING_DEFAULTS, ...s.billing })
    })
    return unsub
  }, [])

  const setBillingField = (k, v) => setBilling((b) => ({ ...b, [k]: v }))

  const handleSave = async (e) => {
    e.preventDefault()
    await saveSettings({ defaultHourlyRate: Number(rate) || 0, billing })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <>
      <div className="content-header">
        <div>
          <h1>Settings</h1>
          <p>Defaults used across the app.</p>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 480 }}>
        <div className="panel-body">
          <form onSubmit={handleSave}>
            <div className="field">
              <label>Default hourly rate</label>
              <input type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
              <span className="field-hint">Pre-fills the rate when you register a new student. Each student's rate can still be changed individually.</span>
            </div>

            <h3 style={{ marginTop: 28, marginBottom: 4 }}>Billing details</h3>
            <p className="field-hint" style={{ marginBottom: 14 }}>Shown on every invoice, so clients know who to pay and how.</p>

            <div className="field">
              <label>Business / trading name</label>
              <input value={billing.businessName} onChange={(e) => setBillingField('businessName', e.target.value)} />
            </div>
            <div className="field">
              <label>Address</label>
              <input value={billing.address} onChange={(e) => setBillingField('address', e.target.value)} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Contact email</label>
                <input type="email" value={billing.contactEmail} onChange={(e) => setBillingField('contactEmail', e.target.value)} />
              </div>
              <div className="field">
                <label>Contact phone</label>
                <input value={billing.contactPhone} onChange={(e) => setBillingField('contactPhone', e.target.value)} />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label>Bank name</label>
                <input value={billing.bankName} onChange={(e) => setBillingField('bankName', e.target.value)} />
              </div>
              <div className="field">
                <label>Account holder</label>
                <input value={billing.accountHolder} onChange={(e) => setBillingField('accountHolder', e.target.value)} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Account number</label>
                <input value={billing.accountNumber} onChange={(e) => setBillingField('accountNumber', e.target.value)} />
              </div>
              <div className="field">
                <label>Branch code</label>
                <input value={billing.branchCode} onChange={(e) => setBillingField('branchCode', e.target.value)} />
              </div>
            </div>

            <button className="btn btn-accent" style={{ marginTop: 8 }}>{saved ? 'Saved ✓' : 'Save'}</button>
          </form>
        </div>
      </div>
    </>
  )
}
