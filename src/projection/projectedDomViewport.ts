import {
  describeTarget,
  dispatchProjectedPointerEvent,
  getLocalRect,
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
  routeWheel(event: WheelEvent, hit: ProjectedPointerHit): { target: HTMLElement | null; consumed: boolean };
  routePointerExit(event: PointerEvent): void;
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
  stack: string[];
  contained: boolean;
  target: string;
  controls: number;
  projectedHover: string;
};

const ROOT_HIT_TEST_Z_INDEX = "2147483647";
const DEBUG_STACK_LIMIT = 8;
const INTERACTIVE_TARGET_SELECTOR = "button, input, select, textarea, [role='button'], [role='switch'], [tabindex]";
const TEXT_INPUT_TYPES = ["", "text", "search", "url", "tel", "email", "password"];
const TEXTAREA_FALLBACK_LINE_HEIGHT_MULTIPLIER = 1.2;
const TEXTAREA_DEFAULT_LINE_HEIGHT = 16;
const DESCRIBED_CLASS_LIMIT = 2;

export function createProjectedDomViewport(panel: HTMLElement): ProjectedDomViewport {
  const state: {
    capturedTarget: HTMLElement | null;
    hoverTarget: HTMLElement | null;
    activeRange: HTMLInputElement | null;
    activeText: { element: HTMLInputElement | HTMLTextAreaElement; anchor: number } | null;
    pointerCapture: Map<number, Element>;
    projectedHoverPath: HTMLElement[];
    lastDebug: ProjectedDomDebug | null;
  } = {
    capturedTarget: null,
    hoverTarget: null,
    activeRange: null,
    activeText: null,
    pointerCapture: new Map(),
    projectedHoverPath: [],
    lastDebug: null,
  };
  const root = panel.parentElement;

  function hitTest(hit: ProjectedPointerHit) {
    const previousPointerEvents = root?.style.pointerEvents ?? "";
    const previousZIndex = root?.style.zIndex ?? "";
    if (root) {
      root.style.pointerEvents = "auto";
      root.style.zIndex = ROOT_HIT_TEST_Z_INDEX;
    }
    try {
      const element = document.elementFromPoint(hit.x, hit.y);
      const containedElement = element && panel.contains(element) ? element : null;
      const interactiveTarget = containedElement?.closest<HTMLElement>(
        INTERACTIVE_TARGET_SELECTOR,
      );
      const target =
        interactiveTarget && panel.contains(interactiveTarget)
          ? interactiveTarget
          : containedElement instanceof HTMLElement
            ? containedElement
          : null;
      state.lastDebug = {
        x: Math.round(hit.x),
        y: Math.round(hit.y),
        rootRect: root ? formatRect(root.getBoundingClientRect()) : "none",
        panelRect: formatRect(panel.getBoundingClientRect()),
        element: element ? describeElement(element) : "none",
        stack: document.elementsFromPoint(hit.x, hit.y).slice(0, DEBUG_STACK_LIMIT).map(describeElement),
        contained: Boolean(element && panel.contains(element)),
        target: target ? describeElement(target) : "none",
        controls: panel.querySelectorAll(INTERACTIVE_TARGET_SELECTOR).length,
        projectedHover: state.projectedHoverPath.map(describeElement).join(" > "),
      };
      return target;
    } finally {
      if (root) {
        root.style.pointerEvents = previousPointerEvents;
        root.style.zIndex = previousZIndex;
      }
    }
  }

  function routePointer(event: PointerEvent, hit: ProjectedPointerHit) {
    if (state.activeRange && (event.type === "pointermove" || event.type === "pointerup")) {
      updateHover(state.activeRange, event, hit);
      updateRangeFromProjectedPoint(state.activeRange, panel, hit.x, new Map());
      const activeRange = state.activeRange;
      if (event.type === "pointerup") {
        dispatchProjectedPointerEventWithCaptureBridge(activeRange, "pointerup", event, panel, hit.x, hit.y, state.pointerCapture);
        dispatchMouseEvent(activeRange, "mouseup", event, panel, hit.x, hit.y);
        state.activeRange = null;
        state.capturedTarget = null;
        state.pointerCapture.delete(event.pointerId);
      }
      return { target: activeRange, captured: activeRange };
    }

    if (state.activeText && (event.type === "pointermove" || event.type === "pointerup")) {
      updateHover(state.activeText.element, event, hit);
      updateTextSelection(state.activeText.element, panel, hit, state.activeText.anchor);
      const activeText = state.activeText.element;
      if (event.type === "pointerup") {
        dispatchProjectedPointerEventWithCaptureBridge(activeText, "pointerup", event, panel, hit.x, hit.y, state.pointerCapture);
        dispatchMouseEvent(activeText, "mouseup", event, panel, hit.x, hit.y);
        state.activeText = null;
        state.capturedTarget = null;
        state.pointerCapture.delete(event.pointerId);
      }
      return { target: activeText, captured: activeText };
    }

    const target = hitTest(hit);
    const captured = state.capturedTarget;

    if (captured && event.type === "pointermove") {
      updateHover(target, event, hit);
      dispatchProjectedPointerEventWithCaptureBridge(captured, "pointermove", event, panel, hit.x, hit.y, state.pointerCapture);
      dispatchMouseEvent(captured, "mousemove", event, panel, hit.x, hit.y);
      return { target, captured };
    }

    if (event.type === "pointerdown" && target) {
      updateHover(target, event, hit);
      state.capturedTarget = target;
      dispatchProjectedPointerEventWithCaptureBridge(target, "pointerdown", event, panel, hit.x, hit.y, state.pointerCapture);
      dispatchMouseEvent(target, "mousedown", event, panel, hit.x, hit.y);

      if (target instanceof HTMLInputElement && target.type === "range") {
        state.activeRange = target;
        updateRangeFromProjectedPoint(target, panel, hit.x, new Map());
      } else if (isTextControl(target)) {
        const caret = getTextCaretIndex(target, panel, hit);
        target.focus({ preventScroll: true });
        setTextSelection(target, caret, caret);
        state.activeText = { element: target, anchor: caret };
      } else if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        target.focus({ preventScroll: true });
      }

      return { target, captured: state.capturedTarget };
    }

    if (event.type === "pointerup") {
      if (captured) {
        updateHover(target, event, hit);
        dispatchProjectedPointerEventWithCaptureBridge(captured, "pointerup", event, panel, hit.x, hit.y, state.pointerCapture);
        dispatchMouseEvent(captured, "mouseup", event, panel, hit.x, hit.y);
        if (isClickable(captured)) {
          captured.click();
        } else {
          dispatchMouseEvent(captured, "click", event, panel, hit.x, hit.y);
        }
      }
      state.capturedTarget = null;
      state.activeRange = null;
      state.activeText = null;
      state.pointerCapture.delete(event.pointerId);
      return { target, captured };
    }

    if (event.type === "pointercancel") {
      if (captured) {
        dispatchProjectedPointerEventWithCaptureBridge(captured, "pointercancel", event, panel, hit.x, hit.y, state.pointerCapture);
      }
      state.capturedTarget = null;
      state.activeRange = null;
      state.activeText = null;
      state.pointerCapture.delete(event.pointerId);
      updateHover(null, event, hit);
      return { target, captured };
    }

    if (event.type === "pointermove") {
      updateHover(target, event, hit);
      if (target) {
        dispatchProjectedPointerEvent(target, "pointermove", event, panel, hit.x, hit.y);
        dispatchMouseEvent(target, "mousemove", event, panel, hit.x, hit.y);
      }
    }

    return { target, captured };
  }

  function routeWheel(event: WheelEvent, hit: ProjectedPointerHit) {
    const target = hitTest(hit);
    let consumed = false;
    if (target) {
      consumed = dispatchWheelEvent(target, event, panel, hit.x, hit.y);
    }
    return { target, consumed };
  }

  function routePointerExit(event: PointerEvent) {
    updateHover(null, event, null);
  }

  function updateHover(target: HTMLElement | null, event: PointerEvent, hit: ProjectedPointerHit | null) {
    if (target === state.hoverTarget) return;
    const previous = state.hoverTarget;
    state.hoverTarget = target;
    setProjectedHoverPath(target);

    if (previous) {
      dispatchProjectedPointerEventAt(previous, "pointerout", event, panel, hit?.x ?? 0, hit?.y ?? 0, true, target);
      dispatchProjectedPointerEventAt(previous, "pointerleave", event, panel, hit?.x ?? 0, hit?.y ?? 0, false, target);
      dispatchMouseEvent(previous, "mouseout", event, panel, hit?.x ?? 0, hit?.y ?? 0, true, target);
      dispatchMouseEvent(previous, "mouseleave", event, panel, hit?.x ?? 0, hit?.y ?? 0, false, target);
    }

    if (target && hit) {
      dispatchProjectedPointerEventAt(target, "pointerover", event, panel, hit.x, hit.y, true, previous);
      dispatchProjectedPointerEventAt(target, "pointerenter", event, panel, hit.x, hit.y, false, previous);
      dispatchMouseEvent(target, "mouseover", event, panel, hit.x, hit.y, true, previous);
      dispatchMouseEvent(target, "mouseenter", event, panel, hit.x, hit.y, false, previous);
    }
  }

  return {
    hitTest,
    routePointer,
    routeWheel,
    routePointerExit,
    releasePointer() {
      state.capturedTarget = null;
      state.activeRange = null;
      state.activeText = null;
      state.pointerCapture.clear();
      setProjectedHoverPath(null);
    },
    getCapturedTarget() {
      return state.capturedTarget;
    },
    getLastDebug() {
      return state.lastDebug;
    },
  };

  function setProjectedHoverPath(target: HTMLElement | null) {
    for (const element of state.projectedHoverPath) {
      element.removeAttribute("data-projected-hover");
    }
    state.projectedHoverPath = [];

    let element: HTMLElement | null = target;
    while (element && panel.contains(element)) {
      element.setAttribute("data-projected-hover", "");
      state.projectedHoverPath.push(element);
      element = element.parentElement;
    }
  }
}

