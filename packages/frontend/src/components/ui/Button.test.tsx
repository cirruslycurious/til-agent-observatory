/**
 * Unit Tests: Button Component
 * Story 1.1: Landing Page & Conference Selection
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('should render button with default props', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();
  });

  it('should apply primary variant by default', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('bg-[color:var(--accent)]');
  });

  it('should apply secondary variant', () => {
    render(<Button variant="secondary">Click me</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('bg-[color:var(--elevated)]');
  });

  it('should apply danger variant', () => {
    render(<Button variant="danger">Click me</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('bg-red-600');
  });

  it('should apply size classes', () => {
    const { rerender } = render(<Button size="small">Click me</Button>);
    let button = screen.getByRole('button');
    expect(button).toHaveClass('h-11');

    rerender(<Button size="medium">Click me</Button>);
    button = screen.getByRole('button');
    expect(button).toHaveClass('h-12');

    rerender(<Button size="large">Click me</Button>);
    button = screen.getByRole('button');
    expect(button).toHaveClass('h-14');
  });

  it('should have minimum 44×44px touch target', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('min-w-[44px]');
    expect(button).toHaveClass('min-h-[44px]');
  });

  it('should have focus ring', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('focus-visible:ring-2');
  });

  it('should be disabled when disabled prop is true', () => {
    render(<Button disabled>Click me</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveClass('disabled:opacity-50');
  });

  it('should call onClick handler when clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    
    const button = screen.getByRole('button');
    await user.click(button);
    
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should not call onClick when disabled', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button disabled onClick={handleClick}>Click me</Button>);
    
    const button = screen.getByRole('button');
    await user.click(button);
    
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('should pass through additional props', () => {
    render(<Button type="submit" data-testid="custom-button">Click me</Button>);
    const button = screen.getByTestId('custom-button');
    expect(button).toHaveAttribute('type', 'submit');
  });
});
