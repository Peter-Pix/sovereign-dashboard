// ErrorBoundary — zachytí runtime chybu v React tree a zobrazí ji místo bílé obrazovky.
// Bez něj uncaught exception (např. ReferenceError při mountu komponenty) shodí celý
// React tree → bílá obrazovka. S ním vidíš, která komponenta a která chyba to je.
import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { error: null, info: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="bg-[#111] border border-red-500/30 rounded-xl p-6 text-left">
          <h3 className="text-sm font-semibold text-[#e85d5d] mb-2">
            ⚠️ Chyba při renderu
          </h3>
          <pre className="text-xs text-[#e85d5d] font-mono whitespace-pre-wrap break-all mb-3">
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <div className="text-xs text-[#5c5c5c] font-mono max-h-40 overflow-y-auto">
            {this.state.error?.stack?.split("\n").slice(0, 6).join("\n")}
          </div>
          <button
            onClick={() => this.setState({ error: null, info: null })}
            className="mt-3 text-xs px-3 py-1.5 rounded-md bg-[#C89B3C] text-[#0a0a0a] font-semibold hover:bg-[#8f6f26] transition-colors"
          >
            Zkusit znovu
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
