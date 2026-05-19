import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import { CitationsTierPill } from './citations-tier-pill';

test.each(['poor', 'fair', 'good', 'excellent', 'none'] as const)('renders %s tier', (t) => {
  render(<CitationsTierPill tier={t} />);
  expect(screen.getByText(t === 'none' ? '—' : new RegExp(t, 'i'))).toBeInTheDocument();
});
