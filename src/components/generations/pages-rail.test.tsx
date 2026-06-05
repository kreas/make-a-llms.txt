import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PagesRail } from './pages-rail';
import type { ManifestPage } from './pages-tree-data';

const setSelectedPath = vi.fn();
let ctx: {
  pages: ManifestPage[];
  manifestPending: boolean;
  selectedPath: string | null;
  setSelectedPath: (p: string) => void;
};
vi.mock('./page-workspace-context', () => ({
  usePageWorkspace: () => ctx,
}));

function page(path: string, status: ManifestPage['status'] = 'ok'): ManifestPage {
  return { url: `https://x.com/${path}`, path, filename: path.split('/').pop()!, status, blobPath: null };
}

function setCtx(over: Partial<typeof ctx>) {
  ctx = { pages: [], manifestPending: false, selectedPath: null, setSelectedPath, ...over };
}

describe('PagesRail', () => {
  it('shows a loading state while the manifest is pending', () => {
    setCtx({ manifestPending: true });
    render(<PagesRail />);
    expect(screen.getByText(/loading pages/i)).toBeInTheDocument();
  });

  it('shows an empty hint when there are no pages', () => {
    setCtx({ pages: [] });
    render(<PagesRail />);
    expect(screen.getByText(/no pages yet/i)).toBeInTheDocument();
  });

  it('renders page names and selecting a page calls setSelectedPath', () => {
    setCtx({ pages: [page('index'), page('about')], selectedPath: 'index' });
    render(<PagesRail />);
    const about = screen.getByText('about');
    fireEvent.click(about);
    expect(setSelectedPath).toHaveBeenCalledWith('about');
  });
});
