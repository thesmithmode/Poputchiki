import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            data-testid="error-boundary-fallback"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "100vh",
              padding: 24,
              gap: 12,
            }}
          >
            <p style={{ fontSize: 15, color: "#e74c3c" }}>Что-то пошло не так</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              style={{
                background: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 20px",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Попробовать снова
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
