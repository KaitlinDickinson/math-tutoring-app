import { useState } from 'react'
import {
  QUESTION_TYPES, CHOICE_TYPES, SAVES_TO, CORE_LINKS, newId, t, optionLabel, optionBaseLabel, priceKind
} from '../../lib/registration'
import Menu from './Menu'

/**
 * A text box for one language of an { en, af } text. In Afrikaans the
 * English shows as a faint hint, because a blank Afrikaans text falls back
 * to English on the form.
 */
export function LangText({ value, onChange, lang, multiline = false, rows = 4, label, id, autoFocus }) {
  const v = value || { en: '', af: '' }
  const Input = multiline ? 'textarea' : 'input'
  return (
    <div className="field rb-field">
      {label && <label htmlFor={id}>{label}{lang === 'af' && <span className="rb-lang-chip">AF</span>}</label>}
      <Input
        id={id}
        value={v[lang] || ''}
        rows={multiline ? rows : undefined}
        placeholder={lang === 'af' ? (v.en ? `English: ${v.en}` : '') : ''}
        autoFocus={autoFocus}
        onChange={(e) => onChange({ ...v, [lang]: e.target.value })}
      />
    </div>
  )
}

const typeLabel = (key) => QUESTION_TYPES.find((x) => x.key === key)?.label || key
const linkLabel = (key) => SAVES_TO.find((x) => x.key === key)?.label || key
const PRICE_KINDS = [
  { key: 'none', label: 'No prices' },
  { key: 'rate', label: 'Hourly lesson rate' },
  { key: 'fee', label: 'Registration fee' }
]

/** The one-line summary under a closed card. */
function preview(q, lang) {
  if (CHOICE_TYPES.includes(q.type)) {
    const labels = (q.options || []).map((o) => optionLabel(o, lang))
    return labels.length > 3 ? `${labels.slice(0, 3).join(' · ')} · +${labels.length - 3} more` : labels.join(' · ')
  }
  if (q.type === 'info') return t(q.text, lang).split('\n').find((l) => l.trim()) || 'Information text'
  if (q.type === 'bank') return 'Banking details from Settings > General'
  return typeLabel(q.type)
}

/**
 * One question in the builder. Closed it's a tidy summary; open it shows the
 * question, its options and prices, with type / required / move / delete in
 * the footer and the rarer settings under "More settings".
 */
