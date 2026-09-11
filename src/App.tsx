import { useMemo, useState } from 'react'

type Location = {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
}

type Connector = {
  id: string
  from: string
  to: string
  color: string
  arrows: 'none' | 'start' | 'end' | 'both'
}

const GRID_COLS = 10
const GRID_ROWS = 6
const CELL = 34

const initialLocations: Location[] = [
  { id: 'loc-1', name: 'Локация 1', x: 180, y: 180, width: 420, height: 252 },
  { id: 'loc-2', name: 'Локация 2', x: 760, y: 290, width: 420, height: 252 },
]

const initialConnectors: Connector[] = [
  { id: 'conn-1', from: 'loc-1', to: 'loc-2', color: '#7b8494', arrows: 'both' },
]

function transitionPoint(location: Location, side: 'right' | 'left') {
  return {
    x: side === 'right' ? location.x + location.width : location.x,
    y: location.y + location.height / 2,
  }
}

export function App() {
  const [mode, setMode] = useState<'viewer' | 'editor'>('editor')
  const [locations, setLocations] = useState(initialLocations)
  const [connectors, setConnectors] = useState(initialConnectors)
  const [selected, setSelected] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)

  const locationMap = useMemo(() => new Map(locations.map((item) => [item.id, item])), [locations])

  function addLocation() {
    const id = `loc-${Date.now()}`
    setLocations((current) => [
      ...current,
      {
        id,
        name: `Локация ${current.length + 1}`,
        x: 360 + current.length * 40,
        y: 620 + current.length * 40,
        width: 420,
        height: 252,
      },
    ])
    setSelected(id)
  }

  function moveLocation(id: string, dx: number, dy: number) {
    if (mode !== 'editor') return
    setLocations((current) => current.map((item) => item.id === id ? { ...item, x: item.x + dx, y: item.y + dy } : item))
  }

  function deleteSelected() {
    if (!selected || mode !== 'editor') return
    setLocations((current) => current.filter((item) => item.id !== selected))
    setConnectors((current) => current.filter((item) => item.from !== selected && item.to !== selected))
    setSelected(null)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">SHADOW SITE</div>
        <div className="mode-switch">
          <button className={mode === 'viewer' ? 'active' : ''} onClick={() => setMode('viewer')}>Просмотр</button>
          <button className={mode === 'editor' ? 'active' : ''} onClick={() => setMode('editor')}>Редактор</button>
        </div>
        <div className="top-actions">
          <button onClick={() => setZoom((value) => Math.max(0.4, value - 0.1))}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((value) => Math.min(2, value + 0.1))}>+</button>
        </div>
      </header>

      <aside className="toolbar">
        <button title="Выбор">↖</button>
        {mode === 'editor' && <button title="Добавить локацию" onClick={addLocation}>＋</button>}
        {mode === 'editor' && <button title="Удалить выбранное" onClick={deleteSelected}>⌫</button>}
      </aside>

      <main className="canvas-shell">
        <div className="canvas" onClick={() => setSelected(null)}>
          <svg
            className="map"
            width="2200"
            height="1400"
            viewBox="0 0 2200 1400"
            style={{ transform: `scale(${zoom})` }}
          >
            <defs>
              <pattern id="canvas-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#20252d" strokeWidth="1" />
              </pattern>
              <marker id="arrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                <path d="M0,0 L9,4.5 L0,9 Z" fill="context-stroke" />
              </marker>
            </defs>
            <rect width="2200" height="1400" fill="url(#canvas-grid)" />

            {connectors.map((connector) => {
              const from = locationMap.get(connector.from)
              const to = locationMap.get(connector.to)
              if (!from || !to) return null
              const a = transitionPoint(from, 'right')
              const b = transitionPoint(to, 'left')
              const midX = (a.x + b.x) / 2
              const markerStart = connector.arrows === 'start' || connector.arrows === 'both' ? 'url(#arrow)' : undefined
              const markerEnd = connector.arrows === 'end' || connector.arrows === 'both' ? 'url(#arrow)' : undefined
              return (
                <path
                  key={connector.id}
                  d={`M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`}
                  fill="none"
                  stroke={connector.color}
                  strokeWidth="4"
                  markerStart={markerStart}
                  markerEnd={markerEnd}
                />
              )
            })}

            {locations.map((location) => (
              <g
                key={location.id}
                className={`location ${selected === location.id ? 'selected' : ''}`}
                transform={`translate(${location.x} ${location.y})`}
                onClick={(event) => { event.stopPropagation(); setSelected(location.id) }}
                onPointerDown={(event) => {
                  if (mode !== 'editor') return
                  const startX = event.clientX
                  const startY = event.clientY
                  const move = (moveEvent: PointerEvent) => moveLocation(location.id, (moveEvent.clientX - startX) / zoom, (moveEvent.clientY - startY) / zoom)
                  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
                  window.addEventListener('pointermove', move)
                  window.addEventListener('pointerup', up)
                }}
              >
                <rect width={location.width} height={location.height} rx="10" className="location-bg" />
                <rect width={location.width} height={location.height} rx="10" className="location-frame" />
                <text x="18" y="28" className="location-title">{location.name}</text>

                <g className="transition-grid">
                  {Array.from({ length: GRID_ROWS * GRID_COLS }, (_, index) => {
                    const col = index % GRID_COLS
                    const row = Math.floor(index / GRID_COLS)
                    return <rect key={index} x={18 + col * CELL} y={48 + row * CELL} width={CELL} height={CELL} />
                  })}
                </g>
                <circle cx={location.width} cy={location.height / 2} r="8" className="anchor" />
                <circle cx={0} cy={location.height / 2} r="8" className="anchor" />
              </g>
            ))}
          </svg>
        </div>
      </main>

      {selected && mode === 'editor' && (
        <section className="inspector">
          <div className="inspector-title">Локация</div>
          <input
            value={locationMap.get(selected)?.name ?? ''}
            onChange={(event) => setLocations((current) => current.map((item) => item.id === selected ? { ...item, name: event.target.value } : item))}
          />
          <div className="inspector-note">Следующий этап: редактирование переходов, точек привязки, рамок территорий и свойств локации.</div>
        </section>
      )}
    </div>
  )
}
