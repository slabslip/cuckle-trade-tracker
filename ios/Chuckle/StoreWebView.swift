import SwiftUI
import WebKit

/// Thin signed window onto the live Pages (or custom-domain) origin.
/// Design Mode and preview documents are refused. See docs/STORE_LAW.md.
struct StoreWebView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.allowsInlineMediaPlayback = true
        let view = WKWebView(frame: .zero, configuration: config)
        view.customUserAgent = StoreOrigin.userAgent
        view.navigationDelegate = context.coordinator
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.allowsBackForwardNavigationGestures = true
        if let url = StoreOrigin.startURL {
            view.load(URLRequest(url: url))
        }
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate {
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }
            if StoreOrigin.isBlocked(url) {
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }
    }
}

enum StoreOrigin {
    static let defaultOrigin = "https://slabslip.github.io/cuckle-trade-tracker"
    static let userAgent = "Mozilla/5.0 ChuckleStore/1 (iPhone; Chuckle Fantasy)"

    static var origin: String {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "ChuckleOrigin") as? String,
           !raw.isEmpty {
            return raw.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        }
        return defaultOrigin
    }

    static var startURL: URL? {
        URL(string: origin + "/?store=1")
    }

    static func isBlocked(_ url: URL) -> Bool {
        let s = url.absoluteString.lowercased()
        let path = url.path.lowercased()
        if s.contains("design=") { return true }
        if path.contains("design-league-home") { return true }
        if path.hasSuffix("iphone-preview.html") { return true }
        if path.hasSuffix("preview.html") { return true }
        return false
    }
}
