import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PagesPreview } from './pages-preview';

describe('PagesPreview', () => {
  it('renders loading state', () => {
    render(<PagesPreview content={null} isLoading={true} isError={false} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders error state', () => {
    render(<PagesPreview content={null} isLoading={false} isError={true} />);
    expect(screen.getByText(/couldn['']t load/i)).toBeInTheDocument();
  });

  it('renders markdown content', () => {
    render(<PagesPreview content="# Hello\n\nWorld" isLoading={false} isError={false} />);
    expect(screen.getByText(/# Hello/)).toBeInTheDocument();
  });

  it('renders empty content state', () => {
    render(<PagesPreview content={null} isLoading={false} isError={false} />);
    expect(screen.getByText(/no content available/i)).toBeInTheDocument();
  });
});
