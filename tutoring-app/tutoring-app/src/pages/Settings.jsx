import { useEffect, useState } from 'react'
import { listenSettings, saveSettings } from '../lib/db'

export default function Settings() {
  const [rate, setRate] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const unsub = listenSettings((s) => setRate(s.defaultHourlyRate ?? 250))
    return unsub
  }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    await saveSettings({ defaultHourlyRate: Number(rate) || 0 })
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

      <div className="panel" style={{ maxWidth: 420 }}>
        <div className="panel-body">
          <form onSubmit={handleSave}>
            <div className="field">
              <label>Default hourly rate</label>
              <input type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
              <span className="field-hint">Pre-fills the rate when you register a new student. Each student's rate can still be changed individually.</span>
            </div>
            <button className="btn btn-accent">{saved ? 'Saved ✓' : 'Save'}</button>
          </form>
        </div>
      </div>
    </>
  )
}