export function describeProjectedDomTarget(target: HTMLElement | null) {
  return target ? describeTarget(target) : "";
}

function dispatchProjectedPointerEventWithCaptureBridge(
  target: HTMLElement,
  type: string,
  source: PointerEvent,
  panel: HTMLElement,
  panelX: number,
  panelY: number,
  pointerCapture: Map<number, Element>,
) {
  const originalSetPointerCapture = Element.prototype.setPointerCapture;
  const originalHasPointerCapture = Element.prototype.hasPointerCapture;
  const originalReleasePointerCapture = Element.prototype.releasePointerCapture;

  Element.prototype.setPointerCapture = function setProjectedPointerCapture(pointerId: number) {
    pointerCapture.set(pointerId, this);
  };
  Element.prototype.hasPointerCapture = function hasProjectedPointerCapture(pointerId: number) {
    return pointerCapture.get(pointerId) === this || originalHasPointerCapture.call(this, pointerId);
  };
  Element.prototype.releasePointerCapture = function releaseProjectedPointerCapture(pointerId: number) {
    if (pointerCapture.get(pointerId) === this) {
      pointerCapture.delete(pointerId);
      return;
    }
    originalReleasePointerCapture.call(this, pointerId);
  };

  try {
    return dispatchProjectedPointerEvent(target, type, source, panel, panelX, panelY);
  } finally {
    Element.prototype.setPointerCapture = originalSetPointerCapture;
    Element.prototype.hasPointerCapture = originalHasPointerCapture;
    Element.prototype.releasePointerCapture = originalReleasePointerCapture;
  }
}

