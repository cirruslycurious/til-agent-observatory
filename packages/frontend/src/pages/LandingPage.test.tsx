/**
 * Unit Tests: Landing Page
 * Story 1.1: Landing Page & Conference Selection
 * 
 * Comprehensive tests including forbidden words regression test.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { LandingPage } from './LandingPage';
import { jobsService } from '../services/api/jobs';
import { setJobToken } from '../utils/tokenStorage';
import * as reactRouterDom from 'react-router-dom';

// Mock dependencies
vi.mock('../services/api/jobs');
vi.mock('../utils/tokenStorage');

const mockNavigate = vi.fn();

// Mock useNavigate
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Helper to render with router
const renderWithRouter = () => {
  return render(
    <BrowserRouter>
      <LandingPage />
    </BrowserRouter>
  );
};

describe('LandingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockNavigate.mockClear();
  });

  describe('Rendering', () => {
    it('should render H1 with correct text', () => {
      renderWithRouter();
      expect(screen.getByRole('heading', { level: 1, name: /TIL — Agent Workflow Observatory/i })).toBeInTheDocument();
    });

    it('should render instrumentation harness messaging', () => {
      renderWithRouter();
      expect(screen.getByText(/This is an instrumentation harness for observing agent behavior end-to-end/i)).toBeInTheDocument();
      expect(screen.getByText(/Inspect decisions, tool calls, artifacts, routing, and evaluation signals/i)).toBeInTheDocument();
    });

    it('should render Non-goals section', () => {
      renderWithRouter();
      expect(screen.getByText(/Non-goals/i)).toBeInTheDocument();
      expect(screen.getByText(/Not intended to produce submission-ready abstracts. Use this to observe workflow traces; edit outputs before use/i)).toBeInTheDocument();
    });

    it('should render conference dropdown', () => {
      renderWithRouter();
      expect(screen.getByLabelText(/conference/i)).toBeInTheDocument();
    });

    it('should render topic dropdown', () => {
      renderWithRouter();
      expect(screen.getByLabelText(/topic/i)).toBeInTheDocument();
    });

    it('should render all conference options', () => {
      renderWithRouter();
      expect(screen.getByText('Black Hat USA')).toBeInTheDocument();
      expect(screen.getByText('AWS re:Invent')).toBeInTheDocument();
      expect(screen.getByText('KubeCon + CloudNativeCon')).toBeInTheDocument();
    });

    it('should render all topic options', () => {
      renderWithRouter();
      expect(screen.getByText('GenAI')).toBeInTheDocument();
      expect(screen.getByText('Cybersecurity')).toBeInTheDocument();
      expect(screen.getByText('Containers')).toBeInTheDocument();
      expect(screen.getByText('Cloud Architecture')).toBeInTheDocument();
      expect(screen.getByText('DevOps')).toBeInTheDocument();
    });
  });

  describe('Button State', () => {
    it('should disable button until both fields are selected', () => {
      renderWithRouter();
      const submitButtons = screen.getAllByRole('button', { name: /run instrumented workflow/i });
      // Both desktop and mobile buttons should be disabled
      submitButtons.forEach(button => {
        expect(button).toBeDisabled();
      });
    });

    it('should enable button when both fields are selected', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      const conferenceSelect = screen.getByLabelText(/conference/i);
      const topicSelect = screen.getByLabelText(/topic/i);
      
      await user.selectOptions(conferenceSelect, 'black_hat');
      await user.selectOptions(topicSelect, 'genai');
      
      const submitButtons = screen.getAllByRole('button', { name: /run instrumented workflow/i });
      await waitFor(() => {
        submitButtons.forEach(button => {
          expect(button).not.toBeDisabled();
        });
      });
    });
  });

  describe('Form Submission', () => {
    it('should call createJob API on successful submit', async () => {
      const user = userEvent.setup();
      const mockResponse = {
        job_id: 'job-123',
        job_read_token: 'token-abc',
        status: 'queued',
        estimated_time_seconds: 90,
      };
      
      (jobsService.createJob as any).mockResolvedValueOnce(mockResponse);
      
      renderWithRouter();
      
      const conferenceSelect = screen.getByLabelText(/conference/i);
      const topicSelect = screen.getByLabelText(/topic/i);
      const submitButtons = screen.getAllByRole('button', { name: /run instrumented workflow/i });
      const submitButton = submitButtons[0]; // Use desktop button
      
      await user.selectOptions(conferenceSelect, 'black_hat');
      await user.selectOptions(topicSelect, 'genai');
      
      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });
      
      await user.click(submitButton);
      
      expect(jobsService.createJob).toHaveBeenCalledWith({
        conference: 'black_hat',
        topic: 'genai',
      });
    });

    it('should store token in sessionStorage on successful submit', async () => {
      const user = userEvent.setup();
      const mockResponse = {
        job_id: 'job-123',
        job_read_token: 'token-abc',
        status: 'queued',
        estimated_time_seconds: 90,
      };
      
      (jobsService.createJob as any).mockResolvedValueOnce(mockResponse);
      
      renderWithRouter();
      
      const conferenceSelect = screen.getByLabelText(/conference/i);
      const topicSelect = screen.getByLabelText(/topic/i);
      const submitButtons = screen.getAllByRole('button', { name: /run instrumented workflow/i });
      const submitButton = submitButtons[0]; // Use desktop button
      
      await user.selectOptions(conferenceSelect, 'reinvent');
      await user.selectOptions(topicSelect, 'cybersecurity');
      
      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });
      
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(setJobToken).toHaveBeenCalledWith('job-123', 'token-abc');
      });
    });

    it('should navigate to /jobs/:jobId on successful submit', async () => {
      const user = userEvent.setup();
      const mockResponse = {
        job_id: 'job-456',
        job_read_token: 'token-xyz',
        status: 'queued',
        estimated_time_seconds: 90,
      };
      
      (jobsService.createJob as any).mockResolvedValueOnce(mockResponse);
      
      renderWithRouter();
      
      const conferenceSelect = screen.getByLabelText(/conference/i);
      const topicSelect = screen.getByLabelText(/topic/i);
      const submitButtons = screen.getAllByRole('button', { name: /run instrumented workflow/i });
      const submitButton = submitButtons[0]; // Use desktop button
      
      await user.selectOptions(conferenceSelect, 'kubecon');
      await user.selectOptions(topicSelect, 'containers');
      
      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });
      
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/jobs/job-456');
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error message for 400 Bad Request', async () => {
      const user = userEvent.setup();
      const error = new Error('Invalid request');
      (error as any).status = 400;
      (jobsService.createJob as any).mockRejectedValueOnce(error);
      
      renderWithRouter();
      
      const conferenceSelect = screen.getByLabelText(/conference/i);
      const topicSelect = screen.getByLabelText(/topic/i);
      const submitButtons = screen.getAllByRole('button', { name: /run instrumented workflow/i });
      const submitButton = submitButtons[0]; // Use desktop button
      
      await user.selectOptions(conferenceSelect, 'black_hat');
      await user.selectOptions(topicSelect, 'genai');
      
      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });
      
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/Invalid selection. Please choose a conference and topic/i)).toBeInTheDocument();
      });
    });

    it('should display error message for 429 Rate Limited', async () => {
      const user = userEvent.setup();
      const error = new Error('Rate limited');
      (error as any).status = 429;
      (jobsService.createJob as any).mockRejectedValueOnce(error);
      
      renderWithRouter();
      
      const conferenceSelect = screen.getByLabelText(/conference/i);
      const topicSelect = screen.getByLabelText(/topic/i);
      const submitButtons = screen.getAllByRole('button', { name: /run instrumented workflow/i });
      const submitButton = submitButtons[0]; // Use desktop button
      
      await user.selectOptions(conferenceSelect, 'black_hat');
      await user.selectOptions(topicSelect, 'genai');
      
      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });
      
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/Rate limited. Please try again in a moment/i)).toBeInTheDocument();
      });
    });

    it('should display error message for 503 Service Unavailable', async () => {
      const user = userEvent.setup();
      const error = new Error('Service unavailable');
      (error as any).status = 503;
      (jobsService.createJob as any).mockRejectedValueOnce(error);
      
      renderWithRouter();
      
      const conferenceSelect = screen.getByLabelText(/conference/i);
      const topicSelect = screen.getByLabelText(/topic/i);
      const submitButtons = screen.getAllByRole('button', { name: /run instrumented workflow/i });
      const submitButton = submitButtons[0]; // Use desktop button
      
      await user.selectOptions(conferenceSelect, 'black_hat');
      await user.selectOptions(topicSelect, 'genai');
      
      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });
      
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/System temporarily unavailable. Please try again later/i)).toBeInTheDocument();
      });
    });

    it('should display error message for unknown errors', async () => {
      const user = userEvent.setup();
      const error = new Error('Network error');
      (jobsService.createJob as any).mockRejectedValueOnce(error);
      
      renderWithRouter();
      
      const conferenceSelect = screen.getByLabelText(/conference/i);
      const topicSelect = screen.getByLabelText(/topic/i);
      const submitButtons = screen.getAllByRole('button', { name: /run instrumented workflow/i });
      const submitButton = submitButtons[0]; // Use desktop button
      
      await user.selectOptions(conferenceSelect, 'black_hat');
      await user.selectOptions(topicSelect, 'genai');
      
      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });
      
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/Unexpected error. Please try again/i)).toBeInTheDocument();
      });
    });

    it('should have error container with role="alert" and aria-live="polite"', async () => {
      const user = userEvent.setup();
      const error = new Error('Error');
      (error as any).status = 400;
      (jobsService.createJob as any).mockRejectedValueOnce(error);
      
      renderWithRouter();
      
      const conferenceSelect = screen.getByLabelText(/conference/i);
      const topicSelect = screen.getByLabelText(/topic/i);
      const submitButtons = screen.getAllByRole('button', { name: /run instrumented workflow/i });
      const submitButton = submitButtons[0]; // Use desktop button
      
      await user.selectOptions(conferenceSelect, 'black_hat');
      await user.selectOptions(topicSelect, 'genai');
      
      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });
      
      await user.click(submitButton);
      
      await waitFor(() => {
        const errorContainer = screen.getByRole('alert');
        expect(errorContainer).toHaveAttribute('aria-live', 'polite');
      });
    });
  });

  describe('Button Labels and Tooltips', () => {
    it('should have desktop button with "Run Instrumented Workflow" label', () => {
      renderWithRouter();
      const desktopCta = screen.getByTestId('desktop-cta');
      const button = desktopCta.querySelector('button');
      expect(button).toHaveTextContent('Run Instrumented Workflow');
    });

    it('should have desktop button with title attribute', () => {
      renderWithRouter();
      const desktopCta = screen.getByTestId('desktop-cta');
      const button = desktopCta.querySelector('button');
      expect(button).toHaveAttribute('title', 'Run Instrumented Workflow');
    });

    it('should have desktop button with aria-label', () => {
      renderWithRouter();
      const desktopCta = screen.getByTestId('desktop-cta');
      const button = desktopCta.querySelector('button');
      expect(button).toHaveAttribute('aria-label', 'Run Instrumented Workflow');
    });

    it('should have mobile button with "Run" label', () => {
      renderWithRouter();
      const mobileCta = screen.getByTestId('mobile-sticky-cta');
      const button = mobileCta.querySelector('button');
      expect(button).toHaveTextContent('Run');
    });

    it('should have mobile button with title attribute', () => {
      renderWithRouter();
      const mobileCta = screen.getByTestId('mobile-sticky-cta');
      const button = mobileCta.querySelector('button');
      expect(button).toHaveAttribute('title', 'Run Instrumented Workflow');
    });
  });

  describe('Forbidden Words Regression Test', () => {
    it('should NOT contain forbidden words in visible text', () => {
      renderWithRouter();
      const container = document.body;
      const textContent = container.textContent || '';
      
      const forbiddenWords = ['assistant', 'writer', 'generator', 'production-ready'];
      const lowerText = textContent.toLowerCase();
      
      forbiddenWords.forEach(word => {
        expect(lowerText).not.toContain(word);
      });
    });

    it('should NOT contain "generate" in button labels', () => {
      renderWithRouter();
      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        const text = button.textContent?.toLowerCase() || '';
        expect(text).not.toContain('generate');
      });
    });
  });

  describe('Microcopy', () => {
    it('should display microcopy below button', () => {
      renderWithRouter();
      // Microcopy appears in both desktop and mobile sections
      const microcopy = screen.getAllByText(/You'll see the agent workflow unfold step by step/i);
      expect(microcopy.length).toBeGreaterThan(0);
    });
  });
});
