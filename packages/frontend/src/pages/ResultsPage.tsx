/**
 * ResultsPage Component
 * Sprint 7: Display final results for a completed job
 * 
 * Shows: final abstract, iteration history, evaluator prediction, provenance
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { workflowService, ResultResponse } from '../services/api/workflow';
import { getJobToken } from '../utils/tokenStorage';

export function ResultsPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [result, setResult] = useState<ResultResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const token = jobId ? getJobToken(jobId) : null;

  useEffect(() => {
    async function fetchResult() {
      if (!jobId || !token) {
        setError('Missing job ID or token');
        setLoading(false);
        return;
      }

      try {
        const data = await workflowService.getResult(jobId, token);
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load results');
      } finally {
        setLoading(false);
      }
    }

    fetchResult();
  }, [jobId, token]);

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-4xl mx-auto text-center py-20">
          <h1 className="text-2xl font-bold mb-4">Session Expired</h1>
          <p className="text-gray-400 mb-6">
            Your access token for this job has expired or is invalid.
          </p>
          <Link
            to="/"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors"
          >
            Start New Generation
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Loading results...</p>
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-4xl mx-auto">
          <Link to={`/jobs/${jobId}`} className="text-blue-400 hover:text-blue-300 mb-6 inline-block">
            &larr; Back to Workflow
          </Link>
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-6 text-center">
            <h2 className="text-xl font-semibold text-red-400 mb-2">Error Loading Results</h2>
            <p className="text-gray-400">{error || 'Unknown error'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to={`/jobs/${jobId}`} className="text-gray-400 hover:text-white flex items-center gap-2">
            &larr; Back to Workflow
          </Link>
          <div className="text-center">
            <h1 className="text-xl font-semibold">{result.conference}</h1>
            <p className="text-sm text-gray-400">{result.topic}</p>
          </div>
          <div className="text-sm text-gray-500">
            {result.status === 'completed' ? (
              <span className="text-green-400">Completed</span>
            ) : (
              <span className="text-yellow-400">{result.status}</span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Final Abstract */}
        <section className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            Final Abstract
            {result.selected_iteration !== null && (
              <span className="text-sm font-normal text-gray-400">
                (Iteration {result.selected_iteration + 1})
              </span>
            )}
          </h2>
          
          {result.final_title ? (
            <>
              <h3 className="text-xl font-medium text-blue-300 mb-3">{result.final_title}</h3>
              <div className="prose prose-invert max-w-none">
                <p className="text-gray-300 whitespace-pre-wrap">{result.final_abstract}</p>
              </div>
            </>
          ) : (
            <p className="text-gray-500 italic">No final abstract available</p>
          )}
        </section>

        {/* Evaluator Assessment */}
        {result.evaluator && (
          <section className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Blind Evaluator Assessment</h2>
            <div className="flex items-center gap-4">
              <div className={`text-3xl ${result.evaluator.matches_target ? 'text-green-400' : 'text-yellow-400'}`}>
                {result.evaluator.matches_target ? '✓' : '⚠'}
              </div>
              <div>
                <p className="text-gray-300">
                  Predicted conference: <strong>{result.evaluator.predicted_conference}</strong>
                </p>
                {result.evaluator.confidence !== null && (
                  <p className="text-sm text-gray-400">
                    Confidence: {(result.evaluator.confidence * 100).toFixed(0)}%
                  </p>
                )}
                <p className={`text-sm ${result.evaluator.matches_target ? 'text-green-400' : 'text-yellow-400'}`}>
                  {result.evaluator.matches_target 
                    ? 'Matches target conference' 
                    : `Target was ${result.conference}`}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Iteration History */}
        {result.iterations.length > 0 && (
          <section className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Iteration History</h2>
            <div className="space-y-4">
              {result.iterations.map((iter, idx) => (
                <div 
                  key={idx}
                  className={`border rounded-lg p-4 ${
                    iter.accepted 
                      ? 'border-green-600 bg-green-900/20' 
                      : 'border-gray-700 bg-gray-750'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">
                      Iteration {iter.iteration + 1}
                      {iter.accepted && <span className="ml-2 text-green-400 text-sm">(Selected)</span>}
                    </span>
                  </div>
                  <h4 className="text-blue-300 mb-1">{iter.title || 'Untitled'}</h4>
                  <p className="text-gray-400 text-sm line-clamp-3">{iter.abstract}</p>
                  {iter.manager_feedback && (
                    <p className="mt-2 text-sm text-gray-500 italic">
                      Feedback: {iter.manager_feedback}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Summary Stats */}
        <section className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-400">{result.summary.total_iterations}</p>
              <p className="text-sm text-gray-400">Iterations</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-400">{result.summary.total_tool_calls}</p>
              <p className="text-sm text-gray-400">Tool Calls</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-400">
                {Math.floor(result.summary.duration_seconds / 60)}m {result.summary.duration_seconds % 60}s
              </p>
              <p className="text-sm text-gray-400">Duration</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-400">${result.summary.estimated_cost_usd}</p>
              <p className="text-sm text-gray-400">Est. Cost</p>
            </div>
          </div>
        </section>

        {/* Provenance */}
        {result.provenance && (result.provenance.sources.length > 0 || result.provenance.artifacts_used.length > 0) && (
          <section className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Sources & Provenance</h2>
            
            {result.provenance.sources.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-400 mb-2">Sources Used</h3>
                <ul className="space-y-1">
                  {result.provenance.sources.map((source, idx) => (
                    <li key={idx} className="text-sm text-gray-300 flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        source.kind === 'web' ? 'bg-blue-900 text-blue-300' :
                        source.kind === 'conference_rules' ? 'bg-green-900 text-green-300' :
                        'bg-gray-700 text-gray-300'
                      }`}>
                        {source.kind}
                      </span>
                      <span>{source.ref}</span>
                      {source.note && <span className="text-gray-500">- {source.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {result.provenance.artifacts_used.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-2">Artifacts</h3>
                <ul className="space-y-1">
                  {result.provenance.artifacts_used.map((artifact, idx) => (
                    <li key={idx} className="text-sm text-gray-300">
                      <code className="bg-gray-700 px-1 rounded">{artifact.artifact_id.substring(0, 8)}...</code>
                      <span className="ml-2 text-gray-500">{artifact.purpose}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Actions */}
        <div className="flex justify-center gap-4">
          <Link
            to="/"
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors"
          >
            Generate Another
          </Link>
        </div>
      </div>
    </div>
  );
}
