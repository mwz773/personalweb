import { useCallback, useEffect, useState, type FormEvent } from 'react'
import './App.css'
import { getSession, signIn, signOut, type Session } from './lib/auth'
import { readableError } from './lib/errors'
import { embedNode, generateSuggestions, getSuggestionsForNode, isSemanticApiConfigured, reviewSuggestion, type SemanticSuggestion } from './lib/semantic'
import {
  createNode,
  createNodeLink,
  deleteNode,
  deleteNodeLink,
  getOwnerLinks,
  getOwnerNodes,
  getPublishedNode,
  getPublishedNodes,
  getPublishedRelatedNodes,
  nodeTypeLabel,
  publicPath,
  relationshipLabel,
  updateNode,
  type NodeInput,
  type NodeStatus,
  type NodeType,
  type OwnerNode,
  type PortfolioNode,
  type RelationshipType,
} from './lib/nodes'
import { isSupabaseConfigured, supabase } from './lib/supabase'

type LoadState = 'loading' | 'ready' | 'error'
type PublicFilter = 'all' | NodeType

const emptyNode: NodeInput = {
  type: 'reflection',
  slug: '',
  title: '',
  summary: '',
  markdown_content: '',
  project_url: '',
  creator: '',
  source_name: '',
  source_url: '',
  status: 'draft',
}

function formatDate(date: string | null): string {
  if (!date) return 'Recently published'
  return new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(date))
}

function semanticStatusLabel(node: OwnerNode): string {
  if (node.embedding_status === 'ready') {
    return `Semantic: ready${node.embedding_model ? ` · ${node.embedding_model}` : ''}`
  }
  if (node.embedding_status === 'processing') return 'Semantic: processing'
  if (node.embedding_status === 'failed') return 'Semantic: needs attention'
  return 'Semantic: not embedded'
}

function publicRoute(): { type: NodeType; slug: string } | null {
  const match = window.location.pathname.match(/^\/(reflections|projects|articles|books|music)\/([^/]+)\/?$/)
  if (!match) return null
  const types: Record<string, NodeType> = {
    reflections: 'reflection',
    projects: 'project',
    articles: 'article',
    books: 'book',
    music: 'music',
  }
  return { type: types[match[1]], slug: decodeURIComponent(match[2]) }
}

function isAdminPath(): boolean {
  return window.location.pathname === '/admin' || window.location.pathname === '/admin/'
}

function App() {
  return isAdminPath() ? <AdminApp /> : <PublicApp />
}

function PublicApp() {
  const [state, setState] = useState<LoadState>('loading')
  const [nodes, setNodes] = useState<PortfolioNode[]>([])
  const [node, setNode] = useState<PortfolioNode | null>(null)
  const [error, setError] = useState('')
  const route = publicRoute()
  const routeType = route?.type
  const routeSlug = route?.slug

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setState('ready')
      return
    }

    async function loadContent() {
      try {
        if (routeType && routeSlug) setNode(await getPublishedNode(routeType, routeSlug))
        else setNodes(await getPublishedNodes())
        setState('ready')
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'The site could not load its published content.')
        setState('error')
      }
    }
    void loadContent()
  }, [routeSlug, routeType])

  if (!isSupabaseConfigured) return <SetupScreen />
  if (state === 'loading') return <StatusScreen message="Loading published work…" />
  if (state === 'error') return <StatusScreen title="Connection problem" message={error} detail="Check your Supabase configuration and database setup." />
  if (route) return <NodePage node={node} />
  return <HomePage nodes={nodes} />
}

function SiteHeader({ admin = false }: { admin?: boolean }) {
  return <header className="site-header"><a className="wordmark" href="/"><span aria-hidden="true">✦</span> Your Name</a><span className="header-note">{admin ? 'Owner dashboard' : 'A living portfolio'}</span></header>
}

