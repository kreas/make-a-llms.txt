import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from './stat-card';

describe('StatCard', () => {
  it('renders label, value and meta', () => {
    render(<StatCard label="Sites Monitored" value="8" meta="4 audited this week" />);
    expect(screen.getByText('Sites Monitored')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('4 audited this week')).toBeInTheDocument();
  });

  it('renders children (e.g. a sparkline slot)', () => {
    render(<StatCard label="Avg" value="83"><div data-testid="spark" /></StatCard>);
    expect(screen.getByTestId('spark')).toBeInTheDocument();
  });
});
