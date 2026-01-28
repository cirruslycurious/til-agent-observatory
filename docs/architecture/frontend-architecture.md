# TIL — Agent Workflow Observatory Frontend Architecture Document

**Product Name:** TIL (Agent Workflow Observatory)  
**Version:** 1.0  
**Date:** January 13, 2026  
**Author:** Architecture Team  
**Status:** Draft

---

## Introduction

This document defines the frontend architecture for TIL (Agent Workflow Observatory), an instrumentation harness for observing agentic AI workflows end-to-end. The system uses abstract creation as a demonstration use case to showcase agentic AI decision-making, tool calls, and workflow orchestration. This document details component structure, state management, API integration, routing, styling, and implementation patterns. This document MUST be used in conjunction with the main Architecture Document (`docs/architecture.md`), which defines the core technology stack choices that are definitive for the entire project.

**Relationship to Main Architecture:**
The main architecture document specifies the frontend technology stack (React 18.2.0, Vite 5.0.0, Zustand 4.4.0, Recharts 2.10.0, Tailwind CSS 3.4.0, TypeScript 5.3.3). This document provides detailed implementation patterns, component architecture, and frontend-specific design decisions.

### Starter Template or Existing Project

**Decision:** Greenfield project, no starter template.

This is a new project built from scratch. Manual setup will be required for all tooling and configuration.

### Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-01-13 | 1.0 | Initial frontend architecture document | Architecture Team |
| 2026-01-13 | 1.1 | Fixed WebSocket auth pattern, added token persistence, WS+polling coordination, event deduplication, logger utility, API client improvements, routing flow, lazy loading, WebSocket types, UI state model | Architecture Team |
| 2026-01-13 | 1.2 | Added Mobile & Small-Screen Considerations section (responsive layout, mobile UX defaults, network reliability, performance budget, browser compatibility) | Architecture Team |
| 2026-01-13 | 1.3 | Added Frontend Observability & Diagnostics section (error tracking, structured logging, network instrumentation, web vitals, correlation IDs, debug mode) and SEO Considerations section (social sharing, robots.txt, sitemap, canonical tags, indexing policy) | Architecture Team |

---

## Frontend Tech Stack

**Note:** This section MUST remain synchronized with the main architecture document's Technology Stack Table.

### Technology Stack Table

| Category | Technology | Version | Purpose | Rationale |
|----------|-----------|---------|---------|-----------|
| **Language** | TypeScript | 5.3.3 | Frontend type safety | Strong typing, excellent tooling, catches errors at compile time |
| **Framework** | React | 18.2.0 | UI framework | Industry standard, large ecosystem, excellent for complex dashboards |
| **Build Tool** | Vite | 5.0.0 | Frontend build tool | Faster dev server, simpler than Next.js for SPA, excellent HMR |
| **State Management** | Zustand | 4.4.0 | Frontend state | Lightweight, simple API, no boilerplate, perfect for SPA |
| **Charting Library** | Recharts | 2.10.0 | Dashboard visualizations | React-native, composable, better for complex dashboards than Chart.js |
| **Styling** | Tailwind CSS | 3.4.0 | CSS framework | Utility-first, fast development, consistent design system |
| **Routing** | React Router | 6.22.0 | Client-side routing | Industry standard, excellent TypeScript support, simple API |
| **HTTP Client** | Fetch API (native) | Native | API requests | Built-in, no dependencies, modern async/await support |
| **WebSocket Client** | Native WebSocket API | Native | Real-time updates | Built-in, no dependencies, simple connection management |
| **Form Handling** | React Hook Form | 7.50.0 | Form validation | Minimal re-renders, excellent performance, TypeScript support |
| **Form Validation** | Zod | 3.22.0 | Schema validation | Used with React Hook Form resolver for type-safe validation |
| **Testing** | Vitest | 1.2.0 | Unit testing | Fast, Vite-native, Jest-compatible API |
| **Testing** | React Testing Library | 14.1.0 | Component testing | Encourages best practices, accessible queries |
| **Testing** | Playwright | 1.42.0 | E2E testing | Modern, fast, excellent debugging, cross-browser |
| **Linting** | ESLint | 8.57.0 | Code quality | Industry standard, extensive plugin ecosystem |
| **Formatting** | Prettier | 3.2.0 | Code formatting | Consistent code style, integrates with ESLint |
| **Type Checking** | TypeScript | 5.3.3 | Static analysis | Catches errors at compile time, excellent IDE support |

---

## Project Structure

```
packages/frontend/
├── public/
│   ├── index.html
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── ui/                    # Base UI components (buttons, inputs, etc.)
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Tabs.tsx
│   │   │   └── index.ts
│   │   ├── layout/                # Layout components
│   │   │   ├── Header.tsx
│   │   │   ├── Navigation.tsx
│   │   │   ├── Container.tsx
│   │   │   └── index.ts
│   │   ├── workflow/              # Workflow visualization components
│   │   │   ├── Timeline.tsx
│   │   │   ├── EventCard.tsx
│   │   │   ├── ArtifactCard.tsx
│   │   │   ├── SimpleView.tsx
│   │   │   ├── DeepView.tsx
│   │   │   └── index.ts
│   │   ├── dashboard/             # Dashboard components
│   │   │   ├── ExecutiveOverview.tsx
│   │   │   ├── AcceptanceRateChart.tsx
│   │   │   ├── ToolUsageHeatmap.tsx
│   │   │   ├── VendorComparison.tsx
│   │   │   ├── SubWorkerChart.tsx
│   │   │   └── index.ts
│   │   └── shared/                # Shared components
│   │       ├── LoadingSpinner.tsx
│   │       ├── ErrorMessage.tsx
│   │       ├── ProgressBar.tsx
│   │       └── index.ts
│   ├── pages/
│   │   ├── LandingPage.tsx
│   │   ├── GenerationPage.tsx
│   │   ├── DashboardPage.tsx
│   │   └── NotFoundPage.tsx
│   ├── stores/                    # Zustand stores
│   │   ├── jobStore.ts
│   │   ├── dashboardStore.ts
│   │   ├── uiStore.ts
│   │   └── index.ts
│   ├── services/                  # API and WebSocket services
│   │   ├── api/
│   │   │   ├── client.ts          # HTTP client configuration
│   │   │   ├── generate.ts        # Generate API
│   │   │   ├── status.ts          # Status API
│   │   │   ├── feedback.ts        # Feedback API
│   │   │   ├── dashboard.ts       # Dashboard API
│   │   │   └── workflow.ts        # Workflow API
│   │   ├── websocket/
│   │   │   ├── client.ts          # WebSocket client
│   │   │   ├── hooks.ts          # WebSocket React hooks
│   │   │   └── types.ts          # WebSocket message types
│   │   └── types.ts               # Shared TypeScript types
│   ├── hooks/                     # Custom React hooks
│   │   ├── useJobStatus.ts
│   │   ├── useWebSocket.ts
│   │   ├── usePolling.ts
│   │   └── index.ts
│   ├── utils/                     # Utility functions
│   │   ├── format.ts             # Formatting utilities
│   │   ├── validation.ts         # Validation utilities
│   │   ├── date.ts               # Date utilities
│   │   ├── logger.ts             # Logger utility (no console.log in prod)
│   │   ├── tokenStorage.ts       # Token persistence (sessionStorage)
│   │   └── index.ts
│   ├── styles/
│   │   ├── globals.css           # Global styles, Tailwind imports
│   │   └── theme.css             # CSS custom properties (theme variables)
│   ├── App.tsx                    # Root component
│   ├── main.tsx                   # Entry point
│   └── vite-env.d.ts             # Vite type definitions
├── tests/
│   ├── unit/
│   │   ├── components/
│   │   ├── stores/
│   │   └── utils/
│   ├── integration/
│   │   └── api/
│   └── e2e/
│       └── workflows.spec.ts
├── .eslintrc.cjs
├── .prettierrc
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
└── tailwind.config.js
```

