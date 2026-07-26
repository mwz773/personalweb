import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d'
import './App.css'
import headshot from './assets/headshot.jpg'
import { getSession, signIn, signOut, type Session } from './lib/auth'
import { readableError } from './lib/errors'
import { embedNode, generateSuggestions, getSuggestionsForNode, isSemanticApiConfigured, reviewSuggestion, type SemanticSuggestion } from './lib/semantic'
import {
  createNode,
  createNodeMedia,
  createNodeLink,
  deleteNode,
  deleteNodeMedia,
  deleteNodeLink,
  getNodeMedia,
  getOwnerLinks,
  getOwnerNodes,
  getPublishedNode,
  getPublishedNodes,
  getPublishedRelatedNodes,
  getPublishedSemanticRelatedNodes,
  getPublicGraph,
  getSignedImageUrls,
  nodeTypeLabel,
  publicPath,
  removePortfolioImage,
  relationshipLabel,
  updateNodeCoverImage,
  updateNodeMedia,
  updateNode,
  uploadPortfolioImage,
  type NodeInput,
  type NodeMedia,
  type NodeStatus,
  type NodeType,
  type OwnerNode,
  type PortfolioNode,
  type RelationshipType,
} from './lib/nodes'
import { isSupabaseConfigured, supabase } from './lib/supabase'

type LoadState = 'loading' | 'ready' | 'error'

function useScrollReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const container = ref.current
    if (!container || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const elements = [...container.querySelectorAll<HTMLElement>('[data-reveal]')]
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed')
          observer.unobserve(entry.target)
        }
      }),
      { threshold: .12 },
    )
    elements.forEach((element, index) => {
      element.style.setProperty('--reveal-delay', `${Math.min(index * 55, 220)}ms`)
      observer.observe(element)
    })
    return () => observer.disconnect()
  }, [])

  return ref
}
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
  const match = window.location.pathname.match(/^\/(reflections|projects|articles|books|music|films)\/([^/]+)\/?$/)
  if (!match) return null
  const types: Record<string, NodeType> = {
    reflections: 'reflection',
    projects: 'project',
    articles: 'article',
    books: 'book',
    music: 'music',
    films: 'film',
  }
  return { type: types[match[1]], slug: decodeURIComponent(match[2]) }
}

function isAdminPath(): boolean {
  return window.location.pathname === '/admin' || window.location.pathname === '/admin/'
}

function isGraphPath(): boolean {
  return window.location.pathname === '/graph' || window.location.pathname === '/graph/'
}

function isCvPath(): boolean {
  return window.location.pathname === '/cv' || window.location.pathname === '/cv/'
}

