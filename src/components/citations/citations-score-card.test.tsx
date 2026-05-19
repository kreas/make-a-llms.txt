import { render, screen } from '@testing-library/react';
import { describe, test, expect, beforeAll } from 'vitest';
import { CitationsScoreCard, type ScoreCardCheck } from './citations-score-card';

// Recharts measures parent layout via ResizeObserver; jsdom doesn't provide one.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

function check(id: string, score: number, weight: number): ScoreCardCheck {
  return { id, score, weight, passed: score >= 70 };
}

const checks: ScoreCardCheck[] = [
  // Structure
  check('h1-present', 100, 5),
  check('heading-hierarchy', 100, 5),
  check('lists-tables', 100, 5),
  check('question-h2s', 0, 7),
  // Answer quality
  check('answer-position', 50, 15),
  check('entity-first-paragraph', 0, 8),
  check('definitions', 0, 5),
  check('readability', 0, 5),
  // Metadata & schema
  check('meta-description', 100, 5),
  check('canonical', 100, 3),
  check('schema-type', 100, 10),
  check('schema-fields', 100, 5),
  // Authority & freshness
  check('named-entities', 60, 9),
  check('internal-links', 100, 5),
  check('freshness', 0, 8),
];

test('renders overall score, tier pill, and the four category rows', () => {
  render(
    <CitationsScoreCard
      score={54}
      tier="fair"
      failingCount={7}
      totalCount={15}
      checks={checks}
    />,
  );

  expect(screen.getByText('54')).toBeInTheDocument();
  expect(screen.getByText(/fair/i)).toBeInTheDocument();
  expect(screen.getByText(/7 of 15 checks failing/i)).toBeInTheDocument();
  expect(screen.getByText('Structure')).toBeInTheDocument();
  expect(screen.getByText('Answer quality')).toBeInTheDocument();
  expect(screen.getByText('Metadata & schema')).toBeInTheDocument();
  expect(screen.getByText('Authority & freshness')).toBeInTheDocument();
});

test('category aggregates use weighted average of member checks', () => {
  render(
    <CitationsScoreCard
      score={54}
      tier="fair"
      failingCount={7}
      totalCount={15}
      checks={checks}
    />,
  );

  // Metadata & schema: all passing (100 × 5 + 100 × 3 + 100 × 10 + 100 × 5) / 23 = 100
  const metaBar = screen.getByRole('progressbar', { name: /metadata & schema/i });
  expect(metaBar).toHaveAttribute('aria-valuenow', '100');

  // Authority & freshness: (60 × 9 + 100 × 5 + 0 × 8) / 22 ≈ round(47.27) = 47
  const authBar = screen.getByRole('progressbar', { name: /authority & freshness/i });
  expect(authBar).toHaveAttribute('aria-valuenow', '47');
});
