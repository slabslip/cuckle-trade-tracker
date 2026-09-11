# Chuckle Fantasy iOS shell. Requires Xcode on a Mac.
# Law: docs/STORE_LAW.md

ORIGIN ?= https://slabslip.github.io/cuckle-trade-tracker
SCHEME ?= Chuckle
PROJECT ?= Chuckle.xcodeproj

.PHONY: origin build run test archive testflight open

origin:
	@echo "WebView origin: $(ORIGIN)/?store=1"
	@echo "User-Agent: ChuckleStore/1"
	@echo "Override: make build ORIGIN=https://yourdomain.com"

open:
	open $(PROJECT)

run:
	@echo "On a Mac: open $(PROJECT) and Run (Cmd-R) on a simulator or device."
	@echo "Start URL: $(ORIGIN)/?store=1"
	@echo "User-Agent: ChuckleStore/1"

test:
	@echo "Device gate: ../docs/STORE_GATE.md"
	cd .. && node scripts/store-device-gate.mjs

build:
	@echo "Set ChuckleOrigin to $(ORIGIN) in Info.plist if you changed ORIGIN."
	xcodebuild -project $(PROJECT) -scheme $(SCHEME) -destination 'generic/platform=iOS' \
		-configuration Release CODE_SIGNING_ALLOWED=NO build

archive:
	xcodebuild -project $(PROJECT) -scheme $(SCHEME) -configuration Release \
		-archivePath build/Chuckle.xcarchive archive

testflight:
	@echo "1. Open ios/Chuckle.xcodeproj on a Mac"
	@echo "2. Signing & Capabilities → your Apple team"
	@echo "3. Product → Archive → Distribute App → App Store Connect → Upload"
	@echo "4. App Store Connect → TestFlight → internal testers = Cuckle seats"
	@echo "Start URL: $(ORIGIN)/?store=1"
