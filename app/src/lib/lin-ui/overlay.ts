// What the clickable editor draws over the diagram: the selected shape's
// eight resize handles, and the connector dots on the shape under the
// pointer. Drawn in page coordinates, sized in screen pixels (`px` page
// pixels to one screen pixel) so they look the same at any zoom.

import type { Theme } from '../lin/draw';
import type { Shape } from '../lin/model';
import { HANDLES, SIDES, dotPoint, dotSpot, handlePoint, type Side } from './handles';

/** Half a handle's side, and a dot's radius, in screen pixels. */
export const HANDLE_HALF = 4;
export const DOT_R = 4.5;
/** How near (screen pixels) counts as on a handle or a dot. */
export const GRAB = 8;
/** How far outside the outline (screen pixels) the dots sit. */
export const DOT_OUT = 14;

export function drawHandles(ctx: CanvasRenderingContext2D, s: Shape, theme: Theme, px: number) {
  const half = HANDLE_HALF * px;
  ctx.save();
  ctx.lineWidth = 1.5 * px;
  ctx.setLineDash([]);
  for (const h of HANDLES) {
    const p = handlePoint(s, h);
    ctx.fillStyle = theme.paper;
    ctx.strokeStyle = theme.accent;
    ctx.fillRect(p.x - half, p.y - half, half * 2, half * 2);
    ctx.strokeRect(p.x - half, p.y - half, half * 2, half * 2);
  }
  ctx.restore();
}

export function drawDots(ctx: CanvasRenderingContext2D, s: Shape, theme: Theme, px: number, hot: Side | null) {
  ctx.save();
  ctx.lineWidth = 1.5 * px;
  ctx.setLineDash([]);
  for (const side of SIDES) {
    const edge = dotPoint(s, side);
    const p = dotSpot(s, side, DOT_OUT * px);
    // A short stem from the outline, so the dot reads as belonging to it.
    ctx.strokeStyle = theme.accent;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(edge.x, edge.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (side === hot ? DOT_R + 1.5 : DOT_R) * px, 0, Math.PI * 2);
    ctx.fillStyle = side === hot ? theme.accent : theme.paper;
    ctx.strokeStyle = theme.accent;
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
