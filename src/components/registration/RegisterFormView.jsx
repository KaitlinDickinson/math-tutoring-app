import { createRef } from 'react'
import SignaturePad from '../SignaturePad'
import { t, sectionColor, CHOICE_TYPES, answerText, optionLabel } from '../../lib/registration'
import { formatDate, todayISO } from '../../lib/helpers'
import './registration.css'

const UI = {
  date: { en: 'Date', af: 'Datum' },
  sign: { en: 'Sign here with your finger or mouse', af: 'Teken hier met jou vinger of muis' },
  clear: { en: 'Clear signature', af: 'Vee handtekening uit' },
  bankAccount: { en: 'Bank', af: 'Bank' },
  accountHolder: { en: 'Account holder', af: 'Rekeninghouer' },
  accountNumber: { en: 'Account number', af: 'Rekeningnommer' },
  branchCode: { en: 'Branch code', af: 'Takkode' },
  reference: { en: 'Reference', af: 'Verwysing' },
  referenceHint: { en: 'Learner first name + surname', af: 'Leerder naam + van' }
}

/** Banking details from Settings > General, as on the invoices. */
function BankDetails({ bank = {}, lang }) {
  const name = bank.businessName || bank.accountHolder
  const rows = [
    bank.bankName && [UI.bankAccount, bank.bankName],
    bank.accountHolder && bank.accountHolder !== name && [UI.accountHolder, bank.accountHolder],
    bank.accountNumber && [UI.accountNumber, bank.accountNumber],
    bank.branchCode && [UI.branchCode, bank.branchCode]
  ].filter(Boolean)
  if (!name && rows.length === 0) return null
  return (
    <div className="rf-info rf-info-lines">
      {name && <div>{name}</div>}
      {rows.map(([label, value]) => <span key={label.en} style={{ display: 'block', fontWeight: 400 }}>{t(label, lang)}: {value}</span>)}
      <span style={{ display: 'block', fontWeight: 700 }}>{t(UI.reference, lang)}: {t(UI.referenceHint, lang)}</span>
    </div>
  )
}

const INPUT_TYPES = { text: 'text', phone: 'tel', email: 'email', date: 'date', number: 'number' }

/** One signature-pad ref per signature question, kept by the page. */
export const signatureRefsFor = (form, existing = {}) => {
  const refs = { ...existing }
  ;(form?.sections || []).forEach((s) => (s.questions || []).forEach((q) => {
    if (q.type === 'signature' && !refs[q.id]) refs[q.id] = createRef()
  }))
  return refs
}

/**
 * The registration form in the Multiplying Minds design. Editable for parents
 * (answers + onChange), or `readOnly` for the PDF copy, with `signatures`
 * as image data URLs. `onlySections` limits which sections are drawn.
 * `branding` ({ logo, bank }) is the logo and banking details from
 * Settings > General.
 */
