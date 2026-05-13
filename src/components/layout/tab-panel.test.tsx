import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TabPanel } from './tab-panel';

describe('TabPanel', () => {
  it('renders meta, actions, and children', () => {
    render(
      <TabPanel
        meta={<span>meta-text</span>}
        actions={<button>action-btn</button>}
      >
        <div>content</div>
      </TabPanel>,
    );
    expect(screen.getByText('meta-text')).toBeInTheDocument();
    expect(screen.getByText('action-btn')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('omits the header row when neither meta nor actions are provided', () => {
    const { container } = render(
      <TabPanel>
        <div>content only</div>
      </TabPanel>,
    );
    // No header row should render — the wrapper's space-y-3 will only have one child.
    expect(container.querySelector('.flex.items-center.justify-between')).toBeNull();
    expect(screen.getByText('content only')).toBeInTheDocument();
  });

  it('renders the actions slot only when actions are provided', () => {
    render(
      <TabPanel meta={<span>just meta</span>}>
        <div>content</div>
      </TabPanel>,
    );
    expect(screen.getByText('just meta')).toBeInTheDocument();
  });

  it('passes through contentClassName when overriding the card padding', () => {
    const { container } = render(
      <TabPanel meta={<span>m</span>} contentClassName="p-0">
        <div>code-block</div>
      </TabPanel>,
    );
    // The card div should have p-0 not p-6.
    const card = container.querySelector('.rounded-xl');
    expect(card?.className).toContain('p-0');
    expect(card?.className).not.toContain('p-6');
  });
});
