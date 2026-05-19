import { render, screen, fireEvent } from '@testing-library/react';
import { test, expect, vi } from 'vitest';
import { CitationsHistoryList } from './citations-history-list';

const items = [
  { id: 'a', score: 80, tier: 'good' as const, fetchedAt: new Date().toISOString(), status: 'succeeded' as const },
  { id: 'b', score: 60, tier: 'fair' as const, fetchedAt: new Date(Date.now() - 86400000).toISOString(), status: 'succeeded' as const },
];

test('marks current and fires onSelect for others', () => {
  const onSelect = vi.fn();
  render(<CitationsHistoryList items={items} currentId="a" onSelect={onSelect} />);
  expect(screen.getByText(/current/i)).toBeInTheDocument();
  fireEvent.click(screen.getByText('60'));
  expect(onSelect).toHaveBeenCalledWith('b');
});