export default function RegisterFormView({
  form, branding = {}, lang, answers = {}, onChange, errors = {}, readOnly = false, print = false,
  signatureRefs = {}, signatures = {}, signedDate, onlySections, hideHeader = false
}) {
  const sections = (form.sections || []).filter((s) => !onlySections || onlySections.includes(s.id))
  return (
    <div className={`rf-sheet ${print ? 'rf-print' : ''}`}>
      {!hideHeader && (
        <>
          <div className="rf-waves left"><span /><span /><span /></div>
          <div className="rf-waves right"><span /><span /><span /></div>
          {branding.logo ? <img className="rf-logo" src={branding.logo} alt="Multiplying Minds" /> : <div className="rf-logo-text">{branding.bank?.businessName || 'Multiplying Minds'}</div>}
          <div className="rf-title">{t(form.title, lang)}</div>
          {t(form.intro, lang) && !readOnly && <p className="rf-intro">{t(form.intro, lang)}</p>}
        </>
      )}

      {sections.map((s) => {
        const c = sectionColor(s.color)
        return (
          <section key={s.id} className={`rf-section ${s.color === 'plain' ? 'plain' : ''}`} style={{ borderColor: s.color === 'plain' ? undefined : c.bg }}>
            <div className="rf-section-head" style={{ background: c.bg, color: c.ink }}>{t(s.title, lang)}</div>
            <div className="rf-section-body">
              {(s.questions || []).map((q) => (
                <Question
                  key={q.id}
                  q={q}
                  lang={lang}
                  value={answers[q.id]}
                  onChange={(v) => onChange?.(q.id, v)}
                  error={errors[q.id]}
                  readOnly={readOnly}
                  sigRef={signatureRefs[q.id]}
                  signature={signatures[q.id]}
                  signedDate={signedDate}
                  bank={branding.bank}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function Question({ q, lang, value, onChange, error, readOnly, sigRef, signature, signedDate, bank }) {
  const id = `rf-${q.id}`
  const label = t(q.label, lang)
  const help = t(q.help, lang)
  const cls = `rf-q ${q.width === 'full' || ['info', 'bank', 'signature', 'paragraph', 'checkbox', ...CHOICE_TYPES].includes(q.type) && q.width !== 'half' ? 'full' : ''} ${error ? 'has-error' : ''}`
  const req = q.required && !readOnly ? <span className="rf-req" aria-hidden="true">*</span> : null
  const errorEl = error ? <div className="rf-error" role="alert">{error}</div> : null

  if (q.type === 'bank') return <div className={cls}><BankDetails bank={bank} lang={lang} /></div>

  if (q.type === 'info') {
    const lines = t(q.text, lang).split('\n').filter((l) => l.trim())
    return (
      <div className={cls}>
        {q.ticks
          ? <ul className="rf-ticks">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
          : <div className="rf-info rf-info-lines">{lines.map((l, i) => <div key={i}>{l}</div>)}</div>}
      </div>
    )
  }

  if (q.type === 'checkbox') {
    return (
      <div className={cls}>
        <label className={`rf-option rf-check ${value ? 'checked' : ''}`}>
          <input type="checkbox" checked={!!value} disabled={readOnly} onChange={(e) => onChange(e.target.checked)} aria-invalid={!!error} />
          <span className="rf-box" aria-hidden="true">{value ? '✓' : ''}</span>
          <span>{label}{req}</span>
        </label>
        {help && <div className="rf-help">{help}</div>}
        {errorEl}
      </div>
    )
  }

  if (CHOICE_TYPES.includes(q.type)) {
    const multiple = q.type === 'multiple'
    const chosen = multiple ? (Array.isArray(value) ? value : []) : value
    const isOn = (oid) => (multiple ? chosen.includes(oid) : chosen === oid)
    const toggle = (oid) => {
      if (readOnly) return
      if (multiple) onChange(isOn(oid) ? chosen.filter((x) => x !== oid) : [...chosen, oid])
      else onChange(oid)
    }
    return (
      <div className={cls} role="group" aria-labelledby={`${id}-label`}>
        <div className="rf-q-label" id={`${id}-label`}>{label}{req}</div>
        {help && <div className="rf-help">{help}</div>}
        <div className="rf-options">
          {(q.options || []).map((o) => (
            <label key={o.id} className={`rf-option ${isOn(o.id) ? 'checked' : ''}`}>
              <input type={multiple ? 'checkbox' : 'radio'} name={id} checked={isOn(o.id)} disabled={readOnly} onChange={() => toggle(o.id)} />
              <span className="rf-box" aria-hidden="true">{isOn(o.id) ? '✓' : ''}</span>
              <span>{optionLabel(o, lang)}</span>
            </label>
          ))}
        </div>
        {errorEl}
      </div>
    )
  }

  if (q.type === 'signature') {
    const dateText = `${t(UI.date, lang)}: ${formatDate(signedDate || todayISO())}`
    return (
      <div className={cls}>
        <div className="rf-q-label">{label}{req}</div>
        {readOnly ? (
          <div className="rf-sign-row">
            {signature ? <img className="rf-sign-img" src={signature} alt={label} /> : <div className="rf-answer" style={{ flex: 1 }} />}
            <div className="rf-sign-date">{dateText}</div>
          </div>
        ) : (
          <>
            {/* Starting to sign clears a "required" message. */}
            <div className="rf-sign-row" onPointerDown={() => { if (error) onChange(undefined) }}>
              <SignaturePad ref={sigRef} placeholder={t(UI.sign, lang)} />
              <div className="rf-sign-date">{dateText}</div>
            </div>
            <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={() => sigRef?.current?.clear()}>{t(UI.clear, lang)}</button>
          </>
        )}
        {errorEl}
      </div>
    )
  }

  return (
    <div className={cls}>
      <label htmlFor={id}>{label}{req}</label>
      {help && <div className="rf-help">{help}</div>}
      {readOnly ? (
        <div className="rf-answer">{q.type === 'date' && value ? formatDate(value) : answerText(q, value, lang)}</div>
      ) : q.type === 'paragraph' ? (
        <textarea id={id} value={value || ''} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} />
      ) : (
        <input
          id={id}
          type={INPUT_TYPES[q.type] || 'text'}
          inputMode={q.type === 'phone' ? 'tel' : q.type === 'number' ? 'numeric' : undefined}
          autoComplete={q.type === 'email' ? 'email' : q.type === 'phone' ? 'tel' : undefined}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
        />
      )}
      {errorEl}
    </div>
  )
}
