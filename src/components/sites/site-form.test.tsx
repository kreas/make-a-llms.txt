import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SiteForm } from './site-form';

describe('SiteForm', () => {
  it('calls onSubmit with valid input', async () => {
    const onSubmit = vi.fn();
    render(<SiteForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/name/i), 'Acme');
    await userEvent.type(screen.getByLabelText(/website url/i), 'https://acme.com');
    await userEvent.click(screen.getByRole('button', { name: /create site/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Acme',
      rootUrl: 'https://acme.com',
      sitemapUrl: undefined,
    });
  });

  it('shows error when URL is invalid', async () => {
    const onSubmit = vi.fn();
    render(<SiteForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/name/i), 'A');
    await userEvent.type(screen.getByLabelText(/website url/i), 'bogus');
    await userEvent.click(screen.getByRole('button', { name: /create site/i }));
    expect(await screen.findByText(/valid url|http/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('SiteForm sitemap discovery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
    vi.stubGlobal('fetch', vi.fn(impl));
  }

  it('shows spinner and disables sitemap while discovering, populates on success', async () => {
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

    // Advance past the 500ms debounce to trigger fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    vi.useRealTimers();

    expect(screen.getByText(/looking for sitemap/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/sitemap url/i)).toBeDisabled();

    await act(async () => {
      resolveFetch(
        new Response(JSON.stringify({ sitemapUrl: 'https://acme.com/sitemap.xml' }), {
          status: 200,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/sitemap url/i)).toHaveValue('https://acme.com/sitemap.xml');
    });
    expect(screen.getByText(/^found$/i)).toBeInTheDocument();
  });

  it('shows "No sitemap found" on 404', async () => {
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

  it('does not overwrite a sitemap the user typed manually', async () => {
    stubFetch(async () =>
      new Response(JSON.stringify({ sitemapUrl: 'https://acme.com/sitemap.xml' }), {
        status: 200,
      }),
    );

    vi.useFakeTimers();
    render(<SiteForm onSubmit={vi.fn()} />);

    // Set sitemap manually first (clears autoFilledRef)
    act(() => {
      fireEvent.change(screen.getByLabelText(/sitemap url/i), {
        target: { value: 'https://manual.test/sm.xml' },
      });
    });

    // Then change rootUrl — discovery should be skipped because manual value exists
    act(() => {
      fireEvent.change(screen.getByLabelText(/website url/i), {
        target: { value: 'https://acme.com' },
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    vi.useRealTimers();

    // Manual value should be preserved
    expect(screen.getByLabelText(/sitemap url/i)).toHaveValue('https://manual.test/sm.xml');
  });
});