---

## Component Standards

### Component Architecture

**Pattern:** Functional Components with Hooks

All components use React functional components with hooks. No class components.

**Component Organization:**
- **Atomic Design Principles:** Components organized by complexity (ui → layout → feature)
- **Co-location:** Component files co-located with their tests when possible
- **Barrel Exports:** Each component directory has an `index.ts` for clean imports

### Component Template

```typescript
import { FC } from 'react';
import { ComponentProps } from './types';

/**
 * ComponentName - Brief description of component purpose
 * 
 * @param props - Component props
 * @returns JSX element
 */
export const ComponentName: FC<ComponentProps> = ({
  prop1,
  prop2,
  ...rest
}) => {
  // Hooks
  const [state, setState] = useState<StateType>(initialState);
  
  // Event handlers
  const handleClick = () => {
    // Handler logic
  };
  
  // Render
  return (
    <div className="component-base-class" {...rest}>
      {/* Component content */}
    </div>
  );
};

ComponentName.displayName = 'ComponentName';
```

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| **Components** | PascalCase | `Timeline.tsx`, `EventCard.tsx` |
| **Files** | PascalCase for components, camelCase for utilities | `Timeline.tsx`, `formatDate.ts` |
| **Directories** | camelCase (components) or kebab-case (utilities) | `workflow/`, `dashboard/`, `api-client/` |
| **Hooks** | camelCase with `use` prefix | `useJobStatus.ts`, `useWebSocket.ts` |
| **Stores** | camelCase with `Store` suffix | `jobStore.ts`, `dashboardStore.ts` |
| **Services** | camelCase | `apiClient.ts`, `websocketClient.ts` |
| **Types/Interfaces** | PascalCase | `JobStatus`, `EventType` |
| **Constants** | UPPER_SNAKE_CASE | `MAX_RETRIES`, `API_BASE_URL` |
| **CSS Classes** | Tailwind utility classes | `bg-obsidian`, `text-primary` |

### Component Props Pattern

```typescript
// types.ts
export interface ComponentProps {
  /** Required prop description */
  requiredProp: string;
  /** Optional prop description */
  optionalProp?: number;
  /** Event handler */
  onClick?: (event: MouseEvent) => void;
  /** Children */
  children?: React.ReactNode;
  /** Additional HTML attributes */
  className?: string;
}

// Component.tsx
export const Component: FC<ComponentProps> = ({
  requiredProp,
  optionalProp = defaultValue,
  onClick,
  children,
  className,
  ...rest
}) => {
  // Component implementation
};
```

---

## State Management

### Store Structure

```
src/stores/
├── jobStore.ts          # Job state (current job, status, workflow events)
├── dashboardStore.ts    # Dashboard data (metrics, filters)
├── uiStore.ts           # UI state (theme, modals, notifications)
└── index.ts            # Barrel export
```

### Token Persistence

**Storage Strategy:**
- **Storage:** `sessionStorage` (not `localStorage`) to reduce "sticky token" risk
- **Key Format:** `cab:job_token:<jobId>` (e.g., `cab:job_token:550e8400-e29b-41d4-a716-446655440000`)
- **Lifetime:** Session-scoped (cleared on browser tab close)

**Token Lifecycle:**
1. **On `/generate` response:** Store token in `sessionStorage` with job_id key
2. **On app load:** If route is `/generate/:jobId`, hydrate store from `sessionStorage`
3. **On token missing:** Show recovery UI ("Paste token" input) or redirect to landing
4. **On job completion:** Token remains in sessionStorage for 7 days (matches backend TTL)

**Implementation:**
```typescript
// utils/tokenStorage.ts
const TOKEN_PREFIX = 'cab:job_token:';

export const tokenStorage = {
  save(jobId: string, token: string): void {
    sessionStorage.setItem(`${TOKEN_PREFIX}${jobId}`, token);
  },
  
  get(jobId: string): string | null {
    return sessionStorage.getItem(`${TOKEN_PREFIX}${jobId}`);
  },
  
  remove(jobId: string): void {
    sessionStorage.removeItem(`${TOKEN_PREFIX}${jobId}`);
  },
  
  clear(): void {
    // Clear all tokens (on logout or session end)
    Object.keys(sessionStorage)
      .filter(key => key.startsWith(TOKEN_PREFIX))
      .forEach(key => sessionStorage.removeItem(key));
  },
};
```

**Usage in Components:**
```typescript
// pages/GenerationPage.tsx - Hydrate token on mount
import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useJobStore } from '@/stores/jobStore';
import { tokenStorage } from '@/utils/tokenStorage';

export const GenerationPage = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { setCurrentJob, jobReadToken } = useJobStore();

  useEffect(() => {
    if (!jobId) {
      navigate('/');
      return;
    }

    // Try to get token from store first
    let token = jobReadToken;
    
    // If not in store, try sessionStorage
    if (!token) {
      token = tokenStorage.get(jobId);
      if (token) {
        setCurrentJob(jobId, token);
      }
    }

    // If still no token, show recovery UI
    if (!token) {
      // Show recovery UI component (allows user to paste token)
      // Or redirect to landing page
    }
  }, [jobId, jobReadToken, setCurrentJob, navigate]);

  // Rest of component...
};
```

### State Management Template (Zustand)

```typescript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { DecisionEvent, JobStatus } from '@/services/types';
import { tokenStorage } from '@/utils/tokenStorage';

interface JobState {
  // State
  currentJobId: string | null;
  jobReadToken: string | null;
  jobStatus: JobStatus | null;
  workflowEvents: DecisionEvent[];
  eventIndex: Record<string, true>; // Deduplication index (event_id -> true)
  isLoading: boolean;
  error: string | null;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'degraded' | 'polling-only';
  
  // Actions
  setCurrentJob: (jobId: string, token: string) => void;
  updateJobStatus: (status: JobStatus) => void;
  addWorkflowEvent: (event: DecisionEvent) => void;
  clearJob: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setConnectionState: (state: JobState['connectionState']) => void;
}

// Helper to sort events by sort key (timestamp#event_type#seq)
const sortEvents = (events: DecisionEvent[]): DecisionEvent[] => {
  return [...events].sort((a, b) => {
    // Sort key format: timestamp#event_type#seq
    const keyA = `${a.timestamp}#${a.event_type}#${a.seq || '000'}`;
    const keyB = `${b.timestamp}#${b.event_type}#${b.seq || '000'}`;
    return keyA.localeCompare(keyB);
  });
};

