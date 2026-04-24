import { useCallback, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, File, Trash2, Loader2, FileText, CheckSquare, Square } from 'lucide-react'
import { ragApi } from '../../api/ragApi'
import { useAppStore } from '../../store/useAppStore'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import type { Document as RagDocument } from '../../types'

const ACCEPTED_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
  'text/markdown': ['.md'],
}

function formatTagMention(filename: string) {
  return /\s/.test(filename) ? `@"${filename}"` : `@${filename}`
}

export default function SourcesPanel() {
  const {
    session,
    documents: docs,
    selectedDocumentIds,
    setDocuments,
    setSelectedDocumentIds,
    toggleDocumentSelection,
  } = useAppStore()
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadDocs = async () => {
    if (!session) return
    try {
      const list = await ragApi.listDocuments(session.id)
      setDocuments(list)
    } catch {
      // silent
    }
  }

  useEffect(() => {
    loadDocs()
  }, [session?.id])

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!session) return
      setUploading(true)
      try {
        for (const file of acceptedFiles) {
          try {
            const doc = await ragApi.upload(session.id, file)
            const { documents, selectedDocumentIds } = useAppStore.getState()
            setDocuments([doc, ...documents])
            setSelectedDocumentIds([...new Set([doc.id, ...selectedDocumentIds])])
            toast.success(`"${file.name}" uploaded (${doc.chunk_count} chunks)`)
          } catch (e: any) {
            toast.error(`Failed to upload "${file.name}": ${e?.response?.data?.detail ?? e.message}`)
          }
        }
      } finally {
        setUploading(false)
      }
    },
    [session, setDocuments, setSelectedDocumentIds],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    disabled: !session || uploading,
    multiple: true,
  })

  const deleteDoc = async (doc: RagDocument) => {
    setDeletingId(doc.id)
    try {
      await ragApi.deleteDocument(doc.id)
      const nextDocs = docs.filter(d => d.id !== doc.id)
      setDocuments(nextDocs)
      toast.success(`"${doc.filename}" removed`)
    } catch {
      toast.error('Failed to delete document')
    } finally {
      setDeletingId(null)
    }
  }

  const allSelected = docs.length > 0 && selectedDocumentIds.length === docs.length

  return (
    <div className="flex flex-col h-full gap-3 p-3">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={clsx(
          'border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors',
          isDragActive
            ? 'border-primary-500 bg-primary-50'
            : 'border-primary-200 hover:border-primary-400 hover:bg-primary-50/50',
          (!session || uploading) && 'opacity-50 cursor-not-allowed',
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2">
          {uploading ? (
            <Loader2 className="w-7 h-7 text-primary-400 animate-spin" />
          ) : (
            <Upload className="w-7 h-7 text-primary-400" />
          )}
          <p className="text-sm text-gray-600">
            {isDragActive
              ? 'Drop files here…'
              : uploading
                ? 'Uploading…'
                : 'Drag & drop files or click to upload'}
          </p>
          <p className="text-xs text-gray-400">PDF, DOCX, TXT, MD · max 20 MB</p>
        </div>
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {docs.length > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-primary-100 bg-primary-50/70 px-3 py-2 text-xs text-gray-500">
            <span>{selectedDocumentIds.length} source{selectedDocumentIds.length === 1 ? '' : 's'} selected for chat context</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedDocumentIds(allSelected ? [] : docs.map((doc) => doc.id))}
                className="text-primary-600 hover:text-primary-700"
              >
                {allSelected ? 'Clear' : 'Select all'}
              </button>
            </div>
          </div>
        )}
        {docs.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-8">
            <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>No documents uploaded yet.</p>
            <p className="text-xs mt-1">Upload files to give the AI knowledge sources.</p>
          </div>
        ) : (
          docs.map(doc => (
            <div
              key={doc.id}
              className={clsx(
                'flex items-start gap-2 rounded-xl border p-2.5 transition-colors',
                selectedDocumentIds.includes(doc.id)
                  ? 'border-primary-300 bg-primary-50'
                  : 'border-primary-100 bg-white hover:bg-primary-50/50',
              )}
            >
              <button
                onClick={() => toggleDocumentSelection(doc.id)}
                className="mt-0.5 flex-shrink-0 text-primary-500 hover:text-primary-700"
                title={selectedDocumentIds.includes(doc.id) ? 'Remove from chat context' : 'Use in chat context'}
              >
                {selectedDocumentIds.includes(doc.id) ? (
                  <CheckSquare className="h-4 w-4" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </button>
              <File className="w-4 h-4 text-primary-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{doc.filename}</p>
                <p className="text-xs text-gray-400">{doc.chunk_count} chunks</p>
                <p className="mt-1 text-[11px] text-gray-400">
                  Tag in chat with <code>{formatTagMention(doc.filename)}</code>
                </p>
              </div>
              <button
                onClick={() => deleteDoc(doc)}
                disabled={deletingId === doc.id}
                className="p-1 hover:bg-red-100 rounded text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
              >
                {deletingId === doc.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
