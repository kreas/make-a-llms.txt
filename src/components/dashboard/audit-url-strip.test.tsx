import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuditUrlStrip } from './audit-url-strip';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

describe('AuditUrlStrip', () => {
  it('routes to the add-site flow with the url prefilled', () => {
    render(<AuditUrlStrip />);
    fireEvent.change(screen.getByPlaceholderText(/yoursite/i), { target: { value: 'acme.com' } });
    fireEvent.click(screen.getByRole('button', { name: /audit/i }));
    expect(push).toHaveBeenCalledWith('/sites/new?url=acme.com');
  });

  it('does nothing when the field is empty', () => {
    push.mockClear();
    render(<AuditUrlStrip />);
    fireEvent.click(screen.getByRole('button', { name: /audit/i }));
    expect(push).not.toHaveBeenCalled();
  });
});
