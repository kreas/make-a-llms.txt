import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProcessTimeline } from './process-timeline';

describe('ProcessTimeline', () => {
  it('renders all 3 stage labels', () => {
    render(<ProcessTimeline status="pending" />);
    expect(screen.getByText('Setup')).toBeInTheDocument();
    expect(screen.getByText('Read')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('marks all stages as reached when status is succeeded', () => {
    const { container } = render(<ProcessTimeline status="succeeded" />);
    // The Done pill should have the timeline-done color class
    const pills = container.querySelectorAll('span[class*="rounded-full"]');
    const donePill = Array.from(pills).find((el) => el.textContent?.includes('Done'));
    expect(donePill?.className).toContain('bg-timeline-done');
  });

  it('only marks Setup as reached when status is pending', () => {
    const { container } = render(<ProcessTimeline status="pending" />);
    const pills = container.querySelectorAll('span[class*="rounded-full"]');
    const setupPill = Array.from(pills).find((el) => el.textContent?.includes('Setup'));
    const donePill = Array.from(pills).find((el) => el.textContent?.includes('Done'));
    expect(setupPill?.className).toContain('bg-timeline-grep');
    expect(donePill?.className).toContain('bg-surface-strong');
  });
});