function dispatchMouseEvent(
  target: HTMLElement,
  type: string,
  source: PointerEvent,
  panel: HTMLElement,
  panelX: number,
  panelY: number,
  bubbles = true,
  relatedTarget: EventTarget | null = null,
) {
  const panelRect = panel.getBoundingClientRect();
  const clientX = panelRect.left + panelX;
  const clientY = panelRect.top + panelY;
  target.dispatchEvent(new MouseEvent(type, {
    bubbles,
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
    relatedTarget,
  }));
}

function dispatchProjectedPointerEventAt(
  target: HTMLElement,
  type: string,
  source: PointerEvent,
  panel: HTMLElement,
  panelX: number,
  panelY: number,
  bubbles: boolean,
  relatedTarget: EventTarget | null,
) {
  const panelRect = panel.getBoundingClientRect();
  const clientX = panelRect.left + panelX;
  const clientY = panelRect.top + panelY;
  target.dispatchEvent(new PointerEvent(type, {
    bubbles,
    cancelable: true,
    composed: true,
    pointerId: source.pointerId,
    pointerType: source.pointerType,
    isPrimary: source.isPrimary,
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
    relatedTarget,
  }));
}

function dispatchWheelEvent(
  target: HTMLElement,
  source: WheelEvent,
  panel: HTMLElement,
  panelX: number,
  panelY: number,
): boolean {
  const panelRect = panel.getBoundingClientRect();
  const clientX = panelRect.left + panelX;
  const clientY = panelRect.top + panelY;
  const wheelEvent = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX,
    clientY,
    screenX: source.screenX,
    screenY: source.screenY,
    deltaX: source.deltaX,
    deltaY: source.deltaY,
    deltaZ: source.deltaZ,
    deltaMode: source.deltaMode,
    ctrlKey: source.ctrlKey,
    altKey: source.altKey,
    shiftKey: source.shiftKey,
    metaKey: source.metaKey,
  });
  return !target.dispatchEvent(wheelEvent);
}

