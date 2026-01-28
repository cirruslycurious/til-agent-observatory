"""
Dependency Graph Builder (Python)
Story 3.2: Artifact Traceability

Builds artifact dependency graphs from provenance.upstream_artifacts[].
Detects circular dependencies and provides lineage/descendants queries.
"""

import boto3
import os
from typing import Dict, Any, List, Optional, Set
from collections import defaultdict, deque

# Import decision event logger for circular dependency detection
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent / 'decision-events'))
from event_logger import log_decision_event
from event_types import EventType
from actor import Actor

# Configuration
ARTIFACTS_TABLE_NAME = os.environ.get('ARTIFACTS_TABLE_NAME', 'til-artifacts')
REGION = os.environ.get('AWS_REGION', 'us-east-1')

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb', region_name=REGION)
table = dynamodb.Table(ARTIFACTS_TABLE_NAME)


def get_all_artifacts_for_job(job_id: str) -> List[Dict[str, Any]]:
    """
    Get all artifacts for a job.
    
    Args:
        job_id: Job identifier (UUID)
        
    Returns:
        List of artifacts (all versions)
    """
    artifacts = []
    
    # Query all artifacts for job_id
    response = table.query(
        KeyConditionExpression='job_id = :job_id',
        ExpressionAttributeValues={
            ':job_id': job_id,
        },
    )
    
    artifacts.extend(response.get('Items', []))
    
    # Handle pagination
    while 'LastEvaluatedKey' in response:
        response = table.query(
            KeyConditionExpression='job_id = :job_id',
            ExpressionAttributeValues={
                ':job_id': job_id,
            },
            ExclusiveStartKey=response['LastEvaluatedKey'],
        )
        artifacts.extend(response.get('Items', []))
    
    # Filter out latest pointers (they're metadata, not artifacts)
    artifacts = [a for a in artifacts if not a.get('artifact_sk', '').startswith('latest#')]
    
    return artifacts


def build_dependency_graph(job_id: str) -> Dict[str, Any]:
    """
    Build dependency graph for all artifacts in a job.
    
    Builds graph from provenance.upstream_artifacts[] (deterministic, no guessing).
    Detects circular dependencies and marks affected artifacts.
    
    Args:
        job_id: Job identifier (UUID)
        
    Returns:
        Dependency graph: {
            nodes: [{artifact_id, artifact_type, task_id, created_at, status}],
            edges: [{from_artifact_id, to_artifact_id, reason, pointers}],
            circular_dependencies: [artifact_id, ...]
        }
    """
    # Get all artifacts for job
    all_artifacts = get_all_artifacts_for_job(job_id)
    
    # Build artifact lookup by artifact_id
    artifacts_by_id = {}
    for artifact in all_artifacts:
        artifact_id = artifact.get('meta', {}).get('artifact_id')
        if artifact_id:
            artifacts_by_id[artifact_id] = artifact
    
    # Build nodes
    nodes = []
    for artifact in all_artifacts:
        meta = artifact.get('meta', {})
        artifact_id = meta.get('artifact_id')
        if not artifact_id:
            continue
        
        nodes.append({
            'artifact_id': artifact_id,
            'artifact_type': meta.get('artifact_type'),
            'task_id': meta.get('task_id'),
            'created_at': meta.get('completed_at') or meta.get('spawned_at'),
            'status': meta.get('status'),
        })
    
    # Build edges from provenance.upstream_artifacts[]
    edges = []
    for artifact in all_artifacts:
        meta = artifact.get('meta', {})
        to_artifact_id = meta.get('artifact_id')
        if not to_artifact_id:
            continue
        
        provenance = artifact.get('provenance', {})
        upstream_artifacts = provenance.get('upstream_artifacts', [])
        
        # Also check sources[] for backward compatibility (artifact: type pointers)
        sources = provenance.get('sources', [])
        for source in sources:
            source_pointer = source.get('source_pointer', '')
            if source_pointer.startswith('artifact:'):
                # Extract artifact_id from source_pointer
                artifact_id_part = source_pointer.split(':', 1)[1].split('#', 1)[0] if '#' in source_pointer.split(':', 1)[1] else source_pointer.split(':', 1)[1]
                # Try to find full artifact_id (may need to reconstruct from job_id + task_id + version)
                # For now, add to upstream_artifacts for processing
                if artifact_id_part not in [ua.get('artifact_id') for ua in upstream_artifacts]:
                    upstream_artifacts.append({
                        'artifact_id': artifact_id_part,
                        'reason': 'Referenced in sources',
                        'pointers': [source_pointer],
                    })
        
        # Process upstream_artifacts
        for upstream in upstream_artifacts:
            from_artifact_id = upstream.get('artifact_id')
            if not from_artifact_id:
                continue
            
            # Validate artifact_id format
            if '#' not in from_artifact_id or not from_artifact_id.endswith(('v0001', 'v0002', 'v0003', 'v0004', 'v0005')):
                # Try to reconstruct full artifact_id
                # Format: {job_id}#{task_id}#{artifact_version}
                if not from_artifact_id.startswith(job_id + '#'):
                    from_artifact_id = f"{job_id}#{from_artifact_id}"
            
            edges.append({
                'from_artifact_id': from_artifact_id,
                'to_artifact_id': to_artifact_id,
                'reason': upstream.get('reason', ''),
                'pointers': upstream.get('pointers', []),
            })
    
    # Detect circular dependencies (DFS traversal)
    circular_dependencies = detect_circular_dependencies(nodes, edges)
    
    # Mark artifacts with invalid_dependency status
    if circular_dependencies:
        # Log decision event for each circular dependency
        for artifact_id in circular_dependencies:
            try:
                log_decision_event(
                    event_type=EventType.ARTIFACT_CIRCULAR_DEPENDENCY_DETECTED.value,
                    details={
                        'artifact_id': artifact_id,
                        'job_id': job_id,
                        'circular_chain': circular_dependencies,
                    },
                    job_id=job_id,
                    execution_id='',  # Not available in this context
                    state_name='DependencyGraphBuilder',
                    iteration=0,
                    actor=Actor.SYSTEM.value,
                    summary=f"Circular dependency detected for artifact {artifact_id}",
                )
            except Exception as e:
                # Log error but continue (event logging failure shouldn't block graph building)
                print(f"Warning: Failed to log circular dependency event: {e}")
    
    return {
        'nodes': nodes,
        'edges': edges,
        'circular_dependencies': circular_dependencies,
    }