function HomePage({ nodes }: { nodes: PortfolioNode[] }) {
  const [filter, setFilter] = useState<PublicFilter>('all')
  const visibleNodes = filter === 'all' ? nodes : nodes.filter((node) => node.type === filter)

  return (
    <main>
      <SiteHeader />
      <section className="hero" aria-labelledby="intro-heading">
        <p className="eyebrow">Hello, I’m Your Name</p>
        <h1 id="intro-heading">Work, ideas, and the connections between them.</h1>
        <p className="hero-copy">This is a growing record of the questions I’m exploring and the work that shapes how I think.</p>
      </section>
      <section className="content-index" aria-labelledby="content-heading">
        <div className="section-heading"><div><p className="eyebrow">Explore</p><h2 id="content-heading">Work and reflections</h2></div><span>{visibleNodes.length} published</span></div>
        <div className="filter-bar" aria-label="Filter published content">
          {(['all', 'reflection', 'project', 'article', 'book', 'music'] as PublicFilter[]).map((item) => <button className={filter === item ? 'filter-button is-active' : 'filter-button'} key={item} type="button" onClick={() => setFilter(item)}>{item === 'all' ? 'All' : item === 'music' ? 'Music' : `${nodeTypeLabel(item)}s`}</button>)}
        </div>
        {visibleNodes.length ? <NodeCards nodes={visibleNodes} /> : <EmptyContent filter={filter} />}
      </section>
    </main>
  )
}

function NodeCards({ nodes }: { nodes: PortfolioNode[] }) {
  return <div className="card-grid">{nodes.map((node) => <article className="reflection-card" key={node.id}><p className="card-date">{nodeTypeLabel(node.type)} · {formatDate(node.published_at)}</p><h3><a href={publicPath(node)}>{node.title}</a></h3><p>{node.summary}</p><a className="read-link" href={publicPath(node)}>Explore {nodeTypeLabel(node.type).toLowerCase()} <span aria-hidden="true">→</span></a></article>)}</div>
}

function EmptyContent({ filter }: { filter: PublicFilter }) {
  return <div className="empty-state"><p className="eyebrow">Nothing here yet</p><h3>{filter === 'all' ? 'There is no published content yet.' : `No ${filter === 'music' ? 'music' : `${nodeTypeLabel(filter).toLowerCase()}s`} match this filter.`}</h3><p>Published work appears here automatically when it is saved from the owner dashboard.</p></div>
}

function NodePage({ node }: { node: PortfolioNode | null }) {
  const [related, setRelated] = useState<Array<{ link: { id: string; relationship_type: RelationshipType }; node: PortfolioNode }>>([])
  const [linksUnavailable, setLinksUnavailable] = useState(false)
  const nodeId = node?.id

  useEffect(() => {
    if (!nodeId) return
    const currentNodeId = nodeId
    async function loadRelated() {
      try {
        setRelated(await getPublishedRelatedNodes(currentNodeId))
      } catch {
        // This remains true until the owner completes the manual Phase C SQL setup.
        setLinksUnavailable(true)
      }
    }
    void loadRelated()
  }, [nodeId])

  if (!node) return <main><StatusScreen title="Content not found" message="It may still be a draft, or the link may be out of date." detail={<a href="/">Return to the homepage</a>} /></main>

  return (
    <main>
      <SiteHeader />
      <article className="reflection-page">
        <a className="back-link" href="/">← All work and reflections</a>
        <p className="eyebrow">{nodeTypeLabel(node.type)} · {formatDate(node.published_at)}</p>
        <h1>{node.title}</h1>
        <p className="reflection-summary">{node.summary}</p>
        {node.creator || node.source_name ? <p className="source-metadata">{node.creator ? <span>{node.creator}</span> : null}{node.creator && node.source_name ? ' · ' : null}{node.source_name ? <span>{node.source_name}</span> : null}</p> : null}
        {node.type === 'project' && node.project_url ? <a className="project-link" href={node.project_url} target="_blank" rel="noreferrer">Visit project <span aria-hidden="true">↗</span></a> : null}
        {node.type !== 'project' && node.source_url ? <a className="project-link" href={node.source_url} target="_blank" rel="noreferrer">{node.type === 'article' ? 'Read source' : node.type === 'book' ? 'Find book' : 'Listen'} <span aria-hidden="true">↗</span></a> : null}
        <div className="reflection-body">{node.markdown_content}</div>
      </article>
      {!linksUnavailable && related.length ? <section className="related-section" aria-labelledby="related-heading"><p className="eyebrow">Follow the thread</p><h2 id="related-heading">Connected work</h2><div className="related-list">{related.map(({ link, node: relatedNode }) => <article className="related-card" key={link.id}><p>{relationshipLabel(link.relationship_type)}</p><h3><a href={publicPath(relatedNode)}>{relatedNode.title}</a></h3><span>{nodeTypeLabel(relatedNode.type)} · {relatedNode.summary}</span></article>)}</div></section> : null}
    </main>
  )
}

function AdminApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [state, setState] = useState<LoadState>('loading')

  useEffect(() => {
    async function restoreSession() { try { setSession(await getSession()) } finally { setState('ready') } }
    void restoreSession()
    const { data } = supabase?.auth.onAuthStateChange((_event, nextSession) => { setSession(nextSession); setState('ready') }) ?? { data: { subscription: { unsubscribe: () => undefined } } }
    return () => data.subscription.unsubscribe()
  }, [])

  if (!isSupabaseConfigured) return <SetupScreen />
  if (state === 'loading') return <StatusScreen message="Checking your owner session…" />
  return session ? <Dashboard session={session} onSignedOut={() => setSession(null)} /> : <LoginPage onSignedIn={setSession} />
}

function LoginPage({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  async function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(''); setIsSubmitting(true); try { await signIn(email, password); const session = await getSession(); if (!session) throw new Error('Sign-in succeeded, but no session was returned.'); onSignedIn(session) } catch (signInError) { setError(readableError(signInError, 'Could not sign in.')) } finally { setIsSubmitting(false) } }
  return <main className="setup-shell"><form className="setup-card auth-card" onSubmit={handleSubmit}><p className="eyebrow">Private area</p><h1>Owner sign in</h1><p>Use the single owner account created in Supabase. There is intentionally no public sign-up form.</p><label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Sign in'}</button><a className="documentation-link" href="/">Return to the public site</a></form></main>
}

function Dashboard({ session, onSignedOut }: { session: Session; onSignedOut: () => void }) {
  const [state, setState] = useState<LoadState>('loading')
  const [nodes, setNodes] = useState<OwnerNode[]>([])
  const [links, setLinks] = useState<Array<{ id: string; source_node_id: string; target_node_id: string; relationship_type: RelationshipType }>>([])
  const [editing, setEditing] = useState<OwnerNode | null>(null)
  const [error, setError] = useState('')
  const [linksError, setLinksError] = useState('')

  async function loadData() {
    setState('loading')
    try { setNodes(await getOwnerNodes()); setError(''); setState('ready') } catch (loadError) { setError(readableError(loadError, 'Could not load your content.')); setState('error') }
    try { setLinks(await getOwnerLinks()); setLinksError('') } catch { setLinksError('Manual connections become available after you type and run the Phase C database code.') }
  }
  useEffect(() => { void loadData() }, [])
  async function handleSignOut() { await signOut(); onSignedOut() }

  return <main><SiteHeader admin /><section className="dashboard-intro"><div><p className="eyebrow">Signed in as {session.user.email}</p><h1>Write and connect.</h1></div><button className="quiet-button" type="button" onClick={() => void handleSignOut()}>Sign out</button></section><div className="dashboard-grid"><section className="dashboard-list" aria-labelledby="your-content-heading"><div className="section-heading compact-heading"><div><p className="eyebrow">Your content</p><h2 id="your-content-heading">Portfolio</h2></div><button className="quiet-button" type="button" onClick={() => setEditing(null)}>New item</button></div>{state === 'loading' ? <p>Loading your content…</p> : null}{state === 'error' ? <p className="form-error" role="alert">{error}</p> : null}<div className="admin-list">{nodes.map((node) => <button className={`admin-list-item ${editing?.id === node.id ? 'is-selected' : ''}`} key={node.id} type="button" onClick={() => setEditing(node)}><span className={`status-pill ${node.status}`}>{node.status}</span><strong>{node.title}</strong><small>{nodeTypeLabel(node.type)} · Updated {formatDate(node.updated_at)}</small><small className={`semantic-status ${node.embedding_status}`}>{semanticStatusLabel(node)}</small></button>)}</div></section><NodeEditor node={editing} nodes={nodes} links={links} linksError={linksError} onChanged={loadData} /></div></main>
}

