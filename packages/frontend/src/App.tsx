import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { ObservatoryPage } from "./pages/ObservatoryPage";
import { WorkflowPage } from "./pages/WorkflowPage";
import { ResultsPage } from "./pages/ResultsPage";
import { JobsListPage } from "./pages/JobsListPage";
import { DashboardGuidePage } from "./pages/DashboardGuidePage";
// Dashboard V2: Research Analytics (10x faster)
import {
  ExecutiveDashboardV2,
  VendorManagerV2,
  VendorWorkerV2,
  ContextEffectsDashboardV2,
  EvaluatorV2,
  SpeedV2,
  ToolBehaviorV2,
  TopAbstractsPage,
} from "./pages/dashboard";
import { DashboardProvider } from "./context/DashboardContext";
import './App.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/observatory" element={<ObservatoryPage />} />
        <Route path="/dashboard-guide" element={<DashboardGuidePage />} />
        {/* Jobs list page */}
        <Route path="/jobs" element={<JobsListPage />} />
        {/* Sprint 7: Workflow visualization page */}
        <Route path="/jobs/:jobId" element={<WorkflowPage />} />
        <Route path="/jobs/:jobId/result" element={<ResultsPage />} />
        
        {/* Dashboard V2 routes - Research Analytics (10x faster) */}
        {/* Aggressive migration: Replaced V1 dashboards with V2 */}
        <Route path="/dashboard" element={
          <DashboardProvider><ExecutiveDashboardV2 /></DashboardProvider>
        } />
        <Route path="/dashboard/manager" element={
          <DashboardProvider><VendorManagerV2 /></DashboardProvider>
        } />
        <Route path="/dashboard/worker" element={
          <DashboardProvider><VendorWorkerV2 /></DashboardProvider>
        } />
        <Route path="/dashboard/context" element={
          <DashboardProvider><ContextEffectsDashboardV2 /></DashboardProvider>
        } />
        <Route path="/dashboard/evaluator" element={
          <DashboardProvider><EvaluatorV2 /></DashboardProvider>
        } />
        <Route path="/dashboard/tools" element={
          <DashboardProvider><ToolBehaviorV2 /></DashboardProvider>
        } />
        <Route path="/dashboard/speed" element={
          <DashboardProvider><SpeedV2 /></DashboardProvider>
        } />
        <Route path="/dashboard/top-abstracts" element={
          <DashboardProvider><TopAbstractsPage /></DashboardProvider>
        } />
      </Routes>
    </BrowserRouter>
  );
}
