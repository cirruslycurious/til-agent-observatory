/**
 * Unit Tests: Select Component
 * Story 1.1: Landing Page & Conference Selection
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './Select';

describe('Select', () => {
  const options = [
    { label: 'Option 1', value: 'opt1' },
    { label: 'Option 2', value: 'opt2' },
    { label: 'Option 3', value: 'opt3' },
  ];

  it('should render select with label', () => {
    render(<Select label="Test Label" options={options} onChange={() => {}} />);
    expect(screen.getByLabelText(/test label/i)).toBeInTheDocument();
  });

  it('should render all options', () => {
    render(<Select label="Test" options={options} onChange={() => {}} />);
    expect(screen.getByText('Option 1')).toBeInTheDocument();
    expect(screen.getByText('Option 2')).toBeInTheDocument();
    expect(screen.getByText('Option 3')).toBeInTheDocument();
  });

  it('should call onChange when option is selected', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Select label="Test" options={options} onChange={handleChange} />);
    
    const select = screen.getByLabelText(/test/i);
    await user.selectOptions(select, 'opt2');
    
    expect(handleChange).toHaveBeenCalledWith('opt2');
  });

  it('should display selected value', () => {
    render(<Select label="Test" value="opt2" options={options} onChange={() => {}} />);
    const select = screen.getByLabelText(/test/i) as HTMLSelectElement;
    expect(select.value).toBe('opt2');
  });

  it('should show required indicator', () => {
    render(<Select label="Test" required options={options} onChange={() => {}} />);
    const label = screen.getByText(/test/i);
    expect(label).toHaveTextContent('*');
  });

  it('should display error message', () => {
    render(
      <Select
        label="Test"
        options={options}
        onChange={() => {}}
        error="This field is required"
      />
    );
    expect(screen.getByText('This field is required')).toBeInTheDocument();
  });

  it('should have aria-invalid when error is present', () => {
    render(
      <Select
        label="Test"
        options={options}
        onChange={() => {}}
        error="Error message"
      />
    );
    const select = screen.getByLabelText(/test/i);
    expect(select).toHaveAttribute('aria-invalid', 'true');
  });

  it('should be disabled when disabled prop is true', () => {
    render(<Select label="Test" disabled options={options} onChange={() => {}} />);
    const select = screen.getByLabelText(/test/i);
    expect(select).toBeDisabled();
  });

  it('should use custom aria-label when provided', () => {
    render(
      <Select
        label="Test"
        ariaLabel="Custom Label"
        options={options}
        onChange={() => {}}
      />
    );
    const select = screen.getByLabelText('Custom Label');
    expect(select).toBeInTheDocument();
  });

  it('should have name attribute when provided', () => {
    render(
      <Select label="Test" name="test-select" options={options} onChange={() => {}} />
    );
    const select = screen.getByLabelText(/test/i);
    expect(select).toHaveAttribute('name', 'test-select');
  });
});
