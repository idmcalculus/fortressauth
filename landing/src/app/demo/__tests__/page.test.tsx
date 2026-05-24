import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import DemoPage, { metadata } from '../page';

vi.mock('@/components/GlobalBackground', () => ({
  GlobalBackground: ({ children }: { children: ReactNode }) => (
    <div data-testid="global-background">{children}</div>
  ),
}));

vi.mock('@/lib/demo-config', () => ({
  getLiveDemoUrl: () => 'https://react-demo.fortressauth.com',
}));

describe('DemoPage', () => {
  it('exports demo metadata', () => {
    expect(metadata.title).toBe('Live Demo | FortressAuth');
  });

  it('renders the live demo iframe and standalone link', () => {
    render(<DemoPage />);

    expect(screen.getByTestId('global-background')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Live Auth Demo' })).toBeInTheDocument();

    const iframe = screen.getByTitle('FortressAuth live authentication demo');
    expect(iframe).toHaveAttribute('src', 'https://react-demo.fortressauth.com/');

    expect(screen.getByRole('link', { name: /open standalone/i })).toHaveAttribute(
      'href',
      'https://react-demo.fortressauth.com/',
    );
  });
});
