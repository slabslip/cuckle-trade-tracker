import SwiftUI

@main
struct ChuckleApp: App {
    var body: some Scene {
        WindowGroup {
            StoreWebView()
                .ignoresSafeArea()
        }
    }
}
