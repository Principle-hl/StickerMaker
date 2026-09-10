import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/** A rectangle in world pixels (1 mm = 96/25.4 px, so zoom 1 is actual size on a 96 dpi screen). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 32;
const STEP = 1.25;
const FIT_PADDING = 64;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/**
 * Figma-style pan and zoom for the stage. The transform is written straight to
 * the world element (never through React state), so dragging costs nothing to
 * render; only the zoom level is mirrored into state for the readout.
 */
export function useViewport() {
  const stageRef = useRef<HTMLElement | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);
  const view = useRef({ x: 0, y: 0, z: 1 });
  /** Whatever is currently on the canvas, for fit / actual-size shortcuts. */
  const content = useRef<Rect | null>(null);
  const drag = useRef<{ id: number; lx: number; ly: number } | null>(null);
  /** Active touch/pen pointers, for two-finger pinch. */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; mx: number; my: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);

  const apply = useCallback(() => {
    const { x, y, z } = view.current;
    const world = worldRef.current;
    const stage = stageRef.current;
    if (world) {
      world.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
      world.style.setProperty('--inv', String(1 / z));
    }
    if (stage) {
      // Keep the grid between 16 and 48 px on screen whatever the zoom.
      let s = 24 * z;
      while (s < 16) s *= 2;
      while (s >= 48) s /= 2;
      stage.style.setProperty('--grid-size', `${s}px`);
      stage.style.setProperty('--grid-x', `${x}px`);
      stage.style.setProperty('--grid-y', `${y}px`);
    }
    setZoom(z);
  }, []);

  const stageSize = () => {
    const s = stageRef.current;
    return s ? { w: s.clientWidth, h: s.clientHeight } : { w: 0, h: 0 };
  };

  /** Zoom by `factor` keeping the stage point (cx, cy) fixed. */
  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      const v = view.current;
      const z = clampZoom(v.z * factor);
      const k = z / v.z;
      view.current = { x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k, z };
      apply();
    },
    [apply],
  );

  const zoomIn = useCallback(() => {
    const { w, h } = stageSize();
    zoomAt(STEP, w / 2, h / 2);
  }, [zoomAt]);

  const zoomOut = useCallback(() => {
    const { w, h } = stageSize();
    zoomAt(1 / STEP, w / 2, h / 2);
  }, [zoomAt]);

  const centreOn = useCallback(
    (r: Rect, z: number) => {
      const { w, h } = stageSize();
      view.current = { z, x: (w - r.w * z) / 2 - r.x * z, y: (h - r.h * z) / 2 - r.y * z };
      apply();
    },
    [apply],
  );

  const fit = useCallback(() => {
    const r = content.current;
    if (!r || !stageRef.current) return;
    const { w, h } = stageSize();
    centreOn(r, clampZoom(Math.min((w - 2 * FIT_PADDING) / r.w, (h - 2 * FIT_PADDING) / r.h)));
  }, [centreOn]);

  const actualSize = useCallback(() => {
    const r = content.current;
    if (r) centreOn(r, 1);
  }, [centreOn]);

  const setContent = useCallback((r: Rect | null) => {
    content.current = r;
  }, []);

  // Wheel: pan; with ⌘/Ctrl (which is also what a trackpad pinch sends) zoom at the cursor.
  // Registered natively because React's wheel listeners are passive and cannot preventDefault.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const dx = e.deltaX * lines, dy = e.deltaY * lines;
      if (e.ctrlKey || e.metaKey) {
        const rect = stage.getBoundingClientRect();
        zoomAt(Math.exp(Math.max(-0.25, Math.min(0.25, -dy * 0.01))), e.clientX - rect.left, e.clientY - rect.top);
      } else {
        view.current = { ...view.current, x: view.current.x - dx, y: view.current.y - dy };
        apply();
      }
    };
    // Safari reports trackpad pinch as gesture events (non-standard) instead of Ctrl+wheel.
    let gestureZoom = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureZoom = view.current.z;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale: number; clientX: number; clientY: number };
      const rect = stage.getBoundingClientRect();
      zoomAt((gestureZoom * g.scale) / view.current.z, g.clientX - rect.left, g.clientY - rect.top);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('gesturestart', onGestureStart);
    stage.addEventListener('gesturechange', onGestureChange);
    return () => {
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('gesturestart', onGestureStart);
      stage.removeEventListener('gesturechange', onGestureChange);
    };
  }, [zoomAt, apply]);

  // Keyboard, when focus is not in a field: + / - zoom, Shift+1 fit, Shift+0 actual size.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (e.isComposing || t?.closest('input, textarea, select, [contenteditable]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '+' || e.key === '=') zoomIn();
      else if (e.key === '-' || e.key === '_') zoomOut();
      else if (e.shiftKey && e.code === 'Digit1') fit();
      else if (e.shiftKey && e.code === 'Digit0') actualSize();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomIn, zoomOut, fit, actualSize]);

  const pinchState = () => {
    const [a, b] = [...pointers.current.values()];
    return { dist: Math.hypot(b.x - a.x, b.y - a.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or already-released pointers cannot be captured; dragging still works without it.
    }
    if (e.pointerType !== 'mouse') {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 2) {
        // Second finger: stop dragging, start pinching.
        drag.current = null;
        pinch.current = pinchState();
        return;
      }
    }
    drag.current = { id: e.pointerId, lx: e.clientX, ly: e.clientY };
    setDragging(true);
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.current && pointers.current.size >= 2) {
        const prev = pinch.current;
        const next = pinchState();
        const rect = e.currentTarget.getBoundingClientRect();
        // Pan by the midpoint's travel, then zoom about the new midpoint.
        view.current = { ...view.current, x: view.current.x + next.mx - prev.mx, y: view.current.y + next.my - prev.my };
        zoomAt(prev.dist > 0 ? next.dist / prev.dist : 1, next.mx - rect.left, next.my - rect.top);
        pinch.current = next;
        return;
      }
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      view.current = { ...view.current, x: view.current.x + e.clientX - d.lx, y: view.current.y + e.clientY - d.ly };
      d.lx = e.clientX;
      d.ly = e.clientY;
      apply();
    },
    [apply, zoomAt],
  );

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
  }, []);

  return {
    zoom,
    dragging,
    stageRef,
    worldRef,
    zoomIn,
    zoomOut,
    fit,
    actualSize,
    setContent,
    pointerHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}

export type Viewport = ReturnType<typeof useViewport>;
