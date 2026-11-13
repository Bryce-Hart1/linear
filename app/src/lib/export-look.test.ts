import { describe, expect, it } from 'vitest';
import { backdropOf, dotsAsSvg, inkOn, luminance } from './export-look';
import { exportSvg as drawingSvg } from './ldw/draw';
import { blankDrawing } from './ldw/model';
import { exportSvg as diagramSvg } from './lin/svg';
import { blankDoc } from './lin/model';

describe('ink on a page', () => {
  it('flips grey ink that would vanish, keeps real colours', () => {
    expect(inkOn('#111111', 'dark')).toBe('#ffffff');
    expect(inkOn('#111111', 'light')).toBe('#111111');
    expect(inkOn('#fafafa', 'light')).toBe('#111111');
    expect(inkOn('#1a237e', 'dark')).toBe('#1a237e');
    expect(inkOn('#111111', 'none')).toBe('#111111');
  });
  it('reads a drawing page as the closest backdrop', () => {
    expect(backdropOf('none')).toBe('none');
    expect(backdropOf('#ffffff')).toBe('light');
    expect(backdropOf('#101010')).toBe('dark');
    expect(luminance('#000000')).toBe(0);
  });
});

describe('grid marks as SVG', () => {
  it('is a pattern and a rectangle that fills the frame with it', () => {
    const svg = dotsAsSvg({ x: -20, y: 0, w: 100, h: 60 }, 10, 1, '#444444');
    expect(svg).toContain('<pattern id="grid"');
    expect(svg).toContain('fill="url(#grid)"');
    expect(svg).toContain('width="100"');
  });
});

describe('drawing export looks', () => {
  const d = { ...blankDrawing(), items: [{ id: 1, t: 'pen' as const, c: '#111111', w: 4, o: 100, z: false, pts: [10, 10, 80, 60] }], next: 2 };
  it('dark: a black page, grey ink turned white, grid on request', () => {
    const svg = drawingSvg(d, false, { backdrop: 'dark', grid: true });
    expect(svg).toContain('fill="#000000"');
    expect(svg).toContain('stroke="#ffffff"');
    expect(svg).toContain('url(#grid)');
  });
  it('light without a grid has neither; transparent has no page', () => {
    const light = drawingSvg(d, false, { backdrop: 'light', grid: false });
    expect(light).toContain('fill="#ffffff"');
    expect(light).not.toContain('url(#grid)');
    expect(drawingSvg(d, false, { backdrop: 'none', grid: false })).not.toContain('<rect');
  });
  it('a whole empty page can be exported', () => {
    expect(drawingSvg(blankDrawing(), true, { backdrop: 'dark', grid: true })).toContain('viewBox="0 0 1600 1000"');
  });
});

describe('diagram export looks', () => {
  it('an empty diagram is the whole page when a look is given, an error without', () => {
    expect(() => diagramSvg(blankDoc())).toThrow('nothing to export');
    const svg = diagramSvg(blankDoc(), { backdrop: 'dark', grid: true });
    expect(svg).toContain('fill="#000000"');
    expect(svg).toContain('url(#grid)');
  });
});
