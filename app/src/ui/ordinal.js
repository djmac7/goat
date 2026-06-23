// "1st / 2nd / 3rd / 11th / 94th" — used on the percentile reveal + result card.
export function ordinalSuffix(n) {
  const v = n % 100
  if (v >= 11 && v <= 13) return 'th'
  switch (n % 10) {
    case 1: return 'st'
    case 2: return 'nd'
    case 3: return 'rd'
    default: return 'th'
  }
}
