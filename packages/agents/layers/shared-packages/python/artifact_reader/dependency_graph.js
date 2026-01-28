/**
 * Dependency Graph Builder (TypeScript)
 * Story 3.2: Artifact Traceability
 *
 * Builds artifact dependency graphs from provenance.upstream_artifacts[].
 * Detects circular dependencies and provides lineage/descendants queries.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const ARTIFACTS_TABLE_NAME = process.env.ARTIFACTS_TABLE_NAME || 'til-artifacts';
/**
 * Get all artifacts for a job
 */
async function getAllArtifactsForJob(jobId) {
    const artifacts = [];
    let lastEvaluatedKey;
    do {
        const params = {
            TableName: ARTIFACTS_TABLE_NAME,
            KeyConditionExpression: 'job_id = :job_id',
            ExpressionAttributeValues: {
                ':job_id': jobId,
            },
        };
        if (lastEvaluatedKey) {
            params.ExclusiveStartKey = lastEvaluatedKey;
        }
        const response = await docClient.send(new QueryCommand(params));
        artifacts.push(...(response.Items || []));
        lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    // Filter out latest pointers (they're metadata, not artifacts)
    return artifacts.filter(a => !a.artifact_sk?.startsWith('latest#'));
}
/**
 * Build dependency graph for all artifacts in a job
 */
export async function buildDependencyGraph(jobId) {
    // Get all artifacts for job
    const allArtifacts = await getAllArtifactsForJob(jobId);
    // Build artifact lookup by artifact_id
    const artifactsById = {};
    for (const artifact of allArtifacts) {
        const artifactId = artifact.meta?.artifact_id;
        if (artifactId) {
            artifactsById[artifactId] = artifact;
        }
    }
    // Build nodes
    const nodes = [];
    for (const artifact of allArtifacts) {
        const meta = artifact.meta || {};
        const artifactId = meta.artifact_id;
        if (!artifactId) {
            continue;
        }
        nodes.push({
            artifact_id: artifactId,
            artifact_type: meta.artifact_type,
            task_id: meta.task_id,
            created_at: meta.completed_at || meta.spawned_at,
            status: meta.status,
        });
    }
    // Build edges from provenance.upstream_artifacts[]
    const edges = [];
    for (const artifact of allArtifacts) {
        const meta = artifact.meta || {};
        const toArtifactId = meta.artifact_id;
        if (!toArtifactId) {
            continue;
        }
        const provenance = artifact.provenance || {};
        let upstreamArtifacts = provenance.upstream_artifacts || [];
        // Also check sources[] for backward compatibility (artifact: type pointers)
        const sources = provenance.sources || [];
        for (const source of sources) {
            const sourcePointer = source.source_pointer || '';
            if (sourcePointer.startsWith('artifact:')) {
                // Extract artifact_id from source_pointer
                const artifactIdPart = sourcePointer.split(':')[1]?.split('#')[0] || sourcePointer.split(':')[1];
                // Check if already in upstream_artifacts
                if (artifactIdPart && !upstreamArtifacts.find((ua) => ua.artifact_id === artifactIdPart)) {
                    upstreamArtifacts.push({
                        artifact_id: artifactIdPart,
                        reason: 'Referenced in sources',
                        pointers: [sourcePointer],
                    });
                }
            }
        }
        // Process upstream_artifacts
        for (const upstream of upstreamArtifacts) {
            let fromArtifactId = upstream.artifact_id;
            if (!fromArtifactId) {
                continue;
            }
            // Validate artifact_id format
            if (!fromArtifactId.includes('#') || !fromArtifactId.match(/v\d{4}$/)) {
                // Try to reconstruct full artifact_id
                // Format: {job_id}#{task_id}#{artifact_version}
                if (!fromArtifactId.startsWith(jobId + '#')) {
                    fromArtifactId = `${jobId}#${fromArtifactId}`;
                }
            }
            edges.push({
                from_artifact_id: fromArtifactId,
                to_artifact_id: toArtifactId,
                reason: upstream.reason || '',
                pointers: upstream.pointers || [],
            });
        }
    }
    // Detect circular dependencies (DFS traversal)
    const circularDependencies = detectCircularDependencies(nodes, edges);
    return {
        nodes,
        edges,
        circular_dependencies: circularDependencies,
    };
}
/**
 * Detect circular dependencies in dependency graph using DFS
 */
function detectCircularDependencies(nodes, edges) {
    // Build adjacency list
    const graph = {};
    for (const edge of edges) {
        const fromId = edge.from_artifact_id;
        const toId = edge.to_artifact_id;
        if (!graph[toId]) {
            graph[toId] = [];
        }
        graph[toId].push(fromId); // Reverse: to depends on from
    }
    // DFS to detect cycles
    const visited = new Set();
    const recStack = new Set();
    const circularArtifacts = new Set();
    function dfs(artifactId, path) {
        if (recStack.has(artifactId)) {
            // Cycle detected - mark all artifacts in cycle
            const cycleStart = path.indexOf(artifactId);
            const cycleArtifacts = path.slice(cycleStart).concat(artifactId);
            cycleArtifacts.forEach(id => circularArtifacts.add(id));
            return true;
        }
        if (visited.has(artifactId)) {
            return false;
        }
        visited.add(artifactId);
        recStack.add(artifactId);
        path.push(artifactId);
        // Visit dependencies
        const deps = graph[artifactId] || [];
        for (const depId of deps) {
            dfs(depId, path);
        }
        recStack.delete(artifactId);
        path.pop();
        return false;
    }
    // Run DFS on all nodes
    for (const node of nodes) {
        const artifactId = node.artifact_id;
        if (!visited.has(artifactId)) {
            dfs(artifactId, []);
        }
    }
    return Array.from(circularArtifacts);
}
/**
 * Recursively trace all artifacts that fed into this artifact
 */
export async function getArtifactLineage(artifactId, jobId) {
    // Build dependency graph
    const graph = await buildDependencyGraph(jobId);
    // Build reverse adjacency list (what depends on what)
    const reverseGraph = {};
    for (const edge of graph.edges) {
        const fromId = edge.from_artifact_id;
        const toId = edge.to_artifact_id;
        if (!reverseGraph[toId]) {
            reverseGraph[toId] = [];
        }
        reverseGraph[toId].push(fromId);
    }
    // Get all artifacts
    const artifactsById = {};
    for (const node of graph.nodes) {
        artifactsById[node.artifact_id] = node;
    }
    // BFS from target artifact to find all ancestors
    const lineage = [];
    const visited = new Set();
    const queue = [artifactId];
    while (queue.length > 0) {
        const currentId = queue.shift();
        if (visited.has(currentId)) {
            continue;
        }
        visited.add(currentId);
        // Add to lineage if it exists
        if (artifactsById[currentId]) {
            const artifact = artifactsById[currentId];
            // Skip artifacts with invalid_dependency status
            if (artifact.status !== 'invalid_dependency') {
                lineage.push(artifact);
            }
        }
        // Add dependencies to queue
        const deps = reverseGraph[currentId] || [];
        for (const depId of deps) {
            if (!visited.has(depId)) {
                queue.push(depId);
            }
        }
    }
    // Reverse lineage to get root-to-target order
    return lineage.reverse();
}
/**
 * Find all artifacts that depend on this artifact (reverse dependency lookup)
 */
export async function getArtifactDescendants(artifactId, jobId) {
    // Build dependency graph
    const graph = await buildDependencyGraph(jobId);
    // Build forward adjacency list
    const forwardGraph = {};
    for (const edge of graph.edges) {
        const fromId = edge.from_artifact_id;
        const toId = edge.to_artifact_id;
        if (!forwardGraph[fromId]) {
            forwardGraph[fromId] = [];
        }
        forwardGraph[fromId].push(toId);
    }
    // Get all artifacts
    const artifactsById = {};
    for (const node of graph.nodes) {
        artifactsById[node.artifact_id] = node;
    }
    // BFS from source artifact to find all descendants
    const descendants = [];
    const visited = new Set();
    const queue = [artifactId];
    while (queue.length > 0) {
        const currentId = queue.shift();
        if (visited.has(currentId)) {
            continue;
        }
        visited.add(currentId);
        // Add to descendants if it exists and is not the source
        if (artifactsById[currentId] && currentId !== artifactId) {
            const artifact = artifactsById[currentId];
            // Skip artifacts with invalid_dependency status
            if (artifact.status !== 'invalid_dependency') {
                descendants.push(artifact);
            }
        }
        // Add dependents to queue
        const dependents = forwardGraph[currentId] || [];
        for (const dependentId of dependents) {
            if (!visited.has(dependentId)) {
                queue.push(dependentId);
            }
        }
    }
    return descendants;
}
//# sourceMappingURL=dependency_graph.js.map