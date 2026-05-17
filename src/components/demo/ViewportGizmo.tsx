import React, { useRef } from "react";
import type { Vec3, ViewState } from "../../types/projector";

const GIZMO_CENTER = 72;
const GIZMO_AXIS_RADIUS = 44;
const GIZMO_VIEWBOX_SIZE = 144;
const axes = [
  { key: "+X", label: "X", direction: [1, 0, 0] as Vec3, color: "#ef4444" },
  { key: "-X", label: "X", direction: [-1, 0, 0] as Vec3, color: "#ef4444", negative: true },
  { key: "+Y", label: "Y", direction: [0, 1, 0] as Vec3, color: "#22c55e" },
  { key: "-Y", label: "Y", direction: [0, -1, 0] as Vec3, color: "#22c55e", negative: true },
  { key: "+Z", label: "Z", direction: [0, 0, 1] as Vec3, color: "#3b82f6" },
  { key: "-Z", label: "Z", direction: [0, 0, -1] as Vec3, color: "#3b82f6", negative: true },
];

export function ViewportGizmo({
  view,
  onOrbit,
  onSnap,
  onReset,
}: {
  view: ViewState | null;
  onOrbit: (dx: number, dy: number) => void;
  onSnap: (direction: Vec3) => void;
  onReset: () => void;
}) {
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const projected = axes
    .map((axis) => ({ ...axis, point: projectGizmoAxis(axis.direction, view) }))
    .sort((a, b) => a.point.depth - b.point.depth);

  return (
    <div
      className="fixed right-5 top-5 z-20 h-36 w-36 select-none rounded-full bg-white/65 shadow-lg ring-1 ring-slate-900/10 backdrop-blur"
      aria-label="Viewport orientation"
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        dragRef.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!dragRef.current) return;
        const dx = event.clientX - dragRef.current.x;
        const dy = event.clientY - dragRef.current.y;
        dragRef.current = { x: event.clientX, y: event.clientY };
        onOrbit(dx, dy);
      }}
      onPointerUp={(event) => {
        dragRef.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onDoubleClick={onReset}
    >
      <svg className="h-full w-full" viewBox={`0 0 ${GIZMO_VIEWBOX_SIZE} ${GIZMO_VIEWBOX_SIZE}`} role="presentation">
        <defs>
          <radialGradient id="viewport-gizmo-globe" cx="36%" cy="28%" r="70%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="72%" stopColor="#eef2f7" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </radialGradient>
        </defs>
        <circle cx={GIZMO_CENTER} cy={GIZMO_CENTER} r="38" fill="url(#viewport-gizmo-globe)" stroke="rgba(15,23,42,.16)" />
        <ellipse cx={GIZMO_CENTER} cy={GIZMO_CENTER} rx="38" ry="11" fill="none" stroke="rgba(15,23,42,.12)" />
        <ellipse cx={GIZMO_CENTER} cy={GIZMO_CENTER} rx="11" ry="38" fill="none" stroke="rgba(15,23,42,.1)" />
        {projected.map((axis) => {
          const muted = axis.point.depth < 0;
          return (
            <g key={axis.key} opacity={muted ? 0.38 : 1}>
              <line
                x1={GIZMO_CENTER}
                y1={GIZMO_CENTER}
                x2={axis.point.x}
                y2={axis.point.y}
                stroke={axis.color}
                strokeWidth={muted ? 2 : 3}
                strokeLinecap="round"
              />
            </g>
          );
        })}
      </svg>
      {projected.map((axis) => (
        <button
          key={axis.key}
          type="button"
          title={`${axis.negative ? "Negative " : ""}${axis.label} view`}
          className="absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/80 text-xs font-bold text-white shadow-md transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
          style={{
            left: axis.point.x,
            top: axis.point.y,
            backgroundColor: axis.color,
            opacity: axis.point.depth < 0 ? 0.55 : 1,
            zIndex: axis.point.depth < 0 ? 1 : 2,
          }}
          onClick={(event) => {
            event.stopPropagation();
            onSnap(axis.direction);
          }}
        >
          {axis.negative ? `-${axis.label}` : axis.label}
        </button>
      ))}
      <button
        type="button"
        title="Reset view"
        className="absolute left-1/2 top-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-900/10 hover:bg-white"
        onClick={(event) => {
          event.stopPropagation();
          onReset();
        }}
      >
        ⌂
      </button>
    </div>
  );
}

function projectGizmoAxis(axis: Vec3, view: ViewState | null) {
  if (!view) {
    return { x: GIZMO_CENTER + axis[0] * GIZMO_AXIS_RADIUS, y: GIZMO_CENTER - axis[1] * GIZMO_AXIS_RADIUS, depth: axis[2] };
  }
  const x = dot(axis, view.right);
  const y = -dot(axis, view.up);
  const depth = dot(axis, view.forward);
  return {
    x: GIZMO_CENTER + x * GIZMO_AXIS_RADIUS,
    y: GIZMO_CENTER + y * GIZMO_AXIS_RADIUS,
    depth,
  };
}

function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
