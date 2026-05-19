import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import { CitationsCheckRow } from './citations-check-row';

test('renders evidence and recommendation when failing', () => {
  render(
    <CitationsCheckRow
      label="H1 present"
      check={{
        id: 'h1-present',
        passed: false,
        score: 0,
        weight: 5,
        evidence: ['No <h1> found.'],
        recommendation: 'Add an H1.',
      }}
    />,
  );
  expect(screen.getByText(/Found:/)).toBeInTheDocument();
  expect(screen.getByText(/Fix:/)).toBeInTheDocument();
});

test('omits Fix line when passing', () => {
  render(
    <CitationsCheckRow
      label="H1 present"
      check={{
        id: 'h1-present',
        passed: true,
        score: 100,
        weight: 5,
        evidence: ["H1 found: 'X'"],
        recommendation: null,
      }}
    />,
  );
  expect(screen.queryByText(/Fix:/)).not.toBeInTheDocument();
});
