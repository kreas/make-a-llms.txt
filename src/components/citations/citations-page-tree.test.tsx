import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { CitationsPageTree, type CitationsPageRow } from './citations-page-tree';

const rows: CitationsPageRow[] = [
  { pageUrl: 'https://x.com/', score: 80, tier: 'good', fetchedAt: new Date().toISOString() },
  { pageUrl: 'https://x.com/about', score: null, tier: null, fetchedAt: null },
  { pageUrl: 'https://x.com/work/alpha', score: 60, tier: 'fair', fetchedAt: new Date().toISOString() },
  { pageUrl: 'https://x.com/work/beta', score: null, tier: null, fetchedAt: null },
  { pageUrl: 'https://x.com/work/case-studies/one', score: null, tier: null, fetchedAt: null },
];

describe('CitationsPageTree', () => {
  test('renders folders with audited/total counts and lists root-level leaves in the correct sorted order (home page first)', () => {
    render(<CitationsPageTree rows={rows} selectedUrl={null} onSelect={() => {}} />);
    // The "work" folder appears with its tally (1 audited of 3 total under work/*).
    expect(screen.getByText('work')).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();
    // Root-level leaves render their last URL segment; homepage labeled "home".
    expect(screen.getByText('home')).toBeInTheDocument();
    expect(screen.getByText('about')).toBeInTheDocument();

    // Verify ordering: home page first, then alphabetical pages, then folders
    const buttons = screen.getAllByRole('button');
    expect(buttons[0].textContent).toContain('home');
    expect(buttons[1].textContent).toContain('about');
    expect(buttons[2].textContent).toContain('work');
  });

  test('fires onSelect with the full pageUrl when a leaf is clicked', () => {
    const onSelect = vi.fn();
    render(<CitationsPageTree rows={rows} selectedUrl={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('about'));
    expect(onSelect).toHaveBeenCalledWith('https://x.com/about');
  });

  test('collapsed folders hide their children', () => {
    render(<CitationsPageTree rows={rows} selectedUrl={null} onSelect={() => {}} />);
    // Default-open is depth < 1; "work" folder starts collapsed.
    expect(screen.queryByText('alpha')).not.toBeInTheDocument();
    // Click to expand.
    fireEvent.click(screen.getByText('work'));
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
    // Nested subfolder still collapsed.
    expect(screen.queryByText('one')).not.toBeInTheDocument();
    expect(screen.getByText('case-studies')).toBeInTheDocument();
  });

  test('shows empty state when no rows', () => {
    render(<CitationsPageTree rows={[]} selectedUrl={null} onSelect={() => {}} />);
    expect(screen.getByText(/no pages/i)).toBeInTheDocument();
  });
});
