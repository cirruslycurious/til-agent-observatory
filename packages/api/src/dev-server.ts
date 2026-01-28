/**
 * Local Development Server
 * Sprint 7: Updated with mock responses for workflow testing
 * 
 * Simple Express server for local development.
 */

import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';

const app = express();
const PORT = process.env.PORT || 3001;

// In-memory store for mock mode
const mockJobs = new Map<string, any>();
const mockEvents = new Map<string, any[]>();

// Middleware
app.use(cors());
app.use(express.json());

// Simulate job progression
function progressJob(jobId: string) {
  const job = mockJobs.get(jobId);
  if (!job) return;
  
  const events = mockEvents.get(jobId) || [];
  const now = new Date().toISOString();
  
  // Simulate phase progression based on time since creation
  const createdTime = new Date(job.created_at).getTime();
  const elapsed = Date.now() - createdTime;
  const elapsedSeconds = elapsed / 1000;
  
  // Phase timing (seconds): goal_formulation (0-5), worker_execution (5-30), manager_review (30-45), final_evaluation (45-60), completed (60+)
  if (elapsedSeconds < 5) {
    job.current_phase = 'goal_formulation';
    job.current_phase_label = 'Goal Formulation';
    job.status = 'running';
    job.iteration = 0;
    
    // Add goal event
    if (events.length === 0) {
      events.push({
        event_id: randomUUID(),
        timestamp: now,
        iteration: 0,
        actor: 'manager',
        actor_label: 'Manager',
        event_type: 'goal_set',
        raw_event_type: 'manager_goal_formulated',
        summary: 'Research goal established for ' + job.conference,
      });
    }
  } else if (elapsedSeconds < 30) {
    job.current_phase = 'worker_execution';
    job.current_phase_label = 'Drafting & Research';
    job.status = 'running';
    job.iteration = Math.min(Math.floor((elapsedSeconds - 5) / 10), 2);
    
    // Add tool call events
    const toolEvents = ['web_search', 'conference_rules', 'abstract_search'];
    for (let i = 0; i < Math.min(elapsedSeconds - 5, toolEvents.length); i++) {
      const toolEventId = `tool_${i}_${jobId}`;
      if (!events.find(e => e.event_id === toolEventId)) {
        events.push({
          event_id: toolEventId,
          timestamp: new Date(createdTime + (6 + i) * 1000).toISOString(),
          iteration: 0,
          actor: 'worker',
          actor_label: 'Worker',
          event_type: 'tool_call',
          raw_event_type: 'tool_called',
          summary: `Called ${toolEvents[i]} (success)`,
          payload: {
            tool: {
              name: toolEvents[i],
              status: 'success',
              duration_ms: 500 + Math.random() * 500,
            },
          },
        });
      }
    }
  } else if (elapsedSeconds < 45) {
    job.current_phase = 'manager_review';
    job.current_phase_label = 'Manager Review';
    job.status = 'running';
    job.iteration = 1;
    
    // Add submission event
    const submitEventId = `submit_${jobId}`;
    if (!events.find(e => e.event_id === submitEventId)) {
      events.push({
        event_id: submitEventId,
        timestamp: new Date(createdTime + 30 * 1000).toISOString(),
        iteration: 0,
        actor: 'worker',
        actor_label: 'Worker',
        event_type: 'iteration_submitted',
        raw_event_type: 'abstract_submitted',
        summary: 'Submitted abstract for review',
      });
    }
  } else if (elapsedSeconds < 60) {
    job.current_phase = 'final_evaluation';
    job.current_phase_label = 'Final Evaluation';
    job.status = 'running';
    job.iteration = 1;
    
    // Add acceptance event
    const acceptEventId = `accept_${jobId}`;
    if (!events.find(e => e.event_id === acceptEventId)) {
      events.push({
        event_id: acceptEventId,
        timestamp: new Date(createdTime + 45 * 1000).toISOString(),
        iteration: 1,
        actor: 'manager',
        actor_label: 'Manager',
        event_type: 'manager_decision',
        raw_event_type: 'manager_accepted',
        summary: 'Abstract accepted',
        payload: {
          decision: {
            accepted: true,
            feedback_summary: 'Well-structured abstract with clear value proposition.',
          },
        },
      });
    }
  } else {
    job.current_phase = 'completed';
    job.current_phase_label = 'Completed';
    job.status = 'completed';
    job.is_terminal = true;
    job.completed_at = new Date(createdTime + 60 * 1000).toISOString();
    job.iteration = 1;
    job.final_title = 'Building Resilient AI Pipelines: A Zero-Trust Approach for ' + (job.conference === 'black_hat' ? 'Security Teams' : 'Cloud Engineers');
    job.final_abstract = 'This talk explores the intersection of AI/ML pipelines and zero-trust security principles. We present a novel framework for building resilient, observable AI systems that maintain security without sacrificing performance. Through real-world case studies, attendees will learn practical strategies for implementing secure AI workflows in production environments.';
    job.selected_iteration = 1;
    job.evaluator_prediction = job.conference;
    job.evaluator_confidence = 0.87;
    job.evaluator_agreement = true;
    
    // Add evaluator event
    const evalEventId = `eval_${jobId}`;
    if (!events.find(e => e.event_id === evalEventId)) {
      events.push({
        event_id: evalEventId,
        timestamp: new Date(createdTime + 55 * 1000).toISOString(),
        iteration: 1,
        actor: 'evaluator',
        actor_label: 'Evaluator',
        event_type: 'manager_decision',
        raw_event_type: 'evaluator_assessed',
        summary: `Evaluator predicted: ${job.conference}`,
        payload: {
          decision: {
            accepted: true,
            feedback_summary: 'High confidence match for target conference.',
          },
        },
      });
    }
  }
  
  // Update phase history
  job.phase_history = [
    {
      phase: 'goal_formulation',
      label: 'Goal Formulation',
      started_at: job.created_at,
      ended_at: elapsedSeconds >= 5 ? new Date(createdTime + 5 * 1000).toISOString() : undefined,
    },
  ];
  
  if (elapsedSeconds >= 5) {
    job.phase_history.push({
      phase: 'worker_execution',
      label: 'Drafting & Research',
      started_at: new Date(createdTime + 5 * 1000).toISOString(),
      ended_at: elapsedSeconds >= 30 ? new Date(createdTime + 30 * 1000).toISOString() : undefined,
    });
  }
  
  if (elapsedSeconds >= 30) {
    job.phase_history.push({
      phase: 'manager_review',
      label: 'Manager Review',
      started_at: new Date(createdTime + 30 * 1000).toISOString(),
      ended_at: elapsedSeconds >= 45 ? new Date(createdTime + 45 * 1000).toISOString() : undefined,
    });
  }
  
  if (elapsedSeconds >= 45) {
    job.phase_history.push({
      phase: 'final_evaluation',
      label: 'Final Evaluation',
      started_at: new Date(createdTime + 45 * 1000).toISOString(),
      ended_at: elapsedSeconds >= 60 ? new Date(createdTime + 60 * 1000).toISOString() : undefined,
    });
  }
  
  if (elapsedSeconds >= 60) {
    job.phase_history.push({
      phase: 'completed',
      label: 'Completed',
      started_at: new Date(createdTime + 60 * 1000).toISOString(),
    });
  }
  
  job.last_event_at = events.length > 0 ? events[events.length - 1].timestamp : now;
  
  mockJobs.set(jobId, job);
  mockEvents.set(jobId, events);
}

