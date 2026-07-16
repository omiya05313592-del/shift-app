import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    const { error } = this.state
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-svh gap-4 p-6 text-center">
          <p className="text-red-500 font-bold">エラーが発生しました</p>
          <p className="text-xs text-gray-500 font-mono break-all">{error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-xl"
          >
            再試行
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
