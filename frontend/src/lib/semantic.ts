import { supabase } from './supabase'
import type { RelationshipType } from './nodes'
import type { NodeType } from './nodes'

const semanticApiUrl = import.meta.env.VITE_SEMANTIC_API_URL?.replace(/\/$/, '')

export const isSemanticApiConfigured = Boolean(semanticApiUrl)

async function getAccessToken(): Promise<string> {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) {
    throw new Error('Sign in again before using semantic tools.')
  }

  return data.session.access_token
}

async function callSemanticService<T>(path: string): Promise<T> {
  if (!semanticApiUrl || !supabase) {
    throw new Error('Start the FastAPI semantic service and set VITE_SEMANTIC_API_URL first.')
  }

  const response = await fetch(`${semanticApiUrl}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await getAccessToken()}` },
  })

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null)
    const detail = typeof payload === 'object' && payload !== null && 'detail' in payload && typeof payload.detail === 'string'
      ? payload.detail
      : 'The semantic service could not embed this item.'
    throw new Error(detail)
  }

  return response.json() as Promise<T>
}

export async function embedNode(nodeId: string): Promise<void> {
  await callSemanticService(`/admin/nodes/${nodeId}/embed`)
}

export async function generateSuggestions(nodeId: string): Promise<{ suggestion_count: number }> {
  return callSemanticService(`/admin/nodes/${nodeId}/suggestions`)
}

export type PublicSemanticSearchResult = {
  id: string
  slug: string
  type: NodeType
  title: string
  summary: string
  excerpt: string
}

export async function searchPublishedContent(
  query: string,
  types: NodeType[],
): Promise<PublicSemanticSearchResult[]> {
  if (!semanticApiUrl) {
    throw new Error('Semantic search is not available right now.')
  }

  const response = await fetch(`${semanticApiUrl}/public/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, types }),
  })
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null)
    const detail = typeof payload === 'object' && payload !== null && 'detail' in payload && typeof payload.detail === 'string'
      ? payload.detail
      : 'Semantic search is unavailable right now.'
    throw new Error(detail)
  }

  const payload = await response.json() as { results?: PublicSemanticSearchResult[] }
  return payload.results ?? []
}

export type SemanticSuggestion = {
  id: string
  target_node_id: string
  source_block_id: string | null
  target_block_id: string | null
  relationship_type: RelationshipType
  confidence_score: number | null
  target_title: string | null
  target_type: NodeType | null
  source_excerpt: string | null
  target_excerpt: string | null
}

export async function getSuggestionsForNode(nodeId: string): Promise<SemanticSuggestion[]> {
  if (!supabase) return []

  const { data: edges, error: edgesError } = await supabase
    .from('edges')
    .select('id, target_node_id, source_block_id, target_block_id, relationship_type, confidence_score')
    .eq('source_node_id', nodeId)
    .eq('status', 'suggested')
    .order('confidence_score', { ascending: false })

  if (edgesError) throw edgesError
  if (!edges?.length) return []

  const targetIds = edges.map((edge) => edge.target_node_id)
  const { data: targetNodes, error: targetNodesError } = await supabase
    .from('nodes')
    .select('id, title, type')
    .in('id', targetIds)

  if (targetNodesError) throw targetNodesError
  const targetById = new Map((targetNodes ?? []).map((node) => [node.id, node]))

  const blockIds = edges.flatMap((edge) => [edge.source_block_id, edge.target_block_id]).filter((id): id is string => Boolean(id))
  const { data: blocks, error: blocksError } = await supabase
    .from('blocks')
    .select('id, content')
    .in('id', blockIds)

  if (blocksError) throw blocksError
  const excerptById = new Map((blocks ?? []).map((block) => [block.id, block.content]))

  return edges.map((edge) => ({
    ...edge,
    relationship_type: edge.relationship_type as RelationshipType,
    target_title: targetById.get(edge.target_node_id)?.title ?? null,
    target_type: (targetById.get(edge.target_node_id)?.type as NodeType | undefined) ?? null,
    source_excerpt: edge.source_block_id ? (excerptById.get(edge.source_block_id) ?? null) : null,
    target_excerpt: edge.target_block_id ? (excerptById.get(edge.target_block_id) ?? null) : null,
  }))
}

export async function reviewSuggestion(
  edgeId: string,
  status: 'accepted' | 'dismissed',
  relationshipType?: RelationshipType,
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { error } = await supabase
    .from('edges')
    .update({
      status,
      relationship_type: relationshipType,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', edgeId)

  if (error) throw error
}
