import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlaybackWindow } from '../PlaybackWindow';

describe('PlaybackWindow Component', () => {
  const mockThemeStyles: React.CSSProperties = {
    backgroundColor: '#0f172a',
    color: '#ffffff',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders pole/customer display showcase window in idle state', () => {
    render(<PlaybackWindow themeStyles={mockThemeStyles} />);

    expect(screen.getByText('Ready to Showcase Videos')).toBeInTheDocument();
    expect(screen.getByText(/Open showcase videos from the register checkout/i)).toBeInTheDocument();
  });
});
