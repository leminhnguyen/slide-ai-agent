export interface SlideOption {
  number: number
  title: string
}

export function splitSlides(markdown: string): string[] {
  const lines = markdown.split('\n')
  let inFrontmatter = false
  let frontmatterDone = false
  const frontmatterLines: string[] = []
  const bodyLines: string[] = []

  for (const line of lines) {
    if (!frontmatterDone && !inFrontmatter && line.trim() === '---') {
      inFrontmatter = true
      frontmatterLines.push(line)
      continue
    }
    if (inFrontmatter && !frontmatterDone) {
      frontmatterLines.push(line)
      if (line.trim() === '---') {
        inFrontmatter = false
        frontmatterDone = true
      }
      continue
    }
    bodyLines.push(line)
  }

  const body = bodyLines.join('\n').trim()
  const rawSlides = body
    ? body
      .split(/\n\s*---\s*\n/g)
      .map((slide) => slide.trim())
      .filter(Boolean)
    : []

  if (!rawSlides.length) return []

  const frontmatter = frontmatterLines.join('\n').trim()
  if (frontmatter) {
    rawSlides[0] = `${frontmatter}\n\n${rawSlides[0]}`
  }

  return rawSlides
}

export function joinSlides(slides: string[]): string {
  return slides.join('\n\n---\n\n')
}

function getSlideTitle(slideMarkdown: string, slideNumber: number): string {
  const lines = slideMarkdown.split('\n')
  let inFrontmatter = false
  let frontmatterDone = false

  for (const line of lines) {
    if (!frontmatterDone && !inFrontmatter && line.trim() === '---') {
      inFrontmatter = true
      continue
    }
    if (inFrontmatter && !frontmatterDone) {
      if (line.trim() === '---') {
        inFrontmatter = false
        frontmatterDone = true
      }
      continue
    }

    const match = line.trim().match(/^#{1,6}\s+(.+)$/)
    if (match) return match[1].trim()
  }

  return `Slide ${slideNumber}`
}

export function getSlideOptions(markdown: string): SlideOption[] {
  return splitSlides(markdown).map((slide, index) => ({
    number: index + 1,
    title: getSlideTitle(slide, index + 1),
  }))
}

export function appendImageToSlide(
  markdown: string,
  slideNumber: number,
  imageUrl: string,
  altText?: string,
): string {
  const slides = splitSlides(markdown)
  if (slideNumber < 1 || slideNumber > slides.length) {
    throw new Error(`Invalid slide number ${slideNumber}.`)
  }

  const fallbackAlt = imageUrl.split('/').pop() || 'Generated image'
  const imageMarkdown = `\n\n![${altText?.trim() || fallbackAlt}](${imageUrl})`
  slides[slideNumber - 1] = slides[slideNumber - 1].replace(/\s+$/, '') + imageMarkdown

  return joinSlides(slides)
}
