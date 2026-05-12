import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PagesTree, type ManifestPage } from './pages-tree';

const pages: ManifestPage[] = [
  { url: '', path: 'index', filename: 'index.md', status: 'ok', blobPath: 'x' },
  { url: '', path: 'docs/cdn', filename: 'cdn.md', status: 'ok', blobPath: 'x' },
  { url: '', path: 'docs/cli/deploy', filename: 'deploy.md', status: 'ok', blobPath: 'x' },
  { url: '', path: 'docs/edge', filename: 'edge.md', status: 'failed', blobPath: null, reason: 'CF 502' },
];

describe('PagesTree', () => {
  it('renders folder nodes and leaf files', () => {
    render(<PagesTree pages={pages} selectedPath={null} onSelect={() => {}} />);
    expect(screen.getByText('docs')).toBeInTheDocument();
    expect(screen.getByText('cdn.md')).toBeInTheDocument();
    expect(screen.getByText('cli')).toBeInTheDocument();
  });

  it('calls onSelect with the page path when a leaf is clicked', () => {
    const onSelect = vi.fn();
    render(<PagesTree pages={pages} selectedPath={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('cdn.md'));
    expect(onSelect).toHaveBeenCalledWith('docs/cdn');
  });

  it('marks failed nodes as still clickable', () => {
    const onSelect = vi.fn();
    render(<PagesTree pages={pages} selectedPath={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('edge.md'));
    expect(onSelect).toHaveBeenCalledWith('docs/edge');
  });

  it('renders folder count badges like (3/4)', () => {
    render(<PagesTree pages={pages} selectedPath={null} onSelect={() => {}} />);
    // docs/ contains 3 items (cdn.md ok, cli/ folder containing 1 deploy.md ok, edge.md failed).
    // Recursive: cdn.md (ok) + cli/deploy.md (ok) + edge.md (failed) = 2/3 ok recursive.
    expect(screen.getByText(/2\/3/)).toBeInTheDocument();
  });
});