function NodeEditor({ node, nodes, links, linksError, onChanged }: { node: OwnerNode | null; nodes: OwnerNode[]; links: Array<{ id: string; source_node_id: string; target_node_id: string; relationship_type: RelationshipType }>; linksError: string; onChanged: () => Promise<void> }) {
  const [form, setForm] = useState<NodeInput>(emptyNode)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setForm(node ? { type: node.type, slug: node.slug, title: node.title, summary: node.summary, markdown_content: node.markdown_content, project_url: node.project_url ?? '', creator: node.creator ?? '', source_name: node.source_name ?? '', source_url: node.source_url ?? '', status: node.status } : emptyNode)
    setError('')
  }, [node])

  function updateField(field: keyof NodeInput, value: string) { setForm((current) => ({ ...current, [field]: value })) }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(''); setIsSaving(true); try { const clean = { ...form, slug: form.slug.trim(), title: form.title.trim(), summary: form.summary.trim(), markdown_content: form.markdown_content.trim(), project_url: form.project_url.trim(), creator: form.creator.trim(), source_name: form.source_name.trim(), source_url: form.source_url.trim() }; if (node) await updateNode(node.id, clean, node.published_at); else await createNode(clean); await onChanged() } catch (saveError) { setError(readableError(saveError, 'Could not save this item.')) } finally { setIsSaving(false) } }
  async function handleDelete() { if (!node || !window.confirm(`Delete “${node.title}”? This cannot be undone.`)) return; try { await deleteNode(node.id); await onChanged() } catch (deleteError) { setError(readableError(deleteError, 'Could not delete this item.')) } }

  const externalType = form.type === 'article' || form.type === 'book' || form.type === 'music'
  const creatorLabel = form.type === 'article' || form.type === 'book' ? 'Author (optional)' : 'Artist or creator (optional)'
  const sourceNameLabel = form.type === 'article' ? 'Publication or site (optional)' : form.type === 'book' ? 'Publisher (optional)' : 'Album, platform, or context (optional)'
  const sourceUrlLabel = form.type === 'article' ? 'Article URL (optional)' : form.type === 'book' ? 'Book URL (optional)' : 'Listening URL (optional)'

  return <section className="editor-panel" aria-labelledby="editor-heading"><p className="eyebrow">{node ? `Edit ${nodeTypeLabel(node.type).toLowerCase()}` : 'New portfolio item'}</p><h2 id="editor-heading">{node ? node.title : 'Start a new piece'}</h2><form className="reflection-form" onSubmit={handleSubmit}><label>Content type<select value={form.type} onChange={(event) => updateField('type', event.target.value)} disabled={Boolean(node)}><option value="reflection">Reflection</option><option value="project">Project</option><option value="article">Article</option><option value="book">Book</option><option value="music">Music</option></select></label><label>Title<input value={form.title} onChange={(event) => updateField('title', event.target.value)} maxLength={160} required /></label><label>Short summary<input value={form.summary} onChange={(event) => updateField('summary', event.target.value)} maxLength={320} required /></label><label>Public URL slug<input value={form.slug} onChange={(event) => updateField('slug', event.target.value)} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" title="Use lowercase words separated by hyphens." required /></label>{form.type === 'project' ? <label>Project URL (optional)<input type="url" value={form.project_url} onChange={(event) => updateField('project_url', event.target.value)} placeholder="https://…" /></label> : null}{externalType ? <><label>{creatorLabel}<input value={form.creator} onChange={(event) => updateField('creator', event.target.value)} /></label><label>{sourceNameLabel}<input value={form.source_name} onChange={(event) => updateField('source_name', event.target.value)} /></label><label>{sourceUrlLabel}<input type="url" value={form.source_url} onChange={(event) => updateField('source_url', event.target.value)} placeholder="https://…" /></label></> : null}<label>{form.type === 'project' ? 'Project write-up' : externalType ? 'Your reflection on this source' : 'Your reflection'}<textarea rows={11} value={form.markdown_content} onChange={(event) => updateField('markdown_content', event.target.value)} required /></label><fieldset><legend>Visibility</legend><label className="radio-label"><input type="radio" checked={form.status === 'draft'} onChange={() => setForm((current) => ({ ...current, status: 'draft' as NodeStatus }))} /> Save as draft</label><label className="radio-label"><input type="radio" checked={form.status === 'published'} onChange={() => setForm((current) => ({ ...current, status: 'published' as NodeStatus }))} /> Publish publicly</label></fieldset>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="editor-actions"><button className="primary-button" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : node ? 'Save changes' : 'Create item'}</button>{node ? <button className="danger-button" type="button" onClick={() => void handleDelete()}>Delete</button> : null}</div></form>{node ? <SemanticPanel node={node} onChanged={onChanged} /> : null}{node ? <ConnectionsEditor node={node} nodes={nodes} links={links} linksError={linksError} onChanged={onChanged} /> : null}</section>
}