export const useJobStore = create<JobState>()(
  devtools(
    (set, get) => ({
      // Initial state
      currentJobId: null,
      jobReadToken: null,
      jobStatus: null,
      workflowEvents: [],
      eventIndex: {},
      isLoading: false,
      error: null,
      connectionState: 'disconnected',
      
      // Actions
      setCurrentJob: (jobId, token) => {
        set({ currentJobId: jobId, jobReadToken: token });
        // Save token to sessionStorage
        tokenStorage.save(jobId, token);
      },
      
      updateJobStatus: (status) => set({ jobStatus: status }),
      
      addWorkflowEvent: (event) => {
        const state = get();
        const eventId = event.event_id || `${event.timestamp}#${event.event_type}#${event.seq || '000'}`;
        
        // Deduplicate by event_id
        if (state.eventIndex[eventId]) {
          return; // Event already processed
        }
        
        // Add to index and events (sorted)
        const newEvents = [...state.workflowEvents, event];
        set({
          workflowEvents: sortEvents(newEvents),
          eventIndex: { ...state.eventIndex, [eventId]: true },
        });
      },
      
      clearJob: () =>
        set({
          currentJobId: null,
          jobReadToken: null,
          jobStatus: null,
          workflowEvents: [],
          eventIndex: {},
          error: null,
          connectionState: 'disconnected',
        }),
      
      setLoading: (loading) => set({ isLoading: loading }),
      
      setError: (error) => set({ error }),
      
      setConnectionState: (state) => set({ connectionState: state }),
    }),
    { name: 'JobStore' }
  )
);
```

### State Management Patterns

**Store Organization:**
- **Domain-based stores:** One store per domain (job, dashboard, UI)
- **Selective subscriptions:** Use Zustand selectors to prevent unnecessary re-renders
- **Derived state:** Compute derived values in selectors, not in components

**Example Selector Usage:**
```typescript
// In component
const jobStatus = useJobStore((state) => state.jobStatus);
const isLoading = useJobStore((state) => state.isLoading);

// Or combine selectors
const { jobStatus, isLoading } = useJobStore((state) => ({
  jobStatus: state.jobStatus,
  isLoading: state.isLoading,
}));
```

---

## API Integration

### Logger Utility

```typescript
// utils/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private isDev = import.meta.env.DEV;

  debug(...args: unknown[]): void {
    if (this.isDev) {
      console.debug('[DEBUG]', ...args);
    }
  }

  info(...args: unknown[]): void {
    if (this.isDev) {
      console.info('[INFO]', ...args);
    }
  }

  warn(...args: unknown[]): void {
    console.warn('[WARN]', ...args);
    // Optionally route to toast system
  }

  error(...args: unknown[]): void {
    console.error('[ERROR]', ...args);
    // Optionally route to error tracking service
  }
}

export const logger = new Logger();
```

### API Client Configuration

```typescript
// services/api/client.ts
import { logger } from '@/utils/logger';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.example.com/api/v1';

interface ApiError {
  message: string;
  code?: string;
  status?: number;
}

class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T | null> {
    const url = `${this.baseURL}${endpoint}`;
    
    const config: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);
      
      // Handle 204 No Content
      if (response.status === 204) {
        return null as T;
      }
      
      if (!response.ok) {
        // Attempt to parse error as JSON, fallback to text
        let error: ApiError;
        const contentType = response.headers.get('content-type');
        
        if (contentType?.includes('application/json')) {
          try {
            error = await response.json();
          } catch {
            error = {
              message: `HTTP ${response.status}: ${response.statusText}`,
              status: response.status,
            };
          }
        } else {
          const text = await response.text().catch(() => '');
          error = {
            message: text || `HTTP ${response.status}: ${response.statusText}`,
            status: response.status,
          };
        }
        throw error;
      }

      // Handle 202 Accepted (may have JSON body)
      if (response.status === 202) {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          return await response.json();
        }
        return null as T;
      }

      // Parse JSON only if Content-Type indicates JSON
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      }
      
      // Non-JSON response
      logger.warn('Non-JSON response received:', contentType);
      return null as T;
    } catch (error) {
      if (error instanceof TypeError) {
        // Network error
        throw { message: 'Network error. Please check your connection.' };
      }
      throw error;
    }
  }

  async get<T>(endpoint: string, token?: string): Promise<T> {
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return this.request<T>(endpoint, { method: 'GET', headers });
  }

  async post<T>(endpoint: string, data: unknown, token?: string): Promise<T> {
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return this.request<T>(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
```

### Service Template

```typescript
// services/api/generate.ts
import { apiClient } from './client';
import type { GenerateRequest, GenerateResponse } from '../types';

export const generateService = {
  /**
   * Initiate abstract generation
   * @param request - Generation request (conference, topic)
   * @returns Generation response with job_id and token
   */
  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    return apiClient.post<GenerateResponse>('/generate', request);
  },
};
```

### WebSocket Message Types

```typescript
// services/websocket/types.ts

// Discriminated union for WebSocket messages
export type WebSocketMessage =
  | ProgressMessage
  | DecisionEventMessage
  | ArtifactCreatedMessage
  | CompletedMessage
  | FailedMessage
  | GuardrailTriggeredMessage
  | AuthSuccessMessage
  | AuthFailedMessage;

interface BaseMessage {
  type: string;
  job_id: string;
  timestamp: string;
}

export interface ProgressMessage extends BaseMessage {
  type: 'progress';
  stage: string;
  message: string;
  stage_index: number;
  stage_total: number;
}

export interface DecisionEventMessage extends BaseMessage {
  type: 'decision_event';
  event_type: string;
  actor: string;
  summary: string;
  details: Record<string, unknown>;
  seq?: string;
  event_id?: string;
}

export interface ArtifactCreatedMessage extends BaseMessage {
  type: 'artifact_created';
  artifact_id: string;
  artifact_type: string;
  task_id: string;
}

export interface CompletedMessage extends BaseMessage {
  type: 'completed';
  result: {
    job_id: string;
    status: 'completed';
    abstract: {
      title: string;
      content: string;
    };
    iteration_selected: number;
    vendor_assignment: {
      manager_vendor: string;
      worker_vendor: string;
    };
  };
}

export interface FailedMessage extends BaseMessage {
  type: 'failed';
  error: string;
  error_code?: string;
}

export interface GuardrailTriggeredMessage extends BaseMessage {
  type: 'guardrail_triggered';
  guardrail_type: string;
  message: string;
  action_taken: string;
}

export interface AuthSuccessMessage extends BaseMessage {
  type: 'auth_success';
}

export interface AuthFailedMessage extends BaseMessage {
  type: 'auth_failed';
  error: string;
}

// Auth request message (client → server)
export interface AuthRequestMessage {
  type: 'auth';
  job_id: string;
  token: string;
}
```

### WebSocket Client

```typescript
// services/websocket/client.ts
import type { WebSocketMessage } from './types';

type ConnectionState = 'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'degraded' | 'polling-only';

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map();
  private state: ConnectionState = 'disconnected';
  private authTimeout: number | null = null;

  constructor(url: string) {
    this.url = url;
  }

  getState(): ConnectionState {
    return this.state;
  }

  connect(jobId: string, token: string): void {
    // Connect with job_id only (token not in URL to prevent log leakage)
    const wsUrl = `${this.url}?job_id=${jobId}`;
    this.ws = new WebSocket(wsUrl);
    this.state = 'connecting';

    this.ws.onopen = () => {
      this.state = 'authenticating';
      // Send auth message frame immediately after connection
      this.ws!.send(JSON.stringify({
        type: 'auth',
        job_id: jobId,
        token: token,
      }));
      
      // Set timeout for auth response (3 seconds)
      this.authTimeout = window.setTimeout(() => {
        if (this.state === 'authenticating') {
          this.ws?.close();
          this.state = 'polling-only';
          this.notifyListeners('auth_timeout', {});
        }
      }, 3000);
    };

    this.ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        
        // Handle auth response
        if (message.type === 'auth_success') {
          if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
          }
          this.state = 'connected';
          this.reconnectAttempts = 0;
          this.notifyListeners('connected', {});
          return;
        }
        
        if (message.type === 'auth_failed') {
          if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
          }
          this.ws?.close();
          this.state = 'polling-only';
          this.notifyListeners('auth_failed', message);
          return;
        }
        
        // Only process messages if authenticated
        if (this.state === 'connected') {
          this.notifyListeners(message.type, message);
        }
      } catch (error) {
        logger.error('Failed to parse WebSocket message:', error);
      }
    };

    this.ws.onerror = (error) => {
      logger.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      if (this.authTimeout) {
        clearTimeout(this.authTimeout);
        this.authTimeout = null;
      }
      
      if (this.state === 'connected' || this.state === 'authenticating') {
        this.state = 'degraded';
        this.attemptReconnect(jobId, token);
      }
    };
  }

  private attemptReconnect(jobId: string, token: string): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        this.connect(jobId, token);
      }, 1000 * this.reconnectAttempts); // Exponential backoff
    }
  }

  on<T>(eventType: string, callback: (data: T) => void): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback as (data: unknown) => void);

    // Return unsubscribe function
    return () => {
      this.listeners.get(eventType)?.delete(callback as (data: unknown) => void);
    };
  }

  private notifyListeners(eventType: string, data: unknown): void {
    this.listeners.get(eventType)?.forEach((callback) => callback(data));
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.listeners.clear();
  }
}

