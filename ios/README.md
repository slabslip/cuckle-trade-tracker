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
