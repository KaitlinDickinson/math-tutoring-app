// Online registration: the logic shared by the public form (/register), the
// Register builder (Settings) and approving registrations (Students). No
// Firebase in here, so it can be unit-tested with `npm test`.
//
// A form: { id, year, open, title, intro, closedMessage, sections }. The logo
// and banking details come from Settings > General (see publicSettings/branding).
// Every text is { en, af }. A section: { id, title, color, keepForSibling,
// showOnThankYou, questions }. A question: { id, type, label, help, required,
// width: 'half' | 'full', savesTo, options, text, ticks }.
// Answers are { [questionId]: value }: a string for typed answers, an option
// id for 'single', an array of option ids for 'multiple', true/false for
// 'checkbox'. Signatures are kept apart as { [questionId]: dataURL }.

export const QUESTION_TYPES = [
  { key: 'text', label: 'Short answer' },
  { key: 'paragraph', label: 'Paragraph' },
  { key: 'phone', label: 'Phone number' },
  { key: 'email', label: 'Email' },
  { key: 'date', label: 'Date' },
  { key: 'number', label: 'Number' },
  { key: 'single', label: 'Single choice' },
  { key: 'multiple', label: 'Multiple choice' },
  { key: 'checkbox', label: 'Tick box' },
  { key: 'signature', label: 'Signature' },
  { key: 'info', label: 'Information text (no answer)' },
  { key: 'bank', label: 'Banking details (from Settings > General)' }
]

// Question types that show something but take no answer.
export const DISPLAY_TYPES = ['info', 'bank']

export const CHOICE_TYPES = ['single', 'multiple']

// Answers that can be linked to the student record. The core ones are needed
// to create a student, so they can't be deleted or unlinked in the builder.
export const SAVES_TO = [
  { key: 'learner.firstName', label: 'Learner first name', core: true },
  { key: 'learner.lastName', label: 'Learner surname', core: true },
  { key: 'learner.contact', label: 'Learner contact number', core: true },
  { key: 'learner.grade', label: 'Grade', core: false },
  { key: 'parent.name', label: 'Parent name', core: true },
  { key: 'parent.surname', label: 'Parent surname', core: true },
  { key: 'parent.contact', label: 'Parent contact number', core: true },
  { key: 'parent.email', label: 'Parent email', core: false }
]
export const CORE_LINKS = SAVES_TO.filter((s) => s.core).map((s) => s.key)

export const SECTION_COLORS = [
  { key: 'teal', label: 'Teal', bg: '#7fdcdc', ink: '#13294b' },
  { key: 'green', label: 'Green', bg: '#c5ecaa', ink: '#13294b' },
  { key: 'pink', label: 'Pink', bg: '#f2a8d8', ink: '#13294b' },
  { key: 'lilac', label: 'Lilac', bg: '#dcc8ec', ink: '#13294b' },
  { key: 'slate', label: 'Slate', bg: '#5d7890', ink: '#ffffff' },
  { key: 'plain', label: 'No band', bg: 'transparent', ink: '#13294b' }
]
export const sectionColor = (key) => SECTION_COLORS.find((c) => c.key === key) || SECTION_COLORS[0]

export const LANGS = [{ key: 'en', label: 'English' }, { key: 'af', label: 'Afrikaans' }]

const MESSAGES = {
  required: { en: 'This question is required', af: 'Hierdie vraag is verpligtend' },
  email: { en: 'Enter a valid email address', af: "Voer 'n geldige e-posadres in" },
  phone: { en: 'Enter a valid phone number', af: "Voer 'n geldige telefoonnommer in" }
}

/** A text in the chosen language, falling back to English when it's blank. */
export function t(text, lang = 'en') {
  if (!text) return ''
  if (typeof text === 'string') return text
  return (lang !== 'en' && text[lang] && String(text[lang]).trim()) ? text[lang] : (text.en || '')
}

export const newId = () => Math.random().toString(36).slice(2, 10)

export const allQuestions = (form) => (form?.sections || []).flatMap((s) => s.questions || [])

export const questionForLink = (form, key) => allQuestions(form).find((q) => q.savesTo === key) || null

/** Core links the form doesn't have, in SAVES_TO order. */
export function missingCoreLinks(form) {
  const linked = new Set(allQuestions(form).map((q) => q.savesTo).filter(Boolean))
  return CORE_LINKS.filter((k) => !linked.has(k))
}

const blank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)

const chosenOptions = (q, answer) => {
  if (!CHOICE_TYPES.includes(q.type) || blank(answer)) return []
  const ids = Array.isArray(answer) ? answer : [answer]
  return (q.options || []).filter((o) => ids.includes(o.id))
}

const firstNumber = (s) => {
  const m = String(s ?? '').match(/\d+/)
  return m ? Number(m[0]) : null
}

