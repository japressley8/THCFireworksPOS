import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SolitaireGame } from '../SolitaireGame';

describe('SolitaireGame Component', () => {
  it('simulates React Strict Mode double-mount/unmount/remount', () => {
    let cachedState: any = null;
    const onSaveCache = vi.fn((state) => {
      cachedState = state;
    });

    const defaultProps = {
      cachedState,
      onSaveCache,
      onClose: vi.fn(),
    };

    // First render/mount
    const { unmount } = render(<SolitaireGame {...defaultProps} cachedState={cachedState} />);

    // Immediate unmount (simulating Strict Mode's first unmount)
    unmount();

    // Now cachedState should have been updated by the unmount cleanup
    expect(onSaveCache).toHaveBeenCalled();
    expect(cachedState).not.toBeNull();
    console.log('Cached state saved on initial unmount:', JSON.stringify(cachedState));

    // Remount (simulating Strict Mode's second mount)
    const remountResult = render(
      <SolitaireGame
        {...defaultProps}
        cachedState={cachedState}
      />
    );

    // Check if the board has cards dealt
    const cards = remountResult.container.querySelectorAll('.solitaire-field [style*="z-index"]');
    console.log('Cards found in remounted component:', cards.length);
    
    // In a properly dealt game, we should have cards.
    // If there are 0 cards, then it failed to deal!
    expect(cards.length).toBeGreaterThan(0);
  });
});
