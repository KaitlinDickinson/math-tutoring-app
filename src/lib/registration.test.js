import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  t, allQuestions, missingCoreLinks, studentFromAnswers, pricingFromAnswers, findMatches,
  studentPatch, rolloverUpdates, gradeFields, siblingAnswers, validateAnswers, copyFormForYear, questionForLink,
  optionLabel, formatRand, missingTranslations, priceKind, withoutTypedPrices
} from './registration.js'
import { defaultRegistrationForm } from './defaultRegistrationForm.js'

const form = defaultRegistrationForm(2027)
const q = (key) => questionForLink(form, key)
const optionId = (qid, enStart) => allQuestions(form).find((x) => x.id === qid).options.find((o) => o.label.en.startsWith(enStart)).id

function filledAnswers() {
  return {
    [q('parent.name').id]: 'Sanet',
    [q('parent.surname').id]: 'van der Merwe',
    [q('parent.contact').id]: '082 555 1234',
    [q('parent.email').id]: 'sanet@example.com',
    [q('learner.firstName').id]: 'Anri',
    [q('learner.lastName').id]: 'van der Merwe',
    [q('learner.contact').id]: '071 222 3333',
    [q('learner.grade').id]: '10',
    lessons: optionId('lessons', 'Online – individual'),
    registration: optionId('registration', 'GR 10')
  }
}

test('t falls back to English when Afrikaans is empty', () => {
  assert.equal(t({ en: 'Name', af: 'Naam' }, 'af'), 'Naam')
  assert.equal(t({ en: 'Name', af: '' }, 'af'), 'Name')
  assert.equal(t({ en: 'Name' }, 'af'), 'Name')
  assert.equal(t(undefined, 'en'), '')
})

test('default form has every core link', () => {
  assert.deepEqual(missingCoreLinks(form), [])
})

test('missingCoreLinks reports a removed core link', () => {
  const broken = structuredClone(form)
  allQuestions(broken).find((x) => x.savesTo === 'parent.contact').savesTo = ''
  assert.deepEqual(missingCoreLinks(broken), ['parent.contact'])
})

test('studentFromAnswers maps linked answers to student fields', () => {
  assert.deepEqual(studentFromAnswers(form, filledAnswers()), {
    firstName: 'Anri',
    lastName: 'van der Merwe',
    studentContact: '071 222 3333',
    grade: 10,
    accountable: { name: 'Sanet', surname: 'van der Merwe', contact: '082 555 1234', email: 'sanet@example.com' }
  })
})

test('studentFromAnswers reads a grade from a choice option', () => {
  const f = structuredClone(form)
  const gq = questionForLink(f, 'learner.grade')
  gq.type = 'single'
  gq.options = [{ id: 'g9', label: { en: 'Grade 9', af: 'Graad 9' } }, { id: 'g11', label: { en: 'Grade 11' }, grade: 11 }]
  assert.equal(studentFromAnswers(f, { [gq.id]: 'g9' }).grade, 9)
  assert.equal(studentFromAnswers(f, { [gq.id]: 'g11' }).grade, 11)
})

test('pricingFromAnswers takes the rate and adds up fees', () => {
  const p = pricingFromAnswers(form, filledAnswers())
  assert.equal(p.rate, 300)
  assert.equal(p.fee, 1500)
  assert.deepEqual(p.feeOptions, ['GR 10–11'])
})

test('pricingFromAnswers with nothing chosen', () => {
  assert.deepEqual(pricingFromAnswers(form, {}), { rate: null, fee: 0, feeOptions: [] })
})

const existing = [
  { id: 'a', firstName: 'Anri ', lastName: 'Van der  Merwe', accountable: { contact: '0825551234', email: 'SANET@example.com' } },
  { id: 'b', firstName: 'Pieter', lastName: 'Botha', accountable: { contact: '+27 82 555 1234', email: '' } },
  { id: 'c', firstName: 'Lize', lastName: 'Smit', accountable: { contact: '083 000 0000', email: 'lize@x.com' } }
]

