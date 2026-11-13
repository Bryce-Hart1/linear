// How an exported picture looks, whatever kind of document it comes from: a
// light or dark page (or none at all), and grid marks or not. The pure parts
// live here (colours, the contrast flip, the grid as canvas calls and as SVG)
// so the three editors and their tests share one idea of "dark mode export".

export type Backdrop = 'light' | 'dark' | 'none';

export interface ExportLook {
  /** The page behind the drawing; 'none' keeps it transparent where the format can. */
  backdrop: Backdrop;
  /** Grid marks over the page. */
  grid: boolean;
}

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const PAPER: Record<'light' | 'dark', string> = { light: '#ffffff', dark: '#000000' };

/** The colour of grid marks on each page. Plain hex, so SVG editors read it too. */
export const GRID_INK: Record<Backdrop, string> = { light: '#c9c9c9', dark: '#444444', none: '#8c8c8c' };

/** The plain colour of ink that has no colour of its own, on each page. */
export const INK: Record<'light' | 'dark', string> = { light: '#111111', dark: '#ffffff' };

const rgb = (hex: string): [number, number, number] | null => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
};

/** 0 (black) to 1 (white). A colour that isn't #rrggbb counts as mid grey. */
export function luminance(hex: string): number {
  const c = rgb(hex);
  return c ? (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 : 0.5;
}

/**
 * A stroke colour as it should print on a page. Near-black grey ink would
 * vanish on a dark page (and near-white on a light one), so those flip;
 * anything with a real colour stays as drawn.
 */
export function inkOn(colour: string, backdrop: Backdrop): string {
  if (backdrop === 'none') return colour;
  const c = rgb(colour);
  if (!c || Math.max(...c) - Math.min(...c) > 24) return colour;
  const l = luminance(colour);
  if (backdrop === 'dark' && l < 0.3) return INK.dark;
  if (backdrop === 'light' && l > 0.8) return INK.light;
  return colour;
}

/** The page a drawing already has, as the closest backdrop. */
export function backdropOf(bg: string): Backdrop {
  return bg === 'none' ? 'none' : luminance(bg) < 0.5 ? 'dark' : 'light';
}

/** Dots on every `step`, over `frame`, in `colour`. */
export function dotsOnCanvas(ctx: CanvasRenderingContext2D, frame: Frame, step: number, size: number, colour: string) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  for (let x = Math.ceil(frame.x / step) * step; x < frame.x + frame.w; x += step) {
    for (let y = Math.ceil(frame.y / step) * step; y < frame.y + frame.h; y += step) ctx.rect(x - size / 2, y - size / 2, size, size);
  }
  ctx.fill();
}

/** The same dots as SVG: one pattern, and one rectangle that paints it over `frame`. */
export function dotsAsSvg(frame: Frame, step: number, size: number, colour: string): string {
  const n = (v: number) => String(Math.round(v * 100) / 100);
  return (
    `<pattern id="grid" x="${n(-size / 2)}" y="${n(-size / 2)}" width="${step}" height="${step}" patternUnits="userSpaceOnUse">` +
    `<rect width="${n(size)}" height="${n(size)}" fill="${colour}"/></pattern>\n` +
    `<rect x="${n(frame.x)}" y="${n(frame.y)}" width="${n(frame.w)}" height="${n(frame.h)}" fill="url(#grid)"/>\n`
  );
}

/** What the export dialog hands back. Not every field means something for every document. */
export interface ExportChoice extends ExportLook {
  format: string;
  /** Pixel art: whole-number size. */
  scale: number;
  /** Drawings: the whole page rather than what's drawn. */
  whole: boolean;
}

/** One way to export a document. */
export interface ExportFormat {
  id: string;
  label: string;
  ext: string;
  /** Whether it is a picture with a page (false: the document file itself). */
  styled: boolean;
  /** Whether it can have a transparent page; a JPEG can't. Defaults to yes. */
  clear?: boolean;
}

const KEY = 'linear.export';

/** What was picked last time for a kind of document, so the dialog opens where you left it. */
export function recallChoice(kind: string): Partial<ExportChoice> {
  try {
    return JSON.parse(localStorage.getItem(`${KEY}.${kind}`) ?? '{}') as Partial<ExportChoice>;
  } catch {
    return {};
  }
}

export function rememberChoice(kind: string, choice: ExportChoice) {
  try {
    localStorage.setItem(`${KEY}.${kind}`, JSON.stringify(choice));
  } catch {
    /* nothing to remember with */
  }
}
