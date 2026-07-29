import { supabase } from './supabase'

export type NodeType = 'reflection' | 'project' | 'article' | 'book' | 'music' | 'film'
export type NodeStatus = 'draft' | 'published'
export type RelationshipType = 'related_to' | 'inspired_by' | 'cites' | 'extends' | 'contrasts_with'

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
  location_name: string | null
  cover_image_path: string | null
  external_source: string | null
  external_id: string | null
  media_metadata: Record<string, unknown>
  tags: string[]
  published_at: string | null
}

export type NodeMedia = {
  id: string
  node_id: string
  storage_path: string
  alt_text: string
  ordinal: number
  created_at: string
}

export type LetterboxdFilmImport = {
  title: string
  year: string
  letterboxdUrl: string
  review: string
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
  location_name: string
  status: NodeStatus
}

export type NodeLink = {
  id: string
  source_node_id: string
  target_node_id: string
  relationship_type: RelationshipType
}

export type PublicGraph = {
  nodes: PortfolioNode[]
  links: NodeLink[]
}

const publicNodeFields =
  'id, slug, type, title, summary, markdown_content, project_url, creator, source_name, source_url, location_name, cover_image_path, external_source, external_id, media_metadata, tags, published_at'
const publicNodeListFields =
  'id, slug, type, title, summary, project_url, creator, source_name, source_url, location_name, cover_image_path, external_source, external_id, media_metadata, tags, published_at'
const ownerNodeFields = `${publicNodeFields}, status, updated_at, embedding_status, embedding_model, last_embedded_at, embedding_error`

export function publicPath(node: Pick<PortfolioNode, 'type' | 'slug'>): string {
  const prefixes: Record<NodeType, string> = {
    reflection: 'reflections',
    project: 'projects',
    article: 'articles',
    book: 'books',
    music: 'music',
    film: 'films',
  }
  return `/${prefixes[node.type]}/${node.slug}`
}

export function nodeTypeLabel(type: NodeType): string {
  return {
    reflection: 'Journal',
    project: 'Project',
    article: 'Article',
    book: 'Book',
    music: 'Music',
    film: 'Film',
  }[type]
}

export function relationshipLabel(type: RelationshipType): string {
  return {
    related_to: 'Related to',
    inspired_by: 'Inspired by',
    cites: 'Cites',
    extends: 'Extends',
    contrasts_with: 'Contrasts with',
  }[type]
}

export async function getPublishedNodes(): Promise<PortfolioNode[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('nodes')
    .select(publicNodeListFields)
    .eq('status', 'published')
    .in('type', ['reflection', 'project', 'article', 'book', 'music', 'film'])
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
    .in('type', ['reflection', 'project', 'article', 'book', 'music', 'film'])
    .order('updated_at', { ascending: false })

  if (error) throw error
  return data as OwnerNode[]
}

export async function createNode(input: NodeInput): Promise<OwnerNode> {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { data, error } = await supabase.from('nodes').insert({
      ...input,
      project_url: input.type === 'project' ? input.project_url || null : null,
      creator: input.creator || null,
      source_name: input.source_name || null,
      source_url: input.source_url || null,
      location_name: input.type === 'reflection' ? input.location_name || null : null,
      published_at: input.status === 'published' ? new Date().toISOString() : null,
    })
    .select(ownerNodeFields)
    .single()

  if (error) throw error
  return data as OwnerNode
}

