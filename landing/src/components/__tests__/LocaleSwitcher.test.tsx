import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleSwitcher } from '../LocaleSwitcher';

const replaceSpy = vi.hoisted(() => vi.fn());

vi.mock('@/i18n/routing', () => ({
  routing: { locales: ['en', 'xx'] },
  usePathname: () => '/docs',
  useRouter: () => ({ replace: replaceSpy }),
}));

describe('LocaleSwitcher', () => {
  beforeEach(() => {
    replaceSpy.mockReset();
  });

  it('renders known and fallback locale labels', () => {
    render(<LocaleSwitcher />);

    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('xx')).toBeInTheDocument();
  });

  it('calls router.replace when a new locale is selected', () => {
    render(<LocaleSwitcher />);

    const select = screen.getByLabelText('Select language') as HTMLSelectElement;
    expect(select.value).toBe('en');

    fireEvent.change(select, { target: { value: 'xx' } });

    expect(replaceSpy).toHaveBeenCalledWith('/docs', { locale: 'xx' });
  });
});
