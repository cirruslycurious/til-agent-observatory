/**
 * Jobs API Service
 * Story 1.1: Landing Page & Conference Selection
 * 
 * Handles job creation API calls.
 * Note: File named jobs.ts (not generate.ts) to avoid "generator" positioning leak.
 */

import { apiClient } from './client';
import { getOrCreateSessionId } from '../../utils/tokenStorage';

export type Conference = "black_hat" | "reinvent" | "kubecon" | "gartner_symposium" | "google_cloud_next";
export type Topic =
  | "ai_ml_genai"
  | "security_zero_trust"
  | "cloud_arch_infra"
  | "k8s_containers"
  | "platform_devops"
  | "networking_mesh"
  | "data_analytics"
  | "leadership_governance";

export type CreateJobRequest = {
  conference: Conference;
  topic: Topic;
  user_session_id?: string;
};

export type CreateJobResponse = {
  job_id: string;
  job_read_token: string;
  status: "queued" | string;
  estimated_time_seconds: number;
};

export type JobListItem = {
  job_id: string;
  status: string;
  created_at: string;
  completed_at?: string;
  conference?: string;
  topic?: string;
  final_title?: string;
  error_code?: string;
};

export type ListJobsResponse = {
  jobs: JobListItem[];
  count: number;
};

export class JobsService {
  async createJob(payload: CreateJobRequest): Promise<CreateJobResponse> {
    // Always include user_session_id for observability correlation
    const requestPayload: CreateJobRequest = {
      ...payload,
      user_session_id: payload.user_session_id || getOrCreateSessionId(),
    };

    // apiClient treats 202 as success (not error)
    return apiClient.post<CreateJobResponse>("/api/v1/jobs", requestPayload);
  }

  async listJobs(limit?: number): Promise<ListJobsResponse> {
    const params = limit ? { limit: limit.toString() } : undefined;
    return apiClient.get<ListJobsResponse>("/api/v1/jobs", params);
  }
}

export const jobsService = new JobsService();
