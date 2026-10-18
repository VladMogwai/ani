import { useCallback, useEffect, useRef, type RefObject } from 'react'

// Full-screen copy of the panel with "hi"; on click or timeout it shrinks onto the real panel
const CONFIG = {
  hold: 60000, // ms before it opens by itself
  shrink: 1100, // ms
  easing: 'cubic-bezier(.76, 0, .24, 1)',
  textOut: 450, // ms, "hi" fades while the panel starts shrinking
}

export function Intro({ panelRef, onDone }: { panelRef: RefObject<HTMLElement | null>; onDone: () => void }) {
  const coverRef = useRef<HTMLDivElement>(null)
  const hiRef = useRef<HTMLDivElement>(null)
  const started = useRef(false)

  const open = useCallback(() => {
    if (started.current) return
    started.current = true
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return onDone()

    const r = panelRef.current!.getBoundingClientRect()
    const cs = getComputedStyle(panelRef.current!)
    hiRef.current!.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.92)' }], {
      duration: CONFIG.textOut,
      easing: 'ease-in',
      fill: 'forwards',
    })
    // the intro's depth (vignette, reflection, darker glass) melts into the panel's look while it shrinks
    coverRef.current!.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: CONFIG.shrink,
      easing: 'ease-in',
      fill: 'forwards',
      pseudoElement: '::before',
    })
    // same shadow list on both ends so the inner shadows fade out while the outer one fades in
    const innerShadows = getComputedStyle(coverRef.current!).boxShadow
    const shrink = coverRef.current!.animate(
      [
        {
          inset: '0px',
          borderWidth: '0px',
          borderRadius: '0px',
          boxShadow: `${innerShadows}, 0 30px 80px 0 transparent`,
        },
        {
          inset: `${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px`,
          borderWidth: cs.borderTopWidth,
          borderRadius: cs.borderTopLeftRadius,
          backgroundColor: cs.backgroundColor,
          boxShadow: `inset 0 0 0 0 transparent, inset 0 0 0 0 transparent, ${cs.boxShadow}`,
        },
      ],
      { duration: CONFIG.shrink, easing: CONFIG.easing, fill: 'forwards' },
    )
    shrink.onfinish = onDone
  }, [panelRef, onDone])

  useEffect(() => {
    // keep the page still under the cover so the measured panel position stays valid
    const root = document.documentElement
    root.style.overflow = 'hidden'
    const timer = setTimeout(open, CONFIG.hold)
    return () => {
      clearTimeout(timer)
      root.style.overflow = ''
    }
  }, [open])

  return (
    <div
      ref={coverRef}
      className="panel intro"
      onClick={(e) => {
        e.stopPropagation()
        open()
      }}
    >
      {/* "hi" is a window into the backdrop: the same gradient and blobs, cut out by a multiply mask */}
      <div ref={hiRef} className="intro-hi">
        <div className="blobs" aria-hidden><i /><i /><i /><i /><i /></div>
        <div className="intro-hi-mask">hello</div>
      </div>
    </div>
  )
}
