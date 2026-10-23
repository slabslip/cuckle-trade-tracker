import SwiftUI
import WebKit

/// Thin signed window onto the live Pages (or custom-domain) origin.
/// Design Mode and preview documents are refused. See docs/STORE_LAW.md.
/// Native Sign in with Apple: page → `chuckleApple` → Apple sheet → JS credential.
struct StoreWebView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.allowsInlineMediaPlayback = true
        // Advertise native Apple so the gate uses the system sheet (not web OAuth).
        let boot = WKUserScript(
            source: "window.chuckleNativeApple = true;",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(boot)
        config.userContentController.add(context.coordinator, name: "chuckleApple")
        let view = WKWebView(frame: .zero, configuration: config)
        view.customUserAgent = StoreOrigin.userAgent
        view.navigationDelegate = context.coordinator
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.allowsBackForwardNavigationGestures = true
        context.coordinator.appleSignIn.webView = view
        context.coordinator.webView = view
        if let url = StoreOrigin.startURL {
            // Always hit the network for the document. Default WKWebView caching was
            // keeping a stale Home after Pages deploys (Safari "Website Data" clear
            // does not wipe this store).
            var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 60)
            req.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
            view.load(req)
        }
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        let appleSignIn = AppleSignInController()
        weak var webView: WKWebView?

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard message.name == "chuckleApple" else { return }
            let action: String
            if let body = message.body as? [String: Any] {
                action = String(describing: body["action"] ?? "signIn")
            } else if let raw = message.body as? String {
                action = raw
            } else {
                action = "signIn"
            }
            if action == "signIn" || action == "1" {
                DispatchQueue.main.async { [weak self] in
                    self?.appleSignIn.startSignIn()
                }
            }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }
            // Allow Apple ID + Supabase Auth hosts. Design Mode / previews stay blocked.
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
        // Bust CDN / intermediary document caches after UI ships.
        let stamp = Int(Date().timeIntervalSince1970)
        return URL(string: origin + "/?store=1&_=\(stamp)")
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
