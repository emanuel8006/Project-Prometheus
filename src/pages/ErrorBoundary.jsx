import { Component } from 'react';

/**
 * Wraps a section of the app so a thrown error inside it shows a graceful
 * fallback instead of taking down the entire page. Use one per major
 * route/section (Simulator, each Module, each standalone tool) rather than
 * a single boundary around the whole app -- that way a bug in one tool
 * doesn't also kill navigation and everything else.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log for debugging -- swap this for a real error-reporting service
    // (Sentry, LogRocket, etc.) if/when this app has real users.
    console.error('Prometheus error boundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[50vh] flex items-center justify-center p-8">
          <div className="max-w-md text-center bg-white rounded-2xl p-8 shadow-lg">
            <div className="text-4xl mb-4">⚠️</div>
            <h3 className="font-display text-xl font-bold text-navy mb-2">
              {this.props.title || 'Something went wrong here'}
            </h3>
            <p className="text-navy-light mb-6">
              This section hit an error, but the rest of the site is still working fine.
              Try refreshing, or head back and try a different page.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-5 py-2 bg-teal text-white rounded-xl font-semibold hover:bg-teal-light transition-colors"
              >
                Try Again
              </button>
              <a
                href="/"
                className="px-5 py-2 bg-cream-dark text-navy rounded-xl font-semibold hover:bg-navy hover:text-white transition-colors"
              >
                Go Home
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;