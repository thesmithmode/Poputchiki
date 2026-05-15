import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  componentStack: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: "", componentStack: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message ?? String(error), componentStack: "" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
    this.setState({ componentStack: info.componentStack ?? "" });
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
              alignItems: "flex-start",
              justifyContent: "center",
              minHeight: "100vh",
              padding: 24,
              gap: 12,
            }}
          >
            <p style={{ fontSize: 15, color: "var(--brand-danger)", margin: 0 }}>
              Что-то пошло не так
            </p>
            {this.state.errorMessage && (
              <pre
                style={{
                  fontSize: 11,
                  color: "var(--brand-sub)",
                  background: "#f5f5f5",
                  padding: 8,
                  borderRadius: 6,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  maxHeight: 200,
                  overflow: "auto",
                  width: "100%",
                  margin: 0,
                }}
              >
                {this.state.errorMessage}
                {"\n\n"}
                {this.state.componentStack.slice(0, 600)}
              </pre>
            )}
            <button
              type="button"
              onClick={() =>
                this.setState({ hasError: false, errorMessage: "", componentStack: "" })
              }
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
