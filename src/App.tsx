import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

type Transition = {
  id: string
  row: number
  col: number
}

type Location = {
  id: string
  name: string
  x: number
  y: number
  size: number
  transitions: Transition[]
}

type ConnectorEndpoint = {
  locationId: string
  transitionId: string
}

type Connector = {
  id: string
  from: ConnectorEndpoint
  to: ConnectorEndpoint
  color: string
  arrows: 'none' | 'start' | 'end' | 'both'
}

const GRID_COLS = 10
const GRID_ROWS = 6
const LOCATION_SIZE = 440
const CANVAS_WIDTH = 5000
const CANVAS_HEIGHT = 3500

function makeTransitions(locationId: string): Transition[] {
  return Array.from({ length: GRID_ROWS * GRID_COLS }, (_, index) => ({
    id: `${locationId}-t-${index}`,
    row: Math.floor(index / GRID_COLS),
    col: index % GRID_COLS,
  }))
}

const initialLocations: Location[] = [
  { id: 'loc-1', name: 'Локация 1', x: 600, y: 500, size: LOCATION_SIZE, transitions: makeTransitions('loc-1') },
  { id: 'loc-2', name: 'Локация 2', x: 1500, y: 800, size: LOCATION_SIZE, transitions: makeTransitions('loc-2') },
]

const initialConnectors: Connector[] = [
  {
    id: 'conn-1',
    from: { locationId: 'loc-1', transitionId: 'loc-1-t-25' },
    to: { locationId: 'loc-2', transitionId: 'loc-2-t-34' },
    color: '#7b8494',
    arrows: 'both',
  },
]

function transitionCenter(location: Location, transition: Transition) {
  const cellWidth = location.size / GRID_COLS
  const cellHeight = location.size / GRID_ROWS
  return {
    x: location.x + transition.col * cellWidth + cellWidth / 2,
    y: location.y + transition.row * cellHeight + cellHeight / 2,
  }
}

function connectorPoint(location: Location, transition: Transition, other: { x: number; y: number }) {
  const cellWidth = location.size / GRID_COLS
  const cellHeight = location.size / GRID_ROWS
  const cellLeft = location.x + transition.col * cellWidth
  const cellTop = location.y + transition.row * cellHeight
  const cellRight = cellLeft + cellWidth
  const cellBottom = cellTop + cellHeight
  const center = { x: cellLeft + cellWidth / 2, y: cellTop + cellHeight / 2 }
  const dx = other.x - center.x
  const dy = other.y - center.y

  if (Math.abs(dx / cellWidth) >= Math.abs(dy / cellHeight)) {
    return { x: dx >= 0 ? cellRight : cellLeft, y: center.y }
  }
  return { x: center.x, y: dy >= 0 ? cellBottom : cellTop }
}

