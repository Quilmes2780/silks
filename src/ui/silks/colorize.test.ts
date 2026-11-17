import { describe, expect, it } from 'vitest';
import { colorizeImageData, hexToRgb, MASK_LEVELS, renderSilksSvg } from './colorize';
import type { Silks } from '../../engine/types';

const silks: Silks = { pattern: 'hoops', body: '#ff0000', pattern2: '#00ff00', sleeves: '#0000ff', cap: '#ffff00' };

describe('Silks-Einfärbung', () => {
  it('hexToRgb', () => {
    expect(hexToRgb('#1f3a93')).toEqual([31, 58, 147]);
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
  });

  it('färbt Maskenregionen ein und erhält die Schattierung', () => {
    // 5 Pixel: Körper hell, Körper dunkel, Ärmel, Kappe, nicht eingefärbt
    const image = new Uint8ClampedArray([200, 200, 200, 255, 100, 100, 100, 255, 200, 200, 200, 255, 200, 200, 200, 255, 50, 60, 70, 255]);
    const m = MASK_LEVELS;
    const mask = new Uint8ClampedArray([m.body, 0, 0, 255, m.body, 0, 0, 255, m.sleeves, 0, 0, 255, m.cap, 0, 0, 255, 0, 0, 0, 255]);
    const out = colorizeImageData(image, mask, silks);
    expect([out[0], out[1], out[2]]).toEqual([255, 0, 0]); // Körper rot, volle Helligkeit
    expect(out[4]).toBe(128); // dunkler schattiert (255 × 100/200, gerundet)
    expect([out[8], out[9], out[10]]).toEqual([0, 0, 255]); // Ärmel blau
    expect([out[12], out[13], out[14]]).toEqual([255, 255, 0]); // Kappe gelb
    expect([out[16], out[17], out[18]]).toEqual([50, 60, 70]); // unverändert
  });

  it('SVG-Platzhalter enthält die Farben und das Muster', () => {
    const svg = renderSilksSvg(silks);
    expect(svg).toContain('#ff0000');
    expect(svg).toContain('#00ff00');
    expect(svg).toContain('data-region="cap"');
    const mask = renderSilksSvg(null);
    expect(mask).toContain('rgb(64,64,64)');
  });
});
