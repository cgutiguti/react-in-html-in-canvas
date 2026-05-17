export type ProjectedSliderSetter = (value: number) => void;

const INTERACTIVE_TARGET_SELECTOR = "button, input, select, textarea, [role='button'], [role='switch'], [tabindex]";
const PROJECTED_CONTROL_SELECTOR = "button, input, [role='switch'], [tabindex]";
const DEFAULT_RANGE_MIN = 0;
const DEFAULT_RANGE_MAX = 100;
const DEFAULT_RANGE_STEP = 1;

export function findProjectedTarget(panel: HTMLElement, x: number, y: number): HTMLElement | null {
  const element = findProjectedElement(panel, x, y);
  return element?.closest<HTMLElement>(INTERACTIVE_TARGET_SELECTOR) ?? null;
}

export function findProjectedElement(panel: HTMLElement, x: number, y: number): HTMLElement | null {
  const elements = Array.from(panel.querySelectorAll<HTMLElement>("*"));
  let target: HTMLElement | null = containsLocalPoint(panel, panel, x, y) ? panel : null;

  for (const element of elements) {
    const style = window.getComputedStyle(element);
    if (style.pointerEvents === "none" || style.visibility === "hidden" || style.display === "none") continue;
    if (containsLocalPoint(element, panel, x, y)) {
      target = element;
    }
  }

  return target;
}

export function getProjectedControls(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLElement>(PROJECTED_CONTROL_SELECTOR));
}

export function updateRangeFromProjectedPoint(
  range: HTMLInputElement,
  panel: HTMLElement,
  panelX: number,
  sliderSetters: Map<string, ProjectedSliderSetter>,
) {
  const rect = getLocalRect(range, panel);
  const min = Number(range.min || DEFAULT_RANGE_MIN);
  const max = Number(range.max || DEFAULT_RANGE_MAX);
  const step = Number(range.step || DEFAULT_RANGE_STEP);
  const localX = panelX - rect.left;
  const ratio = Math.min(1, Math.max(0, localX / rect.width));
  const stepped = Math.round((min + ratio * (max - min)) / step) * step;
  const value = Math.min(max, Math.max(min, stepped));
  const sliderId = range.dataset.projectedSliderId;
  if (sliderId) {
    sliderSetters.get(sliderId)?.(value);
  }
  setNativeInputValue(range, String(value));
  range.dispatchEvent(new Event("input", { bubbles: true }));
  range.dispatchEvent(new Event("change", { bubbles: true }));
}

export function dispatchProjectedPointerEvent(
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
  const event = new PointerEvent(type, {
    bubbles: true,
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
  });
  return target.dispatchEvent(event);
}

export function dispatchProjectedClick(
  target: HTMLElement,
  source: PointerEvent,
  panel: HTMLElement,
  panelX: number,
  panelY: number,
) {
  const panelRect = panel.getBoundingClientRect();
  const clientX = panelRect.left + panelX;
  const clientY = panelRect.top + panelY;
  const event = new MouseEvent("click", {
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
  });
  return target.dispatchEvent(event);
}

export function getLocalRect(element: HTMLElement, ancestor: HTMLElement) {
  let left = 0;
  let top = 0;
  let node: HTMLElement | null = element;

  while (node && node !== ancestor) {
    left += node.offsetLeft;
    top += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }

  if (node !== ancestor) {
    const elementRect = element.getBoundingClientRect();
    const ancestorRect = ancestor.getBoundingClientRect();
    left = elementRect.left - ancestorRect.left;
    top = elementRect.top - ancestorRect.top;
  }

  return {
    left,
    top,
    width: element.offsetWidth,
    height: element.offsetHeight,
  };
}

function containsLocalPoint(element: HTMLElement, panel: HTMLElement, x: number, y: number) {
  const rect = getLocalRect(element, panel);
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

export function describeTarget(target: HTMLElement) {
  const label = target.getAttribute("aria-label") || target.textContent?.trim() || target.tagName.toLowerCase();
  return `${target.tagName.toLowerCase()}${target instanceof HTMLInputElement ? `[${target.type}]` : ""}: ${label}`;
}

export function getDebugId(target: HTMLElement, panel: HTMLElement) {
  return String(getProjectedControls(panel).indexOf(target));
}

export function isClickable(target: HTMLElement) {
  return target instanceof HTMLButtonElement || target.getAttribute("role") === "switch";
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
}
