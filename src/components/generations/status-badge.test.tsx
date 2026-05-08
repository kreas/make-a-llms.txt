import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it.each([
    ['pending', 'PENDING', 'bg-surface-strong'],
    ['running', 'RUNNING', 'bg-canvas-soft'],
    ['succeeded', 'DONE', 'bg-semantic-success'],
    ['failed', 'FAILED', 'bg-destructive'],
    ['cancelled', 'Cancelled', 'text-muted-soft'],
  ] as const)('renders %s with text %s and class containing %s', (status, label, cls) => {
    const { container } = render(<StatusBadge status={status} />);
    expect(screen.getByText(new RegExp(label, 'i'))).toBeInTheDocument();
    expect(container.firstChild).toHaveClass(cls);
  });
});
