import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PillarRadar } from './pillar-radar';

describe('PillarRadar', () => {
  it('renders the three pillar scores as accessible text', () => {
    render(<PillarRadar readable={88} recommendable={55} recognized={74} />);
    expect(screen.getByText(/readable 88/i)).toBeInTheDocument();
    expect(screen.getByText(/recommendable 55/i)).toBeInTheDocument();
    expect(screen.getByText(/recognized 74/i)).toBeInTheDocument();
  });
});
