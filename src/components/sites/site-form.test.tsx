import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SiteForm } from './site-form';

describe('SiteForm', () => {
  it('calls onSubmit with rootUrl when form is submitted with a valid URL', async () => {
    const onSubmit = vi.fn();
    render(<SiteForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/website url/i), 'https://acme.com');
    await userEvent.click(screen.getByRole('button', { name: /add.*generate/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      rootUrl: 'https://acme.com',
      sitemapUrl: undefined,
    });
  });

  it('automatically prepends https:// if protocol is missing', async () => {
    const onSubmit = vi.fn();
    render(<SiteForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/website url/i), 'civilization.agency');
    await userEvent.click(screen.getByRole('button', { name: /add.*generate/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      rootUrl: 'https://civilization.agency',
      sitemapUrl: undefined,
    });
  });

  it('shows error when URL is invalid', async () => {
    const onSubmit = vi.fn();
    render(<SiteForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/website url/i), 'bogus');
    await userEvent.click(screen.getByRole('button', { name: /add.*generate/i }));
    expect(await screen.findByText(/valid url/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows error when URL is empty', async () => {
    const onSubmit = vi.fn();
    render(<SiteForm onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: /add.*generate/i }));
    expect(await screen.findByText(/please enter a website url/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears active validation error immediately on typing', async () => {
    const onSubmit = vi.fn();
    render(<SiteForm onSubmit={onSubmit} />);
    
    // Trigger validation error
    await userEvent.click(screen.getByRole('button', { name: /add.*generate/i }));
    expect(await screen.findByText(/please enter a website url/i)).toBeInTheDocument();
    
    // Type something
    await userEvent.type(screen.getByLabelText(/website url/i), 'c');
    
    // Check if error is gone
    expect(screen.queryByText(/please enter a website url/i)).not.toBeInTheDocument();
  });
});

describe('SiteForm sitemap discovery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
    vi.stubGlobal('fetch', vi.fn(impl));
  }

  it('shows spinner while discovering and populates sitemap hint on success', async () => {
    let resolveFetch!: (r: Response) => void;
    stubFetch(
      () =>
        new Promise<Response>((res) => {
          resolveFetch = res;
        }),
    );

    vi.useFakeTimers();
    render(<SiteForm onSubmit={vi.fn()} />);

    act(() => {
      fireEvent.change(screen.getByLabelText(/website url/i), {
        target: { value: 'https://acme.com' },
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    vi.useRealTimers();

    expect(screen.getByText(/looking for sitemap/i)).toBeInTheDocument();

    await act(async () => {
      resolveFetch(
        new Response(JSON.stringify({ sitemapUrl: 'https://acme.com/sitemap.xml' }), {
          status: 200,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/found sitemap/i)).toBeInTheDocument();
    });
  });

  it('shows "No sitemap found" hint on 404', async () => {
    stubFetch(async () => new Response('', { status: 404 }));

    vi.useFakeTimers();
    render(<SiteForm onSubmit={vi.fn()} />);

    act(() => {
      fireEvent.change(screen.getByLabelText(/website url/i), {
        target: { value: 'https://acme.com' },
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByText(/no sitemap found/i)).toBeInTheDocument();
    });
  });

  it('includes discovered sitemapUrl in onSubmit payload', async () => {
    stubFetch(async () =>
      new Response(JSON.stringify({ sitemapUrl: 'https://acme.com/sitemap.xml' }), {
        status: 200,
      }),
    );

    const onSubmit = vi.fn();
    vi.useFakeTimers();
    render(<SiteForm onSubmit={onSubmit} />);

    act(() => {
      fireEvent.change(screen.getByLabelText(/website url/i), {
        target: { value: 'https://acme.com' },
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByText(/found sitemap/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /add.*generate/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      rootUrl: 'https://acme.com',
      sitemapUrl: 'https://acme.com/sitemap.xml',
    });
  });
});