/** R1 500, R300, R12 500.50: how prices read on the form. */
export function formatRand(amount) {
  const n = Number(amount) || 0
  const [whole, cents] = (Number.isInteger(n) ? String(n) : n.toFixed(2)).split('.')
  return `R${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${cents ? `.${cents}` : ''}`
}

const hasPrice = (v) => v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v))

/**
 * What a choice question's options cost: 'rate' (hourly lesson rate), 'fee'
 * (registration fee) or 'none'. Set per question in the builder; older
 * questions without the setting go by what their options have.
 */
export function priceKind(q) {
  if (!CHOICE_TYPES.includes(q?.type)) return 'none'
  if (q.priceKind) return q.priceKind
  if ((q.options || []).some((o) => hasPrice(o.rate))) return 'rate'
  if ((q.options || []).some((o) => hasPrice(o.fee))) return 'fee'
  return 'none'
}

// Prices typed into the wording before prices had their own boxes.
const TYPED_PRICE = /\s*(@\s*R\s?[\d\s.,]+\s*(per hour|per uur)|\(\s*R\s?[\d\s.,]+\))\s*$/i
/** The option's wording without any price typed into it. */
export const optionBaseLabel = (o, lang = 'en') => t(o.label, lang).replace(TYPED_PRICE, '').trim()

/** An option as parents see it, with its price added from the price box. */
export function optionLabel(o, lang = 'en') {
  const base = optionBaseLabel(o, lang)
  if (hasPrice(o.rate)) return `${base} @ ${formatRand(o.rate)} ${lang === 'af' ? 'per uur' : 'per hour'}`
  if (hasPrice(o.fee)) return `${base} (${formatRand(o.fee)})`
  return t(o.label, lang)
}

/**
 * A copy of the form with prices taken out of the option wording wherever
 * the option has a price box, for editing in the builder.
 */
export function withoutTypedPrices(form) {
  const copy = structuredClone(form)
  ;(copy.sections || []).forEach((s) => (s.questions || []).forEach((q) => (q.options || []).forEach((o) => {
    if (!hasPrice(o.rate) && !hasPrice(o.fee)) return
    o.label = { ...o.label, en: optionBaseLabel(o, 'en'), af: o.label?.af ? String(o.label.af).replace(TYPED_PRICE, '').trim() : '' }
  })))
  return copy
}

/** How many texts have English but no Afrikaans yet (they show in English). */
export function missingTranslations(form) {
  let missing = 0
  const check = (text) => { if (text?.en?.trim() && !text?.af?.trim()) missing += 1 }
  check(form.title); check(form.intro); check(form.closedMessage)
  ;(form.sections || []).forEach((s) => {
    check(s.title)
    ;(s.questions || []).forEach((q) => {
      if (q.type !== 'bank') check(q.label)
      check(q.help)
      if (q.type === 'info') check(q.text)
      ;(q.options || []).forEach((o) => check(o.label))
    })
  })
  return missing
}

/** The readable answer to one question, e.g. for lists and the details view. */
export function answerText(q, answer, lang = 'en') {
  if (q.type === 'checkbox') return answer ? (lang === 'af' ? 'Ja' : 'Yes') : (lang === 'af' ? 'Nee' : 'No')
  if (CHOICE_TYPES.includes(q.type)) return chosenOptions(q, answer).map((o) => optionLabel(o, lang)).join(', ')
  return blank(answer) ? '' : String(answer).trim()
}

function linkedValue(form, answers, key) {
  const q = questionForLink(form, key)
  if (!q) return ''
  const a = answers?.[q.id]
  if (key === 'learner.grade') {
    if (CHOICE_TYPES.includes(q.type)) {
      const o = chosenOptions(q, a)[0]
      if (!o) return ''
      return o.grade != null && o.grade !== '' ? Number(o.grade) : (firstNumber(o.label?.en) ?? '')
    }
    return firstNumber(a) ?? ''
  }
  return answerText(q, a, 'en')
}

/** The student fields the linked answers fill in. */
export function studentFromAnswers(form, answers) {
  const v = (k) => linkedValue(form, answers, k)
  return {
    firstName: v('learner.firstName'),
    lastName: v('learner.lastName'),
    studentContact: v('learner.contact'),
    grade: v('learner.grade'),
    accountable: { name: v('parent.name'), surname: v('parent.surname'), contact: v('parent.contact'), email: v('parent.email') }
  }
}

/** Hourly rate from the first chosen option that has one; fees added up. */
export function pricingFromAnswers(form, answers) {
  let rate = null
  let fee = 0
  const feeOptions = []
  allQuestions(form).forEach((q) => {
    chosenOptions(q, answers?.[q.id]).forEach((o) => {
      if (rate === null && o.rate != null && o.rate !== '') rate = Number(o.rate)
      if (o.fee != null && o.fee !== '' && Number(o.fee)) {
        fee += Number(o.fee)
        feeOptions.push(optionBaseLabel(o, 'en'))
      }
    })
  })
  return { rate, fee, feeOptions }
}

