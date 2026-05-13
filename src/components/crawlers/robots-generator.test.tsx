import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RobotsGenerator } from './robots-generator';
import { KNOWN_AI_BOTS, type AuditResults } from '@/lib/known-ai-bots';
import { withQueryClient } from '@/test/utils';

function defaultResults(): AuditResults {
  return Object.fromEntries(
    KNOWN_AI_BOTS.map((b) => [b, { status: 'default' as const }]),
  ) as AuditResults;
}

function defaultFetchImpl(url: string, init?: RequestInit): Response {
  if (
    typeof url === 'string' &&
    url.includes('/generator-draft') &&
    (!init || !init.method || init.method === 'GET')
  ) {
    return new Response('', { status: 404 });
  }
  return new Response('{}', { status: 200 });
}

function stubFetch(
  impl: (url: string, init?: RequestInit) => Response | Promise<Response> = defaultFetchImpl,
) {
  const spy = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(impl(url, init)),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('RobotsGenerator', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    stubFetch();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
      writable: true,
    });
  });

  it('renders a toggle row for every known bot', () => {
    render(
      withQueryClient(
        <RobotsGenerator siteId={1} initial={defaultResults()} robotsContent={null} />,
      ),
    );
    for (const bot of KNOWN_AI_BOTS) {
      expect(screen.getByText(bot)).toBeInTheDocument();
    }
  });

  it('seeds initial toggle state from the audit results', () => {
    const seeded = { ...defaultResults(), GPTBot: { status: 'blocked' as const } };
    render(
      withQueryClient(
        <RobotsGenerator siteId={1} initial={seeded} robotsContent={null} />,
      ),
    );
    // The blocked button for GPTBot has aria-pressed=true
    const row = screen.getByText('GPTBot').closest('tr')!;
    const buttons = row.querySelectorAll('button');
    // Two buttons per row: Allow, Block
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking Block updates the snippet', async () => {
    const user = userEvent.setup();
    render(
      withQueryClient(
        <RobotsGenerator siteId={1} initial={defaultResults()} robotsContent={null} />,
      ),
    );
    const row = screen.getByText('GPTBot').closest('tr')!;
    const blockBtn = row.querySelectorAll('button')[1];
    await user.click(blockBtn);

    expect(screen.getByTestId('snippet')).toHaveTextContent('User-agent: GPTBot');
    expect(screen.getByTestId('snippet')).toHaveTextContent('Disallow: /');
  });

  it('clicking the highlighted state again resets the bot to default', async () => {
    const user = userEvent.setup();
    const seeded = { ...defaultResults(), GPTBot: { status: 'blocked' as const } };
    render(
      withQueryClient(
        <RobotsGenerator siteId={1} initial={seeded} robotsContent={null} />,
      ),
    );
    const row = screen.getByText('GPTBot').closest('tr')!;
    const blockBtn = row.querySelectorAll('button')[1];
    await user.click(blockBtn);

    expect(screen.getByTestId('snippet')).not.toHaveTextContent('User-agent: GPTBot');
  });

  it('Reset button restores the initial state', async () => {
    const user = userEvent.setup();
    const seeded = { ...defaultResults(), GPTBot: { status: 'blocked' as const } };
    render(
      withQueryClient(
        <RobotsGenerator siteId={1} initial={seeded} robotsContent={null} />,
      ),
    );
    const row = screen.getByText('GPTBot').closest('tr')!;
    const allowBtn = row.querySelectorAll('button')[0];
    await user.click(allowBtn);

    expect(screen.getByTestId('snippet')).toHaveTextContent('Allow: /');

    await user.click(screen.getByRole('button', { name: /reset/i }));
    expect(screen.getByTestId('snippet')).toHaveTextContent('Disallow: /');
  });

  it('Copy button writes the snippet to the clipboard', async () => {
    const user = userEvent.setup();
    // userEvent.setup() installs its own clipboard stub — re-install ours so
    // we can assert against the spy reference directly.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    const seeded = { ...defaultResults(), GPTBot: { status: 'blocked' as const } };
    render(
      withQueryClient(
        <RobotsGenerator siteId={1} initial={seeded} robotsContent={null} />,
      ),
    );
    await user.click(screen.getByRole('button', { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('User-agent: GPTBot'),
    );
  });

  it('renders a placeholder when all bots are default', () => {
    render(
      withQueryClient(
        <RobotsGenerator siteId={1} initial={defaultResults()} robotsContent={null} />,
      ),
    );
    expect(screen.getByTestId('snippet')).toHaveTextContent(
      '# (No directives — toggle a bot to begin)',
    );
  });

  it('loads saved toggles from the draft endpoint', async () => {
    stubFetch((url, init) => {
      if (
        url.includes('/generator-draft') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({ draft: { toggles: '{"GPTBot":"block"}' } }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 200 });
    });

    render(
      withQueryClient(
        <RobotsGenerator siteId={1} initial={defaultResults()} robotsContent={null} />,
      ),
    );

    await waitFor(() => {
      const row = screen.getByText('GPTBot').closest('tr')!;
      const buttons = row.querySelectorAll('button');
      expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    });
  });

  it('debounces a PUT to save toggles on click', async () => {
    const fetchSpy = stubFetch();
    const user = userEvent.setup();
    render(
      withQueryClient(
        <RobotsGenerator siteId={1} initial={defaultResults()} robotsContent={null} />,
      ),
    );

    const row = screen.getByText('GPTBot').closest('tr')!;
    const allowBtn = row.querySelectorAll('button')[0];
    await user.click(allowBtn);

    await waitFor(
      () => {
        const putCall = fetchSpy.mock.calls.find(
          ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
        );
        expect(putCall).toBeTruthy();
        const [putUrl, putInit] = putCall!;
        expect(putUrl).toBe('/api/sites/1/generator-draft');
        const body = JSON.parse((putInit as RequestInit).body as string);
        expect(body.toggles.GPTBot).toBe('allow');
      },
      { timeout: 2000 },
    );
  });

  it('includes robotsContent verbatim in the snippet when present', async () => {
    const user = userEvent.setup();
    render(
      withQueryClient(
        <RobotsGenerator
          siteId={1}
          initial={defaultResults()}
          robotsContent={'User-agent: ExistingBot\nDisallow: /\n'}
        />,
      ),
    );
    const row = screen.getByText('GPTBot').closest('tr')!;
    const blockBtn = row.querySelectorAll('button')[1];
    await user.click(blockBtn);

    const snippet = screen.getByTestId('snippet');
    expect(snippet).toHaveTextContent('User-agent: ExistingBot');
    expect(snippet).toHaveTextContent('User-agent: GPTBot');
  });

  it('Download button triggers a download with filename robots.txt', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => 'blob:test');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectURL,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectURL,
      configurable: true,
      writable: true,
    });

    const clickedAnchors: HTMLAnchorElement[] = [];
    const origCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tagName: string, options?: ElementCreationOptions) => {
        const el = origCreateElement(tagName, options);
        if (tagName.toLowerCase() === 'a') {
          const anchor = el as HTMLAnchorElement;
          // Override click to a no-op recorder. We deliberately do not call
          // the original click here — jsdom logs "Not implemented: navigation
          // to another Document" when an <a> with a blob href is clicked,
          // and that surfaces as a non-zero Vitest exit even though every
          // assertion in this test still passes.
          anchor.click = () => {
            clickedAnchors.push(anchor);
          };
        }
        return el;
      });

    try {
      render(
        withQueryClient(
          <RobotsGenerator
            siteId={1}
            initial={defaultResults()}
            robotsContent={'User-agent: ExistingBot\nDisallow: /\n'}
          />,
        ),
      );
      await user.click(screen.getByRole('button', { name: /download/i }));

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const blobArg = createObjectURL.mock.calls[0][0] as Blob;
      expect(blobArg).toBeInstanceOf(Blob);
      expect(clickedAnchors).toHaveLength(1);
      expect(clickedAnchors[0].getAttribute('download')).toBe('robots.txt');
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
    } finally {
      createElementSpy.mockRestore();
    }
  });

  it('shows the no-robots warning when robotsContent is null', () => {
    render(
      withQueryClient(
        <RobotsGenerator siteId={1} initial={defaultResults()} robotsContent={null} />,
      ),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/no robots\.txt/i);
  });

  it('shows the wildcard-block warning when User-agent: * Disallow: / is set', () => {
    render(
      withQueryClient(
        <RobotsGenerator
          siteId={1}
          initial={defaultResults()}
          robotsContent={'User-agent: *\nDisallow: /\n'}
        />,
      ),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/blocks all crawlers/i);
  });

  it('does not show a warning when robotsContent is permissive', () => {
    render(
      withQueryClient(
        <RobotsGenerator
          siteId={1}
          initial={defaultResults()}
          robotsContent={'User-agent: *\nAllow: /\n'}
        />,
      ),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Dismiss button hides the warning', async () => {
    const user = userEvent.setup();
    render(
      withQueryClient(
        <RobotsGenerator siteId={1} initial={defaultResults()} robotsContent={null} />,
      ),
    );
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('suppresses the Allow section when wildcard already allows root', async () => {
    const user = userEvent.setup();
    render(
      withQueryClient(
        <RobotsGenerator
          siteId={1}
          initial={defaultResults()}
          robotsContent={'User-agent: *\nAllow: /\n'}
        />,
      ),
    );
    const row = screen.getByText('GPTBot').closest('tr')!;
    const allowBtn = row.querySelectorAll('button')[0];
    await user.click(allowBtn);
    const snippet = screen.getByTestId('snippet').textContent ?? '';
    expect(snippet).not.toMatch(/# Allowed AI crawlers/);
    expect(snippet).not.toMatch(/User-agent: GPTBot/);
    expect(snippet).toMatch(/# Already allowed by your User-agent: \* rule/);
    expect(snippet).toMatch(/GPTBot/);
  });

  it('suppresses the Block section when wildcard already blocks root', async () => {
    const user = userEvent.setup();
    render(
      withQueryClient(
        <RobotsGenerator
          siteId={1}
          initial={defaultResults()}
          robotsContent={'User-agent: *\nDisallow: /\n'}
        />,
      ),
    );
    const row = screen.getByText('GPTBot').closest('tr')!;
    const blockBtn = row.querySelectorAll('button')[1];
    await user.click(blockBtn);
    const snippet = screen.getByTestId('snippet').textContent ?? '';
    expect(snippet).not.toMatch(/# Blocked AI crawlers/);
    expect(snippet).not.toMatch(/User-agent: GPTBot/);
    expect(snippet).toMatch(/# Already blocked by your User-agent: \* rule/);
    expect(snippet).toMatch(/GPTBot/);
  });

  it('shows the toggled bot in an informational comment when Allow is suppressed', async () => {
    const user = userEvent.setup();
    render(
      withQueryClient(
        <RobotsGenerator
          siteId={1}
          initial={defaultResults()}
          robotsContent={'User-agent: *\nAllow: /\n'}
        />,
      ),
    );
    // Initially no Allow toggled — the suppression comment should NOT be there.
    expect(screen.getByTestId('snippet')).not.toHaveTextContent(
      /Already allowed by your User-agent/,
    );

    const row = screen.getByText('GPTBot').closest('tr')!;
    await user.click(row.querySelectorAll('button')[0]);

    // Snippet now lists GPTBot inside the informational comment.
    expect(screen.getByTestId('snippet')).toHaveTextContent(
      /Already allowed by your User-agent/,
    );
    expect(screen.getByTestId('snippet')).toHaveTextContent('GPTBot');
  });

  it('still emits the Block section when wildcard is permissive', async () => {
    const user = userEvent.setup();
    render(
      withQueryClient(
        <RobotsGenerator
          siteId={1}
          initial={defaultResults()}
          robotsContent={'User-agent: *\nAllow: /\n'}
        />,
      ),
    );
    const row = screen.getByText('GPTBot').closest('tr')!;
    const blockBtn = row.querySelectorAll('button')[1];
    await user.click(blockBtn);
    const snippet = screen.getByTestId('snippet').textContent ?? '';
    expect(snippet).toMatch(/# Blocked AI crawlers/);
    expect(snippet).toMatch(/User-agent: GPTBot/);
    expect(snippet).toMatch(/Disallow: \//);
  });

  it('still emits the Allow section when wildcard is restrictive', async () => {
    const user = userEvent.setup();
    render(
      withQueryClient(
        <RobotsGenerator
          siteId={1}
          initial={defaultResults()}
          robotsContent={'User-agent: *\nDisallow: /\n'}
        />,
      ),
    );
    const row = screen.getByText('GPTBot').closest('tr')!;
    const allowBtn = row.querySelectorAll('button')[0];
    await user.click(allowBtn);
    const snippet = screen.getByTestId('snippet').textContent ?? '';
    expect(snippet).toMatch(/# Allowed AI crawlers/);
    expect(snippet).toMatch(/User-agent: GPTBot/);
    expect(snippet).toMatch(/Allow: \//);
  });
});
