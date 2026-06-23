import { useState } from 'react'
import { teamLogoUrl } from './assets.js'
import { readableText } from './helpers.js'

// Franchise logo with graceful fallback to the abbreviation badge on the team color.
export default function TeamLogo({ franchise, color = '#2a2a36', size = 26, badge = true }) {
  const [broken, setBroken] = useState(false)
  const url = teamLogoUrl(franchise)
  if (url && !broken) {
    return (
      <img
        className="tlogo"
        src={url}
        alt=""
        crossOrigin="anonymous"
        loading="lazy"
        decoding="async"
        width={size}
        height={size}
        onError={() => setBroken(true)}
      />
    )
  }
  if (!badge) return null
  return (
    <span
      className="tlogo-badge"
      style={{ width: size, height: size, background: color, color: readableText(color), fontSize: Math.round(size * 0.34) }}
    >
      {franchise}
    </span>
  )
}