export const wsClient = new WebSocketClient(
  import.meta.env.VITE_WS_URL || 'wss://api.example.com/ws'
);
```

### WebSocket + Polling Coordination

**State Machine:**
- **disconnected:** Initial state, no connection
- **connecting:** WebSocket connection in progress
- **authenticating:** WebSocket connected, auth message sent, waiting for response
- **connected:** WebSocket authenticated, receiving events
- **degraded:** WebSocket disconnected, attempting reconnection, polling active
- **polling-only:** WebSocket failed or unavailable, using polling only

**Coordination Rules:**
1. **Start WebSocket immediately** when job is created
2. **Start polling only if:**
   - WebSocket isn't connected within 3 seconds (auth timeout)
   - WebSocket disconnects and reconnect attempts are in flight
   - Network is known to block WebSocket (detected via connection failures)
3. **Stop polling** the moment WebSocket receives events again (state → connected)
4. **Status heartbeat:** Low-frequency polling every 15-30s even with WebSocket connected (detects silent failures)

### WebSocket React Hook

```typescript
// hooks/useWebSocket.ts
import { useEffect, useRef } from 'react';
import { wsClient } from '../services/websocket/client';
import { useJobStore } from '../stores/jobStore';
import { usePolling } from './usePolling';

const WS_CONNECTION_TIMEOUT = 3000; // 3 seconds
const HEARTBEAT_INTERVAL = 20000; // 20 seconds

export const useWebSocket = () => {
  const {
    currentJobId,
    jobReadToken,
    addWorkflowEvent,
    updateJobStatus,
    connectionState,
    setConnectionState,
  } = useJobStore();
  
  const unsubscribeRef = useRef<(() => void)[]>([]);
  const wsTimeoutRef = useRef<number | null>(null);
  
  // Polling hook (only active when needed)
  const { startPolling, stopPolling, startHeartbeat, stopHeartbeat } = usePolling();

  useEffect(() => {
    if (!currentJobId || !jobReadToken) {
      return;
    }

    // Set timeout: if WS not connected within 3s, start polling
    wsTimeoutRef.current = window.setTimeout(() => {
      if (wsClient.getState() !== 'connected') {
        setConnectionState('polling-only');
        startPolling(currentJobId, jobReadToken);
      }
    }, WS_CONNECTION_TIMEOUT);

    // Connect WebSocket
    setConnectionState('connecting');
    wsClient.connect(currentJobId, jobReadToken);

    // Subscribe to connection state changes
    const unsubConnected = wsClient.on('connected', () => {
      if (wsTimeoutRef.current) {
        clearTimeout(wsTimeoutRef.current);
        wsTimeoutRef.current = null;
      }
      setConnectionState('connected');
      stopPolling(); // Stop polling when WS connects
      
      // Start heartbeat polling (low frequency)
      startHeartbeat(currentJobId, jobReadToken);
    });

    const unsubAuthFailed = wsClient.on('auth_failed', () => {
      setConnectionState('polling-only');
      startPolling(currentJobId, jobReadToken);
    });

    const unsubAuthTimeout = wsClient.on('auth_timeout', () => {
      setConnectionState('polling-only');
      startPolling(currentJobId, jobReadToken);
    });

    // Subscribe to job events
    const unsubProgress = wsClient.on('progress', (data) => {
      // Handle progress updates
    });

    const unsubDecisionEvent = wsClient.on('decision_event', (data) => {
      addWorkflowEvent(data);
    });

    const unsubCompleted = wsClient.on('completed', (data) => {
      updateJobStatus('completed');
      stopPolling();
      stopHeartbeat();
    });

    const unsubFailed = wsClient.on('failed', (data) => {
      updateJobStatus('failed');
      stopPolling();
      stopHeartbeat();
    });

    unsubscribeRef.current = [
      unsubConnected,
      unsubAuthFailed,
      unsubAuthTimeout,
      unsubProgress,
      unsubDecisionEvent,
      unsubCompleted,
      unsubFailed,
    ];

    // Cleanup
    return () => {
      unsubscribeRef.current.forEach((unsub) => unsub());
      if (wsTimeoutRef.current) {
        clearTimeout(wsTimeoutRef.current);
      }
      stopPolling();
      stopHeartbeat();
      wsClient.disconnect();
    };
  }, [currentJobId, jobReadToken, addWorkflowEvent, updateJobStatus, setConnectionState, startPolling, stopPolling, startHeartbeat, stopHeartbeat]);
};
```

### Polling Hook Implementation

```typescript
// hooks/usePolling.ts
import { useEffect, useRef } from 'react';
import { useJobStore } from '../stores/jobStore';
import { statusService } from '../services/api/status';
import { logger } from '../utils/logger';

const POLL_INTERVAL = 2000; // 2 seconds when polling-only
const HEARTBEAT_INTERVAL = 20000; // 20 seconds for heartbeat

export const usePolling = () => {
  const { currentJobId, jobReadToken, updateJobStatus, addWorkflowEvent } = useJobStore();
  const intervalRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);

  const startPolling = (jobId: string, token: string) => {
    if (intervalRef.current) {
      return; // Already polling
    }

    const poll = async () => {
      try {
        const status = await statusService.getStatus(jobId, token);
        updateJobStatus(status.status);
        
        // Add any new events from status response
        if (status.workflow_events) {
          status.workflow_events.forEach((event) => {
            addWorkflowEvent(event);
          });
        }
        
        // Stop polling if job is complete
        if (status.status === 'completed' || status.status === 'failed') {
          stopPolling();
        }
      } catch (error) {
        logger.error('Polling error:', error);
      }
    };

    poll(); // Immediate poll
    intervalRef.current = window.setInterval(poll, POLL_INTERVAL);
  };

  const startHeartbeat = (jobId: string, token: string) => {
    if (heartbeatRef.current) {
      return; // Already heartbeating
    }

    const heartbeat = async () => {
      try {
        const status = await statusService.getStatus(jobId, token);
        updateJobStatus(status.status);
        // Silent check - no error logging for heartbeat failures
      } catch (error) {
        // Silent failure for heartbeat
      }
    };

    heartbeatRef.current = window.setInterval(heartbeat, HEARTBEAT_INTERVAL);
  };

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const stopHeartbeat = () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopPolling();
      stopHeartbeat();
    };
  }, []);

  return { startPolling, stopPolling, startHeartbeat, stopHeartbeat };
};
```

---

## Routing

### Route Configuration

```typescript
// App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { GenerationPage } from './pages/GenerationPage';
import { DashboardPage } from './pages/DashboardPage';
import { NotFoundPage } from './pages/NotFoundPage';