const normName = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
/** Digits only, with a South African +27 turned into a leading 0. */
export function normPhone(s) {
  let d = String(s || '').replace(/\D/g, '')
  if (d.startsWith('27') && d.length === 11) d = `0${d.slice(2)}`
  return d
}
const normEmail = (s) => String(s || '').trim().toLowerCase()

/**
 * Existing students a registration probably belongs to. A learner-name match
 * is the same child; a parent-only match (phone or email) is usually a
 * sibling. Learner matches come first.
 */
export function findMatches(candidate, students) {
  const name = `${normName(candidate.firstName)}|${normName(candidate.lastName)}`
  const phone = normPhone(candidate.accountable?.contact)
  const email = normEmail(candidate.accountable?.email)
  const learner = []
  const parent = []
  ;(students || []).forEach((s) => {
    if (normName(candidate.firstName) && `${normName(s.firstName)}|${normName(s.lastName)}` === name) {
      learner.push({ type: 'learner', student: s })
      return
    }
    const samePhone = phone && normPhone(s.accountable?.contact) === phone
    const sameEmail = email && normEmail(s.accountable?.email) === email
    if (samePhone || sameEmail) parent.push({ type: 'parent', student: s })
  })
  return [...learner, ...parent]
}

/** Fields to update on an existing student: blank answers keep what's there. */
export function studentPatch(existing, incoming) {
  const patch = {}
  Object.entries(incoming).forEach(([k, v]) => {
    if (k === 'accountable') return
    if (!blank(v)) patch[k] = v
  })
  if (incoming.accountable) {
    const acc = { ...(existing.accountable || {}) }
    let changed = false
    Object.entries(incoming.accountable).forEach(([k, v]) => {
      if (!blank(v)) { acc[k] = v; changed = true }
    })
    if (changed) patch.accountable = acc
  }
  return patch
}

/**
 * The 1 January grade move-up. A student registered ahead for `year` gets
 * exactly that grade; everyone else with a grade goes up by one.
 */
export function rolloverUpdates(students, year) {
  const updates = []
  students.forEach((s) => {
    const pending = s.pendingGrade
    if (pending && Number(pending.year) === year && !blank(pending.grade)) {
      updates.push({ id: s.id, data: { grade: Number(pending.grade), pendingGrade: null } })
    } else if (!blank(s.grade)) {
      updates.push({ id: s.id, data: { grade: Number(s.grade) + 1 } })
    }
  })
  return updates
}

/** Grade fields to save on approval: now for this year, pending for a later year. */
export function gradeFields(grade, formYear, currentYear) {
  if (blank(grade)) return {}
  if (formYear > currentYear) return { pendingGrade: { year: formYear, grade: Number(grade) } }
  return { grade: Number(grade), pendingGrade: null }
}

/** Answers to carry over when the parent registers another learner. */
export function siblingAnswers(form, answers) {
  const kept = {}
  ;(form.sections || []).forEach((s) => {
    if (!s.keepForSibling) return
    ;(s.questions || []).forEach((q) => {
      if (answers[q.id] !== undefined && q.type !== 'signature') kept[q.id] = answers[q.id]
    })
  })
  return kept
}

/** Problems with the answers, as { [questionId]: message } in `lang`. */
export function validateAnswers(form, answers, signatures, lang = 'en') {
  const errors = {}
  const msg = (k) => t(MESSAGES[k], lang)
  allQuestions(form).forEach((q) => {
    if (DISPLAY_TYPES.includes(q.type)) return
    const a = answers?.[q.id]
    if (q.type === 'signature') {
      if (q.required && !signatures?.[q.id]) errors[q.id] = msg('required')
      return
    }
    const empty = q.type === 'checkbox' ? !a : blank(a)
    if (empty) {
      if (q.required) errors[q.id] = msg('required')
      return
    }
    if (q.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(a).trim())) errors[q.id] = msg('email')
    if (q.type === 'phone' && normPhone(a).length < 9) errors[q.id] = msg('phone')
  })
  return errors
}

function replaceYearDeep(value, from, to) {
  if (typeof value === 'string') return value.split(String(from)).join(String(to))
  if (Array.isArray(value)) return value.map((v) => replaceYearDeep(v, from, to))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === 'logo' || k === 'id' ? v : replaceYearDeep(v, from, to)]))
  }
  return value
}

/** A closed copy of a form for another year, with the year changed in every text. */
export function copyFormForYear(form, year) {
  const copy = replaceYearDeep(structuredClone(form), form.year, year)
  return { ...copy, id: `y${year}`, year, open: false }
}
