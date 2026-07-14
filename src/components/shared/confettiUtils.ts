import confetti from 'canvas-confetti';
import { getTheme } from './colorUtils';

export const triggerConfetti = (): void => {
  const theme = getTheme();
  const colors = [theme.primary, theme.bg, theme.accent, theme.border, theme.text, theme.muted, theme.card];
  const end = performance.now() + 3000;

  const frame = () => {
    confetti({
      particleCount: 5,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 1 },
      colors,
    });
    confetti({
      particleCount: 5,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 1 },
      colors,
    });

    if (performance.now() < end) {
      requestAnimationFrame(frame);
    }
  };

  frame();
};