export const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/generate/:jobId" element={<GenerationPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/dashboard/:metricType" element={<DashboardPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
};
```

### Route Definitions

| Path | Component | Description |
|------|-----------|-------------|
| `/` | `LandingPage` | Landing page with conference/topic selection |
| `/generate/:jobId` | `GenerationPage` | Generation workflow visualization (Simple/Deep views, Results). Token required (from sessionStorage or recovery UI). Mobile: defaults to Simple View |
| `/dashboard` | `DashboardPage` | Dashboard landing (Executive Overview) |
| `/dashboard/:metricType` | `DashboardPage` | Specific dashboard metric view (tool-usage, vendors, etc.) |
| `*` | `NotFoundPage` | 404 page |

**Route Protection:**
- No authentication required (public demo MVP)
- All routes are public
- Job-specific data protected by `job_read_token` in API calls

**Route Guard Behavior:**
- If `jobId` in URL but no token in memory/sessionStorage → Show recovery UI ("Paste token" input)
- Recovery UI allows user to paste token manually or redirect to landing page
- Token validation happens on first API call (not on route load)

---

## Styling Guidelines

### Styling Approach

**Primary:** Tailwind CSS utility classes  
**Rationale:** Utility-first approach, fast development, consistent design system, excellent for dark theme

**Global Styles:** CSS custom properties (CSS variables) for theme values  
**Rationale:** Enables theme switching, consistent with UX spec color tokens

### Global Theme Variables

```css
/* styles/theme.css */
:root {
  /* Base Colors (from UX spec) */
  --color-bg-primary: #0B0E11;      /* obsidian */
  --color-bg-surface-1: #141821;    /* graphite */
  --color-bg-surface-2: #1B2030;    /* elevated */
  --color-border: #252C3A;
  
  /* Text Colors */
  --color-text-primary: #E6E8EB;
  --color-text-secondary: #9AA3B2;
  --color-text-muted: #6B7380;
  
  /* Accent */
  --color-accent: #4FA3FF;
  
  /* Semantic Colors */
  --color-success: #3FA37C;         /* Accepted / Success */
  --color-error: #E05D5D;           /* Rejected / Failure */
  --color-info: #4B5563;            /* Neutral Info */
  --color-warning: #B9A06A;         /* Guardrail ONLY */
  
  /* Typography */
  --font-ui: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  
  /* Spacing */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;
  --spacing-2xl: 3rem;
}

