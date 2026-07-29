import { useEffect } from 'react'

const siteTitle = 'Mandy Zhang — Personal Web'
const defaultDescription = 'Mandy Zhang is a Yale Computer Science student building AI, machine-learning, and social-impact projects.'

function updateMeta(selector: string, attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.append(element)
  }
  element.content = content
}

export function usePageMetadata(pageTitle?: string, description = defaultDescription) {
  useEffect(() => {
    const title = pageTitle ? `${pageTitle} — Mandy Zhang` : siteTitle
    document.title = title
    updateMeta('meta[name="description"]', 'name', 'description', description)
    updateMeta('meta[property="og:title"]', 'property', 'og:title', title)
    updateMeta('meta[property="og:description"]', 'property', 'og:description', description)
    updateMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title)
    updateMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description)
  }, [description, pageTitle])
}