export async function importLetterboxdFilms(
  films: LetterboxdFilmImport[],
  status: NodeStatus,
): Promise<{ imported: number; skipped: number }> {
  if (!supabase) throw new Error('Supabase is not configured.')

  const uniqueFilms = [...new Map(films.map((film) => [film.letterboxdUrl, film])).values()]
  const { data: existing, error: existingError } = await supabase
    .from('nodes')
    .select('external_id')
    .eq('external_source', 'letterboxd')
    .in('external_id', uniqueFilms.map((film) => film.letterboxdUrl))
  if (existingError) throw existingError

  const existingIds = new Set((existing ?? []).map((node) => node.external_id))
  const newFilms = uniqueFilms.filter((film) => !existingIds.has(film.letterboxdUrl))
  const timestamp = new Date().toISOString()
  const rows = newFilms.map((film) => {
    const externalToken = film.letterboxdUrl.split('/').filter(Boolean).pop() ?? crypto.randomUUID()
    const titleSlug = film.title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 90) || 'film'
    return {
      type: 'film',
      slug: `letterboxd-${titleSlug}-${film.year}-${externalToken}`.toLowerCase(),
      title: film.title,
      summary: film.year ? `A ${film.year} film logged on Letterboxd.` : 'A film logged on Letterboxd.',
      markdown_content: film.review || 'Imported from my Letterboxd watch history. A longer reflection is forthcoming.',
      status,
      source_name: 'Letterboxd',
      source_url: film.letterboxdUrl,
      external_source: 'letterboxd',
      external_id: film.letterboxdUrl,
      media_metadata: film.year ? { year: film.year } : {},
      published_at: status === 'published' ? timestamp : null,
    }
  })

  for (let start = 0; start < rows.length; start += 50) {
    const { error } = await supabase.from('nodes').insert(rows.slice(start, start + 50))
    if (error) throw error
  }

  return { imported: rows.length, skipped: uniqueFilms.length - newFilms.length }
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
      location_name: input.type === 'reflection' ? input.location_name || null : null,
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

export async function updateNodeCoverImage(id: string, storagePath: string | null): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { error } = await supabase
    .from('nodes')
    .update({ cover_image_path: storagePath })
    .eq('id', id)

  if (error) throw error
}

export async function getNodeMedia(nodeId: string): Promise<NodeMedia[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('node_media')
    .select('id, node_id, storage_path, alt_text, ordinal, created_at')
    .eq('node_id', nodeId)
    .order('ordinal', { ascending: true })

  if (error) throw error
  return data as NodeMedia[]
}

export async function createNodeMedia(input: Pick<NodeMedia, 'node_id' | 'storage_path' | 'alt_text' | 'ordinal'>): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { error } = await supabase.from('node_media').insert(input)
  if (error) throw error
}

export async function updateNodeMedia(id: string, updates: Partial<Pick<NodeMedia, 'alt_text' | 'ordinal'>>): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { error } = await supabase.from('node_media').update(updates).eq('id', id)
  if (error) throw error
}

export async function deleteNodeMedia(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { error } = await supabase.from('node_media').delete().eq('id', id)
  if (error) throw error
}

export async function uploadPortfolioImage(
  ownerId: string,
  nodeId: string,
  file: File,
): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured.')
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPEG, PNG, or WebP image.')
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Choose an image smaller than 5 MB.')
  }

  const extension = file.name.split('.').pop()?.toLowerCase() || 'image'
  const fileName = `${crypto.randomUUID()}.${extension}`
  const storagePath = `${ownerId}/${nodeId}/${fileName}`
  const { error } = await supabase.storage
    .from('portfolio-media')
    .upload(storagePath, file, { contentType: file.type, upsert: false })

  if (error) throw error
  return storagePath
}

export async function removePortfolioImage(storagePath: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { error } = await supabase.storage.from('portfolio-media').remove([storagePath])
  if (error) throw error
}

