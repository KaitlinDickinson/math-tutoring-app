import { useState } from 'react'
import { todayISO } from '../lib/helpers'
import Modal from './Modal'

export default function MarkPaidModal({ invoice, onClose, onConfirm }) {
  const [date, setDate] = useState(todayISO())
  const [method, setMethod] = useState('EFT')

  return (
    <Modal
      title={`Mark ${invoice.studentName}'s invoice as paid`}
      onClose={onClose}
      footer={<>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-accent" onClick={() => onConfirm({ paidDate: date, paidMethod: method })}>Confirm paid</button>
      </>}
    >
      <div className="field">
        <label>Date paid</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="field">
        <label>Payment method</label>
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="EFT">EFT</option>
          <option value="Card">Card</option>
        </select>
      </div>
    </Modal>
  )
}
