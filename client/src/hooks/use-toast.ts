import * as React from "react"

import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast"
import { errorTracker } from "@/lib/errorTracker"

const TOAST_LIMIT = 1
const TOAST_REMOVE_DELAY = 1000000

// Track if we're currently showing a confirmation toast to prevent recursion
let isShowingConfirmation = false

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = typeof actionTypes

type Action =
  | {
      type: ActionType["ADD_TOAST"]
      toast: ToasterToast
    }
  | {
      type: ActionType["UPDATE_TOAST"]
      toast: Partial<ToasterToast>
    }
  | {
      type: ActionType["DISMISS_TOAST"]
      toastId?: ToasterToast["id"]
    }
  | {
      type: ActionType["REMOVE_TOAST"]
      toastId?: ToasterToast["id"]
    }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      }
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

const listeners: Array<(state: State) => void> = []

let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

type Toast = Omit<ToasterToast, "id">

// Helper to show confirmation toast
function showAdminNotifiedConfirmation() {
  if (isShowingConfirmation) return
  isShowingConfirmation = true
  
  setTimeout(() => {
    const id = genId()
    dispatch({
      type: "ADD_TOAST",
      toast: {
        id,
        title: "Admin Notified",
        description: "The admin has been notified of this error.",
        variant: "default",
        open: true,
        onOpenChange: (open) => {
          if (!open) dispatch({ type: "DISMISS_TOAST", toastId: id })
        },
      },
    })
    
    // Reset flag after toast is shown
    setTimeout(() => {
      isShowingConfirmation = false
    }, 1000)
  }, 500) // Small delay after error toast
}

// Set up notification callback (will be done on first toast import)
let callbackSetup = false
function setupCallback() {
  if (!callbackSetup) {
    callbackSetup = true
    errorTracker.setNotificationCallback(() => {
      showAdminNotifiedConfirmation()
    })
  }
}

function toast({ ...props }: Toast) {
  // Ensure callback is set up
  setupCallback()
  const id = genId()

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    })
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })

  // If this is a destructive toast (error), capture it in error tracking
  if (props.variant === "destructive" && !isShowingConfirmation) {
    const titleText = typeof props.title === 'string' ? props.title : 'Error'
    const descText = typeof props.description === 'string' ? props.description : ''
    const message = descText ? `${titleText}: ${descText}` : titleText
    
    errorTracker.captureError({
      message,
      errorType: 'frontend',
      severity: 'medium',
      metadata: {
        toastTitle: titleText,
        toastDescription: descText,
        source: 'toast',
      },
    })
  }

  return {
    id: id,
    dismiss,
    update,
  }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [state])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  }
}

export { useToast, toast }
