import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { getPublicRegistrationForm, submitRegistration, getPublicBranding } from '../lib/db'
import { t, validateAnswers, siblingAnswers, studentFromAnswers, LANGS } from '../lib/registration'
import { elementPdfBlob, downloadBlob, todayISO, pdfPageSizePx } from '../lib/helpers'
import RegisterFormView, { signatureRefsFor } from '../components/registration/RegisterFormView'

const UI = {
  loading: { en: 'Loading…', af: 'Laai…' },
  notSetUp: { en: 'Registration isn’t available yet. Please contact Multiplying Minds directly.', af: 'Registrasie is nog nie beskikbaar nie. Kontak asseblief vir Multiplying Minds direk.' },
  loadError: { en: 'The form couldn’t be loaded. Check your internet connection and try again.', af: 'Die vorm kon nie gelaai word nie. Kontroleer jou internetverbinding en probeer weer.' },
  submit: { en: 'Submit registration', af: 'Dien registrasie in' },
  sending: { en: 'Sending…', af: 'Stuur…' },
  fixErrors: { en: 'Please check the questions marked in pink.', af: 'Kyk asseblief na die vrae wat in pienk gemerk is.' },
  sendError: { en: 'Your registration couldn’t be sent. Check your internet connection and try again.', af: 'Jou registrasie kon nie gestuur word nie. Kontroleer jou internetverbinding en probeer weer.' },
  thanks: { en: 'Thank you! Your registration has been sent.', af: 'Dankie! Jou registrasie is gestuur.' },
  thanksBody: { en: 'Multiplying Minds will be in touch to confirm. Please pay the registration fee using the details below.', af: 'Multiplying Minds sal in kontak wees om te bevestig. Betaal asseblief die registrasiefooi met die besonderhede hieronder.' },
  reference: { en: 'Payment reference', af: 'Betalingsverwysing' },
  pdf: { en: 'Download a copy (PDF)', af: 'Laai ’n afskrif af (PDF)' },
  pdfBusy: { en: 'Preparing PDF…', af: 'Berei PDF voor…' },
  another: { en: 'Register another learner', af: 'Registreer nog ’n leerder' },
  preview: { en: 'Preview: this is how parents see the form. Submitting is switched off.', af: 'Voorskou: so sien ouers die vorm. Indiening is afgeskakel.' }
}

const startLang = () => (typeof navigator !== 'undefined' && /^af/i.test(navigator.language || '') ? 'af' : 'en')

