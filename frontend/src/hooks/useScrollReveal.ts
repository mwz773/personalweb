import { useEffect, useRef } from 'react'

export function useScrollReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const container = ref.current
    if (!container || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const elements = Array.from(container.querySelectorAll<HTMLElement>('[data-reveal]'))
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-revealed')
        observer.unobserve(entry.target)
      }
    }), { threshold: .12 })
    elements.forEach((element, index) => {
      element.style.setProperty('--reveal-delay', `${Math.min(index * 55, 220)}ms`)
      observer.observe(element)
    })
    return () => observer.disconnect()
  }, [])

  return ref
}