function SemanticPanel({ node, onChanged }: { node: OwnerNode; onChanged: () => Promise<void> }) {
  const [isEmbedding, setIsEmbedding] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  async function handleEmbed() { setError(''); setIsEmbedding(true); try { await embedNode(node.id) } catch (embedError) { setError(readableError(embedError, 'Could not embed this item.')) } finally { await onChanged(); setIsEmbedding(false) } }
  async function handleGenerate() { setError(''); setIsGenerating(true); try { await generateSuggestions(node.id); setRevision((current) => current + 1) } catch (suggestionError) { setError(readableError(suggestionError, 'Could not generate suggestions.')) } finally { setIsGenerating(false) } }
  return <section className="semantic-panel" aria-labelledby="semantic-heading"><p className="eyebrow">Semantic status</p><h3 id="semantic-heading">{semanticStatusLabel(node)}</h3>{node.embedding_error ? <p className="form-error" role="alert">{node.embedding_error}</p> : null}{isSemanticApiConfigured ? <div className="editor-actions"><button className="quiet-button" type="button" onClick={() => void handleEmbed()} disabled={isEmbedding}>{isEmbedding ? 'Embedding…' : node.embedding_status === 'ready' ? 'Re-embed this item' : 'Embed this item'}</button><button className="primary-button" type="button" onClick={() => void handleGenerate()} disabled={isGenerating || node.embedding_status !== 'ready'}>{isGenerating ? 'Generating…' : 'Generate suggestions'}</button></div> : <p className="muted-copy">Start the local FastAPI service and set <code>VITE_SEMANTIC_API_URL</code> to enable embedding.</p>}{error ? <p className="form-error" role="alert">{error}</p> : null}<SuggestionsPanel node={node} revision={revision} /></section>
}

function SuggestionsPanel({ node, revision }: { node: OwnerNode; revision: number }) {
  const [suggestions, setSuggestions] = useState<SemanticSuggestion[]>([])
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const loadSuggestions = useCallback(async () => { setIsLoading(true); try { setSuggestions(await getSuggestionsForNode(node.id)); setError('') } catch (loadError) { setError(readableError(loadError, 'Could not load suggestions.')) } finally { setIsLoading(false) } }, [node.id])
  useEffect(() => { void loadSuggestions() }, [loadSuggestions, revision])
  async function review(edgeId: string, status: 'accepted' | 'dismissed', relationshipType?: RelationshipType) { try { await reviewSuggestion(edgeId, status, relationshipType); await loadSuggestions() } catch (reviewError) { setError(readableError(reviewError, 'Could not review this suggestion.')) } }
  return <div className="suggestions-panel"><p className="eyebrow">Suggested connections</p><h3>Review before publishing</h3>{isLoading ? <p className="muted-copy">Loading suggestions…</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}{!isLoading && !suggestions.length ? <p className="muted-copy">Generate suggestions after embedding this item. Only you can see these candidates.</p> : null}<div className="suggestion-list">{suggestions.map((suggestion) => <SuggestionCard key={suggestion.id} suggestion={suggestion} onReview={review} />)}</div></div>
}

