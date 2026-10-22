import AuthenticationServices
import CryptoKit
import Foundation
import UIKit
import WebKit

/// Native Sign in with Apple for the store shell. The page button posts to
/// `chuckleApple`; we return an identity token into `window.__chuckleAppleCredential`.
final class AppleSignInController: NSObject {
    weak var webView: WKWebView?
    private var currentNonce: String?
    private var activeController: ASAuthorizationController?

    func startSignIn() {
        let nonce = Self.randomNonce()
        currentNonce = nonce
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = Self.sha256(nonce)
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        activeController = controller
        controller.performRequests()
    }

    private func deliver(_ payload: [String: Any]) {
        guard let webView else { return }
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else {
            deliverError("Could not encode Apple credential.")
            return
        }
        let js = "window.__chuckleAppleCredential && window.__chuckleAppleCredential(\(json));"
        DispatchQueue.main.async {
            webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    private func deliverError(_ message: String) {
        deliver(["error": message])
    }

    private static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remaining = length
        while remaining > 0 {
            var random: UInt8 = 0
            let status = SecRandomCopyBytes(kSecRandomDefault, 1, &random)
            if status != errSecSuccess { continue }
            if random < charset.count {
                result.append(charset[Int(random)])
                remaining -= 1
            }
        }
        return result
    }

    private static func sha256(_ input: String) -> String {
        let hash = SHA256.hash(data: Data(input.utf8))
        return hash.map { String(format: "%02x", $0) }.joined()
    }
}

extension AppleSignInController: ASAuthorizationControllerDelegate {
    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        activeController = nil
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            deliverError("Apple did not return an ID credential.")
            return
        }
        guard let tokenData = credential.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8),
              !idToken.isEmpty else {
            deliverError("Apple did not return an identity token.")
            return
        }
        var payload: [String: Any] = [
            "id_token": idToken,
            "nonce": currentNonce as Any,
        ]
        if let codeData = credential.authorizationCode,
           let code = String(data: codeData, encoding: .utf8) {
            payload["authorization_code"] = code
        }
        var nameParts: [String] = []
        if let given = credential.fullName?.givenName, !given.isEmpty { nameParts.append(given) }
        if let family = credential.fullName?.familyName, !family.isEmpty { nameParts.append(family) }
        if !nameParts.isEmpty {
            payload["full_name"] = nameParts.joined(separator: " ")
        }
        if let email = credential.email, !email.isEmpty {
            payload["email"] = email
        }
        currentNonce = nil
        deliver(payload)
    }

    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        activeController = nil
        currentNonce = nil
        let ns = error as NSError
        if ns.domain == ASAuthorizationError.errorDomain,
           ns.code == ASAuthorizationError.canceled.rawValue {
            deliver(["error": "canceled"])
            return
        }
        deliverError(error.localizedDescription)
    }
}

extension AppleSignInController: ASAuthorizationControllerPresentationContextProviding {
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        if let window = webView?.window { return window }
        if let window = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap({ $0.windows })
            .first(where: { $0.isKeyWindow }) {
            return window
        }
        return UIWindow()
    }
}
