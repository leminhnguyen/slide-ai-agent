import { create } from 'zustand'
import type { Document, SlideSession } from '../types'

interface AppStore {
  session: SlideSession | null
  documents: Document[]
  selectedDocumentIds: string[]
  setSession: (s: SlideSession) => void
  setDocuments: (docs: Document[]) => void
  toggleDocumentSelection: (docId: string) => void
  setSelectedDocumentIds: (docIds: string[]) => void
  updateMarkdown: (md: string) => void
  updateTitle: (title: string) => void
}

export const useAppStore = create<AppStore>((set) => ({
  session: null,
  documents: [],
  selectedDocumentIds: [],
  setSession: (session) =>
    set((state) => ({
      session,
      documents: state.session?.id === session.id ? state.documents : [],
      selectedDocumentIds: state.session?.id === session.id ? state.selectedDocumentIds : [],
    })),
  setDocuments: (documents) =>
    set((state) => ({
      documents,
      selectedDocumentIds: state.selectedDocumentIds.filter((docId) =>
        documents.some((doc) => doc.id === docId),
      ),
    })),
  toggleDocumentSelection: (docId) =>
    set((state) => ({
      selectedDocumentIds: state.selectedDocumentIds.includes(docId)
        ? state.selectedDocumentIds.filter((id) => id !== docId)
        : [...state.selectedDocumentIds, docId],
    })),
  setSelectedDocumentIds: (selectedDocumentIds) => set({ selectedDocumentIds }),
  updateMarkdown: (markdown) =>
    set((state) => state.session ? { session: { ...state.session, markdown } } : {}),
  updateTitle: (title) =>
    set((state) => state.session ? { session: { ...state.session, title } } : {}),
}))
