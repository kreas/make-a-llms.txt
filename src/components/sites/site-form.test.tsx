import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SiteForm } from './site-form';

type PreflightResult = {
  ok: boolean;
  homepageReachable: boolean;
  sitemapUrl: string | null;
};

function stubPreflight(result: PreflightResult, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(result), { status })),
  );
}

const PASS: PreflightResult = {
  ok: true,
  homepageReachable: true,
  sitemapUrl: 'https://acme.com/sitemap.xml',
};

describe('SiteForm prefill', () => {
  it('prefills the URL input from initialUrl', () => {
    render(<SiteForm onSubmit={() => {}} initialUrl="https://acme.com" />);
    expect(screen.getByLabelText('Website URL')).toHaveValue('https://acme.com');
  });
});

describe('SiteForm validation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows error when URL is empty', async () => {
    const onSubmit = vi.fn();
    render(<SiteForm onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: /preflight check/i }));
    expect(await screen.findByText(/please enter a website url/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows error when URL is invalid', async () => {
    const onSubmit = vi.fn();
    render(<SiteForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/website url/i), 'bogus');
    await userEvent.click(screen.getByRole('button', { name: /preflight check/i }));
    expect(await screen.findByText(/valid url/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears active validation error immediately on typing', async () => {
    render(<SiteForm onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /preflight check/i }));
    expect(await screen.findByText(/please enter a website url/i)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/website url/i), 'c');
    expect(screen.queryByText(/please enter a website url/i)).not.toBeInTheDocument();
  });
});

describe('SiteForm preflight', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('runs preflight on the first click and starts the project on the second', async () => {
    stubPreflight(PASS);
    const onSubmit = vi.fn();
    const onPreflightSuccess = vi.fn();
    render(<SiteForm onSubmit={onSubmit} onPreflightSuccess={onPreflightSuccess} />);

    await userEvent.type(screen.getByLabelText(/website url/i), 'https://acme.com');
    await userEvent.click(screen.getByRole('button', { name: /preflight check/i }));

    // Button flips to "Start Project" and confetti callback fires
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start project/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/site reachable/i)).toBeInTheDocument();
    expect(onPreflightSuccess).toHaveBeenCalledWith(PASS);
    expect(onSubmit).not.toHaveBeenCalled();

    // Preflight hits the dedicated endpoint
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/sitemap/preflight',
      expect.objectContaining({ method: 'POST' }),
    );

    // Second click starts the project with the discovered sitemap
    await userEvent.click(screen.getByRole('button', { name: /start project/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      rootUrl: 'https://acme.com',
      sitemapUrl: 'https://acme.com/sitemap.xml',
    });
  });

  it('prepends https:// before running the preflight check', async () => {
    stubPreflight(PASS);
    render(<SiteForm onSubmit={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/website url/i), 'acme.com');
    await userEvent.click(screen.getByRole('button', { name: /preflight check/i }));

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/sitemap/preflight',
        expect.objectContaining({
          body: JSON.stringify({ rootUrl: 'https://acme.com' }),
        }),
      );
    });
  });

  it('reports an unreachable homepage and stays on Preflight Check', async () => {
    stubPreflight({ ok: false, homepageReachable: false, sitemapUrl: null });
    const onSubmit = vi.fn();
    const onPreflightSuccess = vi.fn();
    render(<SiteForm onSubmit={onSubmit} onPreflightSuccess={onPreflightSuccess} />);

    await userEvent.type(screen.getByLabelText(/website url/i), 'https://acme.com');
    await userEvent.click(screen.getByRole('button', { name: /preflight check/i }));

    expect(await screen.findByText(/couldn't reach the homepage/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /preflight check/i })).toBeInTheDocument();
    expect(onPreflightSuccess).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('reports a missing sitemap when the homepage is reachable but no sitemap exists', async () => {
    stubPreflight({ ok: false, homepageReachable: true, sitemapUrl: null });
    render(<SiteForm onSubmit={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/website url/i), 'https://acme.com');
    await userEvent.click(screen.getByRole('button', { name: /preflight check/i }));

    expect(await screen.findByText(/no sitemap\.xml found/i)).toBeInTheDocument();
  });

  it('resets to the preflight step when the URL is edited after a passing check', async () => {
    stubPreflight(PASS);
    render(<SiteForm onSubmit={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/website url/i), 'https://acme.com');
    await userEvent.click(screen.getByRole('button', { name: /preflight check/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start project/i })).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText(/website url/i), '/blog');
    expect(screen.getByRole('button', { name: /preflight check/i })).toBeInTheDocument();
    expect(screen.queryByText(/site reachable/i)).not.toBeInTheDocument();
  });
});
