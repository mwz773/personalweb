import { supabase } from './supabase'

export type NodeType = 'reflection' | 'project' | 'article' | 'book' | 'music'
export type NodeStatus = 'draft' | 'published'
export type RelationshipType = 'related_to' | 'inspired_by' | 'extends'

export type PortfolioNode = {
  id: string
  slug: string
  type: NodeType
  title: string
  summary: string
  markdown_content: string
  project_url: string | null
  creator: string | null
  source_name: string | null
  source_url: string | null
  published_at: string | null
}

export type OwnerNode = PortfolioNode & {
  status: NodeStatus
  updated_at: string
  embedding_status: 'not_embedded' | 'processing' | 'ready' | 'failed'
  embedding_model: string | null
  last_embedded_at: string | null
  embedding_error: string | null
}

export type NodeInput = {
  type: NodeType
  slug: string
  title: string
  summary: string
  markdown_content: string
  project_url: string
  creator: string
  source_name: string
  source_url: string
  status: NodeStatus
}

export type NodeLink = {
  id: string
  source_node_id: string
  target_node_id: string
  relationship_type: RelationshipType
}

const publicNodeFields =
  'id, slug, type, title, summary, markdown_content, project_url, creator, source_name, source_url, published_at'
const ownerNodeFields = `${publicNodeFields}, status, updated_at, embedding_status, embedding_model, last_embedded_at, embedding_error`

export function publicPath(node: Pick<PortfolioNode, 'type' | 'slug'>): string {
  const prefixes: Record<NodeType, string> = {
    reflection: 'reflections',
    project: 'projects',
    article: 'articles',
    book: 'books',
    music: 'music',
  }
  return `/${prefixes[node.type]}/${node.slug}`
}

export function nodeTypeLabel(type: NodeType): string {
  return {
    reflection: 'Reflection',
    project: 'Project',
    article: 'Article',
    book: 'Book',
    music: 'Music',
  }[type]
}

export function relationshipLabel(type: RelationshipType): string {
  return {
    related_to: 'Related to',
    inspired_by: 'Inspired by',
    extends: 'Extends',
  }[type]
}

export async function getPublishedNodes(): Promise<PortfolioNode[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('nodes')
    .select(publicNodeFields)
    .eq('status', 'published')
    .in('type', ['reflection', 'project', 'article', 'book', 'music'])
    .order('published_at', { ascending: false })

  if (error) throw error
  return data as PortfolioNode[]
}

export async function getPublishedNode(
  type: NodeType,
  slug: string,
): Promise<PortfolioNode | null> {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('nodes')
    .select(publicNodeFields)
    .eq('slug', slug)
    .eq('type', type)
    .eq('status', 'published')
    .maybeSingle()

  if (error) throw error
  return data as PortfolioNode | null
}

export async function getOwnerNodes(): Promise<OwnerNode[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('nodes')
    .select(ownerNodeFields)
    .in('type', ['reflection', 'project', 'article', 'book', 'music'])
    .order('updated_at', { ascending: false })

  if (error) throw error
  return data as OwnerNode[]
}

export async function createNode(input: NodeInput): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { error } = await supabase.from('nodes').insert({
    ...input,
    project_url: input.type === 'project' ? input.project_url || null : null,
    creator: input.creator || null,
    source_name: input.source_name || null,
    source_url: input.source_url || null,
    published_at: input.status === 'published' ? new Date().toISOString() : null,
  })

  if (error) throw error
}

export async function updateNode(
  id: string,
  input: NodeInput,
  existingPublishedAt: string | null,
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { error } = await supabase
    .from('nodes')
    .update({
      ...input,
      project_url: input.type === 'project' ? input.project_url || null : null,
      creator: input.creator || null,
      source_name: input.source_name || null,
      source_url: input.source_url || null,
      published_at:
        input.status === 'published'
          ? (existingPublishedAt ?? new Date().toISOString())
          : null,
    })
    .eq('id', id)

  if (error) throw error
}

export async function deleteNode(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { error } = await supabase.from('nodes').delete().eq('id', id)
  if (error) throw error
}

export async function getOwnerLinks(): Promise<NodeLink[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('node_links')
    .select('id, source_node_id, target_node_id, relationship_type')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as NodeLink[]
}

export async function getPublishedRelatedNodes(
  nodeId: string,
): Promise<Array<{ link: NodeLink; node: PortfolioNode }>> {
  if (!supabase) return []

  const { data: links, error: linksError } = await supabase
    .from('node_links')
    .select('id, source_node_id, target_node_id, relationship_type')
    .or(`source_node_id.eq.${nodeId},target_node_id.eq.${nodeId}`)

  if (linksError) throw linksError
  if (!links?.length) return []

  const relatedIds = links.map((link) =>
    link.source_node_id === nodeId ? link.target_node_id : link.source_node_id,
  )
  const { data: nodes, error: nodesError } = await supabase
    .from('nodes')
    .select(publicNodeFields)
    .in('id', relatedIds)
    .eq('status', 'published')

  if (nodesError) throw nodesError

  const byId = new Map((nodes as PortfolioNode[]).map((node) => [node.id, node]))
  return links.flatMap((link) => {
    const relatedId = link.source_node_id === nodeId ? link.target_node_id : link.source_node_id
    const node = byId.get(relatedId)
    return node ? [{ link: link as NodeLink, node }] : []
  })
}

export async function createNodeLink(
  sourceNodeId: string,
  targetNodeId: string,
  relationshipType: RelationshipType,
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { error } = await supabase.from('node_links').insert({
    source_node_id: sourceNodeId,
    target_node_id: targetNodeId,
    relationship_type: relationshipType,
  })

  if (error) throw error
}

export async function deleteNodeLink(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { error } = await supabase.from('node_links').delete().eq('id', id)
  if (error) throw error
}