// Routes
app.post('/api/v1/jobs', async (req, res) => {
  try {
    const { conference, topic, user_session_id } = req.body;

    // Validate
    const validConferences = ['black_hat', 'reinvent', 'kubecon', 'gartner_symposium', 'google_cloud_next'];
    const validTopics = [
      'ai_ml_genai',
      'security_zero_trust',
      'cloud_arch_infra',
      'k8s_containers',
      'platform_devops',
      'networking_mesh',
      'data_analytics',
      'leadership_governance',
    ];

    if (!conference || !validConferences.includes(conference)) {
      return res.status(400).json({
        error: 'Invalid conference',
        valid_conferences: validConferences,
      });
    }

    if (!topic || !validTopics.includes(topic)) {
      return res.status(400).json({
        error: 'Invalid topic',
        valid_topics: validTopics,
      });
    }

    // Generate job
    const jobId = randomUUID();
    const jobReadToken = randomUUID() + randomUUID();
    const now = new Date().toISOString();

    // Store in mock store
    mockJobs.set(jobId, {
      job_id: jobId,
      job_read_token: jobReadToken,
      status: 'queued',
      created_at: now,
      conference,
      topic,
      user_session_id,
      current_phase: 'goal_formulation',
      current_phase_label: 'Goal Formulation',
      phase_started_at: now,
      iteration: 0,
      max_iterations: 5,
      last_event_at: null,
      phase_history: [],
      is_terminal: false,
    });
    
    mockEvents.set(jobId, []);

    // Return 202 Accepted (as per spec)
    res.status(202).json({
      job_id: jobId,
      job_read_token: jobReadToken,
      status: 'queued',
      estimated_time_seconds: 60,
    });
  } catch (error: any) {
    console.error('Error in POST /api/v1/jobs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sprint 7: Enhanced status with phase projection
app.get('/api/v1/jobs/:jobId/status', async (req, res) => {
  try {
    const { jobId } = req.params;
    const token = req.query.token as string;

    if (!token) {
      return res.status(400).json({ error: 'token query parameter is required' });
    }

    const job = mockJobs.get(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.job_read_token !== token) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    // Progress the job simulation
    progressJob(jobId);
    
    const updatedJob = mockJobs.get(jobId);

    res.json({
      status: updatedJob.status,
      created_at: updatedJob.created_at,
      completed_at: updatedJob.completed_at,
      conference: updatedJob.conference,
      topic: updatedJob.topic,
      current_phase: updatedJob.current_phase,
      current_phase_label: updatedJob.current_phase_label,
      phase_started_at: updatedJob.phase_started_at,
      iteration: updatedJob.iteration,
      max_iterations: updatedJob.max_iterations || 5,
      last_event_at: updatedJob.last_event_at,
      phase_history: updatedJob.phase_history || [],
      is_terminal: updatedJob.is_terminal || false,
      terminal_reason: updatedJob.terminal_reason,
      final_title: updatedJob.final_title,
      final_abstract: updatedJob.final_abstract,
      selected_iteration: updatedJob.selected_iteration,
      evaluator_prediction: updatedJob.evaluator_prediction,
      evaluator_confidence: updatedJob.evaluator_confidence,
      evaluator_agreement: updatedJob.evaluator_agreement,
    });
  } catch (error: any) {
    console.error('Error in GET /api/v1/jobs/:jobId/status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sprint 7: Events with normalization
app.get('/api/v1/workflow/:jobId/events', async (req, res) => {
  try {
    const { jobId } = req.params;
    const token = req.query.token as string;

    if (!token) {
      return res.status(400).json({ error: 'token query parameter is required' });
    }

    const job = mockJobs.get(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.job_read_token !== token) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    // Progress job to generate events
    progressJob(jobId);
    
    const events = mockEvents.get(jobId) || [];
    const lastEvent = events[events.length - 1];

    res.json({
      events,
      next_cursor: lastEvent ? `${lastEvent.timestamp}|${lastEvent.event_id}` : null,
      server_event_count: events.length,
      truncated: false,
    });
  } catch (error: any) {
    console.error('Error in GET /api/v1/workflow/:jobId/events:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sprint 7: Result endpoint
app.get('/api/v1/jobs/:jobId/result', async (req, res) => {
  try {
    const { jobId } = req.params;
    const token = req.query.token as string;

    if (!token) {
      return res.status(400).json({ error: 'token query parameter is required' });
    }

    const job = mockJobs.get(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.job_read_token !== token) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    // Progress job
    progressJob(jobId);
    const updatedJob = mockJobs.get(jobId);

    res.json({
      job_id: jobId,
      status: updatedJob.status,
      conference: updatedJob.conference,
      topic: updatedJob.topic,
      final_title: updatedJob.final_title || null,
      final_abstract: updatedJob.final_abstract || null,
      selected_iteration: updatedJob.selected_iteration || null,
      iterations: [
        {
          iteration: 0,
          title: 'Initial draft title',
          abstract: 'Initial draft abstract content...',
          manager_feedback: 'Good start, but needs more concrete examples.',
          accepted: false,
        },
        {
          iteration: 1,
          title: updatedJob.final_title || 'Revised title',
          abstract: updatedJob.final_abstract || 'Revised abstract...',
          manager_feedback: null,
          accepted: true,
        },
      ],
      evaluator: updatedJob.evaluator_prediction ? {
        predicted_conference: updatedJob.evaluator_prediction,
        confidence: updatedJob.evaluator_confidence || 0.85,
        matches_target: updatedJob.evaluator_agreement || false,
      } : null,
      summary: {
        total_iterations: 2,
        duration_seconds: 60,
        total_tool_calls: 5,
        estimated_cost_usd: '0.0234',
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/v1/jobs/:jobId/result:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sprint 7: Feedback endpoint
app.post('/api/v1/jobs/:jobId/feedback', async (req, res) => {
  try {
    const { jobId } = req.params;
    const token = req.query.token as string;
    const { rating, comment } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'token query parameter is required' });
    }

    const job = mockJobs.get(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.job_read_token !== token) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    if (rating !== 1 && rating !== -1) {
      return res.status(400).json({ error: 'rating must be 1 or -1' });
    }

    const feedbackId = `fb_${randomUUID()}`;
    
    res.status(201).json({
      feedback_id: feedbackId,
      message: 'Thank you for your feedback!',
    });
  } catch (error: any) {
    console.error('Error in POST /api/v1/jobs/:jobId/feedback:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    mode: 'mock',
    jobs: mockJobs.size,
  });
});

app.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
  console.log(`📝 Mode: MOCK (Sprint 7 simulation)`);
  console.log(`📝 Endpoints:`);
  console.log(`   POST /api/v1/jobs`);
  console.log(`   GET  /api/v1/jobs/:jobId/status`);
  console.log(`   GET  /api/v1/workflow/:jobId/events`);
  console.log(`   GET  /api/v1/jobs/:jobId/result`);
  console.log(`   POST /api/v1/jobs/:jobId/feedback`);
  console.log(`   GET  /health`);
  console.log(``);
  console.log(`💡 Job simulation: Jobs progress through phases in ~60 seconds`);
});
