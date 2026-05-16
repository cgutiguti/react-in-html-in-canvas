import {
  describeTarget,
  dispatchProjectedPointerEvent,
  isClickable,
  updateRangeFromProjectedPoint,
} from "./domHitTest";

export type ProjectedPointerHit = {
  x: number;
  y: number;
  u: number;
  v: number;
};

export type ProjectedDomViewport = {
  hitTest(hit: ProjectedPointerHit): HTMLElement | null;
  routePointer(event: PointerEvent, hit: ProjectedPointerHit): { target: HTMLElement | null; captured: HTMLElement | null };
  releasePointer(pointerId: number): void;
  getCapturedTarget(): HTMLElement | null;
  getLastDebug(): ProjectedDomDebug | null;
};

export type ProjectedDomDebug = {
  x: number;
  y: number;
  rootRect: string;
  panelRect: string;
  element: string;
  contained: boolean;
  target: string;
  controls: number;
};

export function createProjectedDomViewport(panel: HTMLElement): ProjectedDomViewport {
  const state: {
    capturedTarget: HTMLElement | null;
    activeRange: HTMLInputElement | null;
    lastDebug: ProjectedDomDebug | null;
  } = {
    capturedTarget: null,
    activeRange: null,
    lastDebug: null,
  };
  const root = panel.parentElement;

  function hitTest(hit: ProjectedPointerHit) {
    const previousPointerEvents = root?.style.pointerEvents ?? "";
    if (root) {
      root.style.pointerEvents = "auto";
    }
    try {
      const element = document.elementFromPoint(hit.x, hit.y);
      const target =
        element && panel.contains(element)
          ? element.closest<HTMLElement>("button, input, select, textarea, [role='button'], [role='switch'], [tabindex]")
          : null;
      state.lastDebug = {
        x: Math.round(hit.x),
        y: Math.round(hit.y),
        rootRect: root ? formatRect(root.getBoundingClientRect()) : "none",
        panelRect: formatRect(panel.getBoundingClientRect()),
        element: element ? describeElement(element) : "none",
        contained: Boolean(element && panel.contains(element)),
        target: target ? describeElement(target) : "none",
        controls: panel.querySelectorAll("button, input, select, textarea, [role='button'], [role='switch'], [tabindex]").length,
      };
      return target;
    } finally {
      if (root) {
        root.style.pointerEvents = previousPointerEvents;
      }
    }
  }

  function routePointer(event: PointerEvent, hit: ProjectedPointerHit) {
    if (state.activeRange && (event.type === "pointermove" || event.type === "pointerup")) {
      updateRangeFromProjectedPoint(state.activeRange, panel, hit.x, new Map());
      if (event.type === "pointerup") {
        state.activeRange = null;
        state.capturedTarget = null;
      }
      return { target: state.activeRange, captured: state.capturedTarget };
    }

    const target = hitTest(hit);
    const captured = state.capturedTarget;

    if (captured && event.type === "pointermove") {
      dispatchProjectedPointerEvent(captured, "pointermove", event, panel, hit.x, hit.y);
      return { target, captured };
    }

    if (event.type === "pointerdown" && target) {
      state.capturedTarget = target;
      dispatchProjectedPointerEvent(target, "pointerdown", event, panel, hit.x, hit.y);
      dispatchMouseEvent(target, "mousedown", event, panel, hit.x, hit.y);

      if (target instanceof HTMLInputElement && target.type === "range") {
        state.activeRange = target;
        updateRangeFromProjectedPoint(target, panel, hit.x, new Map());
      } else if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        target.focus();
      }

      return { target, captured: state.capturedTarget };
    }

    if (event.type === "pointerup") {
      if (captured) {
        dispatchProjectedPointerEvent(captured, "pointerup", event, panel, hit.x, hit.y);
        dispatchMouseEvent(captured, "mouseup", event, panel, hit.x, hit.y);
        if (isClickable(captured)) {
          captured.click();
        }
      }
      state.capturedTarget = null;
      state.activeRange = null;
      return { target, captured };
    }

    return { target, captured };
  }

  return {
    hitTest,
    routePointer,
    releasePointer() {
      state.capturedTarget = null;
      state.activeRange = null;
    },
    getCapturedTarget() {
      return state.capturedTarget;
    },
    getLastDebug() {
      return state.lastDebug;
    },
  };
}

export function describeProjectedDomTarget(target: HTMLElement | null) {
  return target ? describeTarget(target) : "";
}

function dispatchMouseEvent(
  target: HTMLElement,
  type: string,
  source: PointerEvent,
  panel: HTMLElement,
  panelX: number,
  panelY: number,
) {
  const panelRect = panel.getBoundingClientRect();
  const clientX = panelRect.left + panelX;
  const clientY = panelRect.top + panelY;
  target.dispatchEvent(new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: source.button,
    buttons: source.buttons,
    clientX,
    clientY,
    screenX: source.screenX,
    screenY: source.screenY,
    ctrlKey: source.ctrlKey,
    altKey: source.altKey,
    shiftKey: source.shiftKey,
    metaKey: source.metaKey,
  }));
}

function formatRect(rect: DOMRect) {
  return `${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)}`;
}

function describeElement(element: Element) {
  const id = element.id ? `#${element.id}` : "";
  const className =
    typeof element.className === "string" && element.className.trim()
      ? `.${element.className.trim().split(/\s+/).slice(0, 2).join(".")}`
      : "";
  return `${element.tagName.toLowerCase()}${id}${className}`;
}