function App() {
  if (isAdminPath()) return <AdminApp />
  if (isGraphPath()) return <GraphPage />
  if (isCvPath()) return <CvPage />
  return <PublicApp />
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

type GraphNode = PortfolioNode & { x?: number; y?: number }
type GraphLink = { id: string; source: string | GraphNode; target: string | GraphNode; relationship_type: RelationshipType }

function graphEndpointId(endpoint: string | GraphNode): string {
  return typeof endpoint === 'string' ? endpoint : endpoint.id
}

const graphTypeColors: Record<NodeType, string> = {
  reflection: '#7e8b70',
  project: '#e8a317',
  article: '#cd7d5e',
  book: '#85594f',
  music: '#776052',
  film: '#922724',
}

function GraphPage() {
  const [state, setState] = useState<LoadState>('loading')
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [links, setLinks] = useState<GraphLink[]>([])
  const [activeTypes, setActiveTypes] = useState<Set<NodeType>>(new Set(['reflection', 'project', 'article', 'book', 'music', 'film']))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const graphContainerRef = useRef<HTMLDivElement>(null)
  const [graphSize, setGraphSize] = useState({ width: 760, height: 560 })

  useEffect(() => {
    async function loadGraph() {
      try {
        const graph = await getPublicGraph()
        setNodes(graph.nodes)
        setLinks(graph.links.map((link) => ({ id: link.id, source: link.source_node_id, target: link.target_node_id, relationship_type: link.relationship_type })))
        setState('ready')
      } catch (loadError) {
        setError(readableError(loadError, 'The connection map could not load.'))
        setState('error')
      }
    }
    void loadGraph()
  }, [])
  useEffect(() => {
    const element = graphContainerRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setGraphSize({ width: Math.max(280, entry.contentRect.width), height: Math.max(420, entry.contentRect.height) })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const visibleNodes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return nodes.filter((node) => activeTypes.has(node.type) && (!normalizedQuery || `${node.title} ${node.summary}`.toLowerCase().includes(normalizedQuery)))
  }, [activeTypes, nodes, query])
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes])
  const visibleLinks = useMemo(() => links.filter((link) => visibleIds.has(graphEndpointId(link.source)) && visibleIds.has(graphEndpointId(link.target))), [links, visibleIds])
  const connectedIds = useMemo(() => new Set(selectedId ? visibleLinks.filter((link) => graphEndpointId(link.source) === selectedId || graphEndpointId(link.target) === selectedId).flatMap((link) => [graphEndpointId(link.source), graphEndpointId(link.target)]) : []), [selectedId, visibleLinks])
  const selected = nodes.find((node) => node.id === selectedId) ?? null
  const graphData = useMemo(() => ({ nodes: visibleNodes, links: visibleLinks.map((link) => ({ ...link, source: graphEndpointId(link.source), target: graphEndpointId(link.target) })) }), [visibleLinks, visibleNodes])

  function toggleType(type: NodeType) {
    setActiveTypes((current) => {
      if (current.has(type) && current.size === 1) return current
      const next = new Set(current)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  if (!isSupabaseConfigured) return <SetupScreen />
  if (state === 'loading') return <StatusScreen message="Mapping published connections…" />
  if (state === 'error') return <StatusScreen title="Connection problem" message={error} detail={<a href="/">Return to the portfolio</a>} />

  return <div className="graph-page"><header className="graph-header"><a className="graph-wordmark" href="/">✦ Mandy Zhang</a><div><a href="/" className="graph-back-link">Portfolio</a><span>Knowledge graph</span></div></header><main className="graph-main"><section className="graph-intro"><p className="eyebrow">Explore the threads</p><h1>Ideas in relation.</h1><p>Every line is a connection I have reviewed and chosen to make public. Drag to pan, scroll to zoom, and select a node to follow its thread.</p></section><section className="graph-workspace" aria-label="Interactive portfolio connection graph"><div className="graph-canvas" ref={graphContainerRef}><ForceGraph2D<GraphNode, GraphLink> width={graphSize.width} height={graphSize.height} graphData={graphData} backgroundColor="#0d0c0a" nodeRelSize={5} nodeCanvasObjectMode={() => 'replace'} nodeCanvasObject={(node, context, scale) => { const isSelected = node.id === selectedId; const isConnected = !selectedId || connectedIds.has(node.id); const radius = isSelected ? 7 : 5; context.globalAlpha = isConnected ? 1 : 0.22; if (isSelected) { context.beginPath(); context.arc(node.x ?? 0, node.y ?? 0, radius + 5, 0, 2 * Math.PI); context.strokeStyle = graphTypeColors[node.type]; context.lineWidth = 1.5 / scale; context.stroke() } context.beginPath(); context.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI); context.fillStyle = graphTypeColors[node.type]; context.fill(); if (scale >= 0.8) { context.font = `${Math.max(10 / scale, 3)}px Impact, Haettenschweiler, Arial`; context.textAlign = 'center'; context.textBaseline = 'top'; context.fillStyle = isSelected ? '#fffaf2' : '#d7d1c7'; context.fillText(node.title.length > 27 ? `${node.title.slice(0, 25)}…` : node.title, node.x ?? 0, (node.y ?? 0) + radius + 4 / scale) } context.globalAlpha = 1 }} nodeLabel={(node) => `${node.title} · ${nodeTypeLabel(node.type)}`} onNodeClick={(node) => setSelectedId(node.id)} onBackgroundClick={() => setSelectedId(null)} linkColor={(link) => selectedId && (graphEndpointId(link.source) === selectedId || graphEndpointId(link.target) === selectedId) ? '#e8a317' : 'rgba(255,255,255,0.16)'} linkWidth={(link) => selectedId && (graphEndpointId(link.source) === selectedId || graphEndpointId(link.target) === selectedId) ? 1.8 : 0.8} linkLabel={(link) => relationshipLabel(link.relationship_type)} cooldownTicks={100} /></div><aside className="graph-sidebar"><label className="graph-search-label" htmlFor="graph-filter">Filter graph</label><input id="graph-filter" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles…" /><div className="graph-sidebar-section"><p>Node types</p>{(['reflection', 'project', 'article', 'book', 'music', 'film'] as NodeType[]).map((type) => <button type="button" className={activeTypes.has(type) ? 'graph-filter-toggle is-active' : 'graph-filter-toggle'} key={type} onClick={() => toggleType(type)}><i style={{ background: activeTypes.has(type) ? graphTypeColors[type] : '#423f3a' }} /><span>{nodeTypeLabel(type)}</span><small>{nodes.filter((node) => node.type === type).length}</small></button>)}</div><div className="graph-sidebar-section graph-stats"><p>Graph</p><span>Nodes <strong>{visibleNodes.length}</strong></span><span>Connections <strong>{visibleLinks.length}</strong></span></div></aside></section>{selected ? <section className="graph-selection" aria-live="polite"><i style={{ background: graphTypeColors[selected.type] }} /><div><p>{nodeTypeLabel(selected.type)}</p><h2>{selected.title}</h2><span>{selected.summary}</span></div><small>{Math.max(0, connectedIds.size - 1)} connections</small><a className="graph-open-link" href={publicPath(selected)}>Open item <span aria-hidden="true">→</span></a></section> : <p className="graph-instruction">Select a node to see its connections and read the item.</p>}</main></div>
}

function SiteHeader({ admin = false }: { admin?: boolean }) {
  return <header className="site-header"><a className="wordmark" href="/"><span aria-hidden="true">✦</span> Mandy Zhang</a>{admin ? <span className="header-note">Owner dashboard</span> : <a className="header-note graph-nav-link" href="/#knowledge-graph">Knowledge graph</a>}</header>
}

function HomePage({ nodes }: { nodes: PortfolioNode[] }) {
  const homeRef = useScrollReveal<HTMLElement>()

  return (
    <main className="hub-page" ref={homeRef}>
      <header className="hub-header" data-reveal>
        <a className="hub-name" href="/">Mandy Zhang</a>
        <nav aria-label="Personal links">
          <a href="/cv">Resume</a>
          <a href="https://linkedin.com/in/mandywzhang/" target="_blank" rel="noreferrer">LinkedIn</a>
          <a href="mailto:mandy.zhang@yale.edu">Email</a>
          <a href="https://github.com/mwz773">GitHub</a>

        </nav>
      </header>
      <AboutSection />
      <HubGraph />
      <MediaGrid nodes={nodes} />
      <footer className="hub-footer" data-reveal><span>© {new Date().getFullYear()} Mandy Zhang</span><a href="mailto:mandy.zhang@yale.edu">Get in touch</a></footer>
    </main>
  )
}

function AboutSection() {
  return <section className="about-section" aria-labelledby="about-heading" data-reveal><div className="about-photo"><img src={headshot} alt="Mandy Zhang standing outdoors beneath flowering trees." /><h1 id="about-heading">Hi, I’m Mandy.</h1></div><div className="about-copy"><p>I’m a Computer Science student at Yale, interested in tech, social good, and solving real problems.</p><p>Right now, I work on AI/ML infrastructure at The Options Clearing Corporation — building data pipelines, testing AI agents, and helping make Claude-powered tools more useful across the organization. I’ve also spent time in research and social impact work: evaluating AI models for legal document processing at the Vera Institute, training computer vision models to study urban environments at Yale’s Livable City Lab, and managing a nonprofit product team with Develop for Good.</p><p>I work mainly in Python, PyTorch, TensorFlow, and scikit-learn, and I like being able to move between research and production.</p><p>Take a look at <a href="/cv">my resume</a>, or feel free to <a href="mailto:mandy.zhang@yale.edu">email me</a> if you’re working in AI, engineering, or social impact.</p></div></section>
}

type CvExperience = {
  role: string
  dates: string
  company: string
  location: string
  details: string[]
}

const cvExperiences: CvExperience[] = [
  { role: 'AI Engineer', dates: 'Jun 2026 — Present', company: 'The Options Clearing Corporation', location: 'Chicago, IL', details: ['Architecting a medallion data pipeline for AI-adoption metrics across 1,300+ employees.', 'Building a Claude Agent SDK evaluation framework for Tier-1 SOC alert triage, balancing accuracy, cost, and speed.'] },
  { role: 'Data Scientist', dates: 'Oct 2025 — Apr 2026', company: 'Vera Institute', location: 'New York City, NY', details: ['Evaluated Azure OpenAI and Document Intelligence approaches for extracting structured data from legal documents.', 'Built Azure Blob Storage ingestion and extraction workflows in Python, with implementation guides for the team.'] },
  { role: 'Product Manager — nenos Inc.', dates: 'Oct 2025 — Mar 2026', company: 'Develop for Good', location: 'Remote', details: ['Wrote the product requirements document and maintained a milestone roadmap for a five-month website redesign.', 'Led sprint planning and client meetings for a six-person engineering and design team.'] },
  { role: 'Tobin Undergraduate Research Assistant', dates: 'Sep 2025 — Jan 2026', company: 'Livable City Lab', location: 'New Haven, CT', details: ['Fine-tuned a YOLO computer-vision model to recognize objects in geospatial video data.', 'Engineered Python pipelines for frame extraction, classification, geo-projection, model validation, and trajectory computation.'] },
  { role: 'Data Science Intern', dates: 'May 2025 — Aug 2025', company: 'Steelcase', location: 'Grand Rapids, MI', details: ['Built a PySpark and scikit-learn K-means model that surfaced product lines for standardization, with an estimated $10–15M annual savings opportunity.', 'Created sentence-transformer embeddings, analyzed purchasing patterns, and delivered Tableau dashboards for decision-makers.'] },
  { role: 'ONEXYS Supercoach', dates: 'May 2023 — Aug 2025', company: 'Yale University', location: 'Remote · Seasonal', details: ['Led a 53-member coaching team supporting 150+ incoming students.', 'Facilitated weekly strategy meetings and quantitative-skills instruction to strengthen academic performance.'] },
]

const cvSkills = [
  ['Languages', 'Python', 'JavaScript / TypeScript', 'SQL', 'C', 'R', 'HTML / CSS', 'Racket', 'PySpark'],
  ['ML & data', 'Pandas', 'NumPy', 'scikit-learn', 'TensorFlow', 'PyTorch', 'Roboflow', 'OpenCV', 'NLTK'],
  ['Frameworks', 'React', 'Flask', 'Node.js', 'Express.js'],
  ['Data & cloud', 'Databricks', 'Microsoft AI Foundry', 'Azure', 'BigQuery', 'MongoDB'],
  ['Tools', 'Git', 'SQLAlchemy', 'Jupyter', 'Tableau', 'VS Code'],
]

function CvPage() {
  return <main className="cv-page"><header className="cv-header"><a className="hub-name" href="/">Mandy Zhang</a><nav aria-label="CV navigation"><a href="/">Home</a><a className="is-active" href="/cv" aria-current="page">Resume</a><a href="mailto:mandy.zhang@yale.edu">Email</a><a href="https://linkedin.com/in/mandywzhang/" target="_blank" rel="noreferrer">LinkedIn</a></nav></header><section className="cv-intro"><p className="eyebrow">Resume</p><h1>Building useful things with data and care.</h1><p>Computer Science at Yale · Expected December 2026</p><a className="cv-download" href="/MandyZhang_Resume.pdf" download>Download Resume</a></section><section className="cv-section" aria-labelledby="experience-heading"><div className="cv-section-heading"><p className="eyebrow">Experience</p><h2 id="experience-heading">Where I’ve worked.</h2></div><div className="cv-experience-list">{cvExperiences.map((experience) => <article className="cv-experience-card" key={`${experience.company}-${experience.role}`}><div className="cv-role"><h3>{experience.role}</h3><p>{experience.dates}</p></div><div className="cv-company"><h4>{experience.company}</h4><p className="cv-location">{experience.location}</p><ul>{experience.details.map((detail) => <li key={detail}>{detail}</li>)}</ul></div></article>)}</div></section><section className="cv-section cv-education" aria-labelledby="education-heading"><div className="cv-section-heading"><p className="eyebrow">Education</p><h2 id="education-heading">Learning.</h2></div><article className="cv-experience-card"><div className="cv-role"><h3>B.S. Computer Science</h3><p>Expected Dec 2026</p></div><div className="cv-company"><h4>Yale University</h4><p className="cv-location">New Haven, CT · GPA 3.74 / 4.00</p><p>Coursework includes algorithms, artificial intelligence, machine learning, full-stack web development, systems programming, security, and human-computer interaction.</p></div></article></section><section className="cv-section" aria-labelledby="skills-heading"><div className="cv-section-heading"><p className="eyebrow">Technical skills</p><h2 id="skills-heading">My toolkit.</h2></div><div className="cv-skills-grid">{cvSkills.map(([category, ...skills]) => <section className="cv-skill-group" key={category}><h3>{category}</h3><div>{skills.map((skill) => <span key={skill}>{skill}</span>)}</div></section>)}</div></section><footer className="cv-footer"><a href="/">← Back to home</a><a href="mailto:mandy.zhang@yale.edu">mandy.zhang@yale.edu</a></footer></main>
}


function HubGraph() {
  const [state, setState] = useState<LoadState>('loading')
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [links, setLinks] = useState<GraphLink[]>([])
  const [activeTypes, setActiveTypes] = useState<Set<NodeType>>(new Set(['reflection', 'project', 'article', 'book', 'music', 'film']))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const graphRef = useRef<HTMLDivElement>(null)
  const forceGraphRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined)
  const [size, setSize] = useState({ width: 740, height: 560 })

  useEffect(() => {
    void getPublicGraph().then((graph) => { setNodes(graph.nodes); setLinks(graph.links.map((link) => ({ id: link.id, source: link.source_node_id, target: link.target_node_id, relationship_type: link.relationship_type }))); setState('ready') }).catch(() => setState('error'))
  }, [])
  useEffect(() => {
    if (state !== 'ready' || !nodes.length) return
    const frame = window.requestAnimationFrame(() => forceGraphRef.current?.zoomToFit(650, 42))
    return () => window.cancelAnimationFrame(frame)
  }, [nodes.length, state])
  useEffect(() => {
    const element = graphRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.max(280, entry.contentRect.width), height: Math.max(440, entry.contentRect.height) }))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const visibleNodes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return nodes.filter((node) => activeTypes.has(node.type) && (!normalizedQuery || `${node.title} ${node.summary}`.toLowerCase().includes(normalizedQuery)))
  }, [activeTypes, nodes, query])
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes])
  const visibleLinks = useMemo(() => links.filter((link) => visibleIds.has(graphEndpointId(link.source)) && visibleIds.has(graphEndpointId(link.target))), [links, visibleIds])
  const activeNodeId = selectedId ?? hoveredNodeId
  const connectedIds = useMemo(() => new Set(activeNodeId ? visibleLinks.filter((link) => graphEndpointId(link.source) === activeNodeId || graphEndpointId(link.target) === activeNodeId).flatMap((link) => [graphEndpointId(link.source), graphEndpointId(link.target)]) : []), [activeNodeId, visibleLinks])
  const selected = nodes.find((node) => node.id === selectedId) ?? null
  const graphData = useMemo(() => ({ nodes: visibleNodes, links: visibleLinks.map((link) => ({ ...link, source: graphEndpointId(link.source), target: graphEndpointId(link.target) })) }), [visibleLinks, visibleNodes])

  function toggleType(type: NodeType) {
    setActiveTypes((current) => {
      if (current.has(type) && current.size === 1) return current
      const next = new Set(current)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  function resetGraphView() {
    setActiveTypes(new Set(['reflection', 'project', 'article', 'book', 'music', 'film']))
    setSelectedId(null)
    setHoveredNodeId(null)
    setHoveredLinkId(null)
    setQuery('')
    window.requestAnimationFrame(() => forceGraphRef.current?.zoomToFit(450, 42))
  }

  if (state === 'error') return null
  return <section className="hub-graph" id="knowledge-graph" aria-labelledby="hub-graph-heading" data-reveal><div className="hub-section-heading"><h1 id="hub-graph-heading">My Connections.</h1><p>Follow the threads between all the music, books, movies, and experiences I have been consuming! This is a knowledge graph that uses a mini Sentence transformer to embed all my content and connects to the closely related vectors.</p></div><div className="hub-graph-workspace"><div className="hub-graph-canvas" ref={graphRef}>{state === 'loading' ? <p>Mapping connections…</p> : <ForceGraph2D<GraphNode, GraphLink> ref={forceGraphRef} width={size.width} height={size.height} graphData={graphData} backgroundColor="#183c3d" nodeRelSize={5} nodeCanvasObjectMode={() => 'replace'} nodeCanvasObject={(node, context, scale) => { const active = node.id === activeNodeId; const connected = !activeNodeId || connectedIds.has(node.id); const radius = active ? 8 : 5; context.globalAlpha = connected ? 1 : .22; context.beginPath(); context.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI); context.fillStyle = graphTypeColors[node.type]; context.fill(); if (active) { context.strokeStyle = '#f6eee5'; context.lineWidth = 2 / scale; context.stroke() } if (scale > .9) { context.font = `${Math.max(10 / scale, 3)}px Impact, Haettenschweiler, Arial`; context.textAlign = 'center'; context.textBaseline = 'top'; context.fillStyle = '#f6eee5'; context.fillText(node.title.length > 22 ? `${node.title.slice(0, 20)}…` : node.title, node.x ?? 0, (node.y ?? 0) + radius + 4 / scale) } context.globalAlpha = 1 }} linkColor={(link) => activeNodeId && (graphEndpointId(link.source) === activeNodeId || graphEndpointId(link.target) === activeNodeId) ? '#e8a317' : link.id === hoveredLinkId ? '#f6eee5' : 'rgba(246,238,229,.32)'} linkWidth={(link) => activeNodeId && (graphEndpointId(link.source) === activeNodeId || graphEndpointId(link.target) === activeNodeId) ? 1.8 : link.id === hoveredLinkId ? 1.4 : .8} linkDirectionalParticles={(link) => activeNodeId && (graphEndpointId(link.source) === activeNodeId || graphEndpointId(link.target) === activeNodeId) ? 2 : 0} linkDirectionalParticleWidth={1.4} linkDirectionalParticleSpeed={.004} linkLabel={(link) => relationshipLabel(link.relationship_type)} onNodeClick={(node) => setSelectedId(node.id)} onNodeHover={(node) => setHoveredNodeId(node?.id ?? null)} onLinkHover={(link) => setHoveredLinkId(link?.id ?? null)} onBackgroundClick={() => setSelectedId(null)} cooldownTicks={100} />}</div><aside className="hub-graph-sidebar"><label htmlFor="hub-graph-filter">Filter graph</label><input id="hub-graph-filter" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles…" /><div><p>Node types</p>{(['reflection', 'project', 'article', 'book', 'music', 'film'] as NodeType[]).map((type) => <button type="button" className={activeTypes.has(type) ? 'is-active' : ''} key={type} onClick={() => toggleType(type)}><i style={{ background: activeTypes.has(type) ? graphTypeColors[type] : '#776052' }} /><span>{nodeTypeLabel(type)}</span><small>{nodes.filter((node) => node.type === type).length}</small></button>)}</div><div className="hub-graph-stats"><p>Graph</p><span>Nodes <strong>{visibleNodes.length}</strong></span><span>Connections <strong>{visibleLinks.length}</strong></span></div><button className="hub-graph-reset" type="button" onClick={resetGraphView}>Reset view</button></aside></div>{selected ? <a className="hub-graph-selected" href={publicPath(selected)}><span>{nodeTypeLabel(selected.type)}</span><strong>{selected.title}</strong><small>{selected.summary}</small><em>{Math.max(0, connectedIds.size - 1)} connections →</em></a> : <div className="hub-graph-footer"><span>Select a point to read it. Drag to pan and scroll to zoom.</span></div>}</section>
}

function MediaGrid({ nodes }: { nodes: PortfolioNode[] }) {
  const [filter, setFilter] = useState<'all' | 'book' | 'film' | 'music' | 'reflection'>('all')
  const [sort, setSort] = useState<'date' | 'name'>('date')
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set())
  const media = useMemo(() => nodes.filter((node) => node.cover_image_path && ['book', 'film', 'music', 'reflection'].includes(node.type)).filter((node) => filter === 'all' || node.type === filter).sort((a, b) => sort === 'name' ? a.title.localeCompare(b.title) : (b.published_at ?? '').localeCompare(a.published_at ?? '')), [filter, nodes, sort])
  useEffect(() => { void getSignedImageUrls([...new Set(media.map((node) => node.cover_image_path).filter((path): path is string => Boolean(path)))]).then(setUrls).catch(() => setUrls({})) }, [media])
  return <section className="media-grid-section" aria-labelledby="media-grid-heading" data-reveal><div className="hub-section-heading"><p className="eyebrow">Media</p><h2 id="media-grid-heading">A small library.</h2></div><div className="media-controls"><span>Show</span>{(['all', 'book', 'film', 'music', 'reflection'] as const).map((type) => <button key={type} className={filter === type ? 'is-active' : ''} type="button" onClick={() => setFilter(type)}>{type === 'all' ? 'All' : type === 'reflection' ? 'Journal' : nodeTypeLabel(type)}</button>)}<span>Sort</span><button className={sort === 'date' ? 'is-active' : ''} type="button" onClick={() => setSort('date')}>Date</button><button className={sort === 'name' ? 'is-active' : ''} type="button" onClick={() => setSort('name')}>Name</button></div>{media.length ? <div className="media-grid">{media.map((node) => { const imagePath = node.cover_image_path!; const imageUrl = urls[imagePath]; const isLoaded = loadedImages.has(imagePath); return <a className="media-tile" key={node.id} href={publicPath(node)} aria-label={`${nodeTypeLabel(node.type)}: ${node.title}`}><div className={isLoaded ? 'media-thumbnail is-loaded' : 'media-thumbnail'}>{imageUrl ? <img src={imageUrl} alt={`Cover for ${node.title}`} onLoad={() => setLoadedImages((current) => new Set(current).add(imagePath))} /> : <span>{node.title}</span>}</div><span className="media-title">{node.title}</span></a>})}</div> : <p className="muted-copy">Add a cover image to a published Book, Film, Music, or Journal entry to place it here.</p>}</section>
}