test('findMatches puts a learner-name match first', () => {
  const m = findMatches(studentFromAnswers(form, filledAnswers()), existing)
  assert.deepEqual(m.map((x) => [x.type, x.student.id]), [['learner', 'a'], ['parent', 'b']])
})

test('findMatches on a sibling is parent-only', () => {
  const cand = { ...studentFromAnswers(form, filledAnswers()), firstName: 'Mia' }
  const m = findMatches(cand, existing)
  assert.deepEqual(m.map((x) => [x.type, x.student.id]), [['parent', 'a'], ['parent', 'b']])
})

test('findMatches with nobody matching', () => {
  const cand = { firstName: 'New', lastName: 'Kid', accountable: { contact: '011 111 1111', email: 'new@x.com' } }
  assert.deepEqual(findMatches(cand, existing), [])
})

test('findMatches ignores blank parent details', () => {
  const cand = { firstName: 'New', lastName: 'Kid', accountable: { contact: '', email: '' } }
  assert.deepEqual(findMatches(cand, [{ id: 'z', firstName: 'X', lastName: 'Y', accountable: { contact: '', email: '' } }]), [])
})

test('studentPatch keeps existing values when the new answer is blank', () => {
  const patch = studentPatch(
    { firstName: 'Anri', accountable: { name: 'Sanet', email: 'old@x.com', contact: '1' } },
    { firstName: 'Anri', studentContact: '', grade: '', accountable: { name: 'Sanet', email: '', contact: '2' } }
  )
  assert.deepEqual(patch, { firstName: 'Anri', accountable: { name: 'Sanet', email: 'old@x.com', contact: '2' } })
})

test('rolloverUpdates bumps grades and applies pending grades exactly', () => {
  const updates = rolloverUpdates([
    { id: '1', grade: 9 },
    { id: '2', grade: 9, pendingGrade: { year: 2027, grade: 10 } },
    { id: '3', grade: '', pendingGrade: { year: 2027, grade: 8 } },
    { id: '4', grade: '' },
    { id: '5', grade: 11, pendingGrade: { year: 2028, grade: 13 } }
  ], 2027)
  assert.deepEqual(updates, [
    { id: '1', data: { grade: 10 } },
    { id: '2', data: { grade: 10, pendingGrade: null } },
    { id: '3', data: { grade: 8, pendingGrade: null } },
    { id: '5', data: { grade: 12 } }
  ])
})

test('gradeFields: this year sets the grade, a future year waits', () => {
  assert.deepEqual(gradeFields(10, 2026, 2026), { grade: 10, pendingGrade: null })
  assert.deepEqual(gradeFields(10, 2027, 2026), { pendingGrade: { year: 2027, grade: 10 } })
  assert.deepEqual(gradeFields('', 2027, 2026), {})
})

test('siblingAnswers keeps parent and emergency answers only', () => {
  const a = { ...filledAnswers(), em_name: 'Oupa' }
  const kept = siblingAnswers(form, a)
  assert.equal(kept[q('parent.name').id], 'Sanet')
  assert.equal(kept.em_name, 'Oupa')
  assert.equal(kept[q('learner.firstName').id], undefined)
  assert.equal(kept.lessons, undefined)
})

test('validateAnswers flags required, email and phone problems in the chosen language', () => {
  const errs = validateAnswers(form, { ...filledAnswers(), [q('parent.email').id]: 'nope', [q('parent.contact').id]: '12' }, { signature: true }, 'af')
  assert.equal(errs[q('parent.email').id], "Voer 'n geldige e-posadres in")
  assert.equal(errs[q('parent.contact').id], "Voer 'n geldige telefoonnommer in")
  assert.equal(errs.accept_terms, 'Hierdie vraag is verpligtend')
  assert.equal(errs[q('learner.firstName').id], undefined)
})

