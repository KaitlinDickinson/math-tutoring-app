// Images are stored inside the settings document itself (Firestore docs max
// out at 1MB and Firebase Storage isn't on the free plan), so shrink them first.
// The logo prints at up to 360px wide and PDFs render at 2x, so keep over 2x that
// for it to stay sharp.
export const LOGO_SIZE = { maxW: 900, maxH: 360 }
// The watermark prints faintly on white paper, so a white-backed JPEG keeps
// it small enough to sit in the same document as the logo.
export const WATERMARK_SIZE = { maxW: 600, maxH: 600, jpeg: true }

export function resizeImage(file, { maxW, maxH, jpeg }) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      // SVGs without a set size can report 0x0; fall back to the max box.
      const w = img.width || maxW
      const h = img.height || maxH
      const scale = Math.min(1, maxW / w, maxH / h)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      const ctx = canvas.getContext('2d')
      if (jpeg) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height) }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(img.src)
      // PNG keeps the logo's transparent background.
      resolve(jpeg ? canvas.toDataURL('image/jpeg', 0.85) : canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error("That image couldn't be read. Try a PNG or JPG."))
    img.src = URL.createObjectURL(file)
  })
}
