import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CodeShowcase } from '../CodeShowcase';

describe('CodeShowcase', () => {
  it('renders correctly and allows switching tabs', () => {
    render(<CodeShowcase />);

    expect(screen.getByText('codeShowcase.title')).toBeInTheDocument();

    // Initial tab (Quick Start)
    expect(screen.getByText(/FortressAuth/)).toBeInTheDocument();
    expect(screen.getByText('server.ts')).toBeInTheDocument();

    // Switch to React tab
    const reactTab = screen.getByText('codeShowcase.tabs.reactSdk');
    fireEvent.click(reactTab);

    expect(screen.getByText('LoginForm.tsx')).toBeInTheDocument();
    expect(screen.getByText(/useAuth/)).toBeInTheDocument();
  });
});
