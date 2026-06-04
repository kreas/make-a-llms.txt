import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReadinessSparkline } from './readiness-sparkline';

describe('ReadinessSparkline', () => {
  it('shows a placeholder when there is not enough history', () => {
    render(<ReadinessSparkline data={null} />);
    expect(screen.getByText(/not enough history/i)).toBeInTheDocument();
  });

  it('renders a polyline for a data series', () => {
    const { container } = render(<ReadinessSparkline data={[70, 90]} />);
    const poly = container.querySelector('polyline');
    expect(poly).not.toBeNull();
    expect(poly!.getAttribute('points')).toContain(' ');
  });
});
