import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReadinessSparkline } from './readiness-sparkline';

describe('ReadinessSparkline', () => {
  it('shows a placeholder when there is not enough history', () => {
    render(<ReadinessSparkline data={null} />);
    expect(screen.getByText(/not enough history/i)).toBeInTheDocument();
  });

  it('shows the placeholder for a single data point', () => {
    render(<ReadinessSparkline data={[72]} />);
    expect(screen.getByText(/not enough history/i)).toBeInTheDocument();
  });

  it('renders a polyline for a data series', () => {
    const { container } = render(<ReadinessSparkline data={[70, 90]} />);
    const poly = container.querySelector('polyline');
    expect(poly).not.toBeNull();
    expect(poly!.getAttribute('points')).toContain(' ');
  });

  it('inverts y so a higher score sits higher (lower y)', () => {
    // [0, 100]: min at bottom (y=32), max at top (y=0)
    const { container } = render(<ReadinessSparkline data={[0, 100]} />);
    expect(container.querySelector('polyline')!.getAttribute('points')).toBe('0.0,32.0 96.0,0.0');
  });

  it('centers a flat series at the midpoint', () => {
    const { container } = render(<ReadinessSparkline data={[100, 100]} />);
    expect(container.querySelector('polyline')!.getAttribute('points')).toBe('0.0,16.0 96.0,16.0');
  });

  it('colors the line by net trend direction', () => {
    const up = render(<ReadinessSparkline data={[60, 80]} />);
    expect(up.container.querySelector('polyline')!.getAttribute('stroke')).toBe('var(--color-semantic-success)');
    const down = render(<ReadinessSparkline data={[80, 60]} />);
    expect(down.container.querySelector('polyline')!.getAttribute('stroke')).toBe('var(--color-destructive)');
  });
});
