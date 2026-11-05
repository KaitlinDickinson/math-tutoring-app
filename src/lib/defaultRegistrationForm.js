// The starting form for the Register builder: the Multiplying Minds 2027
// registration PDF (English and Afrikaans), with the answers the app needs
// linked to the student record. Marisa can change all of it in Settings.

const tx = (en, af = '') => ({ en, af })

const question = (id, type, label, extra = {}) => ({
  id, type, label, help: tx(''), required: false, width: 'half', savesTo: '', options: [], text: tx(''), ticks: false, ...extra
})

const option = (id, label, extra = {}) => ({ id, label, rate: null, fee: null, grade: null, ...extra })

const TERMS_EN = [
  'Lessons must be cancelled at least 12 hours in advance.',
  'If a learner is late or does not attend a scheduled lesson, the full lesson fee is still payable.',
  'The learner must be prepared to switch on their camera during an online lesson.',
  'Lessons are payable monthly in advance.',
  'A minimum of 3 lessons per month is payable, whether the learner attends or not. Any additional lessons cancelled in advance may be carried over as credit to the following month.',
  'If lessons have not been paid for by the 7th of each month, the learner may not attend further lessons until the account is up to date.'
]
const TERMS_AF = [
  'Klasse moet minstens 12 ure vooruit gekanselleer word.',
  "Indien 'n leerder laat is vir die gereëlde les sal die volle bedrag van die les steeds betaalbaar wees.",
  "Die leerder moet bereid wees om die kamera aan te skakel tydens 'n aanlyn les.",
  'Klasse is maandeliks vooruit betaalbaar.',
  "'n Minimum van 3 klasse per maand is betaalbaar, ongeag of die leerder die klasse bywoon of nie. Enige ander klasse wat vroegtydig gekanselleer word sal as krediet oorgedra kan word na die volgende maand toe.",
  'Indien klasse nie teen die 7de van elke maand betaal is nie sal die leerder nie verder klasse kan bywoon totdat die rekening op datum is nie.'
]