function NodePage({ node }: { node: PortfolioNode | null }) {
  const [related, setRelated] = useState<Array<{ link: { id: string; relationship_type: RelationshipType }; node: PortfolioNode }>>([])
  const [linksUnavailable, setLinksUnavailable] = useState(false)
  const [media, setMedia] = useState<NodeMedia[]>([])
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const nodeId = node?.id

  useEffect(() => {
    if (!nodeId) return
    const currentNodeId = nodeId
    async function loadRelated() {
      const [manual, semantic] = await Promise.allSettled([getPublishedRelatedNodes(currentNodeId), getPublishedSemanticRelatedNodes(currentNodeId)])
      const candidates = [
        ...(semantic.status === 'fulfilled' ? semantic.value : []),
        ...(manual.status === 'fulfilled' ? manual.value : []),
      ]
      const seenNodeIds = new Set<string>()
      setRelated(candidates.filter(({ node: relatedNode }) => {
        if (seenNodeIds.has(relatedNode.id)) return false
        seenNodeIds.add(relatedNode.id)
        return true
      }))
      setLinksUnavailable(manual.status === 'rejected' && semantic.status === 'rejected')
    }
    void loadRelated()
  }, [nodeId])

  useEffect(() => {
    if (!nodeId) return
    const currentNodeId = nodeId
    async function loadMedia() {
      try {
        const photos = await getNodeMedia(currentNodeId)
        const paths = [...new Set([node?.cover_image_path, ...photos.map((photo) => photo.storage_path)].filter((path): path is string => Boolean(path)))]
        setMedia(photos)
        setImageUrls(await getSignedImageUrls(paths))
      } catch {
        // Text content remains available even if a media URL has expired or cannot load.
      }
    }
    void loadMedia()
  }, [node?.cover_image_path, nodeId])

  if (!node) return <main><StatusScreen title="Content not found" message="It may still be a draft, or the link may be out of date." detail={<a href="/">Return to the homepage</a>} /></main>

  return (
    <main>
      <SiteHeader />
      <article className="reflection-page">
        <a className="back-link" href="/">← All work and reflections</a>
        <p className="eyebrow">{nodeTypeLabel(node.type)} · {formatDate(node.published_at)}</p>
        <h1>{node.title}</h1>
        <p className="reflection-summary">{node.summary}</p>
        {node.cover_image_path && imageUrls[node.cover_image_path] ? <img className="node-cover" src={imageUrls[node.cover_image_path]} alt={`Cover image for ${node.title}`} /> : null}
        {node.creator || node.source_name ? <p className="source-metadata">{node.creator ? <span>{node.creator}</span> : null}{node.creator && node.source_name ? ' · ' : null}{node.source_name ? <span>{node.source_name}</span> : null}</p> : null}
        {node.type === 'project' && node.project_url ? <a className="project-link" href={node.project_url} target="_blank" rel="noreferrer">Visit project <span aria-hidden="true">↗</span></a> : null}
        {node.type !== 'project' && node.source_url ? <a className="project-link" href={node.source_url} target="_blank" rel="noreferrer">{node.type === 'article' ? 'Read source' : node.type === 'book' ? 'Find book' : 'Listen'} <span aria-hidden="true">↗</span></a> : null}
        <div className="reflection-body">{node.markdown_content}</div>
        {node.type === 'reflection' && media.length ? <section className="journal-gallery" aria-labelledby="journal-gallery-heading"><p className="eyebrow">Photo journal</p><h2 id="journal-gallery-heading">Moments from this entry</h2><div>{media.map((photo) => imageUrls[photo.storage_path] ? <figure key={photo.id}><img src={imageUrls[photo.storage_path]} alt={photo.alt_text} /><figcaption>{photo.alt_text}</figcaption></figure> : null)}</div></section> : null}
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

  return <main><SiteHeader admin /><section className="dashboard-intro"><div><p className="eyebrow">Signed in as {session.user.email}</p><h1>Write and connect.</h1></div><button className="quiet-button" type="button" onClick={() => void handleSignOut()}>Sign out</button></section><div className="dashboard-grid"><section className="dashboard-list" aria-labelledby="your-content-heading"><div className="section-heading compact-heading"><div><p className="eyebrow">Your content</p><h2 id="your-content-heading">Portfolio</h2></div><button className="quiet-button" type="button" onClick={() => setEditing(null)}>New item</button></div>{state === 'loading' ? <p>Loading your content…</p> : null}{state === 'error' ? <p className="form-error" role="alert">{error}</p> : null}<div className="admin-list">{nodes.map((node) => <button className={`admin-list-item ${editing?.id === node.id ? 'is-selected' : ''}`} key={node.id} type="button" onClick={() => setEditing(node)}><span className={`status-pill ${node.status}`}>{node.status}</span><strong>{node.title}</strong><small>{nodeTypeLabel(node.type)} · Updated {formatDate(node.updated_at)}</small><small className={`semantic-status ${node.embedding_status}`}>{semanticStatusLabel(node)}</small></button>)}</div></section><NodeEditor node={editing} ownerId={session.user.id} nodes={nodes} links={links} linksError={linksError} onChanged={loadData} /></div></main>
}

function NodeEditor({ node, ownerId, nodes, links, linksError, onChanged }: { node: OwnerNode | null; ownerId: string; nodes: OwnerNode[]; links: Array<{ id: string; source_node_id: string; target_node_id: string; relationship_type: RelationshipType }>; linksError: string; onChanged: () => Promise<void> }) {
  const [form, setForm] = useState<NodeInput>(emptyNode)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [newCoverFile, setNewCoverFile] = useState<File | null>(null)
  const [newGalleryFiles, setNewGalleryFiles] = useState<File[]>([])
  const [newGalleryAltText, setNewGalleryAltText] = useState('')

  useEffect(() => {
    setForm(node ? { type: node.type, slug: node.slug, title: node.title, summary: node.summary, markdown_content: node.markdown_content, project_url: node.project_url ?? '', creator: node.creator ?? '', source_name: node.source_name ?? '', source_url: node.source_url ?? '', status: node.status } : emptyNode)
    setError('')
    setNewCoverFile(null)
    setNewGalleryFiles([])
    setNewGalleryAltText('')
  }, [node])

  function updateField(field: keyof NodeInput, value: string) { setForm((current) => ({ ...current, [field]: value })) }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const galleryDescriptions = newGalleryAltText.split('\n').map((text) => text.trim()).filter(Boolean)
    if (!node && newGalleryFiles.length && galleryDescriptions.length !== newGalleryFiles.length) {
      setError('Enter one non-empty photo description per selected Journal image, in the same order.')
      return
    }

    setError('')
    setIsSaving(true)
    try {
      const clean = { ...form, slug: form.slug.trim(), title: form.title.trim(), summary: form.summary.trim(), markdown_content: form.markdown_content.trim(), project_url: form.project_url.trim(), creator: form.creator.trim(), source_name: form.source_name.trim(), source_url: form.source_url.trim() }
      if (node) {
        await updateNode(node.id, clean, node.published_at)
      } else {
        const created = await createNode(clean)
        if (newCoverFile) {
          const storagePath = await uploadPortfolioImage(ownerId, created.id, newCoverFile)
          await updateNodeCoverImage(created.id, storagePath)
        }
        for (const [index, file] of newGalleryFiles.entries()) {
          const storagePath = await uploadPortfolioImage(ownerId, created.id, file)
          await createNodeMedia({ node_id: created.id, storage_path: storagePath, alt_text: galleryDescriptions[index], ordinal: index })
        }
      }
      await onChanged()
    } catch (saveError) {
      setError(readableError(saveError, 'Could not save this item and its selected images. The item may still have been created; check your content list before trying again.'))
    } finally {
      setIsSaving(false)
    }
  }
  async function handleDelete() { if (!node || !window.confirm(`Delete “${node.title}”? This cannot be undone.`)) return; try { await deleteNode(node.id); await onChanged() } catch (deleteError) { setError(readableError(deleteError, 'Could not delete this item.')) } }

  const externalType = form.type === 'article' || form.type === 'book' || form.type === 'music' || form.type === 'film'
  const creatorLabel = form.type === 'article' || form.type === 'book' ? 'Author (optional)' : form.type === 'film' ? 'Director or creator (optional)' : 'Artist or creator (optional)'
  const sourceNameLabel = form.type === 'article' ? 'Publication or site (optional)' : form.type === 'book' ? 'Publisher (optional)' : form.type === 'film' ? 'Studio, platform, or context (optional)' : 'Album, platform, or context (optional)'
  const sourceUrlLabel = form.type === 'article' ? 'Article URL (optional)' : form.type === 'book' ? 'Book URL (optional)' : form.type === 'film' ? 'Film URL (optional)' : 'Listening URL (optional)'

  return <section className="editor-panel" aria-labelledby="editor-heading"><p className="eyebrow">{node ? `Edit ${nodeTypeLabel(node.type).toLowerCase()}` : 'New portfolio item'}</p><h2 id="editor-heading">{node ? node.title : 'Start a new piece'}</h2><form className="reflection-form" onSubmit={handleSubmit}><label>Content type<select value={form.type} onChange={(event) => updateField('type', event.target.value as NodeType)} disabled={Boolean(node)}><option value="reflection">Journal</option><option value="project">Project</option><option value="article">Article</option><option value="book">Book</option><option value="music">Music</option><option value="film">Film</option></select></label><label>Title<input value={form.title} onChange={(event) => updateField('title', event.target.value)} maxLength={160} required /></label><label>Short summary<input value={form.summary} onChange={(event) => updateField('summary', event.target.value)} maxLength={320} required /></label><label>Public URL slug<input value={form.slug} onChange={(event) => updateField('slug', event.target.value)} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" title="Use lowercase words separated by hyphens." required /></label>{form.type === 'project' ? <label>Project URL (optional)<input type="url" value={form.project_url} onChange={(event) => updateField('project_url', event.target.value)} placeholder="https://…" /></label> : null}{externalType ? <><label>{creatorLabel}<input value={form.creator} onChange={(event) => updateField('creator', event.target.value)} /></label><label>{sourceNameLabel}<input value={form.source_name} onChange={(event) => updateField('source_name', event.target.value)} /></label><label>{sourceUrlLabel}<input type="url" value={form.source_url} onChange={(event) => updateField('source_url', event.target.value)} placeholder="https://…" /></label></> : null}<label>{form.type === 'project' ? 'Project write-up' : externalType ? 'Your reflection on this source' : 'Your Journal entry'}<textarea rows={11} value={form.markdown_content} onChange={(event) => updateField('markdown_content', event.target.value)} required /></label>{!node ? <fieldset className="new-item-media"><legend>Images (optional)</legend><p className="muted-copy">Choose files now; they upload automatically after the item is created. JPEG, PNG, or WebP, up to 5 MB each.</p><label>Cover image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setNewCoverFile(event.target.files?.[0] ?? null)} /></label>{form.type === 'reflection' ? <><label>Journal photos<input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => setNewGalleryFiles(Array.from(event.target.files ?? []))} /></label>{newGalleryFiles.length ? <label>Photo descriptions — one per line, in file order<textarea rows={4} value={newGalleryAltText} onChange={(event) => setNewGalleryAltText(event.target.value)} placeholder={'First photo description\nSecond photo description'} required /></label> : null}</> : null}</fieldset> : null}<fieldset><legend>Visibility</legend><label className="radio-label"><input type="radio" checked={form.status === 'draft'} onChange={() => setForm((current) => ({ ...current, status: 'draft' as NodeStatus }))} /> Save as draft</label><label className="radio-label"><input type="radio" checked={form.status === 'published'} onChange={() => setForm((current) => ({ ...current, status: 'published' as NodeStatus }))} /> Publish publicly</label></fieldset>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="editor-actions"><button className="primary-button" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : node ? 'Save changes' : 'Create item'}</button>{node ? <button className="danger-button" type="button" onClick={() => void handleDelete()}>Delete</button> : null}</div></form>{node ? <MediaManager node={node} ownerId={ownerId} /> : null}{node ? <SemanticPanel node={node} onChanged={onChanged} /> : null}{node ? <ConnectionsEditor node={node} nodes={nodes} links={links} linksError={linksError} onChanged={onChanged} /> : null}</section>
}

