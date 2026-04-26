import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { executeGraphQuery } from "@chris-test/graph";
import { readJsonFile, resolveGraphConfigPath, resolveFideContext } from "../../project/config/fide-dir.js";

type GraphTarget =
  { type: "sqlite"; key: string | null; file: string };

type SameAsEdge = {
  statement_fingerprint: string;
  entity_type: string;
  from_node_key: string;
  to_node_key: string;
  created_at: string | null;
};

type IdentityResolutionDecision = {
  statementFingerprint: string;
  decision: "accepted" | "rejected" | "needs_review";
  score?: number | null;
  reasonCode?: string | null;
  evaluator?: string | null;
};

type IdentityResolutionHookInput = {
  graphKey: string;
  graphStoreType: "sqlite";
  edges: SameAsEdge[];
};

type IdentityResolutionHook = (
  input: IdentityResolutionHookInput,
) => Promise<IdentityResolutionDecision[]> | IdentityResolutionDecision[];

type ProjectionRefreshResult = {
  evaluatedEdgeCount: number;
  acceptedEdgeCount: number;
  rejectedEdgeCount: number;
  needsReviewEdgeCount: number;
  evaluator: string;
};

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlNullableLiteral(value: string | null | undefined): string {
  return value == null ? "NULL" : sqlLiteral(value);
}

function sqlNullableNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "NULL";
  return String(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function listSameAsEdges(target: GraphTarget): Promise<SameAsEdge[]> {
  const result = await executeGraphQuery({
    target,
    sql: `
      SELECT
        s.statement_fingerprint,
        s.subject_type AS entity_type,
        s.subject_type || '|' || s.subject_reference_type || '|' || s.subject_fingerprint AS from_node_key,
        s.object_type || '|' || s.object_reference_type || '|' || s.object_fingerprint AS to_node_key,
        s.created_at
      FROM statements s
      JOIN reference_identifiers pred
        ON pred.identifier_fingerprint = s.property_fingerprint
      WHERE pred.reference_identifier = 'https://www.w3.org/2002/07/owl#sameAs'
        AND s.subject_type = s.object_type
        AND s.subject_type <> '00'
    `,
  });
  return (result.rows as Array<Record<string, unknown>>)
    .map((row) => ({
      statement_fingerprint: String(row.statement_fingerprint ?? ""),
      entity_type: String(row.entity_type ?? ""),
      from_node_key: String(row.from_node_key ?? ""),
      to_node_key: String(row.to_node_key ?? ""),
      created_at: typeof row.created_at === "string" ? row.created_at : null,
    }))
    .filter((row) => row.statement_fingerprint.length > 0 && row.entity_type.length > 0);
}

async function loadResolutionHook(graphKey: string): Promise<{ hook: IdentityResolutionHook | null; evaluator: string }> {
  const configPath = resolveGraphConfigPath(graphKey);
  const config = readJsonFile<Record<string, unknown>>(configPath);
  const resolution = isObject(config?.resolution) ? config.resolution : null;
  const hookPathValue = resolution && typeof resolution.hook === "string" ? resolution.hook.trim() : "";
  if (!hookPathValue) {
    return { hook: null, evaluator: "default_accept_all_sameAs_v1" };
  }
  const fide = resolveFideContext(process.cwd());
  const resolvedHookPath = hookPathValue.startsWith("/")
    ? hookPathValue
    : resolve(fide.root, hookPathValue);
  const mod = await import(pathToFileURL(resolvedHookPath).href);
  const exported = mod.evaluateIdentityLinks ?? mod.default;
  if (typeof exported !== "function") {
    throw new Error(
      `Invalid resolution hook at ${resolvedHookPath}. Export default or named "evaluateIdentityLinks" function.`,
    );
  }
  return {
    hook: exported as IdentityResolutionHook,
    evaluator: `hook:${resolvedHookPath}`,
  };
}

function buildDefaultDecisions(edges: SameAsEdge[], evaluator: string): IdentityResolutionDecision[] {
  return edges.map((edge) => ({
    statementFingerprint: edge.statement_fingerprint,
    decision: "accepted",
    score: 1,
    reasonCode: "default_accept_all_sameAs",
    evaluator,
  }));
}

function coerceDecisions(
  edges: SameAsEdge[],
  decisions: IdentityResolutionDecision[],
  fallbackEvaluator: string,
): IdentityResolutionDecision[] {
  const edgeSet = new Set(edges.map((edge) => edge.statement_fingerprint));
  const byStatement = new Map<string, IdentityResolutionDecision>();
  for (const decision of decisions) {
    if (!edgeSet.has(decision.statementFingerprint)) continue;
    if (decision.decision !== "accepted" && decision.decision !== "rejected" && decision.decision !== "needs_review") {
      continue;
    }
    byStatement.set(decision.statementFingerprint, {
      statementFingerprint: decision.statementFingerprint,
      decision: decision.decision,
      score: decision.score ?? null,
      reasonCode: decision.reasonCode ?? null,
      evaluator: decision.evaluator ?? fallbackEvaluator,
    });
  }
  for (const edge of edges) {
    if (byStatement.has(edge.statement_fingerprint)) continue;
    byStatement.set(edge.statement_fingerprint, {
      statementFingerprint: edge.statement_fingerprint,
      decision: "rejected",
      score: null,
      reasonCode: "missing_hook_decision",
      evaluator: fallbackEvaluator,
    });
  }
  return [...byStatement.values()];
}

async function refreshProjectionTables(target: GraphTarget, _acceptedEdges: SameAsEdge[]): Promise<void> {
  await executeGraphQuery({
    target,
    sql: `
      CREATE TABLE IF NOT EXISTS resolved_entity_anchor_members (
        anchor_statement_fingerprint TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        member_fingerprint TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (anchor_statement_fingerprint, entity_type, member_fingerprint)
      );
      CREATE TABLE IF NOT EXISTS resolved_entity_anchors (
        anchor_statement_fingerprint TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        display_name TEXT NULL,
        member_count INTEGER NOT NULL,
        same_as_neighbor_count INTEGER NOT NULL,
        statement_count INTEGER NOT NULL,
        root_count INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_resolved_entity_anchor_members_anchor
        ON resolved_entity_anchor_members(anchor_statement_fingerprint);
      CREATE INDEX IF NOT EXISTS idx_resolved_entity_anchor_members_entity
        ON resolved_entity_anchor_members(entity_type, member_fingerprint);
      CREATE INDEX IF NOT EXISTS idx_resolved_entity_anchors_entity_type
        ON resolved_entity_anchors(entity_type);

      CREATE TEMP TABLE _next_resolved_entity_anchor_members AS
      WITH RECURSIVE
      raw_nodes AS (
        SELECT DISTINCT
          s.subject_type AS entity_type,
          s.subject_reference_type AS entity_reference_type,
          s.subject_fingerprint AS entity_fingerprint,
          s.subject_type || '|' || s.subject_reference_type || '|' || s.subject_fingerprint AS node_key
        FROM statements s
        WHERE s.subject_type <> '00'
        UNION
        SELECT DISTINCT
          s.object_type AS entity_type,
          s.object_reference_type AS entity_reference_type,
          s.object_fingerprint AS entity_fingerprint,
          s.object_type || '|' || s.object_reference_type || '|' || s.object_fingerprint AS node_key
        FROM statements s
        WHERE s.object_type <> '00'
      ),
      accepted_edges AS (
        SELECT DISTINCT
          s.subject_type AS entity_type,
          s.statement_fingerprint AS anchor_statement_fingerprint,
          s.subject_type || '|' || s.subject_reference_type || '|' || s.subject_fingerprint AS from_node_key,
          s.object_type || '|' || s.object_reference_type || '|' || s.object_fingerprint AS to_node_key
        FROM statements s
        JOIN identity_link_evaluations e
          ON e.statement_fingerprint = s.statement_fingerprint
        WHERE e.decision = 'accepted'
      ),
      component_edges AS (
        SELECT entity_type, from_node_key, to_node_key FROM accepted_edges
        UNION
        SELECT entity_type, to_node_key AS from_node_key, from_node_key AS to_node_key FROM accepted_edges
      ),
      component_reachability(root_node_key, node_key, entity_type) AS (
        SELECT node_key, node_key, entity_type FROM raw_nodes
        UNION
        SELECT
          r.root_node_key,
          e.to_node_key,
          r.entity_type
        FROM component_reachability r
        JOIN component_edges e
          ON e.entity_type = r.entity_type
         AND e.from_node_key = r.node_key
      ),
      component_members AS (
        SELECT
          n.entity_type,
          n.entity_fingerprint AS member_fingerprint,
          n.node_key,
          MIN(r.root_node_key) AS component_root_node_key
        FROM raw_nodes n
        JOIN component_reachability r
          ON r.node_key = n.node_key
         AND r.entity_type = n.entity_type
        GROUP BY n.entity_type, n.entity_fingerprint, n.node_key
      ),
      component_anchors AS (
        SELECT
          cm_from.component_root_node_key,
          cm_from.entity_type,
          MIN(ae.anchor_statement_fingerprint) AS anchor_statement_fingerprint
        FROM accepted_edges ae
        JOIN component_members cm_from
          ON cm_from.node_key = ae.from_node_key
         AND cm_from.entity_type = ae.entity_type
        JOIN component_members cm_to
          ON cm_to.node_key = ae.to_node_key
         AND cm_to.entity_type = ae.entity_type
        WHERE cm_from.component_root_node_key = cm_to.component_root_node_key
        GROUP BY cm_from.component_root_node_key, cm_from.entity_type
      )
      SELECT
        ca.anchor_statement_fingerprint,
        cm.entity_type,
        cm.member_fingerprint,
        CURRENT_TIMESTAMP AS updated_at
      FROM component_members cm
      JOIN component_anchors ca
        ON ca.component_root_node_key = cm.component_root_node_key
       AND ca.entity_type = cm.entity_type
      ;

      CREATE TEMP TABLE _next_resolved_entity_anchors AS
      WITH
      -- Shared member->statement mapping used by multiple aggregates.
      -- Keep an eye on this: if it becomes a hotspot at scale, we may remove
      -- this inline aggregation and move to precomputed incremental facts.
      anchor_statement_facts AS (
        SELECT DISTINCT
          m.anchor_statement_fingerprint,
          s.statement_fingerprint
        FROM _next_resolved_entity_anchor_members m
        JOIN statements s
          ON (
            s.subject_type = m.entity_type
            AND s.subject_fingerprint = m.member_fingerprint
          )
          OR (
            s.object_type = m.entity_type
            AND s.object_fingerprint = m.member_fingerprint
          )
      ),
      names AS (
        SELECT
          m.anchor_statement_fingerprint,
          ri.reference_identifier AS display_name,
          ROW_NUMBER() OVER (
            PARTITION BY m.anchor_statement_fingerprint
            ORDER BY s.created_at ASC, ri.reference_identifier ASC
          ) AS rn
        FROM _next_resolved_entity_anchor_members m
        JOIN statements s
          ON s.subject_type = m.entity_type
         AND s.subject_fingerprint = m.member_fingerprint
        JOIN reference_identifiers pred
          ON pred.identifier_fingerprint = s.property_fingerprint
        JOIN reference_identifiers ri
          ON ri.identifier_fingerprint = s.object_fingerprint
        WHERE pred.reference_identifier = 'https://schema.org/name'
          AND s.object_type = 'a0'
          AND s.object_reference_type = 'a0'
      ),
      statement_counts AS (
        SELECT
          anchor_statement_fingerprint,
          COUNT(*) AS statement_count
        FROM anchor_statement_facts
        GROUP BY anchor_statement_fingerprint
      ),
      root_counts AS (
        SELECT
          f.anchor_statement_fingerprint,
          COUNT(DISTINCT sb.batch_root) AS root_count
        FROM anchor_statement_facts f
        LEFT JOIN statement_batches sb
          ON sb.statement_fingerprint = f.statement_fingerprint
        GROUP BY f.anchor_statement_fingerprint
      ),
      member_counts AS (
        SELECT anchor_statement_fingerprint, COUNT(*) AS member_count
        FROM _next_resolved_entity_anchor_members
        GROUP BY anchor_statement_fingerprint
      )
      SELECT
        p.anchor_statement_fingerprint,
        p.entity_type,
        n.display_name AS display_name,
        COALESCE(mc.member_count, 0) AS member_count,
        CASE WHEN COALESCE(mc.member_count, 0) > 0 THEN COALESCE(mc.member_count, 0) - 1 ELSE 0 END AS same_as_neighbor_count,
        COALESCE(sc.statement_count, 0) AS statement_count,
        COALESCE(rc.root_count, 0) AS root_count,
        CURRENT_TIMESTAMP AS updated_at
      FROM _next_resolved_entity_anchor_members p
      LEFT JOIN names n
        ON n.anchor_statement_fingerprint = p.anchor_statement_fingerprint
       AND n.rn = 1
      LEFT JOIN member_counts mc
        ON mc.anchor_statement_fingerprint = p.anchor_statement_fingerprint
      LEFT JOIN statement_counts sc
        ON sc.anchor_statement_fingerprint = p.anchor_statement_fingerprint
      LEFT JOIN root_counts rc
        ON rc.anchor_statement_fingerprint = p.anchor_statement_fingerprint
      GROUP BY p.anchor_statement_fingerprint, p.entity_type, n.display_name, mc.member_count, sc.statement_count, rc.root_count;

      DELETE FROM resolved_entity_anchor_members
      WHERE EXISTS (
        SELECT 1
        FROM _next_resolved_entity_anchor_members n
        WHERE n.anchor_statement_fingerprint = resolved_entity_anchor_members.anchor_statement_fingerprint
          AND n.entity_type = resolved_entity_anchor_members.entity_type
          AND n.member_fingerprint = resolved_entity_anchor_members.member_fingerprint
      );

      INSERT INTO resolved_entity_anchor_members (
        anchor_statement_fingerprint,
        entity_type,
        member_fingerprint,
        updated_at
      )
      SELECT
        anchor_statement_fingerprint,
        entity_type,
        member_fingerprint,
        updated_at
      FROM _next_resolved_entity_anchor_members;

      DELETE FROM resolved_entity_anchor_members
      WHERE NOT EXISTS (
        SELECT 1
        FROM _next_resolved_entity_anchor_members n
        WHERE n.anchor_statement_fingerprint = resolved_entity_anchor_members.anchor_statement_fingerprint
          AND n.entity_type = resolved_entity_anchor_members.entity_type
          AND n.member_fingerprint = resolved_entity_anchor_members.member_fingerprint
      );

      DELETE FROM resolved_entity_anchors
      WHERE EXISTS (
        SELECT 1
        FROM _next_resolved_entity_anchors n
        WHERE n.anchor_statement_fingerprint = resolved_entity_anchors.anchor_statement_fingerprint
      );

      INSERT INTO resolved_entity_anchors (
        anchor_statement_fingerprint,
        entity_type,
        display_name,
        member_count,
        same_as_neighbor_count,
        statement_count,
        root_count,
        updated_at
      )
      SELECT
        anchor_statement_fingerprint,
        entity_type,
        display_name,
        member_count,
        same_as_neighbor_count,
        statement_count,
        root_count,
        updated_at
      FROM _next_resolved_entity_anchors;

      DELETE FROM resolved_entity_anchors
      WHERE NOT EXISTS (
        SELECT 1
        FROM _next_resolved_entity_anchors n
        WHERE n.anchor_statement_fingerprint = resolved_entity_anchors.anchor_statement_fingerprint
      );

      DROP TABLE _next_resolved_entity_anchor_members;
      DROP TABLE _next_resolved_entity_anchors;
    `,
  });
}


export async function refreshResolvedEntityProfiles(input: {
  graphKey: string;
  target: GraphTarget;
}): Promise<ProjectionRefreshResult> {
  const edges = await listSameAsEdges(input.target);
  const hookInfo = await loadResolutionHook(input.graphKey);
  const rawDecisions = hookInfo.hook
    ? await hookInfo.hook({
      graphKey: input.graphKey,
      graphStoreType: input.target.type,
      edges,
    })
    : buildDefaultDecisions(edges, hookInfo.evaluator);
  const decisions = coerceDecisions(edges, rawDecisions, hookInfo.evaluator);

  await executeGraphQuery({
    target: input.target,
    sql: `
      CREATE TABLE IF NOT EXISTS identity_link_evaluations (
        statement_fingerprint TEXT PRIMARY KEY,
        decision TEXT NOT NULL,
        score REAL NULL,
        reason_code TEXT NULL,
        evaluator TEXT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  });
  await executeGraphQuery({
    target: input.target,
    sql: `
      CREATE INDEX IF NOT EXISTS idx_identity_link_evaluations_decision
        ON identity_link_evaluations(decision);
    `,
  });
  if (decisions.length > 0) {
    const keepList = decisions
      .map((decision) => sqlLiteral(decision.statementFingerprint))
      .join(", ");
    await executeGraphQuery({
      target: input.target,
      sql: `
        DELETE FROM identity_link_evaluations
        WHERE statement_fingerprint IN (${keepList});
      `,
    });
    const values = decisions
      .map((decision) => `(
        ${sqlLiteral(decision.statementFingerprint)},
        ${sqlLiteral(decision.decision)},
        ${sqlNullableNumber(decision.score ?? null)},
        ${sqlNullableLiteral(decision.reasonCode ?? null)},
        ${sqlNullableLiteral(decision.evaluator ?? null)},
        CURRENT_TIMESTAMP
      )`.replace(/\s+/g, " ").trim())
      .join(",\n");
    await executeGraphQuery({
      target: input.target,
      sql: `
        INSERT INTO identity_link_evaluations (
          statement_fingerprint,
          decision,
          score,
          reason_code,
          evaluator,
          updated_at
        )
        VALUES ${values};
      `,
    });
    await executeGraphQuery({
      target: input.target,
      sql: `
        DELETE FROM identity_link_evaluations
        WHERE statement_fingerprint NOT IN (${keepList});
      `,
    });
  } else {
    await executeGraphQuery({
      target: input.target,
      sql: `DELETE FROM identity_link_evaluations;`,
    });
  }

  const acceptedFingerprintSet = new Set(
    decisions
      .filter((decision) => decision.decision === "accepted")
      .map((decision) => decision.statementFingerprint),
  );
  const acceptedEdges = edges.filter((edge) => acceptedFingerprintSet.has(edge.statement_fingerprint));

  await refreshProjectionTables(input.target, acceptedEdges);

  return {
    evaluatedEdgeCount: decisions.length,
    acceptedEdgeCount: decisions.filter((decision) => decision.decision === "accepted").length,
    rejectedEdgeCount: decisions.filter((decision) => decision.decision === "rejected").length,
    needsReviewEdgeCount: decisions.filter((decision) => decision.decision === "needs_review").length,
    evaluator: hookInfo.evaluator,
  };
}

