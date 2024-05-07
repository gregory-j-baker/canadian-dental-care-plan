import { render, screen } from '@testing-library/react';

import { parsePhoneNumber } from 'libphonenumber-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InputPhoneField } from '~/components/input-phone-field';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('InputPhoneField', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should render', async () => {
    const phoneNumber = parsePhoneNumber('+15146667777').number;
    render(<InputPhoneField id="test-id" name="test" label="label test" defaultValue={phoneNumber} />);

    const actual: HTMLInputElement = screen.getByTestId('input-phone-field');

    expect(actual).toBeInTheDocument();
    expect(actual).toHaveAccessibleName('label test');
    expect(actual).toHaveAttribute('id', 'test-id');
    expect(actual).toHaveValue('+1 514 666 7777');
    expect(actual).not.toBeRequired();
    expect(actual).not.toHaveAccessibleDescription();
  });

  it('should render with help message', async () => {
    const phoneNumber = parsePhoneNumber('+15146667777').number;
    render(<InputPhoneField id="test-id" name="test" label="label test" defaultValue={phoneNumber} helpMessageSecondary="help message" />);

    const actual = screen.getByTestId('input-phone-field');

    expect(actual).toBeInTheDocument();
    expect(actual).toHaveAccessibleDescription('help message');
    expect(actual).toHaveAccessibleName('label test');
    expect(actual).toHaveAttribute('id', 'test-id');
    expect(actual).toHaveValue('+1 514 666 7777');
    expect(actual).not.toBeRequired();
  });

  it('should render with required', async () => {
    const phoneNumber = parsePhoneNumber('+15146667777').number;
    render(<InputPhoneField id="test-id" name="test" label="label test" defaultValue={phoneNumber} required />);

    const actual = screen.getByTestId('input-phone-field');

    expect(actual).toBeInTheDocument();
    expect(actual).toHaveAttribute('id', 'test-id');
    expect(actual).toHaveValue('+1 514 666 7777');
    expect(actual).toBeRequired();
    expect(actual).not.toHaveAccessibleDescription();
  });

  it('should render with error message', async () => {
    const phoneNumber = parsePhoneNumber('+15146667777').number;
    render(<InputPhoneField id="test-id" name="test" label="label test" defaultValue={phoneNumber} errorMessage="error message" />);

    const actual = screen.getByTestId('input-phone-field');

    expect(actual).toBeInTheDocument();
    expect(actual).toHaveAccessibleName('label test');
    expect(actual).toBeInvalid();
    expect(actual).toHaveAccessibleErrorMessage('error message');
  });
});
