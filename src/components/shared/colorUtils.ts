/**
 * @file colorUtils.ts
 * @description Theme extraction, parsing, and distance computation utilities.
 *
 * This file extracts CSS custom properties from the runtime HTML DOM window styles and parses
 * color models (Hex, RGB, HSL) to support dynamic styles, custom UI overrides, and
 * contrast calculations.
 */

import type { Theme } from '../../types';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export const FALLBACK_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ff0000ff', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316', '#64748b'];

// ── Theme ──────────────────────────────────────────────
export const getTheme = (): Theme => {
  const el = document.querySelector('.glass-panel') || document.body;
  const cs = window.getComputedStyle(el);
  const g = (k: string) => cs.getPropertyValue(k).trim();

  return {
    id: '',
    name: '',
    primary: g('--color-primary') || '#3b82f6',
    primaryHover: g('--color-primary-hover') || '#2563eb',
    accent: g('--color-accent') || '#f59e0b',
    bg: g('--color-bg') || '#090d16',
    card: g('--color-card') || 'rgba(15,23,42,0.7)',
    text: g('--color-text') || '#4d6c8bff',
    muted: g('--color-muted') || '#94a3b8',
    border: g('--color-border') || 'rgba(51,65,85,0.5)',
    input: g('--color-input') || '#05080e',
    header: g('--color-header') || '#0b1021',
  };
};

export const getPlayerColors = (
  count: number
) => {
  const theme = getTheme();
  if (colorDist(theme.primary, theme.accent) < 90) {
    return FALLBACK_COLORS.slice(0, count);
  }

  const colors: string[] = [theme.primary, theme.accent].slice(0, count);

  for (const candidate of FALLBACK_COLORS) {
    if (colors.length >= count) break;
    const distanceFromExisting = colors.every((existing) => colorDist(candidate, existing) > 80);
    if (distanceFromExisting && colorDist(candidate, theme.bg) > 80) {
      colors.push(candidate);
    }
  }

  while (colors.length < count) {
    colors.push(FALLBACK_COLORS[colors.length] || '#ffffff');
  }

  return colors.slice(0, count);
};

export const parseColorToRgb = (colorStr: string): RgbColor | null => {
  const clean = colorStr.trim();
  if (!clean) return null;

  if (clean.startsWith('#')) {
    const hex = clean.replace('#', '');
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
  }

  const rgbMatch = clean.match(/\d+/g);
  if (rgbMatch && rgbMatch.length >= 3) {
    return {
      r: parseInt(rgbMatch[0], 10),
      g: parseInt(rgbMatch[1], 10),
      b: parseInt(rgbMatch[2], 10),
    };
  }

  return null;
};

export const toRgb = parseColorToRgb;

export const getColorDistance = (c1: string, c2: string): number => {
  const rgb1 = parseColorToRgb(c1);
  const rgb2 = parseColorToRgb(c2);
  if (!rgb1 || !rgb2) return 999;
  return Math.sqrt(
    Math.pow(rgb1.r - rgb2.r, 2) +
    Math.pow(rgb1.g - rgb2.g, 2) +
    Math.pow(rgb1.b - rgb2.b, 2)
  );
};

export const colorDist = getColorDistance;

export const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) {
      h = (g - b) / d + (g < b ? 6 : 0);
    } else if (max === g) {
      h = (b - r) / d + 2;
    } else {
      h = (r - g) / d + 4;
    }
    h /= 6;
  }

  return [h * 360, s * 100, l * 100];
};

export const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  h /= 360;
  s /= 100;
  l /= 100;

  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  if (s === 0) {
    const value = Math.round(l * 255);
    return [value, value, value];
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
};

export const genContinentColors = (primary: string, count: number) => {
  const rgb = toRgb(primary) || { r: 59, g: 130, b: 246 };
  const [h, s, l] = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const adjL = Math.min(55, Math.max(30, l));
  const adjS = Math.max(50, s);

  return Array.from({ length: count }, (_, index) => {
    const hue = (h + index * (360 / Math.max(count, 2))) % 360;
    const [cr, cg, cb] = hslToRgb(hue, adjS, adjL);
    return {
      fill: `rgba(${cr},${cg},${cb},0.18)`,
      border: `rgba(${cr},${cg},${cb},0.9)`,
    };
  });
};