export default function QuestionCard({ q, lang, open, onOpen, onClose, onChange, onDelete, onMove, canMoveUp, canMoveDown, usedLinks }) {
  const [more, setMore] = useState(false)
  const core = CORE_LINKS.includes(q.savesTo)
  const set = (patch) => onChange({ ...q, ...patch })
  const kind = priceKind(q)
  const isChoice = CHOICE_TYPES.includes(q.type)
  const answers = !['info', 'bank'].includes(q.type)
  const linkable = !['info', 'bank', 'signature', 'checkbox', 'multiple'].includes(q.type)
  const label = t(q.label, lang)

  if (!open) {
    return (
      <div
        className="rb-card"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
        aria-label={`Edit question: ${label || 'Untitled'}`}
      >
        <div className="rb-card-title">
          <span>{label || <em className="muted">Untitled question</em>}</span>
          {q.required && answers && <span className="rb-req" aria-label="required">*</span>}
          {q.savesTo && <span className={`rb-tag ${core ? 'core' : ''}`}>→ {linkLabel(q.savesTo)}</span>}
        </div>
        <div className="rb-card-preview">{preview(q, lang)}</div>
      </div>
    )
  }

  const setType = (type) => {
    const patch = { type }
    if (CHOICE_TYPES.includes(type) && !(q.options || []).length) {
      patch.options = [{ id: newId(), label: { en: 'Option 1', af: '' }, rate: null, fee: null, grade: null }]
    }
    if (!CHOICE_TYPES.includes(type)) patch.priceKind = 'none'
    if (['info', 'bank', 'signature', 'checkbox', 'multiple'].includes(type) && q.savesTo && !core) patch.savesTo = ''
    set(patch)
  }
  // Switching what the prices mean clears the other kind, so an option never
  // carries both a rate and a fee.
  const setKind = (k) => set({
    priceKind: k,
    options: (q.options || []).map((o) => ({ ...o, rate: k === 'rate' ? o.rate : null, fee: k === 'fee' ? o.fee : null }))
  })
  const setOption = (i, patch) => set({ options: q.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) })
  const moveOption = (i, d) => {
    const next = [...q.options]
    const [o] = next.splice(i, 1)
    next.splice(i + d, 0, o)
    set({ options: next })
  }
  const num = (v) => (v === '' ? null : Number(v))
  const glyph = q.type === 'multiple' ? '☐' : '○'

  return (
    <div className="rb-card open">
      <div className="rb-card-close-row">
        <button type="button" className="rb-link" onClick={onClose}>Close ▴</button>
      </div>

      {q.type === 'info' ? (
        <>
          <LangText label="Text (one item per line)" value={q.text} onChange={(text) => set({ text })} lang={lang} multiline rows={6} id={`q-${q.id}-text`} />
          <label className="rb-check"><input type="checkbox" checked={!!q.ticks} onChange={(e) => set({ ticks: e.target.checked })} /> Show a ✓ tick before each line (like the terms list)</label>
        </>
      ) : q.type === 'bank' ? (
        <p className="rb-note">
          Shows the bank, account holder, account number and branch code from <strong>Settings &gt; General</strong>,
          plus “Reference: Learner first name + surname”. Change them there and the form updates too.
        </p>
      ) : (
        <LangText label="Question" value={q.label} onChange={(l) => set({ label: l })} lang={lang} id={`q-${q.id}-label`} autoFocus />
      )}

      {isChoice && (
        <div className="rb-options">
          <div className="rb-options-head">
            <span className="rb-sub">Options</span>
            <div className="rb-seg" role="group" aria-label="Prices on these options">
              {PRICE_KINDS.map((p) => (
                <button key={p.key} type="button" className={kind === p.key ? 'on' : ''} aria-pressed={kind === p.key} onClick={() => setKind(p.key)}>{p.label}</button>
              ))}
            </div>
          </div>
          {(q.options || []).map((o, i) => (
            <div className="rb-opt" key={o.id}>
              <span className="rb-glyph" aria-hidden="true">{glyph}</span>
              <input
                className="rb-opt-label"
                aria-label={`Option ${i + 1}`}
                value={o.label?.[lang] || ''}
                placeholder={lang === 'af' ? (o.label?.en ? `English: ${o.label.en}` : '') : `Option ${i + 1}`}
                onChange={(e) => setOption(i, { label: { ...o.label, [lang]: e.target.value } })}
              />
              {kind !== 'none' && (
                <label className="rb-money" title={kind === 'rate' ? 'Hourly rate' : 'Registration fee'}>
                  <b>R</b>
                  <input
                    type="number" min="0" step="0.01" inputMode="decimal"
                    aria-label={`${kind === 'rate' ? 'Hourly rate' : 'Registration fee'} for ${optionBaseLabel(o, 'en') || `option ${i + 1}`}`}
                    value={(kind === 'rate' ? o.rate : o.fee) ?? ''}
                    onChange={(e) => setOption(i, kind === 'rate' ? { rate: num(e.target.value) } : { fee: num(e.target.value) })}
                  />
                  <i>{kind === 'rate' ? 'per hour' : 'fee'}</i>
                </label>
              )}
              {q.savesTo === 'learner.grade' && (
                <label className="rb-money" title="The grade this option means">
                  <b>Gr</b>
                  <input type="number" min="0" max="13" aria-label="Grade" value={o.grade ?? ''} onChange={(e) => setOption(i, { grade: num(e.target.value) })} />
                </label>
              )}
              <Menu label={`Option ${i + 1} actions`} items={[
                { label: 'Move up', onClick: () => moveOption(i, -1), disabled: i === 0 },
                { label: 'Move down', onClick: () => moveOption(i, 1), disabled: i === q.options.length - 1 },
                { label: 'Delete option', onClick: () => set({ options: q.options.filter((_, j) => j !== i) }), disabled: q.options.length <= 1, danger: true }
              ]} />
            </div>
          ))}
          <button
            type="button"
            className="rb-link"
            onClick={() => set({ options: [...(q.options || []), { id: newId(), label: { en: `Option ${(q.options || []).length + 1}`, af: '' }, rate: null, fee: null, grade: null }] })}
          >
            + Add option
          </button>
          {kind !== 'none' && q.options?.[0] && (
            <p className="rb-note">
              Parents see: “{optionLabel(q.options[0], lang)}”.{' '}
              {kind === 'rate' ? 'The chosen rate fills in the student’s hourly rate when you approve.' : 'The chosen fee goes on the invoice when you approve.'}
            </p>
          )}
        </div>
      )}

      {more && (
        <div className="rb-more">
          {answers && <LangText label="Help text under the question (optional)" value={q.help} onChange={(help) => set({ help })} lang={lang} id={`q-${q.id}-help`} />}
          {q.type === 'info' && <LangText label="Name (only you see this)" value={q.label} onChange={(l) => set({ label: l })} lang={lang} id={`q-${q.id}-name`} />}
          <div className="field-row" style={{ flexWrap: 'wrap' }}>
            <div className="field" style={{ minWidth: 180 }}>
              <label htmlFor={`q-${q.id}-width`}>Width on computers</label>
              <select id={`q-${q.id}-width`} value={q.width || 'half'} onChange={(e) => set({ width: e.target.value })}>
                <option value="half">Half (two side by side)</option>
                <option value="full">Full width</option>
              </select>
            </div>
            {linkable && (
              <div className="field" style={{ minWidth: 220 }}>
                <label htmlFor={`q-${q.id}-link`}>Saves to student record</label>
                <select id={`q-${q.id}-link`} value={q.savesTo || ''} disabled={core} onChange={(e) => set({ savesTo: e.target.value })}>
                  <option value="">Nothing (kept with the registration only)</option>
                  {SAVES_TO.filter((s) => s.key === q.savesTo || !usedLinks.has(s.key)).map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
                {core && <span className="field-hint">Needed to create the student, so this stays.</span>}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rb-card-foot">
        <select value={q.type} onChange={(e) => setType(e.target.value)} aria-label="Question type">
          {QUESTION_TYPES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
        </select>
        {answers && (
          <label className="rb-check"><input type="checkbox" checked={!!q.required} onChange={(e) => set({ required: e.target.checked })} /> Required</label>
        )}
        <span className="rb-grow" />
        <button type="button" className="rb-icon" onClick={() => onMove(-1)} disabled={!canMoveUp} aria-label="Move question up" title="Move up">↑</button>
        <button type="button" className="rb-icon" onClick={() => onMove(1)} disabled={!canMoveDown} aria-label="Move question down" title="Move down">↓</button>
        <button
          type="button"
          className="rb-icon"
          onClick={onDelete}
          disabled={core}
          aria-label="Delete question"
          title={core ? 'Needed to create the student, so it can’t be deleted' : 'Delete question'}
        >🗑</button>
        <button type="button" className="rb-link" onClick={() => setMore((v) => !v)} aria-expanded={more}>{more ? 'Fewer settings ▴' : 'More settings ▾'}</button>
      </div>
    </div>
  )
}
