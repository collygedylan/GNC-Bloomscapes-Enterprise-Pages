/** Voice names selected by the signed AURA preference endpoint. */
export const GEMINI_VOICES = ["Aoede", "Charon", "Fenrir", "Kore", "Puck"];

/**
 * Format a verified quantity for AURA readouts.
 * @param {unknown} value Inventory quantity.
 * @returns {string} Localized quantity or an unavailable marker.
 */
export function formatQuantity(value) {
  if (value == null || String(value).trim() === "") return "—";
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(number) : "—";
}

/**
 * Create an AURA element with its display text.
 * @param {string} tag Element name.
 * @param {string} [className] CSS class names.
 * @param {unknown} [text] Element text.
 * @returns {HTMLElement} DOM element.
 */
export function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}
