import { useEffect, useMemo, useRef, useState } from 'react'
import {
  listenRegistrationForms, saveRegistrationForm, listenPublicRegistration, setActiveRegistrationForm,
  syncPublicBranding, listenPublicBranding
} from '../../lib/db'
import {
  allQuestions, missingCoreLinks, missingTranslations, copyFormForYear, newId, t, SAVES_TO, SECTION_COLORS, CORE_LINKS, sectionColor, withoutTypedPrices
} from '../../lib/registration'
import { defaultRegistrationForm } from '../../lib/defaultRegistrationForm'
import QuestionCard, { LangText } from './QuestionCard'
import Menu from './Menu'
import Modal from '../Modal'

const blankQuestion = () => ({
  id: newId(), type: 'text', label: { en: '', af: '' }, help: { en: '', af: '' },
  required: false, width: 'half', savesTo: '', options: [], text: { en: '', af: '' }, ticks: false
})
const blankSection = () => ({
  id: newId(), title: { en: 'New section', af: '' }, color: 'teal', keepForSibling: false, showOnThankYou: false, questions: []
})

const linkName = (key) => SAVES_TO.find((s) => s.key === key)?.label || key

/**
 * Settings > Register builder, laid out like Google Forms: a top bar with
 * Save, sections as headings, and each question as a card that opens for
 * editing one at a time. Each year has its own form; one is "live" at
 * /register. Nothing reaches parents until Save.
 */
