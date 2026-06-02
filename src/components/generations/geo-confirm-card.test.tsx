import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GeoConfirmCard } from './geo-confirm-card';

describe('GeoConfirmCard', () => {
  it('shows the suggested type and submits the chosen type + goal', async () => {
    const onAnalyze = vi.fn();
    render(<GeoConfirmCard suggestedType="publisher" confidence={0.86} onAnalyze={onAnalyze} isRunning={false} />);
    expect(screen.getByText(/blog \/ publisher/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /build trust/i }));
    await userEvent.click(screen.getByRole('button', { name: /^analyze/i }));
    expect(onAnalyze).toHaveBeenCalledWith({ siteType: 'publisher', goal: 'build-trust' });
  });

  it('lets the user change the type', async () => {
    const onAnalyze = vi.fn();
    render(<GeoConfirmCard suggestedType="saas" confidence={0.9} onAnalyze={onAnalyze} isRunning={false} />);
    await userEvent.selectOptions(screen.getByLabelText(/site type/i), 'ecommerce');
    await userEvent.click(screen.getByRole('button', { name: /^analyze/i }));
    expect(onAnalyze).toHaveBeenCalledWith(expect.objectContaining({ siteType: 'ecommerce' }));
  });
});
