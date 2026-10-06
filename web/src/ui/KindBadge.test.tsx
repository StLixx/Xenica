import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { KindBadge } from './KindBadge';

describe('KindBadge', () => {
  it('shows the single-character mark of a known kind', () => {
    render(<KindBadge kind="knowledge" />);
    expect(screen.getByRole('img', { name: '知识点' })).toHaveTextContent('知');
  });

  it('falls back to the first letter for unknown kinds', () => {
    render(<KindBadge kind="recipe" />);
    expect(screen.getByRole('img', { name: 'recipe' })).toHaveTextContent('R');
  });
});
