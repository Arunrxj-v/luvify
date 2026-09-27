/**
 * Error boundary around the generated website preview.
 *
 * The preview renders server-generated markup in an iframe and maps over the
 * page list; a rendering failure there must show a useful error instead of a
 * blank white screen. During development the actual error (and stack) is
 * exposed inline so the root cause is visible without opening the console.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Rendered instead of the error UI when the subtree recovers. */
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

export class PreviewErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surfaced here too, so the failure is visible in the console with the
    // component stack even when the inline UI is not expanded.
    console.error("[preview] rendering failed:", error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const development = import.meta.env.DEV;
    return (
      <div className="preview-error" role="alert">
        <h3>The generated website failed to render</h3>
        <p className="muted">
          {development
            ? error.message
            : "Something went wrong while rendering the preview. The website itself was saved - try reloading the preview."}
        </p>
        {development && error.stack ? (
          <pre className="preview-error__stack">{error.stack}</pre>
        ) : null}
        {this.props.onReset ? (
          <button className="btn" onClick={this.props.onReset}>
            Retry
          </button>
        ) : null}
      </div>
    );
  }
}
