import { t, answerText, DISPLAY_TYPES } from '../../lib/registration'
import { formatDate } from '../../lib/helpers'

/** When a registration was sent, as a readable date and time. */
export function submittedLabel(reg) {
  const d = reg.submittedAt?.toDate ? reg.submittedAt.toDate() : null
  return d ? `${formatDate(d)} ${d.toTimeString().slice(0, 5)}` : '—'
}

/**
 * Every answer on a registration, grouped by the form's sections as they
 * were when the parent sent it. Admin only: includes ID numbers, addresses
 * and the signature.
 */
export default function RegistrationDetails({ registration }) {
  const form = registration.form || { sections: [] }
  const lang = 'en'
  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        Sent {submittedLabel(registration)} · {registration.year} form · filled in in {registration.lang === 'af' ? 'Afrikaans' : 'English'}
        {registration.status === 'rejected' && registration.rejectNote ? ` · Rejected: ${registration.rejectNote}` : ''}
      </p>
      <dl className="reg-answers">
        {form.sections.map((s) => {
          const qs = (s.questions || []).filter((q) => !DISPLAY_TYPES.includes(q.type))
          if (!qs.length) return null
          return [
            <h4 key={`${s.id}-h`}>{t(s.title, lang)}</h4>,
            ...qs.map((q) => [
              <dt key={`${q.id}-q`}>{t(q.label, lang)}</dt>,
              <dd key={`${q.id}-a`}>
                {q.type === 'signature'
                  ? (registration.signatures?.[q.id] ? <img src={registration.signatures[q.id]} alt="Signature" /> : <span className="muted">—</span>)
                  : q.type === 'date' && registration.answers?.[q.id]
                    ? formatDate(registration.answers[q.id])
                    : (answerText(q, registration.answers?.[q.id], lang) || <span className="muted">—</span>)}
              </dd>
            ])
          ]
        })}
      </dl>
    </div>
  )
}
