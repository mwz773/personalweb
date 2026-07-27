import { useEffect, useMemo, useRef, useState } from 'react'
import createGlobe from 'cobe'
import { findJournalPlace } from '../lib/journal-places'
import { publicPath, type PortfolioNode } from '../lib/nodes'

type JournalMarker = {
  locationName: string
  lat: number
  lng: number
  entries: PortfolioNode[]
}

type JournalGlobeProps = {
  entries: PortfolioNode[]
  imageUrls: Record<string, string>
}

function entryDate(entry: PortfolioNode): string {
  return entry.published_at
    ? new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(new Date(entry.published_at))
    : 'Journal entry'
}

function projectMarker(lat: number, lng: number, phi: number, theta: number, radius: number) {
  const latRad = (lat * Math.PI) / 180
  const lngRad = (lng * Math.PI) / 180
  let x = Math.cos(latRad) * Math.sin(lngRad)
  let y = Math.sin(latRad)
  let z = Math.cos(latRad) * Math.cos(lngRad)
  const x1 = x * Math.cos(phi) + z * Math.sin(phi)
  const z1 = -x * Math.sin(phi) + z * Math.cos(phi)
  x = x1
  z = z1
  const y1 = y * Math.cos(theta) - z * Math.sin(theta)
  const z2 = y * Math.sin(theta) + z * Math.cos(theta)
  y = y1
  z = z2
  return { x: x * radius, y: -y * radius, visible: z > .05 }
}

export default function JournalGlobe({ entries, imageUrls }: JournalGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const markerElements = useRef(new Map<string, HTMLButtonElement>())
  const phiRef = useRef(0)
  const thetaRef = useRef(.28)
  const pointerRef = useRef({ x: 0, down: false })
  const [size, setSize] = useState(0)
  const [activeMarker, setActiveMarker] = useState<JournalMarker | null>(null)
  const markers = useMemo(() => {
    const byLocation = new Map<string, JournalMarker>()
    entries.forEach((entry) => {
      const place = findJournalPlace(entry.location_name)
      if (!place || !entry.location_name) return
      const existing = byLocation.get(entry.location_name)
      if (existing) existing.entries.push(entry)
      else byLocation.set(entry.location_name, { locationName: entry.location_name, lat: place.lat, lng: place.lng, entries: [entry] })
    })
    return [...byLocation.values()]
  }, [entries])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const updateSize = () => setSize(Math.max(320, Math.min(560, container.clientWidth)))
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const placeOverlayMarkers = () => {
      const radius = size / 2 - 12
      markers.forEach((marker) => {
        const element = markerElements.current.get(marker.locationName)
        if (!element) return
        const projected = projectMarker(marker.lat, marker.lng, phiRef.current, thetaRef.current, radius)
        element.style.opacity = projected.visible ? '1' : '0'
        element.style.pointerEvents = projected.visible ? 'auto' : 'none'
        element.style.transform = `translate(calc(-50% + ${projected.x}px), calc(-50% + ${projected.y}px))`
      })
    }
    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: size * dpr,
      height: size * dpr,
      phi: phiRef.current,
      theta: thetaRef.current,
      dark: 0,
      diffuse: 1.2,
      scale: 1,
      mapSamples: 16000,
      mapBrightness: 6,
      baseColor: [.965, .933, .898],
      markerColor: [.573, .153, .141],
      glowColor: [.965, .933, .898],
      markers: markers.map((marker) => ({ location: [marker.lat, marker.lng] as [number, number], size: .05 })),
    })
    const onPointerDown = (event: PointerEvent) => {
      pointerRef.current.down = true
      pointerRef.current.x = event.clientX
      canvas.style.cursor = 'grabbing'
    }
    const onPointerUp = () => {
      pointerRef.current.down = false
      canvas.style.cursor = 'grab'
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!pointerRef.current.down) return
      phiRef.current += (event.clientX - pointerRef.current.x) * .005
      pointerRef.current.x = event.clientX
    }
    canvas.style.cursor = 'grab'
    canvas.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointermove', onPointerMove)
    let animationFrame = 0
    const render = () => {
      if (!pointerRef.current.down) phiRef.current += .0022
      globe.update({ phi: phiRef.current, theta: thetaRef.current, width: size * dpr, height: size * dpr })
      placeOverlayMarkers()
      animationFrame = window.requestAnimationFrame(render)
    }
    render()
    return () => {
      window.cancelAnimationFrame(animationFrame)
      globe.destroy()
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointermove', onPointerMove)
    }
  }, [markers, size])

  function openEntry(entry: PortfolioNode) { window.location.href = publicPath(entry) }
  function openMarker(marker: JournalMarker) {
    if (marker.entries.length === 1) openEntry(marker.entries[0])
    else setActiveMarker(marker)
  }

  if (!markers.length) return <section className="journal-globe-empty" aria-labelledby="journal-globe-heading"><p className="eyebrow">Places</p><h3 id="journal-globe-heading">Journal globe</h3><p>Add a Place to a Journal entry, then add that exact place to the local coordinate list to place it on the globe.</p></section>

  return <section className="journal-globe" aria-labelledby="journal-globe-heading"><div className="journal-globe-frame" ref={containerRef} onMouseLeave={() => setActiveMarker(null)}><div className="journal-globe-canvas-wrap" style={{ width: size, height: size }}><canvas ref={canvasRef} aria-label="Interactive globe showing Journal locations" style={{ width: size, height: size, touchAction: 'none' }} />{markers.map((marker) => <button type="button" className="journal-globe-marker" key={marker.locationName} ref={(element) => { if (element) markerElements.current.set(marker.locationName, element); else markerElements.current.delete(marker.locationName) }} onMouseEnter={() => setActiveMarker(marker)} onFocus={() => setActiveMarker(marker)} onClick={() => openMarker(marker)}>{marker.locationName}</button>)}</div>{activeMarker ? <aside className="journal-globe-preview"><p>{activeMarker.locationName}</p>{activeMarker.entries.map((entry) => <button type="button" key={entry.id} onClick={() => openEntry(entry)}><span>{entry.cover_image_path && imageUrls[entry.cover_image_path] ? <img src={imageUrls[entry.cover_image_path]} alt="" /> : <i aria-hidden="true">✦</i>}</span><strong>{entry.title}</strong><small>{entryDate(entry)}</small></button>)}</aside> : null}</div><footer><span id="journal-globe-heading">places</span><span>{markers.map((marker) => marker.locationName).join(' · ')}</span></footer></section>
}