function isTextControl(target: HTMLElement): target is HTMLInputElement | HTMLTextAreaElement {
  if (target instanceof HTMLTextAreaElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return TEXT_INPUT_TYPES.includes(target.type);
}

function updateTextSelection(
  element: HTMLInputElement | HTMLTextAreaElement,
  panel: HTMLElement,
  hit: ProjectedPointerHit,
  anchor: number,
) {
  const caret = getTextCaretIndex(element, panel, hit);
  setTextSelection(element, anchor, caret);
}

function setTextSelection(element: HTMLInputElement | HTMLTextAreaElement, anchor: number, focus: number) {
  const start = Math.max(0, Math.min(anchor, focus));
  const end = Math.max(0, Math.max(anchor, focus));
  try {
    element.setSelectionRange(start, end, focus < anchor ? "backward" : "forward");
  } catch {
    // Some input types expose text-ish values but reject selection APIs.
  }
}

function getTextCaretIndex(element: HTMLInputElement | HTMLTextAreaElement, panel: HTMLElement, hit: ProjectedPointerHit) {
  if (element instanceof HTMLTextAreaElement) {
    return getTextareaCaretIndex(element, panel, hit);
  }
  return getSingleLineInputCaretIndex(element, panel, hit);
}

function getSingleLineInputCaretIndex(input: HTMLInputElement, panel: HTMLElement, hit: ProjectedPointerHit) {
  const value = input.value;
  if (!value) return 0;

  const rect = getLocalRect(input, panel);
  const style = window.getComputedStyle(input);
  const localX = hit.x - rect.left - px(style.paddingLeft) + input.scrollLeft;
  const canvas = getMeasurementCanvas();
  const context = canvas.getContext("2d");
  if (!context) return value.length;

  context.font = style.font;
  const text = input.type === "password" ? "•".repeat(value.length) : value;
  if (localX <= 0) return 0;

  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (context.measureText(text.slice(0, mid)).width < localX) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  const before = context.measureText(text.slice(0, low)).width;
  const after = low < text.length ? context.measureText(text.slice(0, low + 1)).width : before;
  return localX - before > (after - before) / 2 ? Math.min(text.length, low + 1) : low;
}

function getTextareaCaretIndex(textarea: HTMLTextAreaElement, panel: HTMLElement, hit: ProjectedPointerHit) {
  const rect = getLocalRect(textarea, panel);
  const style = window.getComputedStyle(textarea);
  const localX = hit.x - rect.left - px(style.paddingLeft) + textarea.scrollLeft;
  const localY = hit.y - rect.top - px(style.paddingTop) + textarea.scrollTop;
  const lineHeight = px(style.lineHeight) || px(style.fontSize) * TEXTAREA_FALLBACK_LINE_HEIGHT_MULTIPLIER || TEXTAREA_DEFAULT_LINE_HEIGHT;
  const lineIndex = Math.max(0, Math.floor(localY / lineHeight));
  const lines = textarea.value.split("\n");
  const clampedLine = Math.min(lines.length - 1, lineIndex);
  const priorLength = lines.slice(0, clampedLine).reduce((length, line) => length + line.length + 1, 0);

  const canvas = getMeasurementCanvas();
  const context = canvas.getContext("2d");
  if (!context) return priorLength;
  context.font = style.font;

  const line = lines[clampedLine] ?? "";
  if (localX <= 0) return priorLength;
  let column = 0;
  while (column < line.length && context.measureText(line.slice(0, column + 1)).width < localX) {
    column += 1;
  }
  return priorLength + column;
}

let measurementCanvas: HTMLCanvasElement | null = null;

function getMeasurementCanvas() {
  measurementCanvas ??= document.createElement("canvas");
  return measurementCanvas;
}

function px(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatRect(rect: DOMRect) {
  return `${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)}`;
}

function describeElement(element: Element) {
  const id = element.id ? `#${element.id}` : "";
  const className =
    typeof element.className === "string" && element.className.trim()
      ? `.${element.className.trim().split(/\s+/).slice(0, DESCRIBED_CLASS_LIMIT).join(".")}`
      : "";
  return `${element.tagName.toLowerCase()}${id}${className}`;
}