export default function Register() {
  const [params] = useSearchParams()
  const previewId = params.get('preview')
  const [lang, setLang] = useState(startLang)
  const [form, setForm] = useState(undefined) // undefined = loading, null = none
  const [loadError, setLoadError] = useState(false)
  // Logo and banking details from Settings > General.
  const [branding, setBranding] = useState({ logo: '', bank: {} })
  const [answers, setAnswers] = useState({})
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(null) // { answers, signatures, date }
  const [pdfBusy, setPdfBusy] = useState(false)
  const honey = useRef(null)
  const sigRefs = useRef({})
  const pdfRef = useRef(null)

  useEffect(() => {
    const load = previewId
      ? getDoc(doc(db, 'registrationForms', previewId)).then((s) => (s.exists() ? s.data() : null))
      : getPublicRegistrationForm()
    load.then(setForm).catch((err) => { console.error(err); setLoadError(true) })
    getPublicBranding().then(setBranding).catch((err) => console.error(err))
  }, [previewId])

  useEffect(() => { document.documentElement.lang = lang }, [lang])
  useEffect(() => {
    if (form?.title) document.title = t(form.title, lang)
  }, [form, lang])

  sigRefs.current = useMemo(() => (form ? signatureRefsFor(form, sigRefs.current) : {}), [form])

  const setAnswer = (qid, value) => {
    // Firestore won't store undefined, so a cleared answer is removed.
    setAnswers((a) => {
      const next = { ...a, [qid]: value }
      if (value === undefined) delete next[qid]
      return next
    })
    if (errors[qid]) setErrors((e) => { const n = { ...e }; delete n[qid]; return n })
  }

  const submit = async (e) => {
    e.preventDefault()
    if (previewId) return
    setFormError('')
    const hasSig = Object.fromEntries(Object.entries(sigRefs.current).map(([k, r]) => [k, !!r.current && !r.current.isEmpty()]))
    const errs = validateAnswers(form, answers, hasSig, lang)
    setErrors(errs)
    if (Object.keys(errs).length) {
      setFormError(t(UI.fixErrors, lang))
      const first = document.querySelector('.rf-q.has-error')
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    const signatures = Object.fromEntries(
      Object.entries(sigRefs.current).filter(([k]) => hasSig[k]).map(([k, r]) => [k, r.current.toDataURL()])
    )
    // A filled-in honeypot means a bot: pretend it worked and send nothing.
    if (honey.current?.value) { setSent({ answers, signatures, date: todayISO() }); return }
    setSending(true)
    try {
      // Older forms kept their own logo; it isn't needed on the copy.
      const { logo: _logo, ...formCopy } = form
      const cleanAnswers = Object.fromEntries(Object.entries(answers).filter(([, v]) => v !== undefined && v !== null))
      await submitRegistration({ formId: form.id, year: form.year, lang, answers: cleanAnswers, signatures, form: formCopy })
      setSent({ answers, signatures, date: todayISO() })
      window.scrollTo({ top: 0 })
    } catch (err) {
      console.error(err)
      setFormError(t(UI.sendError, lang))
    } finally {
      setSending(false)
    }
  }

  const another = () => {
    setAnswers(siblingAnswers(form, sent.answers))
    setErrors({})
    setSent(null)
    window.scrollTo({ top: 0 })
  }

  const downloadPdf = async () => {
    setPdfBusy(true)
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const blob = await elementPdfBlob(pdfRef.current, 'portrait')
      const s = studentFromAnswers(form, sent.answers)
      downloadBlob(blob, `${t(form.title, lang)} - ${s.firstName} ${s.lastName}.pdf`)
    } catch (err) {
      console.error(err)
    } finally {
      setPdfBusy(false)
    }
  }

  const langSwitch = (
    <div className="rf-topbar">
      <div className="rf-lang" role="group" aria-label="Language / Taal">
        {LANGS.map((l) => (
          <button key={l.key} type="button" className={lang === l.key ? 'active' : ''} aria-pressed={lang === l.key} onClick={() => setLang(l.key)}>{l.label}</button>
        ))}
      </div>
    </div>
  )

  if (loadError || form === null || form === undefined) {
    return (
      <div className="rf-page">
        {langSwitch}
        <div className="rf-sheet"><div className="rf-message"><p>{t(loadError ? UI.loadError : form === null ? UI.notSetUp : UI.loading, lang)}</p></div></div>
      </div>
    )
  }

  if (!form.open && !previewId) {
    return (
      <div className="rf-page">
        {langSwitch}
        <div className="rf-sheet">
          {branding.logo && <img className="rf-logo" src={branding.logo} alt="Multiplying Minds" />}
          <div className="rf-title">{t(form.title, lang)}</div>
          <div className="rf-message"><p>{t(form.closedMessage, lang)}</p></div>
        </div>
      </div>
    )
  }

  if (sent) {
    const s = studentFromAnswers(form, sent.answers)
    const thankYouSections = form.sections.filter((x) => x.showOnThankYou).map((x) => x.id)
    return (
      <div className="rf-page">
        {langSwitch}
        <div className="rf-sheet">
          {branding.logo && <img className="rf-logo" src={branding.logo} alt="Multiplying Minds" />}
          <div className="rf-message">
            <h2>{t(UI.thanks, lang)}</h2>
            <p>{t(UI.thanksBody, lang)}</p>
            {(s.firstName || s.lastName) && <div className="rf-reference">{t(UI.reference, lang)}: {s.firstName} {s.lastName}</div>}
          </div>
          {thankYouSections.length > 0 && (
            <RegisterFormView form={form} branding={branding} lang={lang} readOnly hideHeader onlySections={thankYouSections} />
          )}
          <div className="rf-thanks-buttons">
            <button type="button" className="primary" onClick={downloadPdf} disabled={pdfBusy}>{t(pdfBusy ? UI.pdfBusy : UI.pdf, lang)}</button>
            <button type="button" onClick={another}>{t(UI.another, lang)}</button>
          </div>
        </div>
        <div className="pdf-stage" aria-hidden="true">
          <div ref={pdfRef} style={{ width: pdfPageSizePx('portrait').width }}>
            <RegisterFormView form={form} branding={branding} lang={lang} answers={sent.answers} signatures={sent.signatures} signedDate={sent.date} readOnly print />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rf-page">
      {previewId && <div className="rf-preview-note">{t(UI.preview, lang)}</div>}
      {langSwitch}
      <form onSubmit={submit} noValidate>
        <RegisterFormView
          form={form}
          branding={branding}
          lang={lang}
          answers={answers}
          onChange={setAnswer}
          errors={errors}
          signatureRefs={sigRefs.current}
        />
        <div className="rf-honey" aria-hidden="true">
          <label>Website <input ref={honey} type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
        </div>
        <div className="rf-actions">
          {formError && <div className="rf-form-error" role="alert">{formError}</div>}
          <button className="rf-submit" type="submit" disabled={sending || !!previewId}>{t(sending ? UI.sending : UI.submit, lang)}</button>
        </div>
        <div className="rf-stripes" style={{ maxWidth: 860, margin: '18px auto 0' }}><span /><span /><span /></div>
      </form>
    </div>
  )
}