function MediaManager({ node, ownerId }: { node: OwnerNode; ownerId: string }) {
  const [coverPath, setCoverPath] = useState<string | null>(node.cover_image_path)
  const [photos, setPhotos] = useState<NodeMedia[]>([])
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const [galleryAltText, setGalleryAltText] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isWorking, setIsWorking] = useState(false)

  const refreshMedia = useCallback(async () => {
    const nextPhotos = await getNodeMedia(node.id)
    const paths = [...new Set([coverPath, ...nextPhotos.map((photo) => photo.storage_path)].filter((path): path is string => Boolean(path)))]
    setPhotos(nextPhotos)
    setImageUrls(await getSignedImageUrls(paths))
  }, [coverPath, node.id])

  useEffect(() => {
    setCoverPath(node.cover_image_path)
  }, [node.cover_image_path, node.id])

  useEffect(() => {
    void refreshMedia().catch((loadError) => setError(readableError(loadError, 'Could not load this item’s images.')))
  }, [refreshMedia])

  async function uploadCover(file: File | undefined) {
    if (!file) return
    setError('')
    setMessage('')
    setIsWorking(true)
    try {
      const storagePath = await uploadPortfolioImage(ownerId, node.id, file)
      await updateNodeCoverImage(node.id, storagePath)
      setCoverPath(storagePath)
      setMessage('Cover image uploaded.')
    } catch (uploadError) {
      setError(readableError(uploadError, 'Could not upload the cover image.'))
    } finally {
      setIsWorking(false)
    }
  }

  async function clearCover() {
    setError('')
    setIsWorking(true)
    try {
      await updateNodeCoverImage(node.id, null)
      setCoverPath(null)
      setMessage('Cover image removed from this item.')
    } catch (coverError) {
      setError(readableError(coverError, 'Could not remove the cover image.'))
    } finally {
      setIsWorking(false)
    }
  }

  async function uploadGallery(files: FileList | null) {
    const selectedFiles = files ? Array.from(files) : []
    if (!selectedFiles.length) return
    const descriptions = galleryAltText.split('\n').map((text) => text.trim()).filter(Boolean)
    if (descriptions.length !== selectedFiles.length) {
      setError('Enter one non-empty alt-text description per selected photo, in the same order.')
      return
    }
    setError('')
    setMessage('')
    setIsWorking(true)
    try {
      let nextOrdinal = photos.length ? Math.max(...photos.map((photo) => photo.ordinal)) + 1 : 0
      for (const [index, file] of selectedFiles.entries()) {
        const storagePath = await uploadPortfolioImage(ownerId, node.id, file)
        try {
          await createNodeMedia({ node_id: node.id, storage_path: storagePath, alt_text: descriptions[index], ordinal: nextOrdinal })
        } catch (mediaError) {
          await removePortfolioImage(storagePath).catch(() => undefined)
          throw mediaError
        }
        nextOrdinal += 1
      }
      setGalleryAltText('')
      await refreshMedia()
      setMessage(`${selectedFiles.length} Journal photo${selectedFiles.length === 1 ? '' : 's'} added.`)
    } catch (uploadError) {
      setError(readableError(uploadError, 'Could not add the Journal photos.'))
    } finally {
      setIsWorking(false)
    }
  }

  async function saveAltText(photo: NodeMedia, altText: string) {
    const cleanAltText = altText.trim()
    if (!cleanAltText || cleanAltText === photo.alt_text) return
    try {
      await updateNodeMedia(photo.id, { alt_text: cleanAltText })
      await refreshMedia()
    } catch (altError) {
      setError(readableError(altError, 'Could not update the image description.'))
    }
  }

  async function movePhoto(photo: NodeMedia, direction: -1 | 1) {
    const currentIndex = photos.findIndex((item) => item.id === photo.id)
    const neighbor = photos[currentIndex + direction]
    if (!neighbor) return
    setError('')
    setIsWorking(true)
    try {
      const temporaryOrdinal = Math.max(...photos.map((item) => item.ordinal)) + 1
      await updateNodeMedia(photo.id, { ordinal: temporaryOrdinal })
      await updateNodeMedia(neighbor.id, { ordinal: photo.ordinal })
      await updateNodeMedia(photo.id, { ordinal: neighbor.ordinal })
      await refreshMedia()
    } catch (moveError) {
      setError(readableError(moveError, 'Could not reorder the Journal photos.'))
    } finally {
      setIsWorking(false)
    }
  }

  async function removePhoto(photo: NodeMedia) {
    if (!window.confirm('Remove this photo from the Journal entry?')) return
    setError('')
    setIsWorking(true)
    try {
      await deleteNodeMedia(photo.id)
      await removePortfolioImage(photo.storage_path)
      if (coverPath === photo.storage_path) {
        await updateNodeCoverImage(node.id, null)
        setCoverPath(null)
      }
      await refreshMedia()
      setMessage('Journal photo removed.')
    } catch (deleteError) {
      setError(readableError(deleteError, 'Could not remove the Journal photo.'))
    } finally {
      setIsWorking(false)
    }
  }

  async function makeCover(photo: NodeMedia) {
    setError('')
    setIsWorking(true)
    try {
      await updateNodeCoverImage(node.id, photo.storage_path)
      setCoverPath(photo.storage_path)
      setMessage('This Journal photo is now the cover image.')
    } catch (coverError) {
      setError(readableError(coverError, 'Could not set the cover image.'))
    } finally {
      setIsWorking(false)
    }
  }

  return <section className="media-manager" aria-labelledby="media-manager-heading"><p className="eyebrow">Images</p><h3 id="media-manager-heading">Cover image{node.type === 'reflection' ? ' and photo journal' : ''}</h3><p className="muted-copy">JPEG, PNG, or WebP only, up to 5 MB. Images remain private until this item is published.</p>{coverPath && imageUrls[coverPath] ? <img className="admin-cover-preview" src={imageUrls[coverPath]} alt={`Current cover for ${node.title}`} /> : null}<label className="upload-control">Upload or replace cover<input type="file" accept="image/jpeg,image/png,image/webp" disabled={isWorking} onChange={(event) => { void uploadCover(event.target.files?.[0]); event.currentTarget.value = '' }} /></label>{coverPath ? <button className="quiet-button" type="button" disabled={isWorking} onClick={() => void clearCover()}>Remove cover</button> : null}{node.type === 'reflection' ? <div className="gallery-editor"><h4>Journal photos</h4><p className="muted-copy">You can select several photos. Add one description per line, in the same order as the files.</p><label>Photo descriptions<textarea rows={4} value={galleryAltText} onChange={(event) => setGalleryAltText(event.target.value)} placeholder={'First photo description\nSecond photo description'} /></label><label className="upload-control">Add Journal photos<input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={isWorking} onChange={(event) => { void uploadGallery(event.target.files); event.currentTarget.value = '' }} /></label><div className="gallery-admin-list">{photos.map((photo, index) => <article key={photo.id}><img src={imageUrls[photo.storage_path]} alt={photo.alt_text} /><div><label>Alt text<input defaultValue={photo.alt_text} onBlur={(event) => void saveAltText(photo, event.target.value)} /></label><div className="editor-actions"><button className="quiet-button" type="button" disabled={isWorking || index === 0} onClick={() => void movePhoto(photo, -1)}>Move up</button><button className="quiet-button" type="button" disabled={isWorking || index === photos.length - 1} onClick={() => void movePhoto(photo, 1)}>Move down</button>{coverPath !== photo.storage_path ? <button className="quiet-button" type="button" disabled={isWorking} onClick={() => void makeCover(photo)}>Use as cover</button> : null}<button className="danger-button" type="button" disabled={isWorking} onClick={() => void removePhoto(photo)}>Remove</button></div></div></article>)}</div></div> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}{message ? <p className="muted-copy" role="status">{message}</p> : null}</section>
}

