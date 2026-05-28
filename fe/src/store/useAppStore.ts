import { create } from 'zustand'
import type { Document, SlideSession, SlideSessionSummary } from '../types'

interface AppStore {
  session: SlideSession | null
  sessions: SlideSessionSummary[]
  documents: Document[]
  selectedDocumentIds: string[]
  setSession: (s: SlideSession) => void
  setSessions: (sessions: SlideSessionSummary[]) => void
  upsertSessionSummary: (summary: SlideSessionSummary) => void
  removeSessionSummary: (sessionId: string) => void
  setDocuments: (docs: Document[]) => void
  toggleDocumentSelection: (docId: string) => void
  setSelectedDocumentIds: (docIds: string[]) => void
  updateMarkdown: (md: string) => void
  updateTitle: (title: string) => void
}

export const useAppStore = create<AppStore>((set) => ({
  session: null,
  sessions: [],
  documents: [],
  selectedDocumentIds: [],
  setSession: (session) =>
    set((state) => ({
      session,
      documents: state.session?.id === session.id ? state.documents : [],
      selectedDocumentIds: state.session?.id === session.id ? state.selectedDocumentIds : [],
    })),
  setSessions: (sessions) => set({ sessions }),
  upsertSessionSummary: (summary) =>
    set((state) => {
      const withoutCurrent = state.sessions.filter((session) => session.id !== summary.id)
      return {
        sessions: [summary, ...withoutCurrent].sort(
          (a, b) =>
            new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime(),
        ),
      }
    }),
  removeSessionSummary: (sessionId) =>
    set((state) => ({
      sessions: state.sessions.filter((session) => session.id !== sessionId),
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
