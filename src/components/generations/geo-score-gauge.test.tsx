import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GeoScoreGauge } from './geo-score-gauge';

describe('GeoScoreGauge', () => {
  it('renders the score and tier as text', () => {
    render(<GeoScoreGauge score={70} tier="good" />);
    expect(screen.getByText('70')).toBeInTheDocument();
    expect(screen.getByText(/good/i)).toBeInTheDocument();
  });
});