def detect_circular_dependencies(nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]) -> List[str]:
    """
    Detect circular dependencies in dependency graph using DFS.
    
    Args:
        nodes: List of artifact nodes
        edges: List of dependency edges
        
    Returns:
        List of artifact_ids involved in circular dependencies
    """
    # Build adjacency list
    graph = defaultdict(list)
    for edge in edges:
        from_id = edge['from_artifact_id']
        to_id = edge['to_artifact_id']
        graph[to_id].append(from_id)  # Reverse: to depends on from
    
    # DFS to detect cycles
    visited = set()
    rec_stack = set()
    circular_artifacts = set()
    
    def dfs(artifact_id: str, path: List[str]) -> bool:
        """DFS helper to detect cycles"""
        if artifact_id in rec_stack:
            # Cycle detected - mark all artifacts in cycle
            cycle_start = path.index(artifact_id)
            cycle_artifacts = path[cycle_start:] + [artifact_id]
            circular_artifacts.update(cycle_artifacts)
            return True
        
        if artifact_id in visited:
            return False
        
        visited.add(artifact_id)
        rec_stack.add(artifact_id)
        path.append(artifact_id)
        
        # Visit dependencies
        for dep_id in graph.get(artifact_id, []):
            dfs(dep_id, path)
        
        rec_stack.remove(artifact_id)
        path.pop()
        return False
    
    # Run DFS on all nodes
    for node in nodes:
        artifact_id = node['artifact_id']
        if artifact_id not in visited:
            dfs(artifact_id, [])
    
    return list(circular_artifacts)


def get_artifact_lineage(artifact_id: str, job_id: str) -> List[Dict[str, Any]]:
    """
    Recursively trace all artifacts that fed into this artifact.
    
    Args:
        artifact_id: Target artifact ID
        job_id: Job identifier (UUID)
        
    Returns:
        Lineage chain (ordered list of artifacts from root to target)
    """
    # Build dependency graph
    graph = build_dependency_graph(job_id)
    
    # Build reverse adjacency list (what depends on what)
    reverse_graph = defaultdict(list)
    for edge in graph['edges']:
        from_id = edge['from_artifact_id']
        to_id = edge['to_artifact_id']
        reverse_graph[to_id].append(from_id)
    
    # Get all artifacts
    artifacts_by_id = {node['artifact_id']: node for node in graph['nodes']}
    
    # BFS from target artifact to find all ancestors
    lineage = []
    visited = set()
    queue = deque([artifact_id])
    
    while queue:
        current_id = queue.popleft()
        if current_id in visited:
            continue
        
        visited.add(current_id)
        
        # Add to lineage if it exists
        if current_id in artifacts_by_id:
            artifact = artifacts_by_id[current_id]
            # Skip artifacts with invalid_dependency status
            if artifact.get('status') != 'invalid_dependency':
                lineage.append(artifact)
        
        # Add dependencies to queue
        for dep_id in reverse_graph.get(current_id, []):
            if dep_id not in visited:
                queue.append(dep_id)
    
    # Reverse lineage to get root-to-target order
    lineage.reverse()
    
    return lineage


def get_artifact_descendants(artifact_id: str, job_id: str) -> List[Dict[str, Any]]:
    """
    Find all artifacts that depend on this artifact (reverse dependency lookup).
    
    Args:
        artifact_id: Source artifact ID
        job_id: Job identifier (UUID)
        
    Returns:
        Descendants list (all artifacts that reference this artifact)
    """
    # Build dependency graph
    graph = build_dependency_graph(job_id)
    
    # Build forward adjacency list
    forward_graph = defaultdict(list)
    for edge in graph['edges']:
        from_id = edge['from_artifact_id']
        to_id = edge['to_artifact_id']
        forward_graph[from_id].append(to_id)
    
    # Get all artifacts
    artifacts_by_id = {node['artifact_id']: node for node in graph['nodes']}
    
    # BFS from source artifact to find all descendants
    descendants = []
    visited = set()
    queue = deque([artifact_id])
    
    while queue:
        current_id = queue.popleft()
        if current_id in visited:
            continue
        
        visited.add(current_id)
        
        # Add to descendants if it exists and is not the source
        if current_id in artifacts_by_id and current_id != artifact_id:
            artifact = artifacts_by_id[current_id]
            # Skip artifacts with invalid_dependency status
            if artifact.get('status') != 'invalid_dependency':
                descendants.append(artifact)
        
        # Add dependents to queue
        for dependent_id in forward_graph.get(current_id, []):
            if dependent_id not in visited:
                queue.append(dependent_id)
    
    return descendants
