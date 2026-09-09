# CuckleChunckle — Human Interface law

Phone-first dashboard. Source: [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines).
This file is what we **adopt**. The generator enforces it. If this file and `generate-page.mjs`
disagree, the generator wins and this file is wrong.

Cuckle is not a UIKit app and not an Expo app. We do **not** import SF Pro, SF Symbols,
system blue, `expo-glass-effect`, or a full-screen Liquid Glass skin. We take Apple's
*behavior* laws and keep our dark/gold chrome.

Display chrome → [`UI_SDD.md`](./UI_SDD.md). Product needle → [`PRODUCT.md`](./PRODUCT.md).

---

## 0. What we refuse

- A sixth destination tab, or a + FAB as a tab. Apple allows 3–5 tabs.
  We stay at **four destinations + Menu**: Home | Teams | News | Ledger | Menu.
  Menu is the hamburger disclosure (icon only, named in `aria-label`). It is not a sixth page.
- Replacing gold with system tint. One accent: `--lh-gold` / `#e0b44c`.
- Hiding tab *labels*. Icon-only tabs fail HIG.
- Gesture-only actions. Every swipe has a button.
- Self-animating chrome without a pause control (WCAG 2.2.2). The one permitted motion
  region is user-driven (sheet drag). `prefers-reduced-motion` kills transitions.