function SemanticPanel({ node, onChanged }: { node: OwnerNode; onChanged: () => Promise<void> }) {
  const [isEmbedding, setIsEmbedding] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const [generationMessage, setGenerationMessage] = useState('')
  const [revision, setRevision] = useState(0)
  async function handleEmbed() { setError(''); setGenerationMessage(''); setIsEmbedding(true); try { await embedNode(node.id) } catch (embedError) { setError(readableError(embedError, 'Could not embed this item.')) } finally { await onChanged(); setIsEmbedding(false) } }
  async function handleGenerate() { setError(''); setGenerationMessage(''); setIsGenerating(true); try { const { suggestion_count: suggestionCount } = await generateSuggestions(node.id); setGenerationMessage(suggestionCount ? `${suggestionCount} suggested connection${suggestionCount === 1 ? '' : 's'} generated.` : 'No candidates met the threshold. Embed at least two substantive items with related text, then try again.'); setRevision((current) => current + 1) } catch (suggestionError) { setError(readableError(suggestionError, 'Could not generate suggestions.')) } finally { setIsGenerating(false) } }
  return <section className="semantic-panel" aria-labelledby="semantic-heading"><p className="eyebrow">Semantic status</p><h3 id="semantic-heading">{semanticStatusLabel(node)}</h3>{node.embedding_error ? <p className="form-error" role="alert">{node.embedding_error}</p> : null}{isSemanticApiConfigured ? <div className="editor-actions"><button className="quiet-button" type="button" onClick={() => void handleEmbed()} disabled={isEmbedding}>{isEmbedding ? 'Embedding…' : node.embedding_status === 'ready' ? 'Re-embed this item' : 'Embed this item'}</button><button className="primary-button" type="button" onClick={() => void handleGenerate()} disabled={isGenerating || node.embedding_status !== 'ready'}>{isGenerating ? 'Generating…' : 'Generate suggestions'}</button></div> : <p className="muted-copy">Start the local FastAPI service and set <code>VITE_SEMANTIC_API_URL</code> to enable embedding.</p>}{error ? <p className="form-error" role="alert">{error}</p> : null}{generationMessage ? <p className="muted-copy" role="status">{generationMessage}</p> : null}<SuggestionsPanel node={node} revision={revision} /></section>
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
