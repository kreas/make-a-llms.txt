import { render, screen, fireEvent } from '@testing-library/react';
import { test, expect, vi } from 'vitest';
import { CitationsPageTable } from './citations-page-table';

test('renders rows and fires onSelect', () => {
  const onSelect = vi.fn();
  render(<CitationsPageTable rows={[
    { pageUrl: 'https://x.com/a', score: 80, tier: 'good', fetchedAt: new Date().toISOString() },
    { pageUrl: 'https://x.com/b', score: null, tier: null, fetchedAt: null },
  ]} onSelect={onSelect} />);
  expect(screen.getByText('https://x.com/a')).toBeInTheDocument();
  expect(screen.getByText('Never')).toBeInTheDocument();
  fireEvent.click(screen.getByText('https://x.com/a'));
  expect(onSelect).toHaveBeenCalledWith('https://x.com/a');
});

test('shows empty state when no rows', () => {
  render(<CitationsPageTable rows={[]} onSelect={() => {}} />);
  expect(screen.getByText(/no pages/i)).toBeInTheDocument();
});