// The logo and banking details aren't stored on the form: they come from
// Settings > General.
export function defaultRegistrationForm(year = new Date().getFullYear() + 1) {
  return {
    id: `y${year}`,
    year,
    open: false,
    title: tx(`Registration for ${year}`, `Registrasie vir ${year}`),
    intro: tx(
      'Please fill in this form to register your learner for maths lessons with Multiplying Minds.',
      'Voltooi asseblief hierdie vorm om jou leerder vir wiskundeklasse by Multiplying Minds te registreer.'
    ),
    closedMessage: tx(
      'Registrations are closed at the moment. Please contact Multiplying Minds directly.',
      'Registrasies is tans gesluit. Kontak asseblief vir Multiplying Minds direk.'
    ),
    sections: [
      {
        id: 'parent', title: tx('Parent / guardian details', 'Ouer / voog se besonderhede'), color: 'teal', keepForSibling: true, showOnThankYou: false,
        questions: [
          question('parent_name', 'text', tx('Name', 'Naam'), { required: true, savesTo: 'parent.name' }),
          question('parent_surname', 'text', tx('Surname', 'Van'), { required: true, savesTo: 'parent.surname' }),
          question('parent_id', 'text', tx('ID number', 'ID-nommer')),
          question('parent_contact', 'phone', tx('Contact number', 'Kontaknommer'), { required: true, savesTo: 'parent.contact' }),
          question('parent_email', 'email', tx('Email', 'E-pos'), { savesTo: 'parent.email' }),
          question('parent_address', 'paragraph', tx('Address', 'Adres'), { width: 'full' })
        ]
      },
      {
        id: 'emergency', title: tx('Emergency contact details', 'Kontakbesonderhede (indien noodgeval)'), color: 'green', keepForSibling: true, showOnThankYou: false,
        questions: [
          question('em_name', 'text', tx('Name', 'Naam'), { required: true }),
          question('em_surname', 'text', tx('Surname', 'Van')),
          question('em_relationship', 'text', tx('Relationship', 'Verhouding')),
          question('em_contact', 'phone', tx('Contact number', 'Kontaknommer'), { required: true })
        ]
      },
      {
        id: 'learner', title: tx('Learner details', 'Leerder se besonderhede'), color: 'pink', keepForSibling: false, showOnThankYou: false,
        questions: [
          question('learner_first', 'text', tx('Name', 'Naam'), { required: true, savesTo: 'learner.firstName' }),
          question('learner_last', 'text', tx('Surname', 'Van'), { required: true, savesTo: 'learner.lastName' }),
          question('learner_contact', 'phone', tx('Contact number', 'Kontaknommer'), { required: true, savesTo: 'learner.contact' }),
          question('learner_grade', 'number', tx(`Grade in ${year}`, `Graad in ${year}`), { required: true, savesTo: 'learner.grade' }),
          question('learner_dob', 'date', tx('Date of birth', 'Geboortedatum'))
        ]
      },
      {
        id: 'lessons_section', title: tx('Lessons', 'Klasse'), color: 'lilac', keepForSibling: false, showOnThankYou: false,
        questions: [
          // Prices live in each option's price box; the form adds them to the
          // wording ("Online – individual @ R300 per hour").
          question('lessons', 'single', tx('How would you like lessons?', 'Hoe wil jy klasse neem?'), {
            required: true,
            priceKind: 'rate',
            width: 'full',
            options: [
              option('online_individual', tx('Online – individual', 'Aanlyn – individueel'), { rate: 300 }),
              option('online_group', tx('Online – groups', 'Aanlyn – groepe'), { rate: 200 }),
              option('in_person', tx('In person', 'In persoon'), { rate: 150 })
            ]
          })
        ]
      },
      {
        id: 'registration_section', title: tx(`${year} registration (mathematics)`, `Registrasie vir ${year} (wiskunde)`), color: 'lilac', keepForSibling: false, showOnThankYou: false,
        questions: [
          question('registration', 'single', tx(`Registration for ${year} (mathematics)`, `Registrasie vir ${year} (wiskunde)`), {
            required: true,
            priceKind: 'fee',
            width: 'full',
            options: [
              option('gr8_9', tx('GR 8–9', 'GR 8–9'), { fee: 1500 }),
              option('gr10_11', tx('GR 10–11', 'GR 10–11'), { fee: 1500 }),
              option('gr12', tx('GR 12', 'GR 12'), { fee: 1500 })
            ]
          })
        ]
      },
      {
        id: 'terms', title: tx('Important information / terms & conditions', 'Belangrike inligting / voorwaardes'), color: 'teal', keepForSibling: false, showOnThankYou: false,
        questions: [
          question('terms_text', 'info', tx('Terms and conditions', 'Terme en voorwaardes'), { width: 'full', ticks: true, text: tx(TERMS_EN.join('\n'), TERMS_AF.join('\n')) }),
          question('accept_terms', 'checkbox', tx('I accept the terms and conditions', 'Ek aanvaar die terme en voorwaardes'), { required: true, width: 'full' }),
          question('popia', 'checkbox', tx(
            'I agree that Multiplying Minds may store these details for tutoring and billing.',
            'Ek stem in dat Multiplying Minds hierdie besonderhede mag stoor vir onderrig en fakturering.'
          ), { required: true, width: 'full' })
        ]
      },
      {
        id: 'sign', title: tx('Signature', 'Handtekening'), color: 'plain', keepForSibling: false, showOnThankYou: false,
        questions: [
          question('signature', 'signature', tx('Signature', 'Handtekening'), { required: true, width: 'full' })
        ]
      },
      {
        id: 'banking', title: tx('Banking details', 'Bankbesonderhede'), color: 'slate', keepForSibling: false, showOnThankYou: true,
        questions: [
          // Filled in from Settings > General, so it always matches the invoices.
          question('bank_details', 'bank', tx('Banking details', 'Bankbesonderhede'), { width: 'full' })
        ]
      }
    ]
  }
}
