/** Colour helpers for cards that fill with their own colour once done. */

const DARK_INK = '#0b0f14';
const LIGHT_INK = '#ffffff';

/** Reads #rgb, #rrggbb, #rrggbbaa, rgb() and rgba(); null for anything else. */
export function parseColor(value) {
  const text = String(value || '').trim();
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    const digits = hex[1].length === 3 ? hex[1].replace(/./g, '$&$&') : hex[1].slice(0, 6);
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
    };
  }
  const rgb = text.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  return null;
}

/** The colour without its alpha, so a done fill is always solid. */
export function solidColor(value) {
  const rgb = parseColor(value);
  return rgb ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` : value;
}

function luminance({ r, g, b }) {
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Dark or white text, whichever contrasts more with the fill. */
export function readableInk(fill) {
  const rgb = parseColor(fill);
  if (!rgb) return LIGHT_INK;
  const l = luminance(rgb);
  const darkContrast = (l + 0.05) / (luminance(parseColor(DARK_INK)) + 0.05);
  const lightContrast = 1.05 / (l + 0.05);
  return darkContrast >= lightContrast ? DARK_INK : LIGHT_INK;
}
