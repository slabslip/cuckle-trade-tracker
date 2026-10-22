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
Sign in with Apple: enable the capability on the App ID; entitlements are in
`Chuckle/Chuckle.entitlements`. Wire the same Services ID into Supabase Auth →
Apple so the gate’s **Continue with Apple** button works in the WKWebView.