export function App() {
  const [mode, setMode] = useState<'viewer' | 'editor'>('editor')
  const [locations, setLocations] = useState(initialLocations)
  const [connectors, setConnectors] = useState(initialConnectors)
  const [selected, setSelected] = useState<string | null>(null)
  const [hoveredTransition, setHoveredTransition] = useState<ConnectorEndpoint | null>(null)
  const [connectionStart, setConnectionStart] = useState<ConnectorEndpoint | null>(null)
  const [zoom, setZoom] = useState(1)
  const dragging = useRef<{ id: string; startX: number; startY: number; x: number; y: number } | null>(null)

  const locationMap = useMemo(() => new Map(locations.map((item) => [item.id, item])), [locations])

  function addLocation() {
    const id = `loc-${Date.now()}`
    setLocations((current) => [
      ...current,
      {
        id,
        name: `Локация ${current.length + 1}`,
        x: 700 + current.length * 120,
        y: 1500 + current.length * 120,
        size: LOCATION_SIZE,
        transitions: makeTransitions(id),
      },
    ])
    setSelected(id)
  }

  function startDrag(event: ReactPointerEvent<SVGGElement>, location: Location) {
    if (mode !== 'editor') return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging.current = {
      id: location.id,
      startX: event.clientX,
      startY: event.clientY,
      x: location.x,
      y: location.y,
    }
  }

  function dragLocation(event: ReactPointerEvent<SVGGElement>) {
    const drag = dragging.current
    if (!drag) return
    const dx = (event.clientX - drag.startX) / zoom
    const dy = (event.clientY - drag.startY) / zoom
    setLocations((current) => current.map((item) =>
      item.id === drag.id ? { ...item, x: drag.x + dx, y: drag.y + dy } : item,
    ))
  }

  function stopDrag() {
    dragging.current = null
  }

  function beginConnection(endpoint: ConnectorEndpoint, event: ReactPointerEvent) {
    if (mode !== 'editor') return
    event.stopPropagation()
    setConnectionStart(endpoint)
    setSelected(endpoint.locationId)
  }

  function finishConnection(endpoint: ConnectorEndpoint, event: ReactPointerEvent) {
    if (!connectionStart || mode !== 'editor') return
    event.stopPropagation()
    if (connectionStart.locationId === endpoint.locationId && connectionStart.transitionId === endpoint.transitionId) return

    setConnectors((current) => [
      ...current,
      {
        id: `conn-${Date.now()}`,
        from: connectionStart,
        to: endpoint,
        color: '#7b8494',
        arrows: 'both',
      },
    ])
    setConnectionStart(null)
  }

  function deleteSelected() {
    if (!selected || mode !== 'editor') return
    setLocations((current) => current.filter((item) => item.id !== selected))
    setConnectors((current) => current.filter((item) => item.from.locationId !== selected && item.to.locationId !== selected))
    setConnectionStart(null)
    setSelected(null)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">KARTA-CATWAR</div>
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
        <div className="canvas" onClick={() => { setSelected(null); setConnectionStart(null) }}>
          <svg
            className="map"
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
            style={{ transform: `scale(${zoom})` }}
          >
            <defs>
              <pattern id="canvas-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#20252d" strokeWidth="1" />
              </pattern>
              <marker id="arrow-end" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
                <path d="M0,0 L9,4.5 L0,9 Z" fill="context-stroke" />
              </marker>
              <marker id="arrow-start" markerWidth="9" markerHeight="9" refX="1" refY="4.5" orient="auto-start-reverse">
                <path d="M0,0 L9,4.5 L0,9 Z" fill="context-stroke" />
              </marker>
            </defs>
            <rect width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="url(#canvas-grid)" />

            {connectors.map((connector) => {
              const fromLocation = locationMap.get(connector.from.locationId)
              const toLocation = locationMap.get(connector.to.locationId)
              if (!fromLocation || !toLocation) return null
              const fromTransition = fromLocation.transitions.find((item) => item.id === connector.from.transitionId)
              const toTransition = toLocation.transitions.find((item) => item.id === connector.to.transitionId)
              if (!fromTransition || !toTransition) return null

              const fromCenter = transitionCenter(fromLocation, fromTransition)
              const toCenter = transitionCenter(toLocation, toTransition)
              const a = connectorPoint(fromLocation, fromTransition, toCenter)
              const b = connectorPoint(toLocation, toTransition, fromCenter)
              const midX = (a.x + b.x) / 2
              const markerStart = connector.arrows === 'start' || connector.arrows === 'both' ? 'url(#arrow-start)' : undefined
              const markerEnd = connector.arrows === 'end' || connector.arrows === 'both' ? 'url(#arrow-end)' : undefined

              return (
                <path
                  key={connector.id}
                  d={`M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`}
                  fill="none"
                  stroke={connector.color}
                  strokeWidth="4"
                  markerStart={markerStart}
                  markerEnd={markerEnd}
                  pointerEvents="none"
                />
              )
            })}

            {connectionStart && hoveredTransition && (() => {
              const fromLocation = locationMap.get(connectionStart.locationId)
              const toLocation = locationMap.get(hoveredTransition.locationId)
              if (!fromLocation || !toLocation) return null
              const fromTransition = fromLocation.transitions.find((item) => item.id === connectionStart.transitionId)
              const toTransition = toLocation.transitions.find((item) => item.id === hoveredTransition.transitionId)
              if (!fromTransition || !toTransition) return null
              const from = transitionCenter(fromLocation, fromTransition)
              const to = transitionCenter(toLocation, toTransition)
              return <path className="connection-preview" d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`} />
            })()}

            {locations.map((location) => (
              <g
                key={location.id}
                className={`location ${selected === location.id ? 'selected' : ''}`}
                transform={`translate(${location.x} ${location.y})`}
                onClick={(event) => { event.stopPropagation(); setSelected(location.id) }}
                onPointerDown={(event) => startDrag(event, location)}
                onPointerMove={dragLocation}
                onPointerUp={stopDrag}
                onPointerCancel={stopDrag}
              >
                <rect width={location.size} height={location.size} className="location-bg" />
                <text x={location.size / 2} y="-14" textAnchor="middle" className="location-title">{location.name}</text>

                <g className="transition-grid">
                  {location.transitions.map((transition) => {
                    const cellWidth = location.size / GRID_COLS
                    const cellHeight = location.size / GRID_ROWS
                    const endpoint = { locationId: location.id, transitionId: transition.id }
                    const isHovered = hoveredTransition?.locationId === location.id && hoveredTransition.transitionId === transition.id
                    const isStart = connectionStart?.locationId === location.id && connectionStart.transitionId === transition.id
                    const cx = transition.col * cellWidth + cellWidth / 2
                    const cy = transition.row * cellHeight + cellHeight / 2

                    return (
                      <g
                        key={transition.id}
                        className={`transition-cell ${isHovered ? 'hovered' : ''} ${isStart ? 'connection-start' : ''}`}
                        onPointerEnter={() => setHoveredTransition(endpoint)}
                        onPointerLeave={() => setHoveredTransition(null)}
                        onPointerDown={(event) => {
                          event.stopPropagation()
                          if (connectionStart) finishConnection(endpoint, event)
                        }}
                      >
                        <rect
                          x={transition.col * cellWidth}
                          y={transition.row * cellHeight}
                          width={cellWidth}
                          height={cellHeight}
                        />
                        {isHovered && mode === 'editor' && !connectionStart && (
                          <g className="transition-connect-handle" onPointerDown={(event) => beginConnection(endpoint, event)}>
                            <circle cx={cx + cellWidth / 2 - 8} cy={cy} r="13" />
                            <path d={`M ${cx + cellWidth / 2 - 13} ${cy} L ${cx + cellWidth / 2 - 3} ${cy} M ${cx + cellWidth / 2 - 7} ${cy - 4} L ${cx + cellWidth / 2 - 3} ${cy} L ${cx + cellWidth / 2 - 7} ${cy + 4}`} />
                          </g>
                        )}
                      </g>
                    )
                  })}
                </g>

                <rect width={location.size} height={location.size} className="location-frame" />
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
          <div className="inspector-note">Наведите на ячейку перехода — справа появится точка соединения. Нажмите её, затем выберите другую ячейку.</div>
        </section>
      )}
    </div>
  )
}
