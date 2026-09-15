import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react'

const SignaturePad = forwardRef(function SignaturePad(_, ref) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [hasSignature, setHasSignature] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const resize = () => {
      const ratio = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * ratio
      canvas.height = 180 * ratio
      const ctx = canvas.getContext('2d')
      ctx.scale(ratio, ratio)
      ctx.lineWidth = 2.2
      ctx.lineCap = 'round'
      ctx.strokeStyle = '#1b2a4a'
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const point = e.touches ? e.touches[0] : e
    return { x: point.clientX - rect.left, y: point.clientY - rect.top }
  }

  const start = (e) => {
    e.preventDefault()
    drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }
  const move = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasSignature(true)
  }
  const end = () => { drawing.current = false }

  useImperativeHandle(ref, () => ({
    isEmpty: () => !hasSignature,
    clear: () => {
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      setHasSignature(false)
    },
    toDataURL: () => canvasRef.current.toDataURL('image/png')
  }))

  return (
    <div className="sig-pad-wrap">
      {!hasSignature && <div className="sig-placeholder">Sign here with your finger or stylus</div>}
      <canvas
        ref={canvasRef}
        style={{ height: 180 }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
    </div>
  )
})

export default SignaturePad
