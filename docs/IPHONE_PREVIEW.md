# iPhone preview (local)

Agent Chrome on the cloud VM is **not** visible in your Cursor Simple Browser / Design Mode. Open these URLs yourself.

## See the iPhone bezel

1. Ensure a static server is running from the repo root (`python3 -m http.server 8799`).
2. In Cursor: **Simple Browser** → paste:

```
http://127.0.0.1:8799/iphone-preview.html
```

Same page: `design-league-home-frame.html`.

You should see News Feed + Latest trade inside an iPhone shell (Dynamic Island + home bar).

## Design Mode (clickable DOM)

Bezel pages use an iframe, so Design Mode cannot select the app DOM. Open instead:

```
http://127.0.0.1:8799/design-league-home.html
```

That seeds Design Mode storage and lands on the PSA league home **without** a phone frame.