export default function RegisterBuilder({ onDirtyChange }) {
  const [forms, setForms] = useState(null)
  const [activeId, setActiveId] = useState(undefined)
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [savedJson, setSavedJson] = useState('')
  const [openQ, setOpenQ] = useState(null)
  const [lang, setLang] = useState('en')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editingSection, setEditingSection] = useState(null) // section index
  const [confirmDelete, setConfirmDelete] = useState(null) // { kind, si, qi, name }
  const [branding, setBranding] = useState(null)
  const seeding = useRef(false)

  useEffect(() => {
    const u1 = listenRegistrationForms(setForms, (err) => setError(err.message))
    const u2 = listenPublicRegistration((p) => setActiveId(p.activeFormId || null))
    const u3 = listenPublicBranding(setBranding)
    // Make sure the form shows the current logo and banking details, even
    // if they were last saved before the form existed.
    syncPublicBranding().catch((err) => console.error(err))
    return () => { u1(); u2(); u3() }
  }, [])

  // First visit: start from the 2027 registration form, closed.
  useEffect(() => {
    if (!forms || activeId === undefined || forms.length > 0 || seeding.current) return
    seeding.current = true
    ;(async () => {
      const form = defaultRegistrationForm(new Date().getFullYear() + 1)
      await saveRegistrationForm(form)
      await setActiveRegistrationForm(form.id)
    })().catch((err) => setError(err.message))
  }, [forms, activeId])

  // Pick the live form (or the newest) once the forms arrive.
  useEffect(() => {
    if (!forms || forms.length === 0 || selectedId) return
    const pick = forms.find((f) => f.id === activeId) || forms[forms.length - 1]
    setSelectedId(pick.id)
  }, [forms, activeId, selectedId])

  // Load the chosen form into the editor. Later saves from elsewhere don't
  // overwrite what's being edited.
  const selected = forms?.find((f) => f.id === selectedId) || null
  useEffect(() => {
    if (!selected) return
    if (draft && draft.id === selected.id) return
    const clean = withoutTypedPrices(selected)
    setDraft(clean)
    setSavedJson(JSON.stringify(clean))
    setOpenQ(null)
  }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = !!draft && JSON.stringify(draft) !== savedJson
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => {
    if (!dirty) return
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const missing = useMemo(() => (draft ? missingCoreLinks(draft) : []), [draft])
  const untranslated = useMemo(() => (draft ? missingTranslations(draft) : 0), [draft])
  const usedLinks = useMemo(() => new Set(draft ? allQuestions(draft).map((q) => q.savesTo).filter(Boolean) : []), [draft])

  if (error && !draft) return <div className="panel"><div className="panel-body"><p className="rb-warn">{error}</p></div></div>
  if (!draft) return <div className="empty-state">Setting up the registration form…</div>

  const isLive = draft.id === activeId
  const link = `${window.location.origin}/register`
  const status = !isLive
    ? { text: 'Draft · not live', cls: 'draft' }
    : draft.open ? { text: 'Live · open', cls: 'open' } : { text: 'Live · closed', cls: 'closed' }

  const update = (patch) => { setDraft((d) => ({ ...d, ...patch })); setMessage(''); setError('') }
  const updateSection = (si, patch) => update({ sections: draft.sections.map((s, i) => (i === si ? { ...s, ...patch } : s)) })
  const updateQuestion = (si, qi, q) => updateSection(si, { questions: draft.sections[si].questions.map((x, j) => (j === qi ? q : x)) })

  const moveSection = (si, d) => {
    const next = [...draft.sections]
    const [s] = next.splice(si, 1)
    next.splice(si + d, 0, s)
    update({ sections: next })
  }
  // Up/down moves within a section, then across into the next one.
  const moveQuestion = (si, qi, d) => {
    const sections = draft.sections.map((s) => ({ ...s, questions: [...s.questions] }))
    const [q] = sections[si].questions.splice(qi, 1)
    const target = qi + d
    if (target < 0) sections[si - 1].questions.push(q)
    else if (target > sections[si].questions.length) sections[si + 1].questions.unshift(q)
    else sections[si].questions.splice(target, 0, q)
    update({ sections })
  }
  const addQuestion = (si) => {
    const q = blankQuestion()
    updateSection(si, { questions: [...draft.sections[si].questions, q] })
    setOpenQ(q.id)
  }
  const addSection = () => {
    const s = blankSection()
    update({ sections: [...draft.sections, s] })
    setEditingSection(draft.sections.length)
  }
  const doDelete = () => {
    const { kind, si, qi } = confirmDelete
    if (kind === 'section') update({ sections: draft.sections.filter((_, i) => i !== si) })
    else updateSection(si, { questions: draft.sections[si].questions.filter((_, j) => j !== qi) })
    setConfirmDelete(null)
  }

  const save = async () => {
    setError('')
    if (draft.open && missing.length) {
      setError(`The form can't be open without: ${missing.map(linkName).join(', ')}. Add those questions, or close registrations, then save.`)
      return
    }
    setSaving(true)
    try {
      await saveRegistrationForm(draft)
      setSavedJson(JSON.stringify(draft))
      setMessage(isLive ? 'Saved. Parents see the changes straight away.' : 'Saved.')
    } catch (err) {
      setError(`Couldn't save: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }
  const discard = () => { setDraft(JSON.parse(savedJson)); setMessage(''); setError('') }

  const switchForm = (id) => {
    if (dirty && !window.confirm('You have unsaved changes. Switch forms without saving?')) return
    setDraft(null)
    setSelectedId(id)
  }
  const copyForNextYear = async () => {
    if (dirty && !window.confirm('You have unsaved changes. They won’t be in the copy. Continue?')) return
    const latest = forms.reduce((a, b) => (b.year > a.year ? b : a))
    const year = latest.year + 1
    if (forms.some((f) => f.id === `y${year}`)) { switchForm(`y${year}`); return }
    const copy = copyFormForYear(latest, year)
    await saveRegistrationForm(copy)
    setDraft(null)
    setSelectedId(copy.id)
    setMessage(`Copied the ${latest.year} form to ${year}. It stays a draft until you make it live.`)
  }
  const makeLive = async () => {
    if (dirty) { setError('Save your changes before making this the live form.'); return }
    await setActiveRegistrationForm(draft.id)
    setMessage(`The ${draft.year} form is now the one parents see at /register.`)
  }
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(link); setMessage('Registration link copied.') } catch { window.prompt('Copy this link:', link) }
  }

  const section = editingSection !== null ? draft.sections[editingSection] : null

  return (
    <div className="register-builder">
      <div className="rb-top">
        <div className="rb-top-title">
          {forms.length > 1 ? (
            <select value={draft.id} onChange={(e) => switchForm(e.target.value)} aria-label="Which year's form to edit">
              {forms.map((f) => <option key={f.id} value={f.id}>{f.year} registration form{f.id === activeId ? ' (live)' : ''}</option>)}
            </select>
          ) : <strong>{draft.year} registration form</strong>}
          <button type="button" className={`rb-status ${status.cls}`} onClick={() => setSettingsOpen(true)} title="Open or close registrations">
            {status.text}
          </button>
        </div>
        <div className="rb-top-actions">
          <div className="rb-seg" role="group" aria-label="Language you're editing">
            <button type="button" className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
            <button type="button" className={lang === 'af' ? 'on' : ''} aria-pressed={lang === 'af'} onClick={() => setLang('af')} title={untranslated ? `${untranslated} texts have no Afrikaans yet (they show in English)` : 'Everything has Afrikaans'}>
              Afrikaans{untranslated > 0 && <span className="rb-count">{untranslated}</span>}
            </button>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => window.open(`/register?preview=${draft.id}`, '_blank', 'noopener')} title={dirty ? 'Shows the last saved version' : ''}>Preview</button>
          <button type="button" className="btn btn-accent btn-sm" onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save'}</button>
          <Menu label="Form actions" items={[
            { label: 'Form settings…', onClick: () => setSettingsOpen(true) },
            isLive && { label: 'Copy registration link', onClick: copyLink },
            !isLive && { label: 'Make this the live form', onClick: makeLive },
            { label: 'Copy this form for next year', onClick: copyForNextYear },
            dirty && { label: 'Discard unsaved changes', onClick: discard, danger: true }
          ]} />
        </div>
      </div>

      {(error || dirty || message) && (
        <div className={`rb-notice ${error ? 'error' : dirty ? 'dirty' : 'ok'}`} role="status">
          {error || (dirty ? 'Unsaved changes. Parents still see the last saved version.' : message)}
        </div>
      )}
      {missing.length > 0 && (
        <div className="reg-banner error">
          The form needs a question saving to <strong>{missing.map(linkName).join(', ')}</strong> before registrations can open.
          Open a question’s <em>More settings</em> to set what it saves to.
        </div>
      )}
      {lang === 'af' && (
        <p className="rb-note" style={{ margin: '0 0 12px' }}>
          Editing the Afrikaans. Faint text shows the English. Anything left blank shows in English on the form.
        </p>
      )}

      {draft.sections.map((s, si) => {
        const hasCore = s.questions.some((q) => CORE_LINKS.includes(q.savesTo))
        const c = sectionColor(s.color)
        return (
          <section className="rb-section" key={s.id}>
            <div className="rb-section-head">
              <span className="rb-swatch" style={{ background: c.bg === 'transparent' ? '#fff' : c.bg }} aria-hidden="true" />
              <h3>{t(s.title, lang) || 'Untitled section'}</h3>
              {s.keepForSibling && <span className="rb-chip" title="Filled in again when a parent registers another learner">kept for siblings</span>}
              {s.showOnThankYou && <span className="rb-chip" title="Also shown on the thank-you screen">on thank-you</span>}
              <span className="rb-grow" />
              <Menu label={`Section actions: ${t(s.title, 'en')}`} items={[
                { label: 'Edit section…', onClick: () => setEditingSection(si) },
                { label: 'Move section up', onClick: () => moveSection(si, -1), disabled: si === 0 },
                { label: 'Move section down', onClick: () => moveSection(si, 1), disabled: si === draft.sections.length - 1 },
                {
                  label: 'Delete section',
                  onClick: () => setConfirmDelete({ kind: 'section', si, name: t(s.title, 'en') }),
                  disabled: hasCore,
                  title: hasCore ? 'It has questions needed to create a student. Move them out first.' : '',
                  danger: true
                }
              ]} />
            </div>
            <div className="rb-cards">
              {s.questions.map((q, qi) => (
                <QuestionCard
                  key={q.id}
                  q={q}
                  lang={lang}
                  open={openQ === q.id}
                  onOpen={() => setOpenQ(q.id)}
                  onClose={() => setOpenQ(null)}
                  onChange={(next) => updateQuestion(si, qi, next)}
                  onDelete={() => setConfirmDelete({ kind: 'question', si, qi, name: t(q.label, 'en') })}
                  onMove={(d) => moveQuestion(si, qi, d)}
                  canMoveUp={qi > 0 || si > 0}
                  canMoveDown={qi < s.questions.length - 1 || si < draft.sections.length - 1}
                  usedLinks={usedLinks}
                />
              ))}
              <button type="button" className="rb-add" onClick={() => addQuestion(si)}>+ Add question</button>
            </div>
          </section>
        )
      })}

      <button type="button" className="btn btn-outline" onClick={addSection}>+ Add section</button>

      {settingsOpen && (
        <Modal title="Form settings" onClose={() => setSettingsOpen(false)} width={600} footer={<button className="btn btn-accent" onClick={() => setSettingsOpen(false)}>Done</button>}>
          <div className="rb-open-row">
            <label className="rb-switch">
              <input type="checkbox" checked={!!draft.open} onChange={(e) => update({ open: e.target.checked })} disabled={!draft.open && missing.length > 0} />
              <span><strong>Registrations open</strong><br /><span className="muted">{draft.open ? 'Parents can fill in the form.' : 'Parents see the “closed” message below.'}</span></span>
            </label>
          </div>
          {!isLive && <div className="reg-banner warn">This isn’t the live form. Parents won’t see it until you choose “Make this the live form” from the ⋯ menu.</div>}
          {isLive && <p className="muted" style={{ marginTop: 0 }}>Link for parents: <a href={link} target="_blank" rel="noreferrer">{link}</a></p>}
          <p className="rb-note">Changes here are saved with the Save button.</p>

          <div className="field" style={{ maxWidth: 140 }}>
            <label htmlFor="rb-year">Year</label>
            <input id="rb-year" type="number" min="2020" max="2100" value={draft.year} onChange={(e) => update({ year: Number(e.target.value) || draft.year })} />
          </div>
          <LangText label="Title" value={draft.title} onChange={(title) => update({ title })} lang={lang} id="rb-title" />
          <LangText label="Introduction (above the form)" value={draft.intro} onChange={(intro) => update({ intro })} lang={lang} multiline rows={3} id="rb-intro" />
          <LangText label="Message when registrations are closed" value={draft.closedMessage} onChange={(closedMessage) => update({ closedMessage })} lang={lang} multiline rows={3} id="rb-closed" />

          <div className="field">
            <label>Logo and banking details</label>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              {branding?.logo
                ? <img src={branding.logo} alt="Logo" style={{ maxWidth: 160, maxHeight: 70, objectFit: 'contain' }} />
                : <span className="muted">No logo yet.</span>}
              <span className="rb-note" style={{ flex: 1, minWidth: 200 }}>
                These come from <strong>Settings &gt; General</strong>{branding?.bank?.accountNumber ? ` (account ${branding.bank.accountNumber})` : ''}. Change them there and the form updates straight away.
              </span>
            </div>
          </div>
        </Modal>
      )}

      {section && (
        <Modal title="Edit section" onClose={() => setEditingSection(null)} width={520} footer={<button className="btn btn-accent" onClick={() => setEditingSection(null)}>Done</button>}>
          <LangText label="Heading" value={section.title} onChange={(title) => updateSection(editingSection, { title })} lang={lang} id="rb-sec-title" autoFocus />
          <div className="field">
            <label>Band colour</label>
            <div className="rb-swatches" role="radiogroup" aria-label="Band colour">
              {SECTION_COLORS.map((col) => (
                <button
                  key={col.key}
                  type="button"
                  role="radio"
                  aria-checked={section.color === col.key}
                  className={section.color === col.key ? 'on' : ''}
                  onClick={() => updateSection(editingSection, { color: col.key })}
                  title={col.label}
                >
                  <span style={{ background: col.bg === 'transparent' ? '#fff' : col.bg }} />{col.label}
                </button>
              ))}
            </div>
          </div>
          <label className="rb-check" style={{ marginBottom: 8 }}>
            <input type="checkbox" checked={!!section.keepForSibling} onChange={(e) => updateSection(editingSection, { keepForSibling: e.target.checked })} />
            Keep these answers when a parent clicks “Register another learner”
          </label>
          <label className="rb-check">
            <input type="checkbox" checked={!!section.showOnThankYou} onChange={(e) => updateSection(editingSection, { showOnThankYou: e.target.checked })} />
            Also show this section on the thank-you screen
          </label>
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title={confirmDelete.kind === 'section' ? 'Delete section?' : 'Delete question?'}
          onClose={() => setConfirmDelete(null)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={doDelete}>Delete</button>
          </>}
        >
          <p>
            “{confirmDelete.name || 'Untitled'}” will be removed from the form
            {confirmDelete.kind === 'section' ? ', with all its questions' : ''}. Registrations already sent keep their answers.
            Nothing changes for parents until you save.
          </p>
        </Modal>
      )}
    </div>
  )
}