/* Dark theme (default) */
body {
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-family: var(--font-ui);
}
```

### Tailwind Configuration

```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: '#0B0E11',
        graphite: '#141821',
        elevated: '#1B2030',
        border: '#252C3A',
        primary: '#E6E8EB',
        secondary: '#9AA3B2',
        muted: '#6B7380',
        accent: '#4FA3FF',
        success: '#3FA37C',
        error: '#E05D5D',
        info: '#4B5563',
        warning: '#B9A06A',
      },
      fontFamily: {
        ui: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
```

### Styling Patterns

**Component Styling:**
- Use Tailwind utility classes for component styling
- Extract repeated patterns into component variants (if needed)
- Use CSS custom properties for theme values accessed in JavaScript

**Example:**
```typescript
// Component with Tailwind classes (using standard spacing: p-4, p-6, etc.)
<div className="bg-obsidian text-primary p-6 border border-border rounded">
  <h2 className="font-ui text-xl uppercase tracking-wide">Title</h2>
  <p className="font-mono text-secondary text-sm">Code snippet</p>
</div>
```

**Note:** Tailwind spacing uses numeric values (p-4 = 1rem, p-6 = 1.5rem). Custom spacing tokens can be defined in `tailwind.config.js` if needed.

---

## Testing Requirements

### Component Test Template

```typescript
// tests/unit/components/Button.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/Button';

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    
    render(<Button onClick={handleClick}>Click me</Button>);
    await user.click(screen.getByRole('button'));
    
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Click me</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

### Testing Best Practices

1. **Unit Tests:** Test individual components in isolation
2. **Integration Tests:** Test component interactions and API integration
3. **E2E Tests:** Test critical user flows (using Playwright)
4. **Coverage Goals:** Aim for 80% code coverage for business logic
5. **Test Structure:** Arrange-Act-Assert pattern
6. **Mock External Dependencies:** API calls, routing, state management
7. **Accessibility Testing:** Use `@testing-library` queries that encourage accessible code
8. **Visual Regression:** Consider visual regression testing for dashboard components

### E2E Test Example

```typescript
// tests/e2e/workflows.spec.ts
import { test, expect } from '@playwright/test';

test('complete generation workflow', async ({ page }) => {
  // Navigate to landing page
  await page.goto('/');
  
  // Select conference and topic
  await page.selectOption('[data-testid="conference-select"]', 'black_hat');
  await page.selectOption('[data-testid="topic-select"]', 'genai');
  
  // Click generate button
  await page.click('[data-testid="generate-button"]');
  
  // Wait for job to start
  await expect(page.locator('[data-testid="job-status"]')).toContainText('running');
  
  // Wait for completion
  await expect(page.locator('[data-testid="job-status"]')).toContainText('completed', {
    timeout: 120000, // 2 minutes
  });
  
  // Verify results displayed
  await expect(page.locator('[data-testid="abstract-title"]')).toBeVisible();
});
```

---

## Accessibility Implementation

### Accessibility Standards

**Target:** WCAG 2.1 Level AA compliance

**Requirements:**
- **Semantic HTML:** Use proper HTML elements (`<button>`, `<nav>`, `<main>`, etc.)
- **ARIA Labels:** Use ARIA attributes when semantic HTML is insufficient
- **Keyboard Navigation:** All interactive elements must be keyboard accessible
- **Focus Management:** Visible focus indicators, logical tab order
- **Screen Reader Support:** Proper heading hierarchy, alt text for images, descriptive link text

### Accessibility Patterns

```typescript
// Accessible button component
<button
  type="button"
  onClick={handleClick}
  aria-label="Generate abstract"
  className="focus:outline-none focus:ring-2 focus:ring-accent"
>
  Generate Abstract
</button>

// Accessible form
<form aria-label="Generation request form">
  <label htmlFor="conference-select">
    Conference
    <select
      id="conference-select"
      aria-required="true"
      aria-describedby="conference-help"
    >
      {/* options */}
    </select>
  </label>
  <span id="conference-help" className="sr-only">
    Select the target conference
  </span>
</form>
```

### Accessibility Testing

**Tools:**
- **axe DevTools:** Browser extension for accessibility testing
- **WAVE:** Web accessibility evaluation tool
- **Lighthouse:** Automated accessibility auditing
- **Screen Reader Testing:** Manual testing with NVDA/JAWS/VoiceOver

**Process:**
- Run automated accessibility tests in CI/CD
- Manual keyboard navigation testing
- Screen reader testing for critical flows
- Color contrast verification (WCAG AA minimum)

---

## Performance Optimization

### Code Splitting

**Route-based splitting:**
```typescript
// Lazy load pages
import { lazy, Suspense } from 'react';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));

<Suspense fallback={<LoadingSpinner />}>
  <DashboardPage />
</Suspense>
```

**Component-based splitting:**
- Lazy load heavy dashboard components (charts, visualizations)
- Use dynamic imports for Recharts components

### Image Optimization

- Use WebP format where supported
- Lazy load images below the fold
- Provide appropriate image sizes for different viewports

### Re-render Optimization

**Memoization:**
```typescript
import { memo, useMemo, useCallback } from 'react';

// Memoize expensive computations
const expensiveValue = useMemo(() => {
  return computeExpensiveValue(data);
}, [data]);

// Memoize callbacks
const handleClick = useCallback(() => {
  // Handler logic
}, [dependencies]);

// Memoize components
export const ExpensiveComponent = memo(({ data }) => {
  // Component implementation
});
```

**Zustand Selectors:**
- Use specific selectors to prevent unnecessary re-renders
- Avoid selecting entire store state

### Performance Monitoring

**Web Vitals:**
- Track LCP (Largest Contentful Paint) - target <2.5s
- Track FID (First Input Delay) - target <100ms
- Track CLS (Cumulative Layout Shift) - target <0.1

**Implementation:**
- Use `web-vitals` library to measure and report metrics
- **Development:** Log performance metrics to console
- **Production:** Send metrics to analytics endpoint (e.g., `/api/v1/analytics/web-vitals`)
- See "Frontend Observability & Diagnostics" section for custom performance marks

---

## Mobile & Small-Screen Considerations

### Supported Devices

- **Primary:** Desktop (full dashboard + deep workflow view)
- **Secondary:** Mobile (landing, generation progress, results; limited dashboard)

**Mobile Scope Note:** Mobile supports end-to-end generation and viewing results; dashboard and deep analysis are desktop-first.

### Responsive Layout Strategy

**Breakpoints:** Tailwind defaults (sm: 640px, md: 768px, lg: 1024px, xl: 1280px)

**Mobile-First Approach:**
- All pages must be usable at 320px width
- Start with mobile styles, then enhance for larger screens

**Layout Rules by Page:**

1. **LandingPage:**
   - Single-column layout on mobile
   - Sticky bottom "Generate" button on mobile (avoids iOS Safari toolbar overlap)
   - Form fields stack vertically

2. **GenerationPage:**
   - Default to Simple View on mobile
   - Deep View is available but collapsed/accordion-based
   - Timeline uses one primary scroll region (avoid nested scroll containers)
   - Sticky header for job status + progress indicator

3. **DashboardPage:**
   - Mobile shows ExecutiveOverview only
   - Display "View on desktop for details" banner
   - Chart panels hidden on mobile (lazy-loaded on desktop)

### Interaction & Accessibility on Mobile

**Touch Targets:**
- Minimum 44×44px for buttons, tabs, toggles
- Adequate spacing between interactive elements (minimum 8px)

**Scrolling:**
- Avoid nested scroll containers
- Timeline uses one primary scroll region
- Use `overflow-x-auto` sparingly (prefer responsive layout changes)

**Sticky UI:**
- Use sticky header for job status + progress
- Avoid sticky footers that overlap iOS Safari toolbars
- Test on iOS Safari and Chrome Android

### WebSocket / Network Reliability

**Mobile Network Considerations:**
- Mobile networks are intermittent; implement Degraded Mode
- If WebSocket disconnects > 5s, enable polling (every 3–5s) until WS reconnects
- Reduce payload size: on mobile, only render last N events (e.g., 50)
- Lazy-load older events via `/workflow/{job_id}?cursor=...` API

**Implementation:**
```typescript
// hooks/useWebSocket.ts - Enhanced for mobile
const MOBILE_DISCONNECT_THRESHOLD = 5000; // 5 seconds
const MOBILE_POLL_INTERVAL = 4000; // 4 seconds

// In WebSocket disconnect handler:
if (disconnectDuration > MOBILE_DISCONNECT_THRESHOLD) {
  setConnectionState('polling-only');
  startPolling(jobId, token, MOBILE_POLL_INTERVAL);
}
```

### Performance Budget for Mobile

**Initial JS Bundle:**
- Target: < 250KB gzip for landing + generation pages
- Dashboard pages can be larger (desktop-first)

**Lazy Loading:**
- Recharts + dashboard panels must be dynamically imported
- Only load chart libraries when dashboard is accessed (desktop)

**Rendering Optimization:**
- Timeline uses virtualization for long event lists (optional MVP: cap event list with "Load more" button)
- Avoid heavy renders: limit initial event list to last 50 events on mobile
- Use `React.memo` for event cards to prevent unnecessary re-renders

### Mobile UX Defaults

**GenerationPage - Simple View (Mobile Default):**
- Show status (queued/running/completed)
- Latest events feed (last 20-50 events)
- Final abstract + evaluator guess
- Copy/share buttons (prominent, 44×44px minimum)

**GenerationPage - Deep View (Mobile):**
- Available but uses accordions for:
  - Tool calls (collapsed by default)
  - Artifacts (collapsed by default)
  - Cost events (collapsed by default)
- Expandable sections for detailed inspection

**LandingPage (Mobile):**
- Single-column form
- Large, accessible form inputs
- Sticky "Generate" button at bottom

### Mobile Browser Compatibility Notes

**Test Targets:**
- iOS Safari (latest 2 versions)
- Chrome Android (latest 2 versions)

**Compatibility Requirements:**
- Ensure `wss://` works behind corporate/VPN constraints (polling fallback must be solid)
- No reliance on features missing in Safari (e.g., some newer CSS behaviors)
- Test WebSocket reconnection logic on mobile networks
- Verify touch interactions work correctly (no hover-only interactions)

**Known Issues to Avoid:**
- Don't use CSS features that Safari doesn't support (check caniuse.com)
- Avoid `position: sticky` on elements that might conflict with iOS Safari UI
- Test form inputs with iOS keyboard (ensure proper viewport adjustments)

---

## Frontend Observability & Diagnostics

**Goal:** When something breaks in the field, answer "what happened?" without reproducing locally.

### Error Tracking

**Error Capture:**
- Capture uncaught errors via `window.onerror` and `window.onunhandledrejection`
- Capture React render errors via `ErrorBoundary` component
- Capture promise rejections (unhandled promise rejections)

**Error Context:**
Include the following in all error reports:
- `jobId` (if available)
- `connectionState` (WebSocket state)
- `route` (current route path)
- `buildSHA` (git commit hash, injected at build time)
- `browser` (user agent, parsed)
- `timestamp` (ISO string)
- `errorMessage` (sanitized, no PII)

**Implementation:**
```typescript
// utils/errorTracking.ts
import { logger } from './logger';
import { useJobStore } from '@/stores/jobStore';

export const captureError = (error: Error, context?: Record<string, unknown>) => {
  const { currentJobId, connectionState } = useJobStore.getState();
  const errorReport = {
    errorMessage: error.message,
    errorStack: error.stack,
    jobId: currentJobId,
    connectionState,
    route: window.location.pathname,
    buildSHA: import.meta.env.VITE_BUILD_SHA || 'unknown',
    browser: navigator.userAgent,
    timestamp: new Date().toISOString(),
    ...context,
  };
  
  // Send to error tracking service (e.g., Sentry, LogRocket)
  logger.error('Error captured:', errorReport);
  // In production: send to error tracking endpoint
};

// ErrorBoundary component
// components/shared/ErrorBoundary.tsx
export class ErrorBoundary extends React.Component {
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    captureError(error, { componentStack: errorInfo.componentStack });
  }
  // ... rest of ErrorBoundary
}
```

### Structured Logging

**Log Levels:**
- `debug`: Development-only, verbose details
- `info`: General information (user actions, state changes)
- `warn`: Warnings (degraded functionality, fallbacks)
- `error`: Errors (exceptions, failures)

**Log Schema:**
```typescript
interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
  jobId?: string;
  route?: string;
  connectionState?: string;
  buildSHA?: string;
  metadata?: Record<string, unknown>;
}
```

**Sampling Rules:**
- `debug`: Only in development (never in production)
- `info`: Sample 10% in production (reduce noise)
- `warn`: Always log
- `error`: Always log

**PII Prohibition:**
- **Explicit rule:** Never log tokens, passwords, or personally identifiable information
- Sanitize user input before logging
- Redact sensitive fields (e.g., `token: '[REDACTED]'`)

**Implementation:**
```typescript
// utils/logger.ts (enhanced)
class Logger {
  private shouldLog(level: LogLevel): boolean {
    if (level === 'debug' && !this.isDev) return false;
    if (level === 'info' && !this.isDev && Math.random() > 0.1) return false;
    return true;
  }
  
  private sanitize(data: unknown): unknown {
    // Remove tokens, PII from log data
    if (typeof data === 'object' && data !== null) {
      const sanitized = { ...data };
      if ('token' in sanitized) sanitized.token = '[REDACTED]';
      if ('password' in sanitized) sanitized.password = '[REDACTED]';
      return sanitized;
    }
    return data;
  }
}
```

### Network Instrumentation

**Request Tracking:**
- Log request timing + status codes (without payloads)
- Track endpoint, method, duration, status code
- Do not log request/response bodies (may contain sensitive data)

**WebSocket Metrics:**
- Track `/status` poll failures rate
- Track WS connect/auth success rate
- Track reconnect count
- Track "polling-only" duration

**Implementation:**
```typescript
// services/api/client.ts (enhanced)
class ApiClient {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T | null> {
    const startTime = performance.now();
    const requestId = crypto.randomUUID();
    
    try {
      const response = await fetch(url, config);
      const duration = performance.now() - startTime;
      
      // Log request metrics (no payload)
      logger.info('API request', {
        requestId,
        endpoint,
        method: options.method || 'GET',
        status: response.status,
        duration: `${duration.toFixed(2)}ms`,
      });
      
      return await response.json();
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error('API request failed', {
        requestId,
        endpoint,
        method: options.method || 'GET',
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}

// hooks/useWebSocket.ts (enhanced)
// Track WS metrics
const wsMetrics = {
  connectAttempts: 0,
  connectSuccesses: 0,
  authSuccesses: 0,
  reconnectCount: 0,
  pollingOnlyDuration: 0,
};

// Log on connect/auth/reconnect events
```

### Web Vitals + Performance Marks

**Web Vitals Reporting:**
- **Development:** Log to console
- **Production:** Send to analytics endpoint (e.g., `/api/v1/analytics/web-vitals`)

**Custom Performance Marks:**
- `time-to-first-event`: Time from page load to first WebSocket event received
- `time-to-completed`: Time from job start to completion
- `total-events-processed`: Count of events processed during job

**Implementation:**
```typescript
// utils/webVitals.ts
import { onCLS, onFID, onLCP } from 'web-vitals';

export const reportWebVitals = () => {
  const isDev = import.meta.env.DEV;
  
  const sendToAnalytics = (metric: Metric) => {
    if (isDev) {
      console.log('Web Vital:', metric);
    } else {
      // Send to analytics endpoint
      fetch('/api/v1/analytics/web-vitals', {
        method: 'POST',
        body: JSON.stringify(metric),
      });
    }
  };
  
  onCLS(sendToAnalytics);
  onFID(sendToAnalytics);
  onLCP(sendToAnalytics);
};

// Custom marks
// In GenerationPage or useWebSocket hook:
performance.mark('job-started');
// When first event received:
performance.mark('first-event-received');
performance.measure('time-to-first-event', 'job-started', 'first-event-received');
```

### Correlation IDs

**Backend Support:**
- If backend supports `x-request-id` response header, propagate it into logs
- Attach `x-request-id` to subsequent requests in the same flow

**Client Session ID:**
- If backend doesn't support correlation IDs, generate `client_session_id` once per tab session
- Attach `X-Client-Session` header to every request
- Include `client_session_id` in all logs

**Implementation:**
```typescript
// utils/correlation.ts
let clientSessionId: string | null = null;

export const getClientSessionId = (): string => {
  if (!clientSessionId) {
    clientSessionId = crypto.randomUUID();
    sessionStorage.setItem('client_session_id', clientSessionId);
  }
  return clientSessionId;
};

// In API client:
const headers: HeadersInit = {
  'X-Client-Session': getClientSessionId(),
  ...options.headers,
};

// If backend returns x-request-id, store it:
const requestId = response.headers.get('x-request-id');
if (requestId) {
  logger.info('Request ID received', { requestId, endpoint });
}
```

### Debug Mode

**Enable Debug Mode:**
- `?debug=1` URL parameter enables verbose logs + diagnostics panel
- Debug mode shows:
  - WebSocket state (connected/disconnected/polling-only)
  - Poll status (active/inactive, last poll time)
  - Last error (if any)
  - Connection metrics (reconnect count, polling duration)
  - Performance marks

**Implementation:**
```typescript
// utils/debug.ts
export const isDebugMode = (): boolean => {
  return new URLSearchParams(window.location.search).get('debug') === '1';
};

// In logger:
if (isDebugMode() || this.isDev) {
  console.debug('[DEBUG]', ...args);
}

// Debug panel component
// components/shared/DebugPanel.tsx
export const DebugPanel = () => {
  if (!isDebugMode()) return null;
  
  const { connectionState, currentJobId } = useJobStore();
  // ... render diagnostics UI
};
```

---

## Environment Configuration

### Environment Variables

```bash
# .env.development
VITE_API_BASE_URL=http://localhost:3000/api/v1
VITE_WS_URL=ws://localhost:3000/ws

# .env.production
VITE_API_BASE_URL=https://api.example.com/api/v1
VITE_WS_URL=wss://api.example.com/ws
```

**Naming Convention:**
- All environment variables must be prefixed with `VITE_` for Vite to expose them
- Use `import.meta.env.VITE_*` to access in code

**Required Variables:**
- `VITE_API_BASE_URL` - API base URL
- `VITE_WS_URL` - WebSocket URL
- `VITE_BUILD_SHA` - Git commit hash (injected at build time for error tracking)

---

## SEO Considerations

**Goal:** Minimal, high-leverage SEO improvements for discoverability and social sharing.

### Social Sharing Metadata

**Open Graph + Twitter Cards:**
- Add Open Graph and Twitter Card meta tags on `LandingPage`
- Include: title, description, image, URL
- Update per route (at least landing page)

**Implementation:**
```typescript
// components/shared/SEOHead.tsx
export const SEOHead = ({ title, description, image, url }: SEOProps) => {
  return (
    <>
      {/* Primary meta tags */}
      <title>{title}</title>
      <meta name="description" content={description} />
      
      {/* Open Graph */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      
      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
    </>
  );
};

// Usage in LandingPage
<SEOHead
  title="TIL — Agent Workflow Observatory"
  description="Observe agentic AI workflows end-to-end. Inspect decisions, tool calls, artifacts, vendor routing, and evaluation signals in real time."
  image="/og-image.png"
  url="https://til.example.com"
/>
```

### robots.txt + sitemap.xml

**robots.txt:**
- Allow `/` (landing page)
- Allow `/dashboard` (optional, if you want dashboard indexed)
- Disallow `/generate/*` (job pages should not be indexed)

**sitemap.xml:**
- Include `/` (landing page)
- Include `/dashboard` (if allowing indexing)
- Exclude `/generate/*` (job pages)

**Implementation:**
```txt
# public/robots.txt
User-agent: *
Allow: /
Allow: /dashboard
Disallow: /generate/

# public/sitemap.xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://til.example.com/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://til.example.com/dashboard</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
```

### Canonical Tags

**Canonical URL:**
- Add canonical tag to landing page pointing to `/`
- Ensures search engines index the correct URL

**Implementation:**
```typescript
// In LandingPage or SEOHead component
<link rel="canonical" href="https://til.example.com/" />
```

### Indexing Policy

**No-Index Meta Tags:**
- Add `meta name="robots" content="noindex"` on:
  - Job pages (`/generate/:jobId`)
  - Token recovery UI
  - Any pages with sensitive or transient content

**Implementation:**
```typescript
// In GenerationPage
<Helmet>
  <meta name="robots" content="noindex, nofollow" />
</Helmet>

// Or in SEOHead component
{noIndex && <meta name="robots" content="noindex, nofollow" />}
```

**Rationale:**
- Job pages are transient and user-specific (should not be indexed)
- Token recovery pages are private (should not be indexed)
- Prevents search engines from indexing sensitive or temporary content

---

## Frontend Developer Standards

### Critical Coding Rules

1. **TypeScript Strict Mode:** Always enabled, no `any` types (use `unknown` if truly unknown)
2. **Component Props:** Always define TypeScript interfaces for component props
3. **Error Handling:** Always handle errors in API calls and WebSocket connections
4. **Loading States:** Always show loading indicators for async operations
5. **Accessibility:** All interactive elements must be keyboard accessible
6. **Performance:** Use React.memo, useMemo, useCallback appropriately
7. **State Management:** Use Zustand stores for global state, local state for component-specific state
8. **API Calls:** Always use try-catch for async operations
9. **WebSocket:** Always implement reconnection logic and fallback to polling
10. **Testing:** Write tests for all business logic and user interactions
11. **Logging:** Never use `console.log` in production code; use `logger` utility instead
12. **Token Security:** Never pass tokens in URL query strings; use message frames or headers
13. **Event Deduplication:** Always deduplicate WebSocket events using event_id or sort key
14. **Code Splitting:** Lazy load dashboard chart components to improve performance

### Quick Reference

**Common Commands:**
```bash
# Development
npm run dev          # Start dev server (Vite)

# Build
npm run build        # Production build

# Testing
npm run test         # Run unit tests (Vitest)
npm run test:e2e     # Run E2E tests (Playwright)
npm run test:ui      # Run tests in UI mode

# Linting
npm run lint         # Run ESLint
npm run format       # Format with Prettier
```

**Key Import Patterns:**
```typescript
// React
import { FC, useState, useEffect } from 'react';

// Zustand
import { useJobStore } from '@/stores/jobStore';

// Services
import { generateService } from '@/services/api/generate';

// Components
import { Button } from '@/components/ui/Button';

// Types
import type { JobStatus } from '@/services/types';
```

**File Naming:**
- Components: `PascalCase.tsx` (e.g., `Timeline.tsx`)
- Hooks: `camelCase.ts` with `use` prefix (e.g., `useJobStatus.ts`)
- Utilities: `camelCase.ts` (e.g., `formatDate.ts`)
- Types: `camelCase.ts` or co-located with component

---

## Generation Page UI State Model

### Page Modes

The `GenerationPage` (`/generate/:jobId`) has three distinct modes:

#### 1. Simple View (Default)
**Purpose:** Narrative understanding of agent behavior

**State:**
- Job status (queued | running | completed | failed)
- Latest 5 decision events (most recent)
- Progress indicator (stage_index / stage_total)
- Vendor assignment (revealed after generation starts)
- Timeline with numbered stages:
  1. Manager — Objective formulation
  2. Worker — Strategy selection
  3. Sub-workers — Parallel execution
  4. Synthesis
  5. Evaluation

**Components:**
- `SimpleView` component
- `Timeline` component (simplified)
- `ProgressBar` component
- Artifact cards (collapsed by default, inline references)

**Data Source:**
- `jobStore.workflowEvents` (filtered to latest 5)
- `jobStore.jobStatus`

#### 2. Deep View (Inspector)
**Purpose:** Forensic inspection and debugging

**State:**
- All decision events (chronological, sorted by sort key)
- Complete tool call details with parameters and results
- Raw source snippets (max 200 chars per source)
- Token usage and timing per step
- Evaluator full payload and reasoning
- Artifact dependency graphs
- Evidence chains with clickable pointers to sources
- Cost events and budget tracking

**Components:**
- `DeepView` component
- `EventCard` component (log-style panels)
- `ArtifactCard` component (expandable)
- `Timeline` component (full detail)
- Cost visualization components

**Data Source:**
- `jobStore.workflowEvents` (all events, sorted)
- `jobStore.eventIndex` (for deduplication)

#### 3. Results View
**Purpose:** Capture verdict for analytics

**State:**
- Final abstract (title and content)
- Iteration selected (0-4)
- Vendor assignment (Manager: X, Worker: Y)
- Evaluator top-3 predictions
- Feedback form:
  - Verdict buttons: [ACCEPTED] [CONDITIONALLY VIABLE] [NOT VIABLE] [REJECTED]
  - Optional notes (≤500 chars)
  - Submission intent radio buttons

**Components:**
- `ResultsView` component
- `AbstractDisplay` component
- `FeedbackForm` component
- `VendorAssignment` component

**Data Source:**
- `jobStore.jobStatus` (must be 'completed')
- API response from `/status/:jobId`

### View Switching

- Tabs: "Workflow (Simple)", "Workflow (Deep)", "Results"
- Results tab only visible when `jobStatus === 'completed'`
- Switch between Simple/Deep without losing place (state preserved)
- Default view: Simple (on first load)

### State Management

```typescript
// uiStore.ts (add to existing store)
interface UIState {
  generationView: 'simple' | 'deep' | 'results';
  setGenerationView: (view: UIState['generationView']) => void;
}
```

---

## Next Steps

After completing the frontend architecture:

1. **Review:** Review with Product Owner for alignment
2. **Story Creation:** Begin frontend story implementation with Dev agent using SM agent
3. **Setup:** Initialize Vite + React + TypeScript project
4. **Component Library:** Build base UI components first
5. **Integration:** Integrate with backend API

---

**Status:** Ready for review and frontend development
