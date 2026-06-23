import { useState } from 'react'
import { initials, readableText } from './helpers.js'

// Player chip. Renders the real headshot when a `src` URL is given, falling back to initials
// on the team color the moment the image is missing or 404s — so the UI is always complete
// (App spec §1 resilience). crossOrigin lets the result-card PNG export inline the image.
export default function Avatar({ name, src, color = '#333', size = 44, rounded = 9 }) {
  const [broken, setBroken] = useState(false)
  const show = src && !broken
  const style = {
    width: size,
    height: size,
    borderRadius: rounded,
    background: color,
    color: readableText(color),
    fontSize: Math.round(size * 0.36),
  }
  return (
    <div className="avatar" style={style} aria-hidden="true">
      {show ? (
        <img src={src} alt="" crossOrigin="anonymous" loading="lazy" decoding="async" onError={() => setBroken(true)} />
      ) : (
        <span>{initials(name)}</span>
      )}
    </div>
  )
}
