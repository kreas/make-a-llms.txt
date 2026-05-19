import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import { CitationsScoreBadge } from './citations-score-badge';

test('shows score, tier, and failing count', () => {
  render(
    <CitationsScoreBadge score={64} tier="fair" failingCount={5} totalCount={15} />,
  );
  expect(screen.getByText('64')).toBeInTheDocument();
  expect(screen.getByText(/fair/i)).toBeInTheDocument();
  expect(screen.getByText(/5 of 15 checks failing/i)).toBeInTheDocument();
});
