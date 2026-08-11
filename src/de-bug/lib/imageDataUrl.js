// Compress an image File/Blob to a JPEG data URL. Options let callers trade
// size for fidelity — feedback screenshots want small enough to sit in a DB
// text column (the kit passes { max: 1400, quality: 0.7 }).
export function fileToJpegDataUrl(file, { max = 1920, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) {
      reject(new Error('Pick an image file (JPG, PNG, WebP…)'))
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Couldn't read that image"))
    }
    img.src = url
  })
}
