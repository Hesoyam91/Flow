import { useMemo } from 'react'

// Campo de estrellas fijo con posiciones pseudoaleatorias reproducibles.
export default function Stars({ count = 90 }) {
  const stars = useMemo(() => {
    let seed = 7
    const rnd = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    return Array.from({ length: count }, () => {
      const size = rnd() < 0.15 ? 3 : rnd() < 0.5 ? 2 : 1.4
      return { left: `${rnd() * 100}%`, top: `${rnd() * 100}%`, size, delay: `${(rnd() * 4).toFixed(2)}s`, dur: `${(3 + rnd() * 4).toFixed(2)}s` }
    })
  }, [count])

  return (
    <div className="stars" aria-hidden="true">
      {stars.map((s, i) => (
        <i key={i} style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay, animationDuration: s.dur }} />
      ))}
    </div>
  )
}
