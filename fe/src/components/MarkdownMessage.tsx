import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github.css'

interface Props {
  content: string
}

/**
 * Render chat message content as Markdown with GFM (tables, task lists,
 * strikethrough) and syntax-highlighted code blocks. Links open in a new tab.
 */
export default function MarkdownMessage({ content }: Props) {
  return (
    <div className="markdown-body min-w-0 text-sm leading-relaxed [overflow-wrap:anywhere]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a: ({ node, ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-700 underline hover:text-primary-800 [overflow-wrap:anywhere]"
            />
          ),
          code: ({ node, className, children, ...props }) => {
            const inline = !className
            if (inline) {
              return (
                <code className="px-1 py-0.5 rounded bg-gray-100 text-[0.85em] font-mono break-all" {...props}>
                  {children}
                </code>
              )
            }
            return (
              <code className={`${className ?? ''} break-words`} {...props}>
                {children}
              </code>
            )
          },
          pre: ({ children }) => (
            <pre className="my-2 p-2.5 rounded-md bg-gray-50 border border-gray-200 overflow-x-auto text-[0.82rem]">
              {children}
            </pre>
          ),
          ul: ({ children }) => <ul className="list-disc pl-5 my-1 space-y-0.5 [overflow-wrap:anywhere]">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 my-1 space-y-0.5 [overflow-wrap:anywhere]">{children}</ol>,
          li: ({ children }) => <li className="leading-snug [overflow-wrap:anywhere]">{children}</li>,
          p: ({ children }) => <p className="my-1 first:mt-0 last:mb-0 [overflow-wrap:anywhere]">{children}</p>,
          h1: ({ children }) => <h1 className="mt-2 mb-1 text-base font-semibold">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-2 mb-1 text-sm font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-1.5 mb-0.5 text-sm font-semibold">{children}</h3>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary-300 pl-2 my-1 text-gray-600">{children}</blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-gray-300 px-2 py-1 bg-gray-50 text-left font-medium">{children}</th>,
          td: ({ children }) => <td className="border border-gray-300 px-2 py-1 align-top">{children}</td>,
          img: ({ node, ...props }) => (
            <img {...props} className="max-w-full h-auto my-1 rounded" loading="lazy" />
          ),
          hr: () => <hr className="my-2 border-gray-200" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