- Dropping the 44px floor to fit more rows.
- Redesigning Cuckle to be **exactly like** an Appllama example app (WhatsApp, Reddit,
  Slack, GitHub, or any paywall/onboarding from [appllama.io](https://appllama.io)).
  Study the **pattern** (floating labeled tabs, safe area, one accent). Do not ship
  their pixels, their indigo, or their glass-on-every-card.

---

## 1. Rules (the book)

Each rule has an id. `generate-page.mjs` asserts the id. Do not delete an id; mark it
superseded in the same pass.

| Id | Apple HIG | Cuckle law |
| --- | --- | --- |
| **HIG-01** | 44×44 pt minimum hit target | `--hig-tap: 44px`. Brand chrome (`#goBack`, settings, team) and every `.lh-action` declare at least that. Lists that overflow scroll; they do not shrink the floor. |
| **HIG-02** | Safe areas | Interactive chrome uses `env(safe-area-inset-*)`. The Linear pill sits `12px + safe-area-inset-bottom` off the home indicator. Content under the pill gets `#app` padding, not a second peek. |
| **HIG-03** | Tab bar = 3–5 peer destinations | Four labeled destinations (Home, Teams, News, Ledger) plus a Menu hamburger. News is the Alerts + feed peer. League Data lives in the Menu (`history`). Menu is the one icon-only cell — named `Menu`. |
| **HIG-04** | Selected tab is obvious without color alone | Active tab is a gold **oval** (shape) plus gold type. Ledger waiting is a gold **dot** plus the word Ledger in the accessible name (`N waiting`). News missed is a gold **count bubble** (`N missed`, caps at `9+`). |
| **HIG-05** | 11 pt type floor | No control label under `0.6875rem` (11px). `.lh-lab` is the floor. Body copy stays larger. |
| **HIG-06** | VoiceOver / accessible name | Icon-only brand buttons keep `aria-label`. Tabs keep `role="tab"`, `aria-selected`, and a name that is the label (Ledger may append the wait count). Menu is icon-only and must keep `aria-label="Menu"` plus `aria-haspopup="menu"`. Decorative SVG is `aria-hidden`. |
| **HIG-07** | Keyboard = VoiceOver cousin | One tab stop per tablist. Arrow / Home / End move within **that** list (`.lh-actions` and `.nav`). Escape closes the topmost overlay. Focus rings are `:focus-visible` (`#c8c8d0`). |
| **HIG-08** | Do not hide the tab bar inside a tab | The pill stays up on Home / Teams / News / Ledger / League Data. Sub-screens (`calc`, `cosmetics`, Settings, a seat) may hide it — they are modals / drill-ins, not tabs. Returning restores it. |
| **HIG-09** | Reduced motion | No `@keyframes` without a pause control. `prefers-reduced-motion: reduce` disables sheet transitions. |
| **HIG-10** | Thumb zone | Primary league navigation is the bottom pill. Destructive / rare actions stay out of that row. |
| **HIG-11** | 8 pt rhythm | Spacing tokens step 4/8/12/16/24. `--hig-space: 8px`. Do not invent a fifth spacing scale. |
| **HIG-12** | Contrast + one accent | Text on `--bg` / `--card` uses `--text` / `--muted` / `--dim`. Interactive gold is the same gold everywhere. Do not encode meaning in hue alone (Needles stay words + numbers). |
| **HIG-13** | Pinch-zoom / Dynamic Type | Apple wants pinch-zoom. Cuckle **locks scale** (`user-scalable=no`, `maximum-scale=1`) so iOS does not zoom the page when a field focuses. The compensating control is **16px** on `input, select, textarea`. Do not drop that 16px floor. Design Mode stays width-locked at 390. |
| **HIG-14** | Back is a system expectation | Top-left `#goBack` is the drill-in back. Do not steal the left-edge swipe for a custom gesture. `#leagueSub` is the skip-to-Home control, not a second back chevron. |
| **HIG-15** | Content over chrome | The pill is a floating layer, not a full-width iOS 14 tab bar. It does not grow a sixth cell. Menu is a **separate** glass popover above the unchanged pill (video hamburger pattern). Calculator, League Data, and Settings live in that list. Three reserved slot nodes stay in the card; empty slots collapse. |
| **HIG-16** | Study before you draw | Apple + peer apps are research. Extract layout skeleton and hierarchy. Never clone another app 1:1 ([Appllama skill](https://github.com/Appllama/appllama-skills): pattern, not pixels). Cuckle voice stays. |
| **HIG-17** | Glass is a control, not a wallpaper | iOS 26 Liquid Glass / `expo-glass-effect` is native-only. On this static page the **two** glass surfaces are the Linear pill and the Menu popover: same `backdrop-filter` + gold hairline. No glass on cards, banners, or the page shell. Apple: use glass sparingly on functional chrome. |
| **HIG-18** | Reduce Transparency | `prefers-reduced-transparency: reduce` turns the pill **and** the Menu popover opaque and kills blur. Clarity beats decoration. Same family as HIG-09. |
| **HIG-19** | Menu is a popover, not a morph | Far-right hamburger opens a floating glass card (`position: absolute`, `bottom: calc(100% + 10px)`, `border-radius: 28px`) above the pill. The pill stays a pill. Icon + label rows. No hairline dividers. No `max-height` sheet stretch. Pattern source: the Linear-style bar video (rizz_abh). Do not morph the pill upward (that reading of HIG-15 is superseded). |
| **HIG-20** | Menu selection is a capsule | Hover / focus / selected / pressed menu rows use a gold **capsule** plus gold type. Pressed is `:active` (Apple: immediate feedback). No system blue (`#007AFF` / `#0A84FF`). |
| **HIG-21** | One header row | Header is gold mark + **More**. No second toolbar. No filter sliders (the video's sliders are their product, not ours — a dead control fails HIG). No + FAB. |
| **HIG-22** | Menu keyboard | Open: focus the first menuitem; ArrowUp / ArrowDown / Home / End move menuitems before tab roving. Tab and Escape close. Closed panel is `inert` (not in the tab order). Close restores focus to the hamburger. |

---

## 2. Linear pill (HIG-03 / iOS 26 floating tab bar)

Apple's current tab bar floats over content. Ours already does. Laws on that chrome:

- Five cells, `repeat(5, minmax(0, 1fr))`, no wrap. Taller than the first Linear pass (`--lh-nav-h: 72px`) so a thumb can hit each cell.
- Label always painted (`.lh-lab`) on Home / Teams / News / Ledger. Menu is the hamburger-only exception.
- Selected = oval, not an underline (`inset 0 -2px 0` is forbidden).
- Ledger badge is a dot. News missed is a small count bubble, not a second label.
- Pill clears the home indicator (`HIG-02`).
- Roving tabindex: selected tab is `tabindex="0"`, the others `-1`.
- Glass (`HIG-17`): frosted fill, blur, saturate, inset highlight on the pill **and**
  the Menu popover. Opaque under `prefers-reduced-transparency` (`HIG-18`).
- Menu (`HIG-19`…`HIG-22`): separate card above the pill, not a morph. Header is
  mark + More. Rows are icon + label with a gold capsule, no dividers. Closed
  panel is `inert`. Escape / Tab / scrim / Back close and restore the hamburger.

---

## 3. Tokens

These are floors, not a new palette. Existing color variables stay the only hues.

```css
:root {
  --hig-tap: 44px;
  --hig-space: 8px;
  --hig-caption: 0.6875rem;
}
```

`--lh-gold` and `--lh-nav-h` remain the pill's brand tokens.

---

## 4. How a new screen inherits this

1. Tap targets declare `min-height: var(--hig-tap)` (or larger).
2. If it is a peer of Home, it is a **tab** — Menu is the overflow, not a free sixth tab.
3. If it is a task (calc, Settings, a trade), it is a **sub-screen**: hide the pill, keep Back. League Data stays in-pill via Menu.
4. Name every icon. Hide decorative art from AT.
5. Add a generate assertion next to the `HIG-*` block, not a comment in CSS.

---

## 5. Source

- Apple: <https://developer.apple.com/design/human-interface-guidelines>
- Pattern research (not a clone target): <https://appllama.io> ·
  [Appllama skills](https://github.com/Appllama/appllama-skills)
- Tweet that triggered HIG-16…18:
  [jaimintf / copy Apple + liquid glass prompt](https://x.com/jaimintf/status/2097329559838556236)
- Menu popover pattern (HIG-19…22), not a pixel clone:
  [rizz_abh / Linear-style bottom bar](https://x.com/rizz_abh/status/2097348732618735787)

Adopted chapters: Layout (44pt, safe area, thumb zone), Navigation / Tab bars,
Typography (11pt floor), Color (not alone; contrast), Accessibility (labels, keyboard,
reduced motion, reduced transparency), Inputs (16px / no-focus-zoom).
Glass: functional chrome only — CSS fallback, not Expo.
