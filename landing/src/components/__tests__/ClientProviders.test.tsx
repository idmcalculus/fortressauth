import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClientProviders } from '../ClientProviders';

describe('ClientProviders', () => {
  it('renders children and provides theme', () => {
    render(
      <ClientProviders>
        <div data-testid="child">Child</div>
      </ClientProviders>,
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
