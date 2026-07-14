import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseColorToRgb,
  getColorDistance,
  rgbToHsl,
  hslToRgb,
  getPlayerColors,
  genContinentColors
} from '../shared/colorUtils';
import {
  hk,
  hexToPixel,
  pixelToHex,
  hexPts,
  hexNeighbors,
  hexDist,
  screenToWorld,
  worldToScreen
} from '../shared/hexUtils';
import { defaultConfirm, defaultAlert } from '../shared/dialogUtils';
import { triggerConfetti } from '../shared/confettiUtils';
import confetti from 'canvas-confetti';

// Mock canvas-confetti because it uses canvas context
vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

describe('colorUtils', () => {
  describe('parseColorToRgb', () => {
    it('correctly parses 3-character hex colors', () => {
      const rgb = parseColorToRgb('#fff');
      expect(rgb).toEqual({ r: 255, g: 255, b: 255 });

      const rgbColor = parseColorToRgb('  #0f0 ');
      expect(rgbColor).toEqual({ r: 0, g: 255, b: 0 });
    });

    it('correctly parses 6-character hex colors', () => {
      const rgb = parseColorToRgb('#ff0055');
      expect(rgb).toEqual({ r: 255, g: 0, b: 85 });
    });

    it('correctly parses rgb and rgba string values', () => {
      const rgb = parseColorToRgb('rgb(10, 20, 30)');
      expect(rgb).toEqual({ r: 10, g: 20, b: 30 });

      const rgba = parseColorToRgb('rgba(255, 128, 64, 0.5)');
      expect(rgba).toEqual({ r: 255, g: 128, b: 64 });
    });

    it('returns null for invalid inputs', () => {
      expect(parseColorToRgb('')).toBeNull();
      expect(parseColorToRgb('invalid-color')).toBeNull();
    });
  });

  describe('getColorDistance', () => {
    it('calculates the Euclidean distance between two colors', () => {
      const dist = getColorDistance('#000000', '#ffffff');
      // sqrt(255^2 * 3) = ~441.67
      expect(dist).toBeCloseTo(441.67, 1);

      const redToGreen = getColorDistance('#ff0000', '#00ff00');
      // sqrt(255^2 + 255^2) = ~360.62
      expect(redToGreen).toBeCloseTo(360.62, 1);
    });

    it('returns 999 for invalid inputs', () => {
      expect(getColorDistance('bad1', '#ffffff')).toBe(999);
      expect(getColorDistance('#000000', 'bad2')).toBe(999);
    });
  });

  describe('rgbToHsl and hslToRgb round-trip', () => {
    it('integrates correctly on round-trip color conversion', () => {
      // Red: [255, 0, 0] -> [0, 100, 50] -> [255, 0, 0]
      const hsl = rgbToHsl(255, 0, 0);
      expect(hsl).toEqual([0, 100, 50]);

      const rgb = hslToRgb(0, 100, 50);
      expect(rgb).toEqual([255, 0, 0]);

      // Gray [128, 128, 128]
      const grayHsl = rgbToHsl(128, 128, 128);
      expect(grayHsl[1]).toBe(0); // Saturation 0
      expect(grayHsl[2]).toBeCloseTo(50.2, 1); // Lightness ~50%

      const grayRgb = hslToRgb(0, 0, 50);
      expect(grayRgb).toEqual([128, 128, 128]);
    });
  });

  describe('getPlayerColors & genContinentColors', () => {
    beforeEach(() => {
      document.body.className = '';
      // Reset variables in DOM CSS variables
      document.body.style.setProperty('--color-primary', '#10b981');
      document.body.style.setProperty('--color-accent', '#3b82f6');
      document.body.style.setProperty('--color-bg', '#090d16');
    });

    it('generates primary and accent player colors based on theme values', () => {
      const colors = getPlayerColors(3);
      expect(colors[0]).toBe('#10b981');
      expect(colors[1]).toBe('#3b82f6');
      expect(colors.length).toBe(3);
    });

    it('generates continent colors with proper fills and borders', () => {
      const continentColors = genContinentColors('#10b981', 4);
      expect(continentColors.length).toBe(4);
      expect(continentColors[0].fill).toContain('rgba');
      expect(continentColors[0].border).toContain('rgba');
    });
  });
});

describe('hexUtils', () => {
  it('correctly formats coordinates with hk', () => {
    expect(hk(3, -4)).toBe('3,-4');
  });

  it('transforms hex coordinates to screen pixels and back', () => {
    const size = 10;
    const pixel = hexToPixel(2, -3, size);
    // x = size * (sqrt(3)*q + sqrt(3)/2*r) = 10 * (sqrt(3)*2 - sqrt(3)/2*3) = 10 * (0.5 * sqrt(3)) = 5 * sqrt(3) = ~8.66
    expect(pixel.x).toBeCloseTo(8.66, 2);
    // y = size * (1.5 * r) = 10 * (1.5 * -3) = -45
    expect(pixel.y).toBe(-45);

    const hex = pixelToHex(pixel.x, pixel.y, size);
    expect(hex).toEqual({ q: 2, r: -3 });
  });

  it('generates points string for a hexagon SVG path', () => {
    const points = hexPts(0, 0, 10);
    expect(points.split(',').length).toBe(12); // 6 coordinates (x, y) = 12 total entries split by comma
  });

  it('calculates the neighboring coordinates', () => {
    const neighbors = hexNeighbors(0, 0);
    expect(neighbors.length).toBe(6);
    expect(neighbors).toContainEqual({ q: 1, r: -1, s: 0 });
    expect(neighbors).toContainEqual({ q: -1, r: 1, s: 0 });
  });

  it('calculates hexagonal coordinate distances correctly', () => {
    expect(hexDist(0, 0, 2, -2)).toBe(2);
    expect(hexDist(-1, 2, 1, 0)).toBe(2);
    expect(hexDist(0, 0, 0, 0)).toBe(0);
  });

  it('scales world coordinates to screen coordinate systems and back', () => {
    const wx = 100;
    const wy = -50;
    const cx = 10;
    const cy = 20;
    const scale = 2;
    const sw = 800;
    const sh = 600;

    const screen = worldToScreen(wx, wy, cx, cy, scale, sw, sh);
    const world = screenToWorld(screen.x, screen.y, cx, cy, scale, sw, sh);

    expect(world.x).toBeCloseTo(wx, 2);
    expect(world.y).toBeCloseTo(wy, 2);
  });
});

describe('dialogUtils', () => {
  it('calls window.confirm when calling defaultConfirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const result = await defaultConfirm('Are you sure?');
    expect(confirmSpy).toHaveBeenCalledWith('Are you sure?');
    expect(result).toBe(true);
    confirmSpy.mockRestore();
  });

  it('calls window.alert when calling defaultAlert', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    await defaultAlert('Watch out!');
    expect(alertSpy).toHaveBeenCalledWith('Watch out!');
    alertSpy.mockRestore();
  });
});

describe('confettiUtils', () => {
  it('triggers canvas confetti frames', () => {
    const confettiMock = vi.mocked(confetti);
    triggerConfetti();
    expect(confettiMock).toHaveBeenCalled();
  });
});