export async function getSignedImageUrls(paths: string[]): Promise<Record<string, string>> {
  if (!supabase || !paths.length) return {}

  const cacheKey = 'portfolio-signed-image-urls-v1'
  const cacheLifetimeMs = 55 * 60 * 1000
  const uniquePaths = [...new Set(paths)]
  let cached: Record<string, { url: string; expiresAt: number }> = {}

  try {
    const stored = window.sessionStorage.getItem(cacheKey)
    if (stored) cached = JSON.parse(stored) as Record<string, { url: string; expiresAt: number }>
  } catch {
    cached = {}
  }

  const now = Date.now()
  const validCached = Object.fromEntries(
    Object.entries(cached)
      .filter(([, entry]) => entry.expiresAt > now)
      .map(([path, entry]) => [path, entry.url]),
  )
  const missingPaths = uniquePaths.filter((path) => !validCached[path])

  if (!missingPaths.length) return Object.fromEntries(uniquePaths.map((path) => [path, validCached[path]]))

  const { data, error } = await supabase.storage
    .from('portfolio-media')
    .createSignedUrls(missingPaths, 60 * 60)
  if (error) throw error

  const freshUrls = Object.fromEntries(
    (data ?? [])
      .filter((item) => item.signedUrl)
      .map((item) => [item.path, item.signedUrl]),
  )
  const refreshedCache = {
    ...cached,
    ...Object.fromEntries(Object.entries(freshUrls).map(([path, url]) => [path, { url, expiresAt: now + cacheLifetimeMs }])),
  }

  try {
    window.sessionStorage.setItem(cacheKey, JSON.stringify(refreshedCache))
  } catch {
    // Signed URLs still work when browser storage is unavailable.
  }

  return Object.fromEntries(uniquePaths.map((path) => [path, validCached[path] ?? freshUrls[path]]).filter(([, url]) => Boolean(url)))
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

export async function getPublishedSemanticRelatedNodes(
  nodeId: string,
): Promise<Array<{ link: NodeLink; node: PortfolioNode }>> {
  if (!supabase) return []

  const { data: edges, error: edgesError } = await supabase
    .from('edges')
    .select('id, source_node_id, target_node_id, relationship_type')
    .eq('status', 'accepted')
    .or(`source_node_id.eq.${nodeId},target_node_id.eq.${nodeId}`)

  if (edgesError) throw edgesError
  if (!edges?.length) return []

  const relatedIds = edges.map((edge) =>
    edge.source_node_id === nodeId ? edge.target_node_id : edge.source_node_id,
  )
  const { data: nodes, error: nodesError } = await supabase
    .from('nodes')
    .select(publicNodeFields)
    .in('id', relatedIds)
    .eq('status', 'published')

  if (nodesError) throw nodesError

  const byId = new Map((nodes as PortfolioNode[]).map((node) => [node.id, node]))
  return edges.flatMap((edge) => {
    const relatedId = edge.source_node_id === nodeId ? edge.target_node_id : edge.source_node_id
    const node = byId.get(relatedId)
    return node ? [{ link: edge as NodeLink, node }] : []
  })
}

export async function getPublicGraph(): Promise<PublicGraph> {
  if (!supabase) return { nodes: [], links: [] }

  const [nodesResult, manualLinksResult, semanticEdgesResult] = await Promise.all([
    supabase
      .from('nodes')
      .select(publicNodeListFields)
      .eq('status', 'published')
      .in('type', ['reflection', 'project', 'article', 'book', 'music', 'film'])
      .order('published_at', { ascending: false }),
    supabase
      .from('node_links')
      .select('id, source_node_id, target_node_id, relationship_type'),
    supabase
      .from('edges')
      .select('id, source_node_id, target_node_id, relationship_type')
      .eq('status', 'accepted'),
  ])

  if (nodesResult.error) throw nodesResult.error
  if (manualLinksResult.error) throw manualLinksResult.error
  if (semanticEdgesResult.error) throw semanticEdgesResult.error

  const nodes = (nodesResult.data ?? []) as PortfolioNode[]
  const nodeIds = new Set(nodes.map((node) => node.id))
  const pairIds = new Set<string>()
  const links = [...(semanticEdgesResult.data ?? []), ...(manualLinksResult.data ?? [])]
    .filter((link) => nodeIds.has(link.source_node_id) && nodeIds.has(link.target_node_id))
    .filter((link) => {
      const pairId = [link.source_node_id, link.target_node_id].sort().join(':')
      if (pairIds.has(pairId)) return false
      pairIds.add(pairId)
      return true
    }) as NodeLink[]

  return { nodes, links }
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