function SuggestionCard({ suggestion, onReview }: { suggestion: SemanticSuggestion; onReview: (edgeId: string, status: 'accepted' | 'dismissed', relationshipType?: RelationshipType) => Promise<void> }) {
  const [relationship, setRelationship] = useState<RelationshipType>(suggestion.relationship_type)
  const relevance = suggestion.confidence_score === null ? 'Unscored' : `${Math.round(suggestion.confidence_score * 100)}% relevance`
  return <article className="suggestion-card"><div className="suggestion-heading"><div><span className="status-pill draft">{relevance}</span><h4>{suggestion.target_title ?? 'Unavailable content'}</h4><p>{suggestion.target_type ? nodeTypeLabel(suggestion.target_type) : 'Content item'}</p></div><label>Relationship<select value={relationship} onChange={(event) => setRelationship(event.target.value as RelationshipType)}><option value="related_to">Related to</option><option value="inspired_by">Inspired by</option><option value="cites">Cites</option><option value="extends">Extends</option><option value="contrasts_with">Contrasts with</option></select></label></div><div className="evidence-grid"><p><strong>Your excerpt</strong>{suggestion.source_excerpt ?? 'No stored excerpt'}</p><p><strong>Matching excerpt</strong>{suggestion.target_excerpt ?? 'No stored excerpt'}</p></div><div className="editor-actions"><button className="primary-button" type="button" onClick={() => void onReview(suggestion.id, 'accepted', relationship)}>Accept connection</button><button className="quiet-button" type="button" onClick={() => void onReview(suggestion.id, 'dismissed')}>Dismiss</button></div></article>
}

function ConnectionsEditor({ node, nodes, links, linksError, onChanged }: { node: OwnerNode; nodes: OwnerNode[]; links: Array<{ id: string; source_node_id: string; target_node_id: string; relationship_type: RelationshipType }>; linksError: string; onChanged: () => Promise<void> }) {
  const [targetId, setTargetId] = useState('')
  const [relationship, setRelationship] = useState<RelationshipType>('related_to')
  const [error, setError] = useState('')
  const candidates = nodes.filter((candidate) => candidate.id !== node.id)
  const nodeLinks = links.filter((link) => link.source_node_id === node.id || link.target_node_id === node.id)
  const byId = new Map(nodes.map((item) => [item.id, item]))
  async function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!targetId) return; setError(''); try { await createNodeLink(node.id, targetId, relationship); setTargetId(''); await onChanged() } catch (linkError) { setError(readableError(linkError, 'Could not create this connection.')) } }
  async function removeLink(id: string) { try { await deleteNodeLink(id); await onChanged() } catch (linkError) { setError(readableError(linkError, 'Could not remove this connection.')) } }
  return <section className="connections-editor" aria-labelledby="connections-heading"><p className="eyebrow">Manual connections</p><h3 id="connections-heading">Connect this work</h3>{linksError ? <p className="muted-copy">{linksError}</p> : <><form className="connection-form" onSubmit={handleSubmit}><label>Relationship<select value={relationship} onChange={(event) => setRelationship(event.target.value as RelationshipType)}><option value="related_to">Related to</option><option value="inspired_by">Inspired by</option><option value="extends">Extends</option></select></label><label>Connect to<select value={targetId} onChange={(event) => setTargetId(event.target.value)} required><option value="">Choose published or draft work</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{nodeTypeLabel(candidate.type)} · {candidate.title}</option>)}</select></label><button className="quiet-button" type="submit" disabled={!targetId}>Add connection</button></form>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="connection-list">{nodeLinks.length ? nodeLinks.map((link) => { const target = byId.get(link.source_node_id === node.id ? link.target_node_id : link.source_node_id); return <div key={link.id}><span>{relationshipLabel(link.relationship_type)} · {target?.title ?? 'Unavailable content'}</span><button type="button" onClick={() => void removeLink(link.id)}>Remove</button></div> }) : <p className="muted-copy">No manual connections yet.</p>}</div></>}</section>
}

function SetupScreen() { return <main className="setup-shell"><section className="setup-card"><p className="eyebrow">Setup needed</p><h1>Your portfolio starter is ready.</h1><p>Connect it to Supabase to turn this into a live, database-backed portfolio.</p></section></main> }
function StatusScreen({ title = 'One moment', message, detail }: { title?: string; message: string; detail?: React.ReactNode }) { return <section className="status-screen" aria-live="polite"><p className="eyebrow">{title}</p><h1>{message}</h1>{detail ? <p>{detail}</p> : null}</section> }

export default App
