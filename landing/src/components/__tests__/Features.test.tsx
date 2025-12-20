import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Features } from '../Features';

describe('Features', () => {
  it('renders title and feature cards', () => {
    render(<Features />);

    expect(screen.getByText('features.title')).toBeInTheDocument();

    // Check some specific features
    expect(screen.getByText('features.secureByDefault.title')).toBeInTheDocument();
    expect(screen.getByText('features.databaseAgnostic.title')).toBeInTheDocument();
    expect(screen.getByText('features.hexagonal.title')).toBeInTheDocument();
  });
});
