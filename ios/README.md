# Chuckle iOS shell

WKWebView onto the live site (`?store=1`). Law: [`docs/STORE_LAW.md`](../docs/STORE_LAW.md).
Ops: [`docs/STORE_OPS.md`](../docs/STORE_OPS.md).

```bash
cd ios
make origin
make test          # Chrome store-device-gate (no Xcode)
# On a Mac with Xcode:
make run           # notes for Cmd-R
open Chuckle.xcodeproj
make testflight
```

Bundle id: `com.chuckle.fantasy`. Portrait only. Design Mode URLs are blocked.
App icon: `data/ui/icon-1024.png` copied into the asset catalog.
Signing: Debug/Release use **Automatic** signing with team `44RJM54LSJ` (override
in Xcode if your seat is on another team). `CODE_SIGNING_ALLOWED` must stay **Yes**
for device runs — otherwise Sign in with Apple fails with `AKAuthenticationError -7026`
/ `ASAuthorizationError 1000` because the entitlement never lands in the binary.
Sign in with Apple: enable the capability on the App ID; entitlements are in
`Chuckle/Chuckle.entitlements`. The gate’s **Sign in with Apple** button calls
native `ASAuthorizationAppleIDProvider` via `AppleSignIn.swift` (one-tap sheet),
then exchanges the identity token with Supabase. Wire Apple in Supabase Auth →
Providers → Apple (Services ID for Safari; App ID for the binary).

To test this branch before Pages merges to `main`, point the WebView at a host
serving this checkout:

```bash
# Mac terminal in repo root
python3 -m http.server 8765
# ngrok / Cloudflare tunnel → https://….then in Xcode Info:
# ChuckleOrigin = https://your-tunnel.example
```