test('validateAnswers requires a signature', () => {
  const errs = validateAnswers(form, filledAnswers(), {}, 'en')
  assert.equal(errs.signature, 'This question is required')
})

test('banking details come from settings and take no answer', () => {
  const bank = allQuestions(form).find((x) => x.type === 'bank')
  assert.ok(bank, 'default form has a banking details block')
  assert.equal(validateAnswers(form, {}, {}, 'en')[bank.id], undefined)
  assert.equal(form.logo, undefined)
})

test('copyFormForYear moves the year in every text and closes the copy', () => {
  const next = copyFormForYear({ ...form, open: true }, 2028)
  assert.equal(next.year, 2028)
  assert.equal(next.id, 'y2028')
  assert.equal(next.open, false)
  assert.equal(next.title.af, 'Registrasie vir 2028')
  assert.equal(allQuestions(next).find((x) => x.id === 'registration').label.en, 'Registration for 2028 (mathematics)')
})

test('formatRand groups thousands with a space', () => {
  assert.equal(formatRand(1500), 'R1 500')
  assert.equal(formatRand(300), 'R300')
  assert.equal(formatRand(12500.5), 'R12 500.50')
})

test('optionLabel adds the price from the price box', () => {
  assert.equal(optionLabel({ label: { en: 'Online – individual', af: 'Aanlyn – individueel' }, rate: 300 }, 'en'), 'Online – individual @ R300 per hour')
  assert.equal(optionLabel({ label: { en: 'Online – individual', af: 'Aanlyn – individueel' }, rate: 300 }, 'af'), 'Aanlyn – individueel @ R300 per uur')
  assert.equal(optionLabel({ label: { en: 'GR 10–11' }, fee: 1500 }, 'en'), 'GR 10–11 (R1 500)')
  assert.equal(optionLabel({ label: { en: 'Grade 9' } }, 'en'), 'Grade 9')
})

test('optionLabel replaces a price typed into older wording', () => {
  assert.equal(optionLabel({ label: { en: 'Online – individual @ R300 per hour' }, rate: 350 }, 'en'), 'Online – individual @ R350 per hour')
  assert.equal(optionLabel({ label: { en: 'GR 12 (R1 500)' }, fee: 1800 }, 'en'), 'GR 12 (R1 800)')
})

test('priceKind follows the question setting, else the options', () => {
  assert.equal(priceKind(allQuestions(form).find((x) => x.id === 'lessons')), 'rate')
  assert.equal(priceKind(allQuestions(form).find((x) => x.id === 'registration')), 'fee')
  assert.equal(priceKind({ type: 'single', options: [{ fee: 100 }] }), 'fee')
  assert.equal(priceKind({ type: 'single', options: [{}] }), 'none')
  assert.equal(priceKind({ type: 'text' }), 'none')
})

test('missingTranslations counts English texts with no Afrikaans', () => {
  assert.equal(missingTranslations(form), 0)
  const f = structuredClone(form)
  f.sections[0].questions[0].label.af = ''
  f.sections[0].title.af = ' '
  assert.equal(missingTranslations(f), 2)
})

test("withoutTypedPrices cleans older wording for editing", () => {
  const old = { sections: [{ questions: [{ type: "single", options: [
    { label: { en: "In person @ R150 per hour", af: "In persoon @ R150 per uur" }, rate: 150 },
    { label: { en: "GR 12 (R1 500)", af: "" }, fee: 1500 },
    { label: { en: "Grade 9 (R2)" } }
  ] }] }] }
  const opts = withoutTypedPrices(old).sections[0].questions[0].options
  assert.deepEqual(opts.map((o) => o.label), [{ en: "In person", af: "In persoon" }, { en: "GR 12", af: "" }, { en: "Grade 9 (R2)" }])
  assert.equal(old.sections[0].questions[0].options[0].label.en, "In person @ R150 per hour")
})
