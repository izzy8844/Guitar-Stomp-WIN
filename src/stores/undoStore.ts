import { create } from 'zustand'
import { useProjectStore, type ProjectTrigger } from './projectStore'

/**
 * Undo/Redo store using a snapshot-based command stack.
 *
 * Design:
 * - Each snapshot is a frozen copy of the triggers array
 * - pushSnapshot() is called before any mutation (add/remove/update/clear)
 * - undo() restores the previous snapshot; redo() moves forward
 * - Max stack depth to prevent memory issues
 */

const MAX_UNDO_STACK = 50

interface UndoState {
  undoStack: ProjectTrigger[][]
  redoStack: ProjectTrigger[][]
  canUndo: boolean
  canRedo: boolean
  pushSnapshot: () => void
  undo: () => void
  redo: () => void
  clear: () => void
}

export const useUndoStore = create<UndoState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  canUndo: false,
  canRedo: false,

  pushSnapshot: () => {
    const currentTriggers = useProjectStore.getState().triggers
    // Deep copy to freeze the snapshot
    const snapshot = currentTriggers.map(t => ({ ...t }))
    set((s) => {
      const newStack = [...s.undoStack, snapshot]
      if (newStack.length > MAX_UNDO_STACK) {
        newStack.shift()
      }
      return { undoStack: newStack, redoStack: [], canUndo: true, canRedo: false }
    })
  },

  undo: () => {
    const { undoStack } = get()
    if (undoStack.length === 0) return

    // Save current state to redo stack
    const currentTriggers = useProjectStore.getState().triggers.map(t => ({ ...t }))
    const previousSnapshot = undoStack[undoStack.length - 1]
    const newUndoStack = undoStack.slice(0, -1)

    // Restore triggers from the snapshot
    useProjectStore.setState({ triggers: previousSnapshot, isDirty: true })

    set({
      undoStack: newUndoStack,
      redoStack: [...get().redoStack, currentTriggers],
      canUndo: newUndoStack.length > 0,
      canRedo: true,
    })
  },

  redo: () => {
    const { redoStack } = get()
    if (redoStack.length === 0) return

    // Save current state to undo stack
    const currentTriggers = useProjectStore.getState().triggers.map(t => ({ ...t }))
    const nextSnapshot = redoStack[redoStack.length - 1]
    const newRedoStack = redoStack.slice(0, -1)

    // Restore triggers from redo snapshot
    useProjectStore.setState({ triggers: nextSnapshot, isDirty: true })

    set({
      undoStack: [...get().undoStack, currentTriggers],
      redoStack: newRedoStack,
      canUndo: true,
      canRedo: newRedoStack.length > 0,
    })
  },

  clear: () => {
    set({ undoStack: [], redoStack: [], canUndo: false, canRedo: false })
  },
}))
