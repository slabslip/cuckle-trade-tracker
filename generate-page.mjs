#!/usr/bin/env node
/** Per-person dashboard. Loads data/ui/*.json — serve over http. */
import fs from "node:fs";
import { ROOT } from "./lib.mjs";

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta http-equiv="Cache-Control" content="no-cache" />
  <meta name="theme-color" content="#0b0b0d" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black" />
  <title>CuckleChunckle</title>
  <style>
    :root {
      --bg: #0b0b0d; --card: #141416; --line: #2a2a30;
      --text: #f0f0f0; --muted: #9a9aa3; --dim: #8a8a93;
      --green: #3ddc97; --red: #e05555;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; background: var(--bg); color: var(--text); overflow-x: hidden; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 16px;
      max-width: 920px; margin: 0 auto;
      padding:
        max(16px, env(safe-area-inset-top, 0px))
        max(16px, env(safe-area-inset-right, 0px))
        max(24px, env(safe-area-inset-bottom, 0px))
        max(16px, env(safe-area-inset-left, 0px));
      -webkit-tap-highlight-color: rgba(255,255,255,0.08);
    }
    /* This header must never clip, and the rule is load-bearing again. It held the seat picker
       until the Teams chip replaced it, and overflow: hidden here clipped that menu to the 44px
       header twice -- 44px of a 472px menu, one option of eleven hit-testable. The removal pass
       kept the rule while it protected nothing; #scoreAs is now absolutely positioned against
       .lens-wrap inside this h1, so a clip here would hide the clock control's whole panel and
       reproduce that defect exactly. What keeps the row inside the viewport is the ellipsis on
       h1.brand a plus the trigger's own font step, not a clip. */
    h1.brand {
      display: flex; align-items: center; gap: 10px;
      font-size: 1.4rem; font-weight: 650; margin: 0 0 12px; letter-spacing: -0.02em;
      overflow: visible;
    }
    h1.brand a {
      color: inherit; text-decoration: none; margin-right: auto;
      min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      /* It is a link home, so it is a target as well as a title. The line box carries the
         44px rather than padding, which would push the ellipsis off the text. */
      min-height: 44px; line-height: 44px;
    }
    button.go-home {
      flex: 0 0 auto; appearance: none; font: inherit; color: inherit;
      background: var(--card); border: 1px solid var(--line); border-radius: 10px;
      width: 44px; height: 44px; padding: 0; display: grid; place-items: center; cursor: pointer;
    }
    button.go-home:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 2px; }
    h2 { font-size: 1.05rem; font-weight: 650; margin: 26px 0 8px; }
    p { color: var(--muted); line-height: 1.45; margin: 0 0 14px; }
    .caption { font-size: 0.8125rem; color: var(--dim); margin: 6px 0 14px; }
    /* Every sentence that explains a value: a style tile, a stat box, a Score as option,
       a vote caption, a chart header. They all wrap, and they all stranded one short word
       on a last line -- "Fair.", "deals.", "out" -- inside a box small enough that the
       orphan reads as a rendering fault rather than as prose. This balances the last lines
       instead; where the property is unsupported the text wraps exactly as it does now. */
    .caption, .thesis,
    button.mark span, .stat span, .mark-chart-h span,
    #scoreAs button.score-opt span, button.vote-opt span, .day-alert-h span,
    .leg > span, .hop > span {
      text-wrap: pretty;
    }
    #lead:empty { display: none; }
    /* The clock control's mount, in the space the seat picker used to hold. Its own stacking
       context above every panel inside #app -- .filter-wrap is 4 and .ds-wrap is 3 -- because
       this control is persistent chrome and its panel drops down over whatever screen is below
       it. Nothing here may clip: #scoreAs is absolutely positioned against it, and a hidden
       overflow anywhere up this chain is what made the seat picker unusable twice. */
    .lens-wrap { position: relative; flex: 0 0 auto; z-index: 5; }
    /* The brand plus the seat picker needed 394px of a 343px row at 375px, so the picker ran off
       the right edge and the title stepped down to buy it back. The picker is gone and the clock
       control took its place, so the row is carrying a control again and the step still earns its
       keep. The trigger takes the same step the picker did, and at 320px that step is what makes
       the row fit: the widest of the five labels measures 107.7px at 0.75rem, leaving 1.4px of
       the 288px row, and 116.7px at 0.8125rem, which would ellipsise the title. */
    @media (max-width: 460px) {
      h1.brand { font-size: 1.2rem; gap: 8px; }
      #lensBtn { font-size: 0.75rem; }
    }
    /* 320px is the narrowest phone still in use and nothing here had been checked at it.
       The row is 288px after the body padding: 44 for the home icon, two 6px gaps, the clock
       trigger, and the rest for the title -- which was 100px against the 147px the word needs
       when the seat picker took the other half of the row, so the app's own name read
       "CuckleChunc…". At 1rem the title needs 122.9px and the widest trigger label takes
       107.7px, which fits by 1.4px. That is under one character, and it is the title that gives
       when a font fallback eats it: h1.brand a carries the ellipsis and the trigger does not,
       because a control never truncates before a wordmark does. Measured, not assumed --
       body.scrollWidth equals 320 on all five labels. */
    @media (max-width: 360px) {
      h1.brand { font-size: 1rem; gap: 6px; }
    }
    /* All ten managers have to be on screen at once -- this is the most-used control in the app
       and a list you have to scroll to reach half of is the thing being fixed. Ten options at the
       44px minimum plus the menu's 4px padding and 1px border is 450px, so the cap is that plus a
       few pixels of slack. The second term is the room a phone has for it at all, which is what
       stops it growing past the viewport in landscape -- it does not know where on the page the
       trigger sits, and since the header picker was removed this menu opens from league home's
       Teams chip, halfway down the screen. showMenu() is what puts it on screen from there; this
       cap is what keeps it short enough for that to be possible.
       Do not lower the 44px to make a longer list fit -- raise this instead, and check
       scrollHeight == clientHeight at 568px, which is the shortest phone we care about. */
    .who-menu {
      position: absolute; top: calc(100% + 4px); right: 0; z-index: 40;
      /* 168px cut a 27-character seat name to "BartholomewCuckl…", and the crown now takes
         19px more of that row. The menu is anchored to the right edge and floats over the
         page, so it can take the width the trigger cannot, and it still yields to the
         viewport on the narrowest phone. */
      width: 220px; max-width: calc(100vw - 32px);
      max-height: min(calc(10 * 44px + 16px), calc(100dvh - 88px)); overflow-y: auto;
      background: var(--card); border: 1px solid var(--line); border-radius: 10px;
      padding: 4px 0; margin: 0;
      box-shadow: 0 10px 28px rgba(0,0,0,0.55);
    }
    /* A flex row so the crown can sit beside the name. The name keeps the ellipsis, and it needs
       min-width: 0 to get it -- a flex item's automatic minimum is min-content (§3a). */
    .who-menu button {
      display: flex; align-items: center; gap: 6px;
      width: 100%; appearance: none; font: inherit;
      font-size: 0.8125rem; color: var(--muted); text-align: left;
      background: transparent; border: 0;
      min-height: 44px; padding: 6px 12px; cursor: pointer;
    }
    .who-menu .who-name {
      min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    /* Same box as a text emoji (🤢): 1.15em, nudged to the baseline so it sits with the name. */
    img.seat-flair, svg.crown {
      display: inline-block; width: 1.15em; height: 1.15em;
      vertical-align: -0.2em; object-fit: contain; flex: 0 0 auto;
    }
    .who-menu button[aria-selected="true"] { color: var(--text); }
    .who-menu button.on { color: var(--text); }
    .who-menu button:focus-visible { outline: 2px solid #c8c8d0; outline-offset: -2px; }
    button.row, button.chip, button.tab, .row {
      appearance: none; font: inherit; color: inherit; text-align: left;
      background: var(--card); border: 1px solid var(--line); border-radius: 10px;
      min-height: 44px; touch-action: manipulation;
    }
    button.row, button.chip, button.tab { cursor: pointer; }
    button.tab:focus-visible, button.chip:focus-visible, button.row:focus-visible {
      outline: 2px solid #c8c8d0; outline-offset: 2px;
    }
    .you { color: var(--text); font-weight: 650; }
    /* Four tabs at 375px wrapped onto two lines. They share the row instead. */
    .nav { display: flex; gap: 8px; flex-wrap: nowrap; margin: 12px 0 16px; }
    .nav button.tab { flex: 1 1 0; min-width: 0; text-align: center; padding: 10px 6px; }
    /* At 320px a quarter of the row is 66px and "partners" needs 60px of the 54px the
       padding left it, so the longest tab label spilled its own pill. The gaps and the
       side padding pay for it; the label keeps its size. */
    @media (max-width: 360px) { .nav { gap: 4px; } .nav button.tab { padding: 10px 2px; } }
    @media (min-width: 560px) { .nav { justify-content: flex-start; } .nav button.tab { flex: 0 0 auto; padding: 10px 18px; } }
    button.tab, button.chip {
      border-radius: 999px; padding: 10px 14px; color: var(--muted);
    }
    button.tab.on { color: var(--text); background: #1c1c22; }
    /* A screen that replaces the page instead of expanding inside it needs its own way out.
       The home icon in the header is the constant; this is the one step back. */
    button.chip.back { color: var(--text); margin: 0 0 2px; }
    h2.screen-h { margin-top: 14px; }
    h2.screen-h:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 4px; }
    /* Whose page this is. The header's picker names the control rather than the selection, so
       on a seat's four tabs this is the only thing on screen that says which manager you are
       looking at. It sits above the tab row so it frames the tabs instead of reading as the
       first item of whichever one is open. A display name is one unbroken word -- 17 characters
       for DarkWingDucks2023, which has pushed this app past its own viewport twice -- and a
       heading has no ellipsis to fall back on, so it is allowed to break mid-word. */
    h2.seat-h {
      margin: 2px 0 0; font-size: 1.15rem; overflow-wrap: anywhere;
    }
    .screen-foot { margin: 20px 0 0; }
    .sr-only {
      position: absolute; width: 1px; height: 1px; margin: -1px;
      overflow: hidden; clip-path: inset(50%); white-space: nowrap;
    }
    .pos { color: var(--green); } .neg { color: var(--red); }
    .row { width: 100%; padding: 12px; margin: 0 0 8px; }
    .row-top { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
    /* Same rule as the tape below, applied to the plain row: a flex item's automatic minimum
       is min-content, so without this the text column refuses to shrink and pushes the figure
       out of the card. The figure is the one thing that must not give, so it also never wraps
       -- "-1,234" has a break opportunity after the sign, and a value split across two lines
       is a worse failure than a name that ellipsises. */
    .row-top > * { min-width: 0; }
    .row-top > .margin { flex: 0 0 auto; white-space: nowrap; }
    /* min-width: 0 lets the text column shrink, but a name with no space in it has no
       soft wrap opportunity to shrink to, so it spilled the card anyway. These rows carry
       one name and one figure and can afford a second line, so they wrap rather than
       ellipsise -- the opposite of the tape, which is dense and has two names to place.
       anywhere rather than break-word because only anywhere lowers the min-content size,
       which is the measurement the track is sized from. */
    .row-top:not(.tape) .names { overflow-wrap: anywhere; }
    /* min-width: 0 everywhere a track holds text. Without it a grid track cannot shrink
       below its longest word, so a name like DarkWingDucks2023 pushed the value it sits
       next to past the card edge at 375px. Names ellipsize; figures never do. */
    /* Two columns, no middle track. The margin used to live in a centre column as one
       unsigned number with an arrow for direction; it is now a signed figure on each side,
       so the column it sat in has nothing left to hold and the date/caption already spans
       the full row below. */
    .row-top.tape { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 2px 14px; width: 100%; align-items: start; }
    .row-top.tape > * { min-width: 0; }
    .row-top.tape .side { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .row-top.tape .side-line { display: flex; gap: 6px; align-items: baseline; min-width: 0; }
    .row-top.tape .side.right { text-align: right; }
    /* Both sides write name, then signed delta, then bag total, so the stacked phone row
       reads the same way on every line; row-reverse is what mirrors the pair on the wide
       tape, which puts each delta beside its own name and both totals inboard. */
    .row-top.tape .side.right .side-line { flex-direction: row-reverse; justify-content: flex-start; }
    /* The delta and the bag total are one flex child, not two, so a line too short for all
       three drops the pair together instead of orphaning the total. */
    .row-top.tape .figs { display: flex; gap: 6px; align-items: baseline; flex: 0 0 auto; }
    .row-top.tape .side.right .figs { flex-direction: row-reverse; }
    .row-top.tape .names {
      min-width: 0; flex: 0 1 auto;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    /* The caption spans the whole row instead of sharing the middle column. Sitting in
       that auto track it sized the track to its own max-content, and on the lopsided
       board -- where the caption carries a headline -- that left the 1fr name tracks 0px. */
    .row-top.tape .tape-sub {
      grid-column: 1 / -1; display: flex; justify-content: center;
      gap: 6px; min-width: 0; margin-top: 2px;
    }
    .row-top.tape .tape-sub > * + *::before { content: "· "; color: var(--dim); }
    .row-top.tape .tape-sub .sub-when { flex: 0 0 auto; white-space: nowrap; }
    .row-top.tape .tape-sub .sub-note {
      flex: 0 1 auto; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    /* Phone: name + figure | margin | figure + name does not fit inline. At 390px each
       name track is ~70px inline, and only ~120px even with the two sides stacked in
       place, against 155px for DarkWingDucks2023 -- so stacking within the three columns
       is not enough either. One full-width line per side gives every name ~258px at
       375px, which clears the longest league name by more than 100px and leaves the
       figures untouched. Stacked, both sides read left to right, so neither is mirrored and
       the bag totals right-align into one column.
       The switch back to the wide tape is at 700px, not at a phone width, because that is
       where the inline arrangement measurably fits. It moved up from 640px when each side
       gained a signed delta: at 641px DarkWingDucks2023 came 2.1px short and ellipsised,
       and the inline form only clears the name from 650px. 700px is that measured floor
       plus real headroom -- 27px spare per side against today's longest name and widest
       delta -- and below it the stacked form handles any name at any width. Measure, do
       not guess, if either side gains another figure. */
    @media (max-width: 700px) {
      .row-top.tape { grid-template-columns: minmax(0, 1fr); gap: 3px; }
      .row-top.tape .side.right { text-align: left; }
      .row-top.tape .side-line,
      .row-top.tape .side.right .side-line { flex-direction: row; justify-content: flex-start; gap: 4px 10px; flex-wrap: wrap; }
      /* Stacked, both sides read delta then total, so the deltas line up in one column and
         the bag totals in another, which is what makes a pair of side lines comparable at a
         glance. One auto margin, on the figure pair, pushes it to the right of the line.
         The pair also wraps as a pair. At 320px the line runs ~15px short once each side
         carries a delta as well as a total, and the figures drop beneath the name rather
         than the name truncating or breaking mid-word: overflow-wrap: anywhere would have
         rendered DarkWingDucks2023 as "DarkWingDucks20 / 23", which reads as a rendering
         accident. Nothing wraps at 375px or above. This is the call the Recent Trade card
         already makes for the same name-and-figure hazard. The base nowrap ellipsis on
         .names stays as the last resort for a name wider than a whole line. */
      .row-top.tape .side.right .figs { flex-direction: row; }
      .row-top.tape .figs { margin-left: auto; }
      .row-top.tape .tape-sub { justify-content: flex-start; }
    }
    @media (max-width: 430px) { .row-top.tape { font-size: 0.9375rem; } }
    .row.own-pick { border-color: #2e6b4f; }
    .row.away-pick { border-color: #6b5a2e; }
    .origin.own { color: var(--green); font-weight: 650; }
    .origin.away { color: #e0b44c; font-weight: 650; }
    .row-top.tape .val { font-variant-numeric: tabular-nums; font-weight: 650; flex: 0 0 auto; white-space: nowrap; }
    .names { font-weight: 600; }
    .date { color: var(--dim); font-size: 0.8125rem; }
    .margin { font-variant-numeric: tabular-nums; font-weight: 650; }
    /* Every signed delta in the app is this one span, emitted by tapeMargin(). The colour
       is written as .delta.pos / .delta.neg rather than borrowing the bare .pos and .neg
       so it survives inside containers that set their own colour on a descendant element
       -- .day-in-val dims its spans, and a one-class .pos would lose to that. */
    .delta { font-variant-numeric: tabular-nums; font-weight: 650; white-space: nowrap; flex: 0 0 auto; }
    .delta.pos { color: var(--green); }
    .delta.neg { color: var(--red); }
    .detail { display: none; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
    .row.open .detail { display: block; }
    /* An expandable row: the summary is the button, the detail is its sibling. The detail
       holds clickable .leg elements, and a button may not contain a button -- nesting them
       made clicking a player name inside an open row collapse the row. */
    .row-x {
      background: var(--card); border: 1px solid var(--line); border-radius: 10px;
      margin: 0 0 8px;
    }
    .row-x.own-pick { border-color: #2e6b4f; }
    .row-x.away-pick { border-color: #6b5a2e; }
    button.row-x-btn {
      display: block; width: 100%; appearance: none; font: inherit; color: inherit;
      text-align: left; background: none; border: 0; border-radius: 10px;
      min-height: 44px; padding: 12px; cursor: pointer; touch-action: manipulation;
    }
    button.row-x-btn:focus-visible { outline: 2px solid #c8c8d0; outline-offset: -2px; }
    /* The same row on a screen that is already only this trade: nothing to toggle, so the
       summary is not a control. Same padding as the button it replaces. */
    .row-x-head { padding: 12px; }
    .row-x > .detail { margin: 0; padding: 12px; border-top: 1px solid var(--line); }
    .row-x.open > .detail { display: block; }
    /* Rows this device has voted on, in the gold the vote buttons already use. */
    button.row.voted { border-color: #6b5a2e; }
    .bags { display: grid; gap: 12px; }
    @media (min-width: 640px) { .bags { grid-template-columns: 1fr 1fr; } }
    .bags > * { min-width: 0; }
    .bag h3 {
      margin: 0 0 6px; font-size: 0.92rem;
      display: flex; gap: 8px; align-items: baseline; justify-content: space-between;
    }
    .bag h3 > span { min-width: 0; overflow-wrap: anywhere; }
    .bag h3 > b { flex: 0 0 auto; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .leg {
      display: flex; justify-content: space-between; gap: 8px; align-items: baseline;
      font-size: 0.84rem; padding: 3px 0; color: var(--muted); min-width: 0;
    }
    .leg > span { min-width: 0; overflow-wrap: anywhere; }
    .leg > b { flex: 0 0 auto; white-space: nowrap; }
    /* A .leg's <b> is a figure everywhere else, so it is nowrap and never shrinks -- which is
       right until Champions Path puts a whole draft's worth of picks in one. Thirty picks joined
       by "·" cannot be a single unbreakable token: it measured 1,051px inside a 320px viewport
       and took the document's width with it, invisibly, because documentElement.scrollWidth
       clamps and reported 320. A list is not a number, so it stacks under its label and wraps;
       nothing here is a figure that truncating would damage. */
    .leg.list { display: block; }
    .leg.list > span { display: block; }
    .leg.list > b {
      display: block; margin-top: 2px;
      white-space: normal; overflow-wrap: anywhere;
    }
    button.leg[data-pick] {
      width: 100%; appearance: none; font: inherit; font-size: 0.84rem;
      color: var(--muted); text-align: left; background: none; border: 0;
      padding: 8px 0; cursor: pointer; min-height: 44px;
      touch-action: manipulation;
    }
    .leg[data-pick]:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 2px; }
    .leg[data-pick].on { color: var(--text); }
    .hops { margin: 2px 0 10px 8px; padding-left: 10px; border-left: 2px solid var(--line); }
    .hop { display: flex; justify-content: space-between; gap: 8px; font-size: 0.8125rem; padding: 4px 0; color: var(--dim); }
    .hop > span { min-width: 0; overflow-wrap: anywhere; }
    .hop > b { flex: 0 0 auto; white-space: nowrap; }
    .hop b { color: var(--text); font-variant-numeric: tabular-nums; }
    .leg b { color: var(--text); font-variant-numeric: tabular-nums; }
    .leg.va { color: var(--text); border-top: 1px solid var(--line); margin-top: 6px; padding-top: 6px; font-weight: 650; }
    .leg.va b { color: #d4c07a; }
    .warn { color: #e0b44c; font-size: 0.8125rem; }
    .badge { font-size: 0.8125rem; color: #e0b44c; }
    svg.spark { width: 100%; height: 72px; margin-top: 8px; }
    /* The league ticker stood here: a feed div, a masked track, its pills and a 48-second loop.
       It is gone, and with it the last animation in this stylesheet -- there are now no
       keyframes and no animation property anywhere on the page, which the generator asserts as
       a negative rather than as a list of names. Do not reintroduce one without a pause
       control; the audit's only WCAG 2.2.2 failure was that marquee. The generator also refuses
       any page that so much as names the removed selectors, so this note spells them out in
       words -- write them as code and the build stops. */
    .alert-row {
      display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
      align-items: stretch; margin: 0 0 14px;
    }
    /* One column still means one pair: equal rows keep both gold cards the same height. */
    @media (max-width: 520px) { .alert-row { grid-template-columns: 1fr; grid-auto-rows: 1fr; } }
    .day-alert, a.champ-alert {
      display: flex; flex-direction: column; justify-content: center;
      background: #1a1810; border: 1px solid #6b5a2e; border-radius: 12px;
      padding: 10px 12px; margin: 0; min-height: 88px; height: 100%;
      /* A 1fr track's automatic minimum is min-content, so nowrap text below would widen
         the card past the viewport instead of ellipsising. min-width: 0 lets it clip. */
      min-width: 0;
    }
    /* Champions Path has less content than its twin, so its slack belongs at the bottom, not above the header. */
    a.champ-alert {
      color: inherit; text-decoration: none; box-sizing: border-box; cursor: pointer;
      justify-content: flex-start;
    }
    a.champ-alert:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 2px; }
    .day-alert-h { font-weight: 650; }
    .day-alert-h span { display: block; color: var(--dim); font-weight: 500; font-size: 0.8125rem; margin-top: 2px; }
    a.champ-alert .day-alert-h { line-height: 1.3; }
    /* The header shares its row with the one door to the league-wide list, so that everything
       about trades lives in this card rather than as a loose control on home. */
    .day-alert-top { display: flex; align-items: flex-start; gap: 12px; }
    /* A flex item's automatic minimum is min-content, so the heading would widen the card
       past the viewport rather than give the button room. Same guard as the card itself. */
    .day-alert-top .day-alert-h { min-width: 0; }
    /* This card's height is set by its content to the pixel, and the two gold cards must stay
       equal, so this control is not allowed to contribute any. The visual pill is therefore
       shorter than the heading beside it and ::after -- which is painted and hit-tested but
       never laid out -- carries the 44px tap area the rest of the app enforces. */
    button.all-trades {
      position: relative; flex: 0 0 auto; margin-left: auto;
      display: inline-flex; align-items: center; gap: 5px;
      appearance: none; font: inherit; font-size: 0.75rem; font-weight: 650;
      color: #e0b44c; background: none; border: 1px solid #6b5a2e; border-radius: 999px;
      height: 26px; padding: 0 9px; cursor: pointer; white-space: nowrap;
      touch-action: manipulation;
    }
    /* Deliberately square: this box is never painted, and a radius here only kills the corners
       of the tap area. Measured -- a 999px radius on the 113x44 region left its corners dead. */
    button.all-trades::after { content: ""; position: absolute; inset: -10px; }
    button.all-trades:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 4px; }
    /* Nowrap plus ellipsis: a long manager or player name shortens instead of wrapping,
       which is what would break the two gold cards' equal height. */
    a.champ-alert .champ-line {
      color: var(--text); font-weight: 700; line-height: 1.3; margin-top: 4px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    a.champ-alert .date {
      line-height: 1.35; margin-top: 1px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    /* The championship and top-scorer lines each end in a score. On one nowrap line the
       score is furthest from the left edge, so it is what a long opponent or player name
       pushes off first. As a pair the figure is pinned and the name is the only thing that
       gives, which is the rule everywhere else in this app. */
    a.champ-alert .champ-fig { display: flex; gap: 6px; align-items: baseline; }
    a.champ-alert .champ-fig > span {
      min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    a.champ-alert .champ-fig > b {
      flex: 0 0 auto; margin-left: auto; white-space: nowrap;
      font-weight: 650; font-variant-numeric: tabular-nums; color: var(--muted);
    }
    /* The scoreboard: champion, final score, runner-up, with each team's record directly
       under its own name. One grid for both rows is what keeps the records under the names
       -- as two separate rows they drift apart the moment a name ellipsises. The centre
       track is auto so the score sizes to itself and never truncates; the two 1fr tracks
       are equal, which centres the score, and minmax(0, ...) is what lets a long name give
       way instead of widening the card (a 1fr track's automatic minimum is min-content). */
    a.champ-alert .champ-bout {
      display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      align-items: baseline; column-gap: 8px; margin-top: 4px;
      /* Uniform on the scoreboard line, and not by taste. Ellipsis makes each cell a scroll
         container, and a scroll container has no baseline of its own -- alignment synthesizes
         one from its border box. Mixed sizes therefore sat the score a pixel off the names it
         was between. Equal font-size and line-height make the synthesized baselines identical. */
      font-size: 0.9375rem; line-height: 1.3;
    }
    a.champ-alert .champ-bout > * { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    /* Both right-hand cells, name and record, are pinned to the third track. Without this the
       record auto-places into the middle and sits under the score. */
    a.champ-alert .bout-r { grid-column: 3; text-align: right; }
    a.champ-alert .bout-team { font-weight: 650; }
    a.champ-alert .bout-score {
      grid-column: 2; justify-self: center; overflow: visible;
      font-weight: 700; font-variant-numeric: tabular-nums;
      /* Default (no half coloured yet) stays the gold the card already used. */
      color: #e0b44c;
    }
    /* Winner / loser halves of the final. Same green and red the rest of the app uses for
       up/down value, because a final is a result and not a mood. */
    a.champ-alert .bout-score .bout-w { color: var(--green); }
    a.champ-alert .bout-score .bout-l { color: var(--red); }
    a.champ-alert .bout-score .bout-dash { color: var(--muted); }
    a.champ-alert .bout-rec {
      color: var(--dim); font-size: 0.8125rem; line-height: 1.35; margin-top: 1px;
      font-variant-numeric: tabular-nums;
    }
    button.day-in {
      display: block; width: 100%; appearance: none; font: inherit; color: inherit;
      text-align: left; background: none; border: 0; padding: 6px 0 0; margin: 2px 0 0;
      cursor: pointer;
    }
    button.day-in + button.day-in { border-top: 1px solid #6b5a2e; padding-top: 10px; }
    button.day-in:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 2px; }
    /* Two names and a "vs", so real pairs wrap at the spaces and cost no extra height.
       anywhere rather than break-word because only anywhere lowers the min-content size:
       without it a single unbreakable name escapes the card and widens the document.
       Wrapping rather than ellipsis here on purpose -- this line is where the pair is
       named in full, and truncating it is the defect being fixed everywhere else. */
    button.day-in b { display: block; font-weight: 650; overflow-wrap: anywhere; }
    button.day-in span { display: block; color: var(--dim); font-size: 0.8125rem; margin-top: 2px; }
    button.day-in .day-in-vals { margin-top: 4px; }
    /* Same name-and-figure pair as a tape row, and the same hazard: side by side, a long
       name would have to ellipsize to leave the figure room. Wrapping instead drops the
       figure onto its own line only when the name actually needs the width, so today's
       names cost no extra height and the two gold cards keep matching. */
    button.day-in .day-in-val {
      display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 12px;
      color: var(--muted); font-size: 0.8125rem; margin-top: 2px;
    }
    button.day-in .day-in-val i { font-style: normal; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    button.day-in .day-in-val em { font-style: normal; font-weight: 650; color: var(--text); flex: 0 0 auto; margin-left: auto; }
    /* button.day-in span is a block-level dim caption; the delta is neither. */
    button.day-in .day-in-val .delta { display: inline; margin: 0; font-size: inherit; }
    .vote { margin: 10px 0 0; }
    .vote-h { font-weight: 650; }
    .vote-opts { display: flex; gap: 8px; margin-top: 8px; }
    /* Two names side by side leaves each about 114px at 320px, which clipped
       KingHenryXXVI. Stacked, each gets the full 240px and no manager in the league
       comes close -- the same trade the tape row makes one screen up. */
    @media (max-width: 360px) { .vote-opts { flex-direction: column; } }
    button.vote-opt {
      flex: 1 1 0; min-width: 0; min-height: 48px;
      appearance: none; font: inherit; color: inherit; text-align: left;
      background: var(--card); border: 1px solid var(--line); border-radius: 12px;
      padding: 8px 12px; cursor: pointer;
    }
    button.vote-opt.on { background: #1a1810; border-color: #6b5a2e; }
    button.vote-opt:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 2px; }
    button.vote-opt b { display: block; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    button.vote-opt span { display: block; color: var(--dim); font-size: 0.75rem; margin-top: 2px; }
    /* On the trade's own screen the vote is a section of the page, not a tail on a row. */
    .vote-card {
      background: var(--card); border: 1px solid var(--line); border-radius: 12px;
      padding: 12px; margin: 12px 0 0;
    }
    .vote-card .vote { margin: 0; }
    /* Voting hands the user back to the league list. Say the vote landed, and that it moves. */
    .vote-note {
      background: #1a1810; border: 1px solid #6b5a2e; border-radius: 12px;
      color: var(--text); font-size: 0.875rem; line-height: 1.45;
      padding: 10px 12px; margin: 0 0 12px;
    }
    .vote-note b { font-weight: 650; }
    .marks { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 8px; }
    button.mark {
      flex: 1 1 calc(50% - 8px); min-width: 140px;
      appearance: none; font: inherit; color: inherit; text-align: left;
      background: var(--card); border: 1px solid var(--line); border-radius: 12px;
      padding: 10px 12px; min-height: 52px; cursor: pointer;
    }
    button.mark:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 2px; }
    button.mark b { display: block; font-size: 1.25rem; font-weight: 700; line-height: 1.2; }
    button.mark span { display: block; color: var(--dim); font-size: 0.75rem; margin-top: 4px; line-height: 1.35; }
    button.mark.on { border-color: #6b5a2e; }
    button.mark.pos b { color: var(--green); }
    button.mark.neg b { color: var(--red); }
    .mark-chart {
      background: var(--card); border: 1px solid var(--line); border-radius: 12px;
      padding: 12px; margin: 0 0 14px;
    }
    .mark-chart-h { font-weight: 650; margin-bottom: 12px; }
    .mark-chart-h span { display: block; color: var(--dim); font-weight: 500; font-size: 0.75rem; margin-top: 2px; }
    .mark-bar { margin: 0 0 12px; }
    .mark-bar:last-child { margin-bottom: 0; }
    .mark-bar.you .names { color: var(--text); font-weight: 650; }
    .mark-bar-top { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
    .mark-bar-top .names { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mark-bar-top .lab { font-weight: 650; font-size: 0.85rem; flex: 0 0 auto; white-space: nowrap; }
    .mark-bar-track { height: 8px; background: #1c1c22; border-radius: 99px; margin: 5px 0 4px; overflow: hidden; }
    .mark-bar-track i { display: block; height: 100%; width: 0; background: #6b6b78; border-radius: 99px; }
    .mark-bar-track i.pos { background: var(--green); }
    .mark-bar-track i.neg { background: var(--red); }
    .pack { margin: 0 0 8px; }
    .pack-body { margin-top: 8px; }
    /* The anchor both of league home's menus hang from. Its own stacking context, at a lower
       z-index than the .filter-wrap holding Score as, which sits directly above it: the two
       controls are mutually exclusive but an open Score as panel is 300px tall and reaches down
       over this box, and the box must not paint through it. Nothing here may clip -- the panels
       are absolutely positioned against it, and a hidden overflow anywhere up the chain is
       exactly what made the seat picker unusable twice.
       It is the chip box itself rather than a wrapper around one trigger, so both panels drop
       the full width of the box instead of the width of the cell they were opened from, and
       there is one ancestor chain to keep open rather than two. */
    .ds-wrap { position: relative; z-index: 3; overflow: visible; margin: 0; }
    /* League home's four chips, in one card in the app's existing card idiom. Four cells of
       equal size: 2x2 on a phone, four across from 560px.
       The columns are minmax(0, 1fr) and not 1fr because a grid track's automatic minimum is
       min-content (§3a) -- without it "League Data Sets" refuses to wrap inside its cell and
       widens the whole row instead. grid-auto-rows: 1fr is what makes the two phone rows equal
       to each other: in an auto-height grid every 1fr row resolves to the tallest row's base
       size, so a two-line label does not leave the bottom pair shorter than the top pair. */
    .chip-box {
      background: var(--card); border: 1px solid var(--line); border-radius: 12px;
      padding: 12px; margin: 0 0 14px;
    }
    .chip-grid {
      display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-auto-rows: 1fr; gap: 8px;
    }
    @media (min-width: 560px) {
      .chip-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    }
    /* 56px, not 44px: the cell has to hold "League Data Sets" on two lines at 320px, where a
       half-width cell leaves 106px for the text. Every cell takes the tallest one's height, so
       this is the floor rather than the height. */
    .home-chip {
      display: flex; align-items: center; width: 100%; min-width: 0;
      appearance: none; font: inherit; font-size: 0.875rem; font-weight: 650;
      color: var(--text); text-align: left;
      background: #1c1c22; border: 1px solid var(--line); border-radius: 10px;
      min-height: 56px; padding: 8px 10px; margin: 0; touch-action: manipulation;
    }
    button.home-chip { cursor: pointer; }
    button.home-chip.on { border-color: #6b5a2e; }
    button.home-chip:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 2px; }
    /* The caret rides with the last word rather than pinning to the right edge: pinned, it would
       sit alone beside a two-line label and read as a second control in the cell. */
    .home-chip .chip-lab { min-width: 0; overflow-wrap: anywhere; text-wrap: pretty; }
    .home-chip .chev { color: var(--muted); }
    /* The two cells nobody has decided on yet. They are spans, not buttons. The ticker shipped
       "Most active" and "Least active" as <button> pills carrying an empty destination, so every
       tap on them was silently ignored, and the fix was to make a pill with nowhere to go a
       static span. Four chips is a bigger surface for exactly that defect. A span has no tab
       stop and no activation behaviour; the dashed edge, the dimmed dash and the default cursor
       say "slot" rather than "control"; and aria-hidden keeps an em dash out of a screen
       reader's way, because it is a placeholder and not a reading. */
    .home-chip.slot {
      justify-content: center; color: var(--dim); font-weight: 500;
      background: transparent; border-style: dashed; cursor: default;
    }
    /* The Teams chip is the only mount of .who-menu now that the brand header's picker is gone,
       and it keeps the class rather than inheriting a copy of it: the 220px width, the 44px
       options and the no-scroll cap are that one rule. The override is only which edge it hangs
       from -- the header's picker was the right-most thing in its row, this chip is the left-most
       thing in its box -- so nothing about the menu itself is restated here. */
    .chip-box .who-menu { left: 0; right: auto; }
    /* The League Data Sets trigger has no rules of its own any more: it is one of the four
       .home-chip cells above, and giving it a second, more specific rule set is how the four
       cells stop being the same size as each other. Its 44px floor became the box's 56px one. */
    /* Six options -- None plus the five sets -- each with a line saying what the set is built
       from, so a row is 59px and 76px where that line wraps at 320px. It floats rather than
       shoving the open set down the page, which is what the Score as panel does.
       The width is the trigger's width and not a fixed 340px. Capped, it left half of every trade
       row visible beside it at 375px and wider -- figures and names floating to the right of a
       menu that was covering the rest of their row, which measured perfectly and read as a
       rendering fault. Full width also means the panel cannot be wider than the body's content
       box, so it can never widen the document. */
    /* Addressed by id, the way #scoreAs and #yearFilters are, so these win over the shared
       .filter-panel box rules that are declared further down the sheet. */
    /* The cap is the list, not a fraction of the viewport. It used to be min(100dvh - 96px, 480px)
       -- a flat 480px on any phone taller than 576px -- which is a number the six options never
       reach and so never bit: the panel measured 439px at 320px and simply hung off the bottom of
       the screen, four of its six options below the fold. This is the same rule the seat menu was
       fixed with: six rows at the 76px a two-line option takes at 320px, five 4px gaps, 12px of
       panel padding and 2px of border, and then the room a phone has as the second term. Sizing
       to the list is what makes "does it fit" a question with an answer at build time -- the
       generator asserts DATA_SETS.length + 1 against it, so a seventh set fails the build instead
       of shipping a scrolling menu. Do not lower the 44px option floor to fit a longer list. */
    #dataSets {
      position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 12;
      width: auto; margin: 0; padding: 6px;
      max-height: min(calc(6 * 76px + 34px), calc(100dvh - 96px)); overflow-y: auto;
      display: flex; flex-direction: column; gap: 4px;
      box-shadow: 0 10px 28px rgba(0,0,0,0.55);
    }
    #dataSets button.ds-opt {
      appearance: none; font: inherit; color: inherit; text-align: left;
      background: #1c1c22; border: 1px solid var(--line); border-radius: 8px;
      min-height: 44px; padding: 8px 10px; cursor: pointer;
    }
    #dataSets button.ds-opt.on { border-color: #6b5a2e; }
    #dataSets button.ds-opt b { display: block; font-weight: 650; }
    #dataSets button.ds-opt span {
      display: block; color: var(--dim); font-size: 0.75rem; margin-top: 2px; text-wrap: pretty;
    }
    #dataSets button.ds-opt:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 2px; }
    /* The name of the set on screen. The trigger above reads the constant "League Data Sets", so
       this is the only thing that says which one you are looking at. */
    h2.ds-h { margin: 0 0 2px; font-size: 1.05rem; overflow-wrap: anywhere; }
    h2.ds-h:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 4px; }
    #dsBody .caption { margin: 0 0 8px; }
    /* News and Alerts. The user asked for "scrolling", and this scrolls because a finger or a
       wheel moves it -- there is no animation here at all.
       This was written when league home still carried the league ticker, which the audit
       recorded as a WCAG 2.2.2 failure: a 48s loop with no pause control. That ticker is gone,
       and a news row is text a person needs time to read rather than a pill they glance at. So
       this is a plain overflow box: capped height, newest at the top, and it stays where it is
       put. Pull-to-refresh and the "new posts" pill are user-driven state (text / a button),
       not a self-moving region — no CSS animation, no prefers-reduced-motion branch. */
    .news-box {
      max-height: 420px; overflow-y: auto; -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
      background: var(--card); border: 1px solid var(--line); border-radius: 12px;
      padding: 4px 12px;
    }
    /* The box is a scroll container, so it is a tab stop and it is named -- otherwise a
       keyboard cannot reach the rows below the fold and a screen reader gets an unlabelled
       region. */
    .news-box:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 2px; }
    .news-row {
      display: block; width: 100%; padding: 12px 0; margin: 0;
      color: inherit; text-decoration: none;
      /* Every row is a link to the source, so every row is a target. */
      min-height: 44px;
    }
    .news-row + .news-row { border-top: 1px solid var(--line); }
    a.news-row:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 2px; }
    .news-top { display: flex; align-items: baseline; gap: 10px; }
    /* The manager's name also appears inside the voice line directly below, so this label is
       the one thing in the row that can afford to shorten. min-width: 0 is what lets it --
       a flex item's automatic minimum is min-content (§3a). */
    .news-who {
      min-width: 0; flex: 1 1 auto; font-weight: 650;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    /* Multi-tag headers list several seats — allow wrap so the second name is not clipped. */
    .news-row-tweet .news-who {
      white-space: normal; overflow: visible; text-overflow: unset;
      line-height: 1.25;
    }
    /* Same gold as button.all-trades. Not --red/--green: those mean "you are down or up value"
       on every other screen in this app, and a hamstring is not a value delta. */
    .news-cat {
      flex: 0 0 auto; font-size: 0.6875rem; font-weight: 650; white-space: nowrap;
      color: #e0b44c; border: 1px solid #6b5a2e; border-radius: 999px; padding: 2px 8px;
    }
    .news-line { margin-top: 5px; line-height: 1.4; overflow-wrap: anywhere; text-wrap: pretty; }
    /* The sharer's own jab, attributed. Sits above the locker-room summary so their words and
       the app's voice stay two different things. */
    .news-note {
      margin-top: 5px; color: var(--muted); font-size: 0.8125rem; line-height: 1.4;
      overflow-wrap: anywhere; text-wrap: pretty;
    }
    .news-note-by { font-weight: 650; color: var(--dim); }
    .news-head {
      margin-top: 4px; color: var(--muted); font-size: 0.8125rem; line-height: 1.4;
      overflow-wrap: anywhere; text-wrap: pretty;
    }
    .news-meta {
      margin-top: 4px; color: var(--dim); font-size: 0.75rem; line-height: 1.4;
      overflow-wrap: anywhere;
    }
    /* A shared tweet's row is a plain container, not a link -- See tweet is a real <a> and
       nesting one control inside another is defect A1. The full tweet stays off the row;
       the locker-room line is the copy, and the handle/time/link is the citation. */
    .news-row-tweet { display: block; }
    .news-line-tweet {
      margin-top: 4px; font-size: 0.875rem; line-height: 1.35; font-weight: 550;
      overflow-wrap: anywhere; text-wrap: pretty;
    }
    .news-tweet-foot {
      display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px;
      margin-top: 6px; color: var(--dim); font-size: 0.75rem; line-height: 1.3;
    }
    .news-tweet-foot .news-tweet-sep { opacity: 0.55; }
    /* Compact citation link — still clears 44px so a finger finds it. */
    .news-tweet-link {
      display: inline-flex; align-items: center; min-height: 44px;
      color: var(--muted); font-size: 0.75rem; font-weight: 650; text-decoration: underline;
    }
    .news-tweet-link:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 2px; }
    /* Admin remove. Only rendered for TrumanCooper's remembered seat. Plain text control, not
       a chip or a card — it is a destructive action on a short row and must not look like a
       primary CTA. 44px so a finger finds it without hunting the word. */
    .news-del {
      display: inline-flex; align-items: center; min-height: 44px; margin: 0; padding: 0 2px;
      background: none; border: 0; color: var(--dim);
      font: inherit; font-size: 0.75rem; font-weight: 650; text-decoration: underline;
      cursor: pointer;
    }
    .news-del:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 2px; }
    .news-del[disabled] { opacity: 0.5; cursor: wait; }
    .news-empty { color: var(--dim); font-size: 0.8125rem; line-height: 1.45; padding: 10px 0; }
    /* Live feed chrome. Sits between the heading and the scroll box. No transform / keyframes —
       the animation guard on .news-box stays honest; these are static text and a tap target. */
    .news-live {
      display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px;
      min-height: 0; margin: 0 0 8px;
    }
    .news-live:empty { display: none; margin: 0; }
    .news-new {
      display: inline-flex; align-items: center; min-height: 44px; margin: 0; padding: 0 2px;
      background: none; border: 0; color: var(--muted);
      font: inherit; font-size: 0.8125rem; font-weight: 650; text-decoration: underline;
      cursor: pointer;
    }
    .news-new:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 2px; }
    .news-pull {
      color: var(--dim); font-size: 0.75rem; line-height: 1.3;
      text-align: center; padding: 8px 0 4px;
    }
    .news-pull[hidden] { display: none; }
    /* What is left of this row now that the clock control moved to the brand header: the year
       filter on the Trades tab and the round filter on Drafts, each with its caption. Both are
       screen-local, so both stay on the screen they filter. */
    .lens-row { display: flex; align-items: center; gap: 10px; margin: 8px 0 12px; }
    @media (max-width: 360px) {
      .lens-row { flex-wrap: wrap; }
      .lens-row-left { flex: 1 1 100%; }
      .lens-row-left .caption { white-space: normal; }
    }
    .lens-row-left { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 10px; }
    .lens-row-left .caption { margin: 0; }
    .lens-row-left .caption { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    /* The clock trigger. It reads the selected window alone -- "Since trade ▾" -- and not
       "Score as Since trade": at 0.8125rem the prefix costs 54px of measured width, which the
       320px brand row does not have, and the five window names are self-describing without it.
       The words "Score as" stay in the accessible name, where they cost nothing. */
    button.score-btn {
      flex: 0 0 auto; appearance: none; font: inherit;
      font-size: 0.8125rem; color: var(--text);
      background: var(--card); border: 1px solid var(--line); border-radius: 999px;
      min-height: 44px; padding: 6px 12px; position: relative; cursor: pointer;
      white-space: nowrap;
    }
    button.score-btn.on { border-color: #6b5a2e; }
    button.score-btn:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 2px; }
    button.score-btn .chev { color: var(--muted); }
    button.score-btn .dot {
      position: absolute; top: 6px; right: 6px;
      width: 7px; height: 7px; border-radius: 50%; background: #e0b44c;
    }
    /* Anchored to the trigger's own box rather than to a fixed 52px, because the trigger now
       sits in the brand row instead of at the top of a screen. The cap is the room below the
       header on the shortest phone -- 16px of body padding, the 44px row, the 4px offset and
       24px of clearance -- and only bites in landscape, where the five options do not fit.
       display:flex must NOT live on the base rule: an id-level display beats [hidden]'s
       display:none in engines that do not mark [hidden] as !important, and the empty panel
       then paints as a thin card bar under the brand header -- the "weird box" on league home.
       Flex is applied only when the panel is open; hidden/empty stay display:none !important. */
    #scoreAs {
      position: absolute; top: calc(100% + 4px); right: 0; left: auto; z-index: 12;
      width: min(280px, calc(100vw - 32px)); margin: 0; padding: 6px;
      max-height: calc(100dvh - 88px); overflow-y: auto;
      background: var(--card); border: 1px solid var(--line); border-radius: 10px;
      box-shadow: 0 10px 28px rgba(0,0,0,0.55);
    }
    #scoreAs:not([hidden]) {
      display: flex; flex-direction: column; gap: 4px;
    }
    #scoreAs[hidden], #scoreAs:empty { display: none !important; }
    #scoreAs button.score-opt {
      appearance: none; font: inherit; color: inherit; text-align: left;
      background: #1c1c22; border: 1px solid var(--line); border-radius: 8px;
      min-height: 44px; padding: 8px 10px; cursor: pointer;
    }
    #scoreAs button.score-opt.on { border-color: #6b5a2e; }
    #scoreAs button.score-opt b { display: block; font-weight: 650; }
    #scoreAs button.score-opt span { display: block; color: var(--dim); font-size: 0.75rem; margin-top: 2px; }
    #scoreAs button.score-opt:focus-visible {
      outline: 2px solid #c8c8d0; outline-offset: 2px;
    }
    button.filter-btn {
      flex: 0 0 auto; appearance: none; font: inherit; color: var(--muted);
      background: var(--card); border: 1px solid var(--line); border-radius: 10px;
      width: 44px; height: 44px; padding: 0; display: grid; place-items: center;
      position: relative; cursor: pointer;
    }
    button.filter-btn.on { color: var(--text); border-color: #6b5a2e; }
    button.filter-btn:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 2px; }
    button.filter-btn .dot {
      position: absolute; top: 8px; right: 8px;
      width: 7px; height: 7px; border-radius: 50%; background: #e0b44c;
    }
    .filter-panel {
      background: var(--card); border: 1px solid var(--line); border-radius: 10px;
      padding: 4px 12px; margin: 0 0 14px;
    }
    .filter-panel label {
      display: flex; align-items: center; gap: 10px;
      min-height: 44px; color: var(--text);
    }
    .filter-panel input { width: 18px; height: 18px; accent-color: var(--green); }
    .filter-panel .rule { border: 0; border-top: 1px solid var(--line); margin: 4px 0; }
    .filter-panel .filter-h { color: var(--dim); font-size: 0.75rem; margin: 8px 0 0; }
    .filter-wrap { position: relative; z-index: 4; }
    #yearFilters {
      position: absolute; top: 52px; left: 0; z-index: 12;
      width: 132px; max-height: min(60dvh, 420px); overflow-y: auto;
      margin: 0; padding: 4px 8px;
      display: flex; flex-direction: column;
      box-shadow: 0 10px 28px rgba(0,0,0,0.55);
    }
    #yearFilters label {
      min-height: 44px; gap: 10px; font-size: 0.8125rem; color: var(--muted);
      cursor: pointer;
    }
    #yearFilters label:has(input:checked) { color: var(--text); }
    #yearFilters input { width: 16px; height: 16px; }
    .path-hero { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin: 0 0 14px; }
    .path-hero .kicker { color: var(--dim); font-size: 0.75rem; margin: 0 0 4px; }
    .path-hero h2 { margin: 0 0 6px; }
    .path-hero .thesis { color: var(--muted); margin: 0; }
    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 0 0 14px; }
    .stat {
      background: var(--card); border: 1px solid var(--line); border-radius: 12px;
      padding: 10px 12px; min-height: 64px;
      /* Half a 320px viewport is 140px of box for a value plus a sentence about it. */
      min-width: 0;
    }
    .stat b { display: block; font-size: 1.25rem; font-weight: 700; line-height: 1.2; overflow-wrap: anywhere; }
    .stat span { display: block; color: var(--dim); font-size: 0.75rem; margin-top: 4px; line-height: 1.35; }
    .chapter { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px; margin: 0 0 12px; }
    .chapter h3 { margin: 0 0 8px; font-size: 1rem; }
    .origin-held { color: var(--muted); }
    .origin-drafted { color: var(--green); }
    .origin-trade { color: #e0b44c; }
    .origin-waiver, .origin-fa { color: #7aa2ff; }
  </style>
</head>
<body>
  <h1 class="brand">
    <button type="button" class="go-home" id="goHome" aria-label="Home">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path fill="currentColor" d="M12 3.2l9 7.4h-2.4V21h-5.2v-6.2H10.6V21H5.4v-10.4H3L12 3.2z"/>
      </svg>
    </button>
    <a href="./">CuckleChunckle</a>
    <span class="lens-wrap" id="lensWrap">
      <button type="button" class="score-btn" id="lensBtn" data-score="1" aria-label="Score as Since trade" aria-haspopup="true" aria-expanded="false">Since trade <span class="chev">▾</span></button>
      <div id="scoreAs" hidden></div>
    </span>
  </h1>
  <p id="lead"></p>
  <div id="app" tabindex="-1" hidden></div>
  <script>
    const fmt = (n) => n == null || Number.isNaN(n) ? "—" : Math.round(n).toLocaleString();
    // Fantasy scores are conventionally one decimal. Sleeper stores two.
    const score1 = (n) => n == null || Number.isNaN(Number(n)) ? "—" : Number(n).toFixed(1);
    // The scoreboard on the champ card: one decimal, and a trailing .0 dropped, so 189.98
    // and 162.82 read as "190" and "162.8". Same rule on both halves of a score, and only
    // here -- the Champions Path screen still prints the finals to two decimals.
    const scoreShort = (n) => score1(n).replace(/\\.0$/, "");
    const cls = (n) => n == null ? "" : n >= 0 ? "pos" : "neg";
    // Sleeper display names and player labels are user data. Escape text and attributes alike.
    const esc = (s) => String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
    /**
     * Seat flair on the painted name only. Matching, data-who, data-partner and the news
     * matcher keep the bare Sleeper name; this is what the eye reads next to it.
     * Order: reigning-champ crown (most recent title year) → name → glyph/img flair.
     */
    const SEAT_FLAIR = Object.assign(Object.create(null), {
      SF69erss: { img: "data/ui/flair-sf69erss.png" },
      bigjberg: { img: "data/ui/flair-bigjberg.png" },
      TipsUp: { img: "data/ui/flair-tipsup.png" },
      BubbaCuckShremp: { img: "data/ui/flair-bubbacuckshremp.png" },
      TedCumberbatch: { img: "data/ui/flair-tedcumberbatch.png" },
      TrumanCooper: { img: "data/ui/flair-trumancooper.png" },
      DarkWingDucks2023: { img: "data/ui/flair-darkwingducks2023.png" },
      ARae: { img: "data/ui/flair-arae.png" },
      ChiefGumby: { img: "data/ui/flair-chiefgumby.png" },
      KingHenryXXVI: { img: "data/ui/flair-kinghenryxxvi.png" },
    });
    // Gold, the same #e0b44c the alert cards and the vote outline use. Decorates the
    // reigning champion beside their name everywhere seatLabel paints — never the name itself.
    const CROWN = '<svg class="crown" viewBox="0 0 24 24" width="16" height="16"'
      + ' aria-hidden="true" focusable="false">'
      + '<path fill="#e0b44c" d="M2 7l4.7 3.1L12 3.4l5.3 6.7L22 7l-1.7 11.4H3.7L2 7z"/></svg>';
    /** Most recent title year from titles.json; falls back to members.place === 1. */
    function reigningChampName() {
      const t = titles && Array.isArray(titles.titles) && titles.titles[0];
      if (t && t.name) return String(t.name);
      const m = (members || []).find((x) => x && x.place === 1);
      return m && m.name ? String(m.name) : "";
    }
    function seatFlairHtml(name) {
      const f = SEAT_FLAIR[name];
      if (!f) return "";
      if (f.glyph) return " " + f.glyph;
      if (f.img) {
        return ' <img class="seat-flair" src="' + esc(f.img) + "?" + DATA_V
          + '" width="16" height="16" alt="" decoding="async" />';
      }
      return "";
    }
    /** Plain-text flair for aria-labels (no markup). Image flair / crown are silent. */
    function seatFlairText(name) {
      const f = SEAT_FLAIR[name];
      return f && f.glyph ? " " + f.glyph : "";
    }
    function seatLabel(name) {
      const n = String(name == null ? "" : name);
      // Multi-seat counterparties arrive joined: decorate each seat, not the whole string.
      if (n.includes(" · ")) return n.split(" · ").map(seatLabel).join(" · ");
      const crown = reigningChampName() === n ? CROWN + " " : "";
      return crown + esc(n) + seatFlairHtml(n);
    }
    /** Bag headings like "TrumanCooper received" — flair the seat prefix, escape the rest. */
    function seatTitle(title) {
      const s = String(title == null ? "" : title);
      // Flair seats plus the reigning champ — so bag headings crown the title holder even
      // when they have no glyph/img flair of their own.
      const names = [...new Set([...Object.keys(SEAT_FLAIR), reigningChampName()].filter(Boolean))]
        .sort((a, b) => b.length - a.length);
      for (const name of names) {
        if (s === name || s.startsWith(name + " ")) {
          return seatLabel(name) + esc(s.slice(name.length));
        }
      }
      return esc(s);
    }
    // One threshold for "even", used by every screen that grades a partner.
    const GRADE_EVEN = 100;
    let members = [];
    let me = null;
    let data = null;
    let league = null;
    let picks = null;
    let titles = null;
    let marks = null;
    let news = null;
    // Soft-deleted shared tweets, by item id (tweet:22). Filled from Supabase on load and on
    // each successful admin Remove, so a delete hides the row without waiting for a Pages rebuild.
    const newsGone = new Set();
    let newsDelPending = null;
    // Live feed refresh (Twitter-shaped). news.json is a static Pages file; the client polls it
    // with a cache-busting query and either applies new rows in place (reader at the top) or
    // holds them behind a "new posts" pill (reader scrolled down). Pull-to-refresh at the top
    // of the box always applies. See docs/NEWS_SDD.md §10c.
    const NEWS_POLL_MS = 45000;
    let newsPollTimer = null;
    let newsRefreshing = false;
    let newsPullPx = 0;
    let newsPullArmed = false;
    let newsTouchStartY = null;
    let newsPendingBook = null;
    let newsStatus = ""; // "Refreshing…" / "Up to date" / "" — aria-live, short-lived
    let newsStatusTimer = null;
    let newsBoundBox = null;
    let lens = "all";
    const DATA_V = "news20260901183553";
    /**
     * League home's five lists, in one place. They used to be five accordion packs stacked down
     * the screen, each with its own header and any number of them expanded at once; they are now
     * one "League Data Sets" dropdown with exactly one set on screen. The id is what the menu
     * options carry, and it is now the only thing that does: the ticker pills carried it too
     * until the ticker was removed, so the dropdown is the sole door to all five.
     *
     * The third column is why you would pick it. Each one states what the list is actually built
     * from -- see playerLists() in revalue.mjs -- because the titles alone do not distinguish
     * "least traded" from "forever", which overlap by construction.
     */
    const DATA_SETS = [
      ["wide", "Most lopsided trades", "The ten widest margins, on the clock set above."],
      ["passed", "Most passed around", "The five players traded the most times."],
      ["least", "Least traded", "The five rostered players who have moved least."],
      ["forever", "Forever players", "Every player still on the team that drafted them in 2019."],
      ["home", "Homesteaders", "The five longest stays, forever players aside."],
    ];
    // One set at a time, and none to begin with. League home opens as the dropdown alone with
    // nothing rendered under it: the sets are reachable by opening the menu and by nothing else
    // now that the ticker's pills are gone. An earlier build pre-selected Most lopsided so home
    // would not read as a lone control over empty space; the user asked for the empty space.
    // null is the "nothing selected" state and the "None" option at the top of the menu is the
    // way back to it, so the choice is reversible without a reload.
    let dataSet = null;
    let dsOpen = false;
    const WINDOWS = [
      ["t0", "At trade", "Who won on accept day. Picks still picks."],
      ["y1", "First 1 year", "Who won after 1 year. Hides younger deals."],
      ["y2", "First 2 years", "Who won after 2 years. Hides younger deals."],
      ["y3", "First 3 years", "Who won after 3 years. Hides younger deals."],
      ["all", "Since trade", "Who is winning from accept through today."],
    ];
    let view = "home";
    let draftSort = "new";
    let draftRounds = { 1: true, 2: true, 3: true, 4: true };
    let draftStartup = false;
    let draftFilterOpen = false;
    let year = "all";
    let yearFilterOpen = false;
    // League home's Teams chip, the one and only way into a seat. The brand header carried a
    // second trigger for the same list until the chips replaced it.
    let teamsOpen = false;
    let lensOpen = false;
    let markOpen = null;
    let openId = null;
    let openPick = null;
    let openDraft = null;
    let partnerName = null;
    let titleYear = null;
    // The seat whose side frames the full-screen trade. A trade has two sides and the board
    // rows are per seat, so the screen needs to know which one it is reading from. Deliberately
    // not the selected seat: the full-screen trade is league-wide and must not select one.
    let tradeSeat = null;
    // Set when a vote navigates the user to the league list, so the list can say the vote landed.
    let voteToast = null;
    // The screen heading to move focus to after the next render, or null to keep focus put.
    let focusNext = null;
    const seatCache = {};
    // Committed league tallies from data/ui/votes.json, or null when that file is absent
    // or not schema v1. Votes are opinion and live only here — never in league or seat data.
    let voteBook = null;

    const params = new URLSearchParams(location.search);
    const startLens = params.get("lens");
    if (startLens && WINDOWS.some((w) => w[0] === startLens)) lens = startLens;

    // A missing year-end is a gap in the tape, not a value of zero: break the path there.
    function spark(series) {
      const keys = Object.keys(series[0] || {}).filter((k) => k !== "as_of");
      if (series.length < 2 || !keys.length) return "";
      const vals = keys.map((k) => series.map((p) => {
        const v = p[k];
        return v == null || Number.isNaN(v) ? null : v;
      }));
      const flat = vals.flat().filter((v) => v != null);
      if (!flat.length) return "";
      const min = Math.min.apply(null, flat), max = Math.max.apply(null, flat), span = max - min || 1;
      const w = 300, h = 72, pad = 6;
      const colors = ["#3ddc97", "#7aa2ff", "#e0b44c"];
      const paths = vals.map((arr, i) => {
        const dots = [];
        let d = "", pen = false;
        arr.forEach((v, x) => {
          if (v == null) { pen = false; return; }
          const px = pad + (x / (arr.length - 1)) * (w - pad * 2);
          const py = pad + (1 - (v - min) / span) * (h - pad * 2);
          d += (pen ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1) + " ";
          if (!pen && (x + 1 >= arr.length || arr[x + 1] == null)) {
            dots.push('<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="2" fill="' + colors[i % 3] + '"/>');
          }
          pen = true;
        });
        if (!d) return "";
        return '<path d="' + d.trim() + '" fill="none" stroke="' + colors[i % 3] + '" stroke-width="1.6"/>' + dots.join("");
      }).join("");
      if (!paths) return "";
      return '<svg class="spark" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none">' + paths + "</svg>";
    }

    function hopHtml(key) {
      const p = picks && picks[key];
      if (!p) return '<div class="hops caption">No hop tape.</div>';
      const head = p.became
        ? p.became + (p.used_by ? " · used by " + p.used_by : "")
        : (p.still_pick ? "still a pick" : "");
      return '<div class="hops">' + (head ? '<div class="date">' + esc(head) + "</div>" : "")
        + (p.hops || []).map((h) => {
          const exit = h.exit === "drafted" ? " · used" : h.exit === "flip" ? " · sold" : " · held";
          return '<div class="hop"><span>' + esc(h.date) + " · " + esc(h.from || "?") + " → " + esc(h.to) + exit
            + "</span><b>" + fmt(h.t0) + " → " + fmt(h.out) + "</b></div>";
        }).join("") + "</div>";
    }

    function bagBlock(title, legs, total, unpriced, va) {
      const items = (legs || []).map((l) => {
        const val = l.flag === "unpriced" || l.value == null
          ? "no DP row"
          : l.flag === "priced_as_mid" ? fmt(l.value) + " · Mid"
          : l.flag && String(l.flag).startsWith("priced_as_")
            ? fmt(l.value) + " · as " + String(l.flag).slice(10)
          : fmt(l.value);
        const body = "<span>" + esc(l.label) + "</span><b>" + val + "</b>";
        if (l.kind === "pick" && l.asset_key) {
          const open = openPick === l.asset_key;
          return '<button type="button" class="leg' + (open ? " on" : "") + '" data-pick="' + esc(l.asset_key) + '"'
            + ' aria-expanded="' + (open ? "true" : "false") + '">'
            + body + "</button>" + (open ? hopHtml(l.asset_key) : "");
        }
        return '<div class="leg">' + body + "</div>";
      }).join("");
      // Signed by the same rule as every other delta, but it keeps its gold ink rather than
      // green/red: this is an adjustment inside one bag, not a result against another side.
      const adj = va && Math.round(va)
        ? '<div class="leg va"><span>Value Adjustment</span><b>' + signedNum(va) + "</b></div>"
        : "";
      const warn = unpriced ? '<div class="warn">' + unpriced + " no DP row</div>" : "";
      const shown = unpriced && !total ? "—" : fmt(total);
      // Name and total as a pinned pair, the same shape as every other row in the app that
      // pairs a label with a figure. Joined by "·" in one wrapping heading, a long name put
      // the bag's total alone on a second line, reading as though it belonged to nothing.
      return '<div class="bag"><h3><span>' + seatTitle(title) + "</span><b>" + shown + "</b></h3>"
        + warn + items + adj + "</div>";
    }

    // GitHub Pages answers a missing file with an HTML 404, so res.json() would throw a parse error.
    async function getJson(path) {
      const res = await fetch(path + "?" + DATA_V);
      if (!res.ok) throw new Error(path + " " + res.status);
      return res.json();
    }

    function say(msg) {
      document.getElementById("lead").textContent = msg || "";
    }

    // "trades" carries two meanings by design: the selected seat's Trades tab when a seat is
    // set, and the league-wide list of every trade when none is. "trade" is one trade as its
    // own screen and is always league-wide — it takes ?t= plus ?seat= for the side that frames it.
    const VIEWS = ["home", "trades", "partners", "drafts", "titles", "trade"];
    const SEATLESS = ["home", "titles", "trades", "trade"];

    async function loadMembers() {
      members = await getJson("data/ui/members.json");
      // Last season's finishing order, derived by title-path.mjs. The file already ships in
      // this order; sorting again is what keeps the picker right if anything ever reorders it,
      // and a build with no places sorts to a no-op and keeps the file's own order.
      members.sort((a, b) => (a.place || 99) - (b.place || 99));
      league = await getJson("data/ui/league.json");
      try { titles = await getJson("data/ui/titles.json"); }
      catch (err) { titles = { titles: [] }; }
      try { marks = await getJson("data/ui/marks.json"); }
      catch (err) { marks = { seats: {} }; }
      // News is additive and third-party. A missing, stale or malformed file must cost the news
      // section and nothing else, so this never throws and never blocks the page -- the same
      // rule the vote tallies follow below. An unknown v is treated as absent rather than
      // read optimistically, because a schema change could move the field the UI escapes.
      try {
        const book = await getJson("data/ui/news.json");
        news = book && book.v === 1 && Array.isArray(book.items) ? book : null;
      } catch (err) { news = null; }
      // Absent, stale or malformed vote tallies must never block the page: the local vote still works.
      try {
        const book = await getJson("data/ui/votes.json");
        voteBook = book && book.v === 1 && book.votes ? book : null;
      } catch (err) { voteBook = null; }
      const startTitle = params.get("title");
      const startView = params.get("view");
      tradeSeat = params.get("seat") || null;
      // The league-wide screens resolve without a seat, so honour them before the ?me lookup
      // or the URL lands back on league home (P1-1).
      if (startView === "titles") {
        view = "titles";
        titleYear = startTitle || null;
      } else if (startView === "trade") {
        view = "trade";
        openId = params.get("t") || null;
      } else if (startView === "trades") {
        view = "trades";
      }
      // syncUrl writes ?me=<display name>; accept either that or a user_id.
      const startMe = params.get("me");
      const seat = startMe
        ? members.find((m) => m.user_id === startMe || m.name === startMe)
        : null;
      if (seat) {
        view = VIEWS.indexOf(startView) >= 0 ? startView : "home";
        openId = params.get("t") || null;
        if (view === "trade") await ensureTradeSeat();
        await selectMe(seat.user_id, true);
        return;
      }
      if (view === "trade") {
        // ?view=trade with no trade is not a screen. The list it belongs to is.
        if (!openId) view = "trades";
        else await ensureTradeSeat();
      }
      document.getElementById("app").hidden = false;
      render();
    }

    /**
     * Resolve and load the seat that frames the open full-screen trade. The board tape names
     * both sides of every trade, so ?t= alone is enough — the seat param only picks which side
     * frames it. Returns true once the seat file is in hand.
     */
    async function ensureTradeSeat() {
      if (!openId) return false;
      if (!tradeSeat) {
        const row = tradeSide(openId, null);
        tradeSeat = row ? row.user_id : null;
      }
      if (!tradeSeat) return false;
      return !!(await seatData(tradeSeat));
    }

    /**
     * The league's ten managers as listbox options: last season's finishing order, the champion
     * crowned (via seatLabel), the taken seat marked, one 44px target each.
     *
     * One emitter, and now one mount: league home's Teams chip renders it into #teamMenu. The
     * brand header used to paint the same options into a second menu of its own, and the emitter
     * stayed single the whole time it did, because two controls claiming to be the same list are
     * exactly how the finishing order or the crown ends up disagreeing between them. It stays
     * single now for the next second mount rather than for the one that was removed.
     */
    function whoOptions() {
      const opt = (on, id, label) =>
        '<button type="button" role="option" aria-selected="' + (on ? "true" : "false") + '"'
        + ' class="' + (on ? "on" : "") + '" data-who="' + esc(id) + '">'
        + '<span class="who-name">' + seatLabel(label) + "</span></button>";
      // Managers only. The list used to open with a "Team" option that cleared the seat; the home
      // icon in the header does exactly that, and dropping the option is what lets all ten names
      // show without scrolling. Crown rides seatLabel for the reigning champ — not a second paint.
      return members
        .map((m) => opt(!!(me && me.user_id === m.user_id), m.user_id, m.name))
        .join("");
    }

    /**
     * A popup opened from a control halfway down the page can be almost entirely below the fold,
     * and focusing its first option only brings that option into view -- which is how five of the
     * six data sets sat off screen at 375px. Scroll by the least amount that puts the whole panel
     * inside the viewport; if it is taller than the viewport, align its top and let it scroll
     * internally. Both menus in the chip box are capped to their own list precisely so that the
     * first branch is the one that runs.
     */
    function showMenu(menu) {
      if (!menu || !menu.getBoundingClientRect) return;
      const r = menu.getBoundingClientRect();
      const pad = 8;
      let dy = 0;
      if (r.bottom > window.innerHeight - pad) dy = r.bottom - (window.innerHeight - pad);
      if (r.top - dy < pad) dy = r.top - pad;
      if (dy) window.scrollBy(0, dy);
    }

    function clearLeague() {
      me = null;
      data = null;
      view = "home";
      openId = null;
      partnerName = null;
      openPick = null;
      openDraft = null;
      markOpen = null;
      titleYear = null;
      tradeSeat = null;
      voteToast = null;
      // Filters are per-seat state. Leaving them set filtered the next seat to a season it may not have.
      year = "all";
      lens = "all";
      draftSort = "new";
      draftRounds = { 1: true, 2: true, 3: true, 4: true };
      draftStartup = false;
      yearFilterOpen = false;
      draftFilterOpen = false;
      lensOpen = false;
      dsOpen = false;
      teamsOpen = false;
      // The home icon returns league home to exactly what a cold load shows, which is now the
      // chip box with nothing under it. It used to reset to Most lopsided.
      dataSet = null;
      say("");
      // League home has no screen heading, so this only asks render() for the scroll to top.
      focusNext = ".screen-h";
      syncUrl();
      render();
    }

    function urlNow() {
      const q = new URLSearchParams();
      if (me) q.set("me", me.name);
      if (view && view !== "home") q.set("view", view);
      if (view === "titles" && titleYear) q.set("title", titleYear);
      if (openId) q.set("t", openId);
      if (view === "trade" && tradeSeat) q.set("seat", tradeSeat);
      if (lens && lens !== "all") q.set("lens", lens);
      return "?" + q.toString();
    }

    /**
     * Which screen you are on — not what is expanded on it. Moving between screens pushes a
     * history entry, so browser Back retraces the same steps the in-app back chip does.
     * Expanding a row or moving the clock only replaces: Safari throttles history writes
     * around 100 per 30 s and an accordion used to spend one on every toggle (P1-12).
     */
    function screenKey() {
      return [
        (me && me.user_id) || "",
        view,
        view === "titles" ? (titleYear || "") : "",
        view === "trade" ? (openId || "") + "/" + (tradeSeat || "") : "",
      ].join("|");
    }

    // Depth of the current history entry among the entries this document pushed. Only when it
    // is above zero does the app own something behind it, so only then may back() be trusted
    // not to walk off the site. Read back out of the popped entry, so Forward is exact too.
    let depth = 0;
    let restoring = false;
    let lastUrl = null;
    let lastScreen = null;

    function stateNow() {
      return {
        me: (me && me.user_id) || null,
        view: view,
        titleYear: titleYear,
        openId: openId,
        tradeSeat: tradeSeat,
        lens: lens,
        d: depth,
      };
    }

    function syncUrl() {
      const url = urlNow();
      const screen = screenKey();
      if (url === lastUrl && screen === lastScreen) return;
      const push = lastScreen !== null && screen !== lastScreen;
      lastUrl = url;
      lastScreen = screen;
      // popstate already moved the browser to this URL. Writing history again would either
      // duplicate the entry or clobber the one we just arrived at.
      if (restoring) return;
      if (push) {
        depth += 1;
        history.pushState(stateNow(), "", url);
      } else {
        history.replaceState(stateNow(), "", url);
      }
    }

    function stateFromUrl() {
      const q = new URLSearchParams(location.search);
      const name = q.get("me");
      const seat = name ? members.find((m) => m.user_id === name || m.name === name) : null;
      return {
        me: (seat && seat.user_id) || null,
        view: q.get("view") || "home",
        titleYear: q.get("title") || null,
        openId: q.get("t") || null,
        tradeSeat: q.get("seat") || null,
        lens: q.get("lens") || "all",
        d: 0,
      };
    }

    /**
     * Browser Back and Forward. The address bar is already the destination, so this only has
     * to put the app back into the state that URL describes and repaint.
     */
    async function applyState(st) {
      const want = st || {};
      restoring = true;
      try {
        depth = want.d || 0;
        lens = want.lens && WINDOWS.some((w) => w[0] === want.lens) ? want.lens : "all";
        view = VIEWS.indexOf(want.view) >= 0 ? want.view : "home";
        titleYear = want.titleYear || null;
        openId = want.openId || null;
        tradeSeat = want.tradeSeat || null;
        // Not in the URL, so a history hop cannot restore it. Closed rather than left stale.
        partnerName = null;
        openPick = null;
        openDraft = null;
        markOpen = null;
        teamsOpen = false;
        lensOpen = false;
        yearFilterOpen = false;
        draftFilterOpen = false;
        voteToast = null;
        const wantMe = want.me || null;
        if (((me && me.user_id) || null) !== wantMe) {
          if (!wantMe) {
            me = null;
            data = null;
          } else {
            const seat = members.find((m) => m.user_id === wantMe);
            try {
              if (!seat) throw new Error("unknown seat " + wantMe);
              data = seatCache[wantMe] || await getJson("data/ui/me/" + wantMe + ".json");
              seatCache[wantMe] = data;
              me = seat;
            } catch (err) {
              console.error(err);
              me = null;
              data = null;
              if (view !== "titles" && view !== "trade" && view !== "trades") view = "home";
            }
          }
        }
        if (view === "trade" && tradeSeat) await seatData(tradeSeat);
        say("");
        focusNext = ".screen-h";
        render();
      } finally {
        restoring = false;
      }
    }

    window.addEventListener("popstate", (e) => {
      applyState(e.state || stateFromUrl());
    });

    /**
     * In-app Back. Where the app owns a history entry it uses the real one, so the chip and
     * the browser button can never disagree. A cold deep link has nothing behind it, so it
     * gets an explicit parent screen instead of being bounced off the site.
     */
    function goBack(fallback) {
      if (depth > 0) {
        history.back();
        return;
      }
      fallback();
    }

    async function selectMe(id, keep) {
      const prev = me;
      try {
        me = members.find((m) => m.user_id === id);
        data = seatCache[id] || await getJson("data/ui/me/" + id + ".json");
        seatCache[id] = data;
        if (!league) league = await getJson("data/ui/league.json");
        if (!picks) picks = await getJson("data/ui/picks.json");
      } catch (err) {
        console.error(err);
        me = prev;
        document.getElementById("app").hidden = false;
        say("Could not load that team. Check your connection and try again.");
        render();
        return;
      }
      say("");
      document.getElementById("app").hidden = false;
      voteSeatRemember(id);
      // The menu is spent once a seat is taken, and it lives inside the subtree render() is
      // about to replace.
      teamsOpen = false;
      if (!keep) {
        view = "home";
        openId = null;
        tradeSeat = null;
        partnerName = null;
        openPick = null;
        openDraft = null;
        voteToast = null;
        focusNext = ".screen-h";
      }
      syncUrl();
      render();
    }

    function gradeOf(per) {
      if (per == null) return "even";
      if (per >= GRADE_EVEN) return "you_extract";
      if (per <= -GRADE_EVEN) return "they_extract";
      return "even";
    }

    /** The one per-partner number. Home's teaser and the Partners tab both read this. */
    function partnerPer(seat, name) {
      const ds = ((seat && seat.trades) || [])
        .filter((t) => (t.others || []).length === 1 && t.others[0] === name
          && !t.incomplete && chipLived(t.date))
        .map(tradeDelta)
        .filter((d) => d != null);
      const per = ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null;
      return { name: name, n: ds.length, per: per, grade: gradeOf(per) };
    }

    function gradeLabel(g) {
      if (g === "you_extract") return "you extract";
      if (g === "they_extract") return "they extract";
      return "even";
    }

    function gradeCls(g) {
      if (g === "you_extract") return "pos";
      if (g === "they_extract") return "neg";
      return "";
    }

    function isMulti(t) {
      return !!(t && t.others && t.others.length > 1);
    }

    function sideOf(t) {
      return applyVa((t.windows && t.windows[lens]) || t.even || t.realized, isMulti(t));
    }

    // Mirrors value-adjust.mjs exactly: no VA on N-way trades, totals refresh when either bag is priced.
    function applyVa(s, noVa) {
      if (!s || s.incomplete) return s;
      const priced = (legs) => (legs || []).filter((l) => l.value != null);
      const sum = (legs) => priced(legs).reduce((a, l) => a + l.value, 0);
      const got = priced(s.legs), sent = priced(s.sent);
      if (!got.length && !sent.length) return s;
      const pieceWeight = (l) => {
        if (!l || l.became) return 1;
        return /^pick:\\d{4}:4:/.test(String(l.asset_key || "")) ? 0.5 : 1;
      };
      const one = (mine, other) => {
        if (!mine.length || !other.length) return 0;
        if (mine.length === other.length) return 0;
        const myMax = Math.max(...mine.map((l) => l.value));
        const theirMax = Math.max(...other.map((l) => l.value));
        const mineCount = mine.reduce((a, l) => a + pieceWeight(l), 0);
        const spots = Math.max(0, other.reduce((a, l) => a + pieceWeight(l), 0) - mineCount);
        const lesser = other.filter((l) => l.value < myMax).reduce((a, l) => a + pieceWeight(l), 0);
        const n = Math.min(3, Math.max(spots, Math.max(0, lesser - mineCount)));
        const damp = theirMax > 0 ? myMax / Math.max(myMax, theirMax) : 1;
        return 0.15 * n * myMax * damp;
      };
      const vaG = noVa ? 0 : one(got, sent), vaS = noVa ? 0 : one(sent, got);
      const today = sum(s.legs) + vaG, sentToday = sum(s.sent) + vaS;
      return Object.assign({}, s, {
        value_adjust: vaG,
        value_adjust_sent: vaS,
        today: today,
        sent_today: sentToday,
        today_delta: today - sentToday,
      });
    }

    // ponytail: middle = rounded bags, so 12,944 − 6,874 reads 6,070 not a raw 6069.33 or an aged leftover.
    function displayDelta(got, sent) {
      if (got == null || sent == null || Number.isNaN(got) || Number.isNaN(sent)) return null;
      return Math.round(got) - Math.round(sent);
    }

    function windowScore(r) {
      const w = r.windows && r.windows[lens];
      if (!w || w.incomplete) return null;
      return displayDelta(w.got, w.sent);
    }

    // renderTeamHome used to call this inside a sort comparator, so one home render
    // recomputed the Value Adjustment from legs about 2,000 times.
    const deltaCache = new WeakMap();
    function tradeDelta(t) {
      if (!t || t.incomplete) return null;
      let byLens = deltaCache.get(t);
      if (!byLens) { byLens = {}; deltaCache.set(t, byLens); }
      if (lens in byLens) return byLens[lens];
      const s = sideOf(t);
      const d = !s || s.incomplete || s.today == null || s.sent_today == null
        ? null
        : displayDelta(s.today, s.sent_today);
      byLens[lens] = d;
      return d;
    }

    function chipLived(date) {
      if (lens === "t0" || lens === "all") return true;
      return windowLived(date);
    }

    function addYears(ymd, n) {
      const p = (ymd || "").split("-").map(Number);
      if (p.length < 3) return ymd;
      const y = p[0] + n, m = p[1], d = p[2];
      const dim = new Date(y, m, 0).getDate();
      return y + "-" + String(m).padStart(2, "0") + "-" + String(Math.min(d, dim)).padStart(2, "0");
    }

    function windowLived(date) {
      const need = { t0: 0, y1: 1, y2: 2, y3: 3, all: 1 }[lens];
      if (!need) return true;
      const today = (league && league.today) || "";
      return date <= addYears(today, -need);
    }

    function rankWide() {
      const sides = (league && league.trade_boards && league.trade_boards.sides) || [];
      // Score each side once, then dedupe and sort on the stored key.
      const by = new Map();
      for (const r of sides) {
        // chipLived, not windowLived: "all" is unfiltered, and windowLived maps it to 1 year.
        if (!chipLived(r.date)) continue;
        const s = windowScore(r);
        if (s == null) continue;
        const prev = by.get(r.transaction_id);
        if (!prev || Math.abs(s) > Math.abs(prev.score)) by.set(r.transaction_id, { r: r, score: s });
      }
      return [...by.values()].sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
        .slice(0, 10).map((x) => x.r);
    }

    async function seatData(uid) {
      try {
        if (!seatCache[uid]) seatCache[uid] = await getJson("data/ui/me/" + uid + ".json");
        if (!picks) picks = await getJson("data/ui/picks.json");
      } catch (err) {
        console.error(err);
        say("Could not load that team's trades. Check your connection and try again.");
        return null;
      }
      return seatCache[uid];
    }

    /**
     * ONE convention for every value delta on this dashboard: a signed, coloured figure
     * sitting next to the thing it describes. Positive is "+N" in green, negative is
     * "−N" in red, and the sign is always explicit. A tie is a bare 0 in neutral ink.
     * A delta that does not exist stays an em dash and never gets a sign invented for it.
     *
     * This replaced four conventions for the same quantity: an arrow glyph in a middle
     * column, an explicit "+" prefix, colour with no sign, and a bare number. Both sides
     * of a two-team trade now carry the delta, mirrored, which is redundant by
     * construction -- zero-sum holds -- and deliberately so: the redundancy is what makes
     * "who won by how much" readable without decoding a glyph.
     *
     * signedNum is the text, signedCls is the colour, tapeMargin is the only markup.
     * Anything that renders a delta calls tapeMargin; anything that names a delta inside
     * a sentence calls signedNum and takes its ink from the sentence.
     */
    function signedNum(d) {
      if (d == null || Number.isNaN(d)) return "—";
      const r = Math.round(d);
      if (r === 0) return "0";
      return (r > 0 ? "+" : "−") + fmt(Math.abs(r));
    }

    function signedCls(d) {
      return d == null || Number.isNaN(d) || Math.round(d) === 0 ? "" : cls(d);
    }

    // Keeps the tapeMargin name because the three tape rows -- trades, lopsided board and
    // drafts -- were already funnelled through it so the convention could not drift between
    // them. Now every screen shares it, and none of them formats a delta by hand.
    function tapeMargin(d) {
      return '<span class="delta ' + signedCls(d) + '">' + signedNum(d) + "</span>";
    }

    // A side's delta and its bag total are one unit, so the narrow layout wraps them
    // together beneath the name. Emitted as two separate flex children they wrapped
    // separately, which stranded the total alone on a line and left-aligned under a
    // right-aligned side -- a bare 12,621 reading as though it belonged to nothing.
    function tapeFigures(d, valHtml) {
      return '<span class="figs">' + tapeMargin(d) + '<span class="val">' + valHtml + "</span></span>";
    }

    /** The trade_boards side row that frames one trade, preferring a named seat's side. */
    function tradeSide(tx, uid) {
      const sides = (league && league.trade_boards && league.trade_boards.sides) || [];
      let first = null;
      for (const s of sides) {
        if (s.transaction_id !== tx) continue;
        if (uid && s.user_id === uid) return s;
        if (!first) first = s;
      }
      return first;
    }

    /**
     * One collapsed trade on a league-wide list. It used to swap itself for an expanded
     * tradeRow in place; it now opens the trade as its own screen, so a league row and the
     * screen it leads to are two things instead of one thing in two states.
     */
    function boardTape(r) {
      const w = (r.windows && r.windows[lens]) || {};
      const s = windowScore(r);
      const got = w.incomplete && !w.got ? "—" : fmt(w.got);
      const sent = w.incomplete && !w.sent ? "—" : fmt(w.sent);
      // Gold outline for a trade this device has voted on. Colour alone is not a message,
      // so the same fact goes to a screen reader as text.
      const voted = !!readVotes(r.transaction_id).choice;
      // The two sides are exact mirrors, so one score signs both: the seat carries s, the
      // counterparty carries -s. The names go back to plain ink -- the colour belongs on the
      // figure it describes, not on the label beside it.
      return '<button type="button" class="row' + (voted ? " voted" : "") + '" data-board-open="' + esc(r.user_id) + '" data-id="' + esc(r.transaction_id) + '">'
        + '<div class="row-top tape">'
        + '<div class="side"><div class="side-line"><span class="names">' + seatLabel(r.name) + "</span>" + tapeFigures(s, got) + "</div></div>"
        + '<div class="side right"><div class="side-line"><span class="names">' + seatLabel(r.other) + "</span>" + tapeFigures(s == null ? null : -s, sent) + "</div></div>"
        + '<div class="tape-sub"><span class="date sub-when">' + esc(r.date) + "</span>"
        + (r.headline ? '<span class="date sub-note">' + esc(r.headline) + "</span>" : "")
        + "</div></div>"
        + (voted ? '<span class="sr-only">You voted on this trade.</span>' : "")
        + "</button>";
    }

    function yearsOn(days) {
      if (days == null) return "—";
      if (days < 365) return days + "d";
      const y = days / 365;
      return (Math.round(y * 10) / 10).toString().replace(/\\.0$/, "") + "y";
    }

    function listRow(r, right) {
      return '<div class="row"><div class="row-top"><div><div class="names">' + esc(r.name) + "</div>"
        + '<div class="date">' + esc(r.team || "") + (r.stays > 1 ? " · " + r.stays + " stays" : "") + "</div></div>"
        + '<div class="margin">' + right + "</div></div></div>";
    }

    function dataSetDef(id) {
      return DATA_SETS.find((d) => d[0] === id) || DATA_SETS[0];
    }

    /**
     * The rows of one data set. Every list is rendered exactly as its pack rendered it -- the
     * same listRow, the same right-hand figure, the same boardTape for the lopsided board. This
     * change swapped the container, not the lists.
     */
    function dataSetRows(id) {
      const p = (league && league.player_lists) || {};
      const trades = (r) => r.trades + (r.trades === 1 ? " trade" : " trades");
      if (id === "wide") return rankWide().map((r) => boardTape(r)).join("");
      if (id === "passed") return (p.most_traded || []).map((r) => listRow(r, trades(r))).join("");
      if (id === "least") return (p.least_traded || []).map((r) => listRow(r, trades(r))).join("");
      if (id === "forever") return (p.forever || []).map((r) => listRow(r, yearsOn(r.days))).join("");
      return (p.homesteaders || []).map((r) => listRow(r, yearsOn(r.days))).join("");
    }

    function dsOpt(row) {
      const on = dataSet === row[0];
      return '<button type="button" role="option" aria-selected="' + (on ? "true" : "false") + '"'
        + ' class="ds-opt' + (on ? " on" : "") + '" data-dset="' + esc(row[0]) + '">'
        + "<b>" + esc(row[1]) + "</b><span>" + esc(row[2]) + "</span></button>";
    }

    /**
     * The way back to nothing selected, first in the menu so it is the option a user meets
     * rather than one they have to know about. It is a real option in the listbox -- same
     * role, same 44px target, same arrow-key run as the five sets -- so a keyboard reaches it
     * on ArrowDown/Home like any other, and aria-selected marks it when it is the live state.
     *
     * Its line is deliberately short enough to stay one line at 320px, where every set's line
     * wraps to two. A sixth option pushes the tail of an already tall panel further below the
     * fold -- three of five were already under it at 320px before this option existed -- and one
     * line rather than two is the whole of what this function can do about that.
     */
    function dsNoneOpt() {
      const on = !dataSet;
      return '<button type="button" role="option" aria-selected="' + (on ? "true" : "false") + '"'
        + ' class="ds-opt' + (on ? " on" : "") + '" data-dset-none="1">'
        + "<b>None</b><span>Hide the set below the dropdown.</span></button>";
    }

    function dsMenu() {
      return '<div class="filter-panel" id="dataSets" role="listbox" aria-label="League Data Sets">'
        + dsNoneOpt()
        + DATA_SETS.map(dsOpt).join("")
        + "</div>";
    }

    /**
     * The one control that replaced the five pack headers. Same shape as the Score as button and
     * the seat picker: a trigger, an absolutely positioned panel of options, outside-click and
     * Escape to close.
     *
     * The visible label is the constant "League Data Sets" and never the selection -- the seat
     * picker settled on that convention for the same reason, and the chosen set is named by the
     * heading immediately below and by aria-selected inside the menu. The accessible name carries
     * the selection so nothing is lost to a screen reader.
     *
     * With nothing selected there is no heading below and nothing else on screen says so, so the
     * accessible name says "none selected" -- the one state where the label's silence would
     * otherwise leave a screen reader with no reading at all.
     */
    function dataSetRow() {
      const cur = dataSet ? dataSetDef(dataSet) : null;
      const named = cur
        ? ' aria-label="League Data Sets, ' + esc(cur[1]) + ' selected"'
        : ' aria-label="League Data Sets, none selected"';
      return '<button type="button" class="home-chip' + (dsOpen ? " on" : "") + '" data-dset-open="1"'
        + ' aria-haspopup="listbox" aria-expanded="' + (dsOpen ? "true" : "false") + '"'
        + named + '><span class="chip-lab">'
        + "League Data Sets" + ' <span class="chev">▾</span></span></button>';
    }

    /**
     * The other live chip, and the only way into a seat: the brand header's picker was removed
     * once the chips shipped, on the ruling that the chips are the access points. The way out of
     * a seat is the home icon in the header, which calls clearLeague() from every screen -- so
     * leaving one seat for another is two taps, and that is the accepted trade.
     *
     * The visible label is the constant "Teams", never the selection, for the same reason the
     * League Data Sets chip beside it reads a constant: a chip that renamed itself to the taken
     * seat would read as that manager's own button rather than as the way to the other nine. The
     * accessible name carries the seat instead, and the h2.seat-h above the tab row is what says
     * it on screen.
     */
    function teamsChip() {
      const named = me && me.name
        ? "Teams, " + me.name + seatFlairText(me.name) + " selected"
        : "Teams, none selected";
      return '<button type="button" class="home-chip' + (teamsOpen ? " on" : "") + '" data-teams-open="1"'
        + ' aria-haspopup="listbox" aria-expanded="' + (teamsOpen ? "true" : "false") + '"'
        + ' aria-label="' + esc(named) + '"><span class="chip-lab">'
        + "Teams" + ' <span class="chev">▾</span></span></button>';
    }

    function teamsMenu() {
      return '<div class="who-menu" id="teamMenu" role="listbox" aria-label="Teams">'
        + whoOptions() + "</div>";
    }

    /**
     * A cell nobody has decided on yet. Deliberately not a button and deliberately not
     * addressable: no tabindex, no data-*, no role, nothing for a handler to find. The ticker
     * shipped two <button> pills with an empty destination and every tap on them did nothing;
     * an inert cell that looks pressable is the defect this app removed tonight, and four large
     * chips would be a far bigger version of it. It is aria-hidden because an em dash is a
     * placeholder, not a reading.
     */
    function chipSlot() {
      return '<span class="home-chip slot" aria-hidden="true">—</span>';
    }

    /**
     * League home's box of four equal chips. Two lead somewhere, two are slots.
     *
     * Both menus are emitted here rather than inside their triggers, so both are absolutely
     * positioned against this one box: they drop the full width of the card instead of the
     * width of the cell they were opened from, and there is a single ancestor chain to keep
     * free of overflow, transform, contain and clip-path.
     */
    function homeChips() {
      return '<div class="chip-box ds-wrap">'
        + '<div class="chip-grid">'
        + teamsChip()
        + dataSetRow()
        + chipSlot()
        + chipSlot()
        + "</div>"
        + (teamsOpen ? teamsMenu() : "")
        + (dsOpen ? dsMenu() : "")
        + "</div>";
    }

    /**
     * The selected set, or nothing at all. Empty is the first-load state and the state the
     * "None" option and the home icon return to, so this renders no box, no heading and no
     * placeholder -- the dropdown stands alone over the news feed.
     */
    function dataSetPanel() {
      if (!dataSet) return "";
      const cur = dataSetDef(dataSet);
      const rows = dataSetRows(cur[0]);
      // The data-* is what focusSelector() re-finds after a render this screen did not ask for --
      // a vote settling, or votes.json arriving. Selecting a set puts focus here, and without a
      // handle a late render dropped it to <body> a moment later, which is the same defect the
      // .screen-h special case exists for.
      return '<div class="pack" id="dsBody">'
        + '<h2 class="ds-h" tabindex="-1" data-dset-head="1">' + esc(cur[1]) + "</h2>"
        + '<p class="caption">' + esc(cur[2]) + "</p>"
        + '<div class="pack-body">'
        + (rows || '<p class="caption">Nothing in this data set yet.</p>')
        + "</div></div>";
    }

    function nth(n) {
      const v = Number(n);
      if (!v) return String(n);
      const m = v % 100;
      if (m >= 11 && m <= 13) return v + "th";
      return v + ({ 1: "st", 2: "nd", 3: "rd" }[v % 10] || "th");
    }

    function pct(n) {
      return n == null || Number.isNaN(n) ? "—" : Math.round(n * 100) + "%";
    }

    function originLab(o) {
      return ({ held: "held", drafted: "drafted", trade: "traded in", waiver: "waiver", fa: "FA", opening: "opening", unknown: "unknown" })[o] || "unknown";
    }

    function postureLab(p) {
      return ({ player_heavy: "Bought players", pick_heavy: "Bought picks", swap: "Swapped", none: "No trades" })[p] || "No trades";
    }

    function statBox(title, sub) {
      return '<div class="stat"><b>' + title + "</b><span>" + sub + "</span></div>";
    }

    /** A label and a run of pick names. Not a leg-and-figure pair — see .leg.list. */
    function bagLine(label, items) {
      if (!items || !items.length) return "";
      return '<div class="leg list"><span>' + esc(label) + "</span><b>" + items.map(esc).join(" · ") + "</b></div>";
    }

    function chapterHtml(title, ch, extra) {
      if (!ch) return '<div class="chapter"><h3>' + title + "</h3><p class='caption'>No prior season in this league.</p></div>";
      const mean = ch.league_mean_trades;
      const vs = mean == null ? "" : " · league mean " + mean.toFixed(1);
      const partners = (ch.partners || []).slice(0, 3).map((p) => seatLabel(p.name) + " ×" + p.n).join(" · ");
      const big = (ch.big || []).map((b) => {
        return '<div class="row"><div class="row-top"><div><div class="names">'
          + (b.partners || []).map(esc).join(" · ") + "</div>"
          + '<div class="date">' + esc(b.date || "")
          + (b.firsts ? " · " + b.firsts + " first" + (b.firsts === 1 ? "" : "s") : "")
          + "</div></div></div>"
          + '<div class="date">Got ' + ((b.got || []).map(esc).join(", ") || "—")
          + "<br>Sent " + ((b.sent || []).map(esc).join(", ") || "—") + "</div></div>";
      }).join("");
      const picksIn = ch.picks_in || [];
      const picksOut = ch.picks_out || [];
      return '<div class="chapter"><h3>' + esc(title) + "</h3>"
        + '<div class="stats">'
        + statBox(ch.trades, "trades" + vs)
        + statBox(postureLab(ch.posture), "player " + ch.players_in + " in / " + ch.players_out + " out")
        + statBox(String(picksIn.length), "picks in · " + ch.firsts_in + " firsts")
        + statBox(String(picksOut.length), "picks out · " + ch.firsts_out + " firsts")
        + statBox(String((ch.waiver_adds || 0) + (ch.fa_adds || 0)), "waiver + FA adds")
        + statBox(String(ch.drops || 0), "drops")
        + "</div>"
        + bagLine("Picks in", picksIn)
        + bagLine("Picks out", picksOut)
        + (partners ? '<div class="caption">Traded with ' + partners + "</div>" : "")
        + (extra || "")
        + (big ? "<h2>Big moves</h2>" + big : "")
        + "</div>";
    }

    function renderTitleDetail(t) {
      const rec = t.record || {};
      const sit = rec.sit == null ? "—" : Math.round(rec.sit * 100) + "%";
      const prior = t.prior
        ? t.prior.season + " · " + (t.prior.place ? nth(t.prior.place) : "no place")
          + " · " + t.prior.wins + "–" + t.prior.losses
          + (t.prior.fpts_rank ? " · " + nth(t.prior.fpts_rank) + " in points" : "")
        : "Startup year — no prior season.";
      const turn = t.turnover || {};
      const end = turn.vs_prev_end || {};
      const core = turn.core_from_prev_end || {};
      const used = (t.draft && t.draft.used) || [];
      const draftLine = used.length
        ? used.map((p) => esc(p.player) + " (R" + esc(p.round) + ")").join(" · ")
        : "None used.";
      const lineup = ((t.title_lineup && t.title_lineup.starters) || []).map((p) =>
        '<div class="leg"><span>' + esc(p.player) + '</span><b class="origin-' + esc(p.origin || "unknown") + '">'
        + originLab(p.origin) + "</b></div>"
      ).join("");
      const winHow = rec.fpts_rank === 1 ? "Won the points race" : "Won the bracket";
      // Routed through the one back handler, not through data-title="": clicking it used to
      // push a fresh titles entry, so the browser's Back then returned to this detail while the
      // chip claimed to have left it. Both now pop the same entry.
      return '<button type="button" class="chip back" data-back="1">← All champions</button>'
        + '<div class="path-hero"><div class="kicker">' + esc(t.season) + " champion</div>"
        + '<h2 class="screen-h" tabindex="-1">' + seatLabel(t.name) + "</h2>"
        + '<p class="thesis">' + esc(t.thesis || "") + "</p></div>"
        + '<div class="stats">'
        + statBox(rec.wins + "–" + rec.losses, winHow + " · " + rec.fpts_rank + " of " + rec.teams + " in points")
        + statBox(fmt(rec.fpts), "scored · sit " + sit + " of potential")
        + statBox(String(rec.trades), "title-year trades · mean " + (rec.league_mean_trades == null ? "—" : rec.league_mean_trades.toFixed(1)))
        + statBox(t.draft && t.draft.startup ? used.length + " startup" : String(used.length), t.draft && t.draft.startup ? "startup picks used" : "rookie picks used")
        + statBox((t.title_lineup && t.title_lineup.from_opening) + " / " + (t.title_lineup && t.title_lineup.n), "title starters from opening roster")
        + statBox(end.retention == null ? "—" : pct(end.retention), "of last year's finale still on opening roster")
        + "</div>"
        + (t.final
          ? '<p class="caption">Championship, week ' + esc(t.final.week) + ": "
            + (t.final.tie ? "tied " : "beat ") + seatLabel(t.final.opponent) + " "
            + esc(t.final.champ_points) + "–" + esc(t.final.opponent_points) + "."
            + (t.final.top ? " Top scorer " + esc(t.final.top.player) + " " + esc(t.final.top.points) + "." : "")
            + "</p>"
          : "")
        + '<p class="caption">Year before: ' + esc(prior)
        + (core.n ? " · " + core.held + " of " + core.n + " opening starters were on that finale." : "")
        + "</p>"
        + "<h2>How they won</h2>"
        + chapterHtml("Previous season", t.windows && t.windows.previous)
        + chapterHtml("Offseason into " + t.season, t.windows && t.windows.offseason)
        + chapterHtml("Title season — regular", t.windows && t.windows.regular)
        + chapterHtml("Playoff run", t.windows && t.windows.playoffs)
        + '<div class="chapter"><h3>Draft capital used</h3>'
        + '<p class="caption">' + (t.draft && t.draft.startup ? "Startup. Not rookie capital." : "Rookie draft clicks.") + "</p>"
        + '<div class="caption">' + draftLine + "</div></div>"
        + '<div class="chapter"><h3>Title lineup</h3>'
        + '<p class="caption">Who started the championship week, and how they got there this year.</p>'
        + lineup + "</div>";
    }

    function renderTitles() {
      const list = (titles && titles.titles) || [];
      if (!list.length) return '<p class="caption">No championship path yet. Run <code>node title-path.mjs</code>.</p>';
      const open = titleYear && list.find((t) => t.season === titleYear);
      if (open) return renderTitleDetail(open);
      return '<h2 class="screen-h" tabindex="-1">Champions Path</h2>'
        + '<p class="caption">Each title year. Previous season, offseason, then the year they won. Not the trade needle.</p>'
        + list.map((t) => {
          const rec = t.record || {};
          const how = rec.fpts_rank === 1 ? "points race" : "bracket";
          return '<button type="button" class="row" data-title="' + esc(t.season) + '">'
            + '<div class="row-top"><div><div class="names">' + esc(t.season) + " · " + seatLabel(t.name) + "</div>"
            + '<div class="date">' + rec.wins + "–" + rec.losses + " · " + how
            + " · " + ((t.draft && t.draft.used) || []).length + " pick" + (((t.draft && t.draft.used) || []).length === 1 ? "" : "s") + " used</div></div>"
            + '<div class="margin">1st</div></div></button>';
        }).join("");
    }

    /** "3h ago". Null means the source's own date was unparseable, so say nothing rather than lie. */
    function ago(ms) {
      if (!ms) return "";
      const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
      if (s < 90) return "just now";
      const m = Math.round(s / 60);
      if (m < 60) return m + "m ago";
      const h = Math.round(m / 60);
      if (h < 36) return h + "h ago";
      return Math.round(h / 24) + "d ago";
    }

    const NEWS_CATS = {
      injury: "Injury", suspension: "Suspension", off_field: "Off the field",
      trade: "Trade", depth_chart: "Depth chart", breakout: "Breakout", news: "News",
      tweet: "From X",
    };

    /**
     * News and Alerts, below the league data sets.
     *
     * Every string in a row comes from the open internet -- a headline, a summary and a source
     * label written by somebody else's CMS -- which makes this the most exposed surface in the
     * app. Every one of them goes through esc(), in text and in attributes alike, and the href
     * is additionally gated to http/https so a "javascript:" URL in a feed cannot become a link.
     * The only field this repo authors is league_line, and that is escaped too rather than
     * trusted for being ours.
     */
    function renderNews() {
      const book = news && news.v === 1 ? news : null;
      const raw = (book && book.items) || [];
      // Soft-deleted posts stay in news.json until the next sync rebuild; newsGone is what
      // makes Remove take effect on this device immediately, and for every visitor once the
      // deleted_at stamp has been read from Supabase.
      const items = raw.filter((it) => !newsGone.has(it.id));
      // Heading only. The rows carry their own sharer, category and timestamp, so a paragraph
      // describing the feed was restating what the first row already shows. The empty state
      // still explains how an item gets here, which is the one thing a row cannot.
      const head = '<h2>News and Alerts</h2>';
      const live = '<div class="news-live" data-news-live="1"></div>';
      if (!items.length) {
        /**
         * Two different nothings, and they must not read the same.
         *
         * A null book is the load having failed -- the file missing, unreadable, or a version
         * this page does not know -- and the loader deliberately swallows all three so the feed
         * cannot take the page down. Printing "nothing has been shared yet" over that is the
         * page stating something it does not know, and stating it reassuringly: the user would
         * go looking at their Shortcut for a fault that is on this end.
         *
         * A book that loaded and holds no items is the real empty state, and it is the normal
         * one right now -- the feed is manual submissions only, so it is genuinely bare until
         * somebody shares. It has to read as a feed waiting for its first item rather than as a
         * feature that broke, and it has to say how an item gets here, because sharing from X
         * is the entire mechanism and it is not discoverable from this page.
         *
         * (No backticks in this comment: the whole page is one template literal.)
         */
        // The empty sentence is short on purpose, and it is now the only prose in this section:
        // the descriptive caption that used to sit above the box is gone, so this sentence is
        // the one place the mechanism is written down. It stays one line because a reader
        // staring at an empty box needs the action that fills it, not a description of the
        // feed they can already see is bare.
        // A third case: the book has rows but every one is soft-deleted. That is not "nothing
        // shared yet" and not a load failure — it is an emptied feed.
        const blank = !book
          ? "The feed could not be loaded. Nothing else on this page is affected."
          : (raw.length
            ? "No posts in the feed right now."
            : "Nothing shared yet. Send a tweet in from X with the league shortcut and it lands here.");
        return head + live
          + '<div class="news-box" data-news-feed="1" tabindex="0" role="region" aria-label="News and alerts, empty">'
          + '<p class="news-empty">' + esc(blank) + "</p></div>";
      }
      // Remove is admin-only in the UI. League home clears me, so this reads the remembered
      // seat (same key votes use) — pick TrumanCooper once via Teams, then Home still unlocks it.
      const admin = isNewsAdmin();
      const rows = items.map((it) => {
        const url = String(it.source_url || "");
        // Only http(s) becomes a link. Anything else -- and a feed is fully capable of shipping
        // "javascript:" -- renders as a plain row instead.
        const safe = /^https?:\\/\\//i.test(url) ? url : "";
        const when = ago(it.published);
        const cat = NEWS_CATS[it.category] || "News";
        const also = (it.also || []).length ? " +" + (it.also || []).length + " more" : "";
        const where = [
          esc(it.player) + (it.player_team ? " \\u00b7 " + esc(it.player_team) : "")
            + (it.player_position ? " " + esc(it.player_position) : ""),
          esc(it.source_label || it.source) + esc(also),
          when ? esc(when) : "",
        ].filter(Boolean).join(" \\u00b7 ");
        // An unaddressed shared tweet matched nobody, so there is no name to print. The label
        // says so rather than leaving an empty slot that reads as a rendering fault. Multi-tag
        // rows list every matched seat in the header (managers[]); single-tag rows use manager.
        const whoNames = (Array.isArray(it.managers) && it.managers.length)
          ? it.managers.filter(Boolean)
          : (it.manager ? [it.manager] : []);
        const who = whoNames.length
          ? whoNames.map((n) => seatLabel(n)).join(" \\u00b7 ")
          : (it.category === "tweet" ? "The league" : "");
        // Sharer's note, attributed, then the locker-room / factual summary. Both may be absent
        // on older rows; either alone is enough for the top of the post.
        const noteBit = it.note
          ? '<div class="news-note"><span class="news-note-by">'
            + (it.submitted_by ? seatLabel(it.submitted_by) : esc("Someone")) + ":</span> " + esc(it.note) + "</div>"
          : "";
        const inner = '<div class="news-top"><span class="news-who">' + who + "</span>"
          + '<span class="news-cat">' + esc(cat) + "</span></div>"
          + noteBit
          + '<div class="news-line">' + esc(it.league_line) + "</div>"
          + (it.headline ? '<div class="news-head">\\u201c' + esc(it.headline) + "\\u201d</div>" : "")
          + '<div class="news-meta">' + where + "</div>";

        /**
         * A tweet somebody shared in: manager tag, compact locker-room summary, then citation.
         *
         * **The row is a <div> and never an <a>.** See tweet (and Remove) are real controls;
         * nesting them inside a row-level link is defect A1.
         *
         * The full tweet text stays off the row on purpose -- it ate the viewport. The summary
         * is the copy; @handle + relative time + See tweet is the receipt. tweet_text still
         * has to exist on the item (the branch gate) so a row without oEmbed text cannot ship
         * an empty roast with a dead link.
         *
         * (No backticks in this comment: the whole page is one template literal.)
         */
        if (it.category === "tweet" && it.tweet_text) {
          /**
           * The link out is labelled "See tweet", so it may only go to X.
           *
           * The escapes are doubled because this whole page is one template literal: a lone
           * backslash is swallowed. A build guard asserts this exact x.com shape survived.
           */
          const xLink = /^https:\\/\\/x\\.com\\/[A-Za-z0-9_]{1,15}\\/status\\/[0-9]{1,25}$/.test(url) ? url : "";
          const handle = it.tweet_handle ? "@" + esc(it.tweet_handle) : "";
          const subId = newsSubmissionId(it.id);
          const del = (admin && subId)
            ? '<button type="button" class="news-del" data-news-del="' + esc(it.id) + '"'
              + (newsDelPending === it.id ? " disabled" : "")
              + ' aria-label="Remove this post from the feed">'
              + (newsDelPending === it.id ? "Removing\\u2026" : "Remove")
              + "</button>"
            : "";
          const footBits = [];
          if (handle) footBits.push('<span class="news-tweet-handle">' + handle + "</span>");
          if (when) footBits.push('<span class="news-tweet-when">' + esc(when) + "</span>");
          if (xLink) {
            footBits.push(
              '<a class="news-tweet-link" href="' + esc(xLink)
                + '" target="_blank" rel="noopener noreferrer">See tweet</a>'
            );
          }
          const foot = footBits.length
            ? '<div class="news-tweet-foot">'
              + footBits.join('<span class="news-tweet-sep" aria-hidden="true">\\u00b7</span>')
              + del
              + "</div>"
            : (del ? '<div class="news-tweet-foot">' + del + "</div>" : "");
          return '<div class="news-row news-row-tweet">'
            + '<div class="news-top"><span class="news-who">' + who + "</span>"
            + '<span class="news-cat">' + esc(cat) + "</span></div>"
            + noteBit
            + '<div class="news-line news-line-tweet">' + esc(it.league_line) + "</div>"
            + foot
            + "</div>";
        }
        return safe
          ? '<a class="news-row" href="' + esc(safe) + '" target="_blank" rel="noopener noreferrer">' + inner + "</a>"
          : '<div class="news-row">' + inner + "</div>";
      }).join("");
      return head
        + live
        + '<div class="news-box" data-news-feed="1" tabindex="0" role="region" aria-label="News and alerts, ' + items.length + ' items">'
        + '<div class="news-pull" data-news-pull="1" hidden aria-hidden="true"></div>'
        + rows + "</div>";
    }

    /**
     * Two controls, deliberately separate, and now in two different places. The clock -- At
     * trade, first 1/2/3 years, since trade -- is persistent chrome in the brand header, because
     * it is a global setting that six screens read. dataSetRow() picks which list is on this one
     * screen and is one cell of the chip box below. Folding them together would put two
     * unrelated axes in one menu and would take the clock away from Most lopsided, which is the
     * set that reads it.
     */
    function renderLeagueHome() {
      return dayAlert()
        + homeChips()
        + dataSetPanel()
        + renderNews();
    }

    function backChip(label) {
      return '<button type="button" class="chip back" data-back="1">← ' + esc(label || "Back") + "</button>";
    }

    /**
     * Every trade in the league, newest first. trade_boards.sides holds one row per seat per
     * trade, so this dedupes to one row per transaction_id. The side kept is the first one the
     * data lists rather than the winning one, so the left/right framing follows the tape
     * rather than putting the winner on the left of every row. Which side won is carried by
     * the signed delta beside each name, so the order does not have to carry it.
     */
    function leagueTrades() {
      const sides = (league && league.trade_boards && league.trade_boards.sides) || [];
      const by = new Map();
      for (const r of sides) if (!by.has(r.transaction_id)) by.set(r.transaction_id, r);
      return [...by.values()].sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        // Sleeper transaction ids climb with time, so they order a single day truthfully.
        return a.transaction_id < b.transaction_id ? 1 : a.transaction_id > b.transaction_id ? -1 : 0;
      });
    }

    function renderLeagueTrades() {
      const all = leagueTrades();
      // The same clock filter the per-seat tab and the home tiles use, so the three agree.
      const lived = all.filter((r) => chipLived(r.date));
      const toast = voteToast
        ? '<p class="vote-note">Vote recorded'
          + (voteToast.name ? " — you have <b>" + seatLabel(voteToast.name) + "</b> winning that one" : "")
          + ". Open it again to change your vote, or tap the same side to clear it.</p>"
        : "";
      const empty = !all.length
        ? '<p class="caption">No trades on the league tape yet.</p>'
        : !lived.length
          ? '<p class="caption">No trade in the league has lived ' + esc(clockName())
            + " yet. Score as Since trade to see them.</p>"
          : "";
      // No back chip here on purpose. This screen's parent is always league home, which is
      // exactly what the home icon in the header does — a second control beside it would say
      // the same thing twice. The trade screen does get one, because its parent varies.
      return '<h2 class="screen-h" tabindex="-1">League trades</h2>'
        // "the tape" is trade_boards.sides, and it carries only complete two-team trades: the
        // league's two three-team deals have no row there, so this is 288 of 290. Saying "the
        // tape" rather than "the league" is the difference between a claim and a fact.
        + '<p class="caption">Every trade on the league tape, newest first. Tap one to review it'
        + " and vote on who actually won. A gold outline is a trade you have voted on.</p>"
        + toast
        + '<div class="caption">' + esc(livedHint(lived.length, all.length, "trade")) + "</div>"
        + empty
        + lived.map((r) => boardTape(r)).join("");
    }

    /**
     * One trade, as the whole screen. Built on tradeRow / tradeBags rather than a second
     * renderer, so the row layout and the bag arithmetic stay in one place.
     */
    function renderTradeScreen() {
      const r = tradeSide(openId, tradeSeat);
      if (!openId || !r) {
        return backChip("Back")
          + '<h2 class="screen-h" tabindex="-1">Trade not found</h2>'
          + '<p class="caption">That trade is not on the league tape.</p>'
          + '<button type="button" class="chip" data-trades-list="1">All league trades</button>';
      }
      const uid = tradeSeat || r.user_id;
      const cached = seatCache[uid];
      const hit = cached && (cached.trades || []).find((t) => t.transaction_id === openId);
      return backChip("Back")
        + '<h2 class="screen-h" tabindex="-1">' + seatLabel(r.name) + " vs " + seatLabel(r.other) + "</h2>"
        + '<p class="caption">' + esc(r.date) + (r.headline ? " · " + esc(r.headline) : "") + "</p>"
        + (hit
          ? tradeRow(hit, null, true)
          : boardTape(r) + '<p class="caption">Loading both bags…</p>')
        + '<div class="vote-card">' + voteBlock(r) + "</div>"
        + '<div class="screen-foot">'
        + '<button type="button" class="chip" data-trades-list="1">All league trades</button>'
        + "</div>";
    }

    function partnerLine(p) {
      return '<button type="button" class="row" data-partner="' + esc(p.name) + '">'
        + '<div class="row-top"><div><div class="names">' + seatLabel(p.name) + "</div>"
        + '<div class="date">' + p.n + " complete · " + gradeLabel(p.grade) + "</div></div>"
        + '<div class="margin">' + tapeMargin(p.per) + "</div></div></button>";
    }

    function draftLine(p, tag) {
      if (!p) return "";
      return '<div class="row"><div class="row-top"><div><div class="names">' + esc(p.player) + "</div>"
        + '<div class="date">' + esc(tag) + " · " + esc(p.season) + " R" + esc(p.round) + "</div></div>"
        + '<div class="margin">' + tapeMargin(p.surplus) + "</div></div></div>";
    }

    function mark(id, title, sub, tone) {
      const on = markOpen === id;
      return '<button type="button" class="mark' + (tone ? " " + tone : "") + (on ? " on" : "") + '" data-mark="' + esc(id) + '" aria-expanded="' + on + '">'
        + "<b>" + esc(title) + "</b>" + (sub ? "<span>" + esc(sub) + "</span>" : "") + "</button>";
    }

    /**
     * Every number here is precomputed in apply-value-adjust.mjs and shipped in marks.json.
     * The browser used to recompute them from a seat file, which is why the home "manners"
     * tile and the Partners tab disagreed on 20 of 82 grades: the tile read the pipeline's
     * today-clock grade while the tab regraded on the selected clock.
     */
    function marksOf(row) {
      const m = row || {};
      const w = (m.lens && m.lens[lens]) || {};
      const n = m.two_way || 0;
      const volume = n >= 80 ? "Hyper" : n >= 40 ? "Active" : "Quiet";
      const soldPicks = m.sold_picks || 0;
      const soldPlayers = m.sold_players || 0;
      let posture = "Swap shop";
      if (soldPlayers >= soldPicks + 5) posture = "Buys picks";
      else if (soldPicks >= soldPlayers + 5) posture = "Buys players";
      const extract = w.extract || 0;
      const farmed = w.farmed || 0;
      const even = w.even || 0;
      let manners = "Fair";
      let mannersTone = "";
      if (farmed >= extract + 2) { manners = "Gets extracted"; mannersTone = "neg"; }
      else if (extract > farmed) { manners = "Extracts"; mannersTone = "pos"; }
      const aged = { length: (m.aging && m.aging.n) || 0 };
      const ageMean = (m.aging && m.aging.mean != null) ? m.aging.mean : null;
      let aging = "Held";
      let agingTone = "";
      if (ageMean != null && ageMean > 100) { aging = "Aged up"; agingTone = "pos"; }
      else if (ageMean != null && ageMean < -100) { aging = "Aged down"; agingTone = "neg"; }
      const rook = { length: (m.draft && m.draft.n) || 0 };
      const draftMean = (m.draft && m.draft.mean != null) ? m.draft.mean : null;
      let draft = "Mixed";
      let draftTone = "";
      if (draftMean != null && draftMean > 200) { draft = "Hit factory"; draftTone = "pos"; }
      else if (draftMean != null && draftMean < -500) { draft = "Miss factory"; draftTone = "neg"; }
      const total = w.total == null ? null : w.total;
      const per = w.per == null ? null : w.per;
      let run = "Even";
      let runTone = "";
      if (total != null && total > 0) { run = "Ahead"; runTone = "pos"; }
      else if (total != null && total < 0) { run = "Behind"; runTone = "neg"; }
      const volumeSub = n >= 80
        ? n + " two-way trades. 80+ is Hyper."
        : n >= 40
          ? n + " two-way trades. 40–79 is Active."
          : n + " two-way trades. Under 40 is Quiet.";
      let postureSub = soldPicks + " picks sold for players vs " + soldPlayers + " the other way. Within 5 is Swap shop.";
      if (posture === "Buys picks") {
        postureSub = soldPlayers + " players sold for picks vs " + soldPicks + " the other way. Five or more extra is Buys picks.";
      } else if (posture === "Buys players") {
        postureSub = soldPicks + " picks sold for players vs " + soldPlayers + " the other way. Five or more extra is Buys players.";
      }
      let mannersSub = "You came out ahead vs " + extract + " partners. Partners came out ahead vs you on " + farmed + (even ? ". " + even + " even" : "") + ". Close enough is Fair.";
      if (manners === "Gets extracted") mannersSub = farmed + " partners came out ahead vs you. You came out ahead vs " + extract + ".";
      else if (manners === "Extracts") mannersSub = "You came out ahead vs " + extract + " partners. Partners came out ahead vs you on " + farmed + ".";
      let agingSub = "No accept-day value to compare.";
      if (ageMean != null && aging === "Aged up") agingSub = "Trades got better after you accepted (" + signedNum(ageMean) + " on average).";
      else if (ageMean != null && aging === "Aged down") agingSub = "Trades got worse after you accepted (" + signedNum(ageMean) + " on average).";
      else if (ageMean != null) agingSub = "Trades are worth about the same as the day you accepted.";
      let draftSub = "No graded rookie picks yet.";
      if (draftMean != null && draft === "Hit factory") draftSub = "Rookie picks usually turn into more than the pick was worth (" + rook.length + " graded).";
      else if (draftMean != null && draft === "Miss factory") draftSub = "Rookie picks usually turn into less than the pick was worth (" + rook.length + " graded).";
      else if (draftMean != null) draftSub = "Some rookies hit, some missed. Net is about even (" + rook.length + " graded).";
      const runSub = per == null
        ? "No complete deals to total yet."
        : signedNum(total) + " net, about " + signedNum(per) + " per deal.";
      // statHtml, not stat: these lines carry a coloured delta span, so they ship as markup and
      // are rendered unescaped. Every part of them is a number or a literal from this function --
      // no manager, player or partner name may ever be concatenated in here. Counts are counts
      // and stay unsigned; only a value delta gets a sign.
      return {
        run: { title: run, tone: runTone, sort: total == null ? 0 : total, sub: runSub,
          statHtml: per == null ? "No complete deals" : tapeMargin(total) + " net · " + tapeMargin(per) + " / deal" },
        volume: { title: volume, tone: "", sort: n, sub: volumeSub, statHtml: n + " two-way" },
        posture: { title: posture, tone: "", sort: soldPicks - soldPlayers, sub: postureSub,
          statHtml: soldPicks + " picks for players · " + soldPlayers + " players for picks" },
        manners: { title: manners, tone: mannersTone, sort: extract - farmed, sub: mannersSub,
          statHtml: extract + " extracts · " + farmed + " extracted" + (even ? " · " + even + " even" : "") },
        aging: { title: aging, tone: agingTone, sort: ageMean == null ? 0 : ageMean, sub: agingSub,
          statHtml: ageMean == null ? "No accept-day compare" : tapeMargin(ageMean) + " after accept · " + aged.length + " deals" },
        draft: { title: draft, tone: draftTone, sort: draftMean == null ? 0 : draftMean, sub: draftSub,
          statHtml: draftMean == null ? "No graded rookies" : tapeMargin(draftMean) + " / pick · " + rook.length + " graded" },
      };
    }

    function teamMarks() {
      const m = marksOf(marks && marks.seats && marks.seats[me.user_id]);
      return '<div class="marks">'
        + mark("run", m.run.title, m.run.sub, m.run.tone)
        + mark("volume", m.volume.title, m.volume.sub, m.volume.tone)
        + mark("posture", m.posture.title, m.posture.sub, m.posture.tone)
        + mark("manners", m.manners.title, m.manners.sub, m.manners.tone)
        + mark("aging", m.aging.title, m.aging.sub, m.aging.tone)
        + mark("draft", m.draft.title, m.draft.sub, m.draft.tone)
        + "</div>";
    }

    function markChart() {
      if (!markOpen) return "";
      const heads = {
        run: ["Ahead or behind", (WINDOWS.find((w) => w[0] === lens) || [])[1] || ""],
        volume: ["How much they trade", "Two-way count. 80+ Hyper, 40–79 Active, under 40 Quiet."],
        posture: ["Players vs picks", "Picks sold for players vs players sold for picks."],
        manners: ["Who extracts", "Partners they beat vs partners who beat them."],
        aging: ["Aged after accept", "How 2-team trades moved after the day they accepted."],
        draft: ["Rookie hits", "Mean surplus vs the pick."],
      };
      const head = heads[markOpen] || ["League", ""];
      const seats = (marks && marks.seats) || {};
      const rows = members
        .filter((mem) => seats[mem.user_id])
        .map((mem) => ({ name: mem.name, uid: mem.user_id, ...marksOf(seats[mem.user_id])[markOpen] }));
      if (!rows.length) {
        return '<div class="mark-chart"><div class="mark-chart-h">' + esc(head[0])
          + '</div><p class="caption">No league marks in this build.</p></div>';
      }
      rows.sort((a, b) => b.sort - a.sort);
      const maxAbs = Math.max.apply(null, rows.map((r) => Math.abs(r.sort)).concat([1]));
      return '<div class="mark-chart">'
        + '<div class="mark-chart-h">' + head[0] + (head[1] ? "<span>" + head[1] + "</span>" : "") + "</div>"
        + rows.map((r, i) => {
          const you = me && me.user_id === r.uid;
          const pct = Math.round(Math.abs(r.sort) / maxAbs * 100);
          return '<div class="mark-bar' + (you ? " you" : "") + '">'
            + '<div class="mark-bar-top"><span class="names">' + (i + 1) + ". " + seatLabel(r.name) + "</span>"
            + '<span class="lab' + (r.tone ? " " + r.tone : "") + '">' + esc(r.title) + "</span></div>"
            + '<div class="mark-bar-track"><i class="' + (r.tone || "") + '" style="width:' + pct + '%"></i></div>'
            + '<div class="date">' + r.statHtml + "</div></div>";
        }).join("")
        + "</div>";
    }

    // ---- Vote store -------------------------------------------------------------
    // A vote is an opinion about who won a trade. It is NEVER value: it does not reach the
    // needle, the even book, VA, the lens windows, today_delta, partner grades or any board
    // ranking. One identity per number — so votes get their own file, their own two doors
    // (readVotes / writeVote) and their own UI block, and nothing else may read them.
    const VOTE_KEY = "cuckle.votes.v1";
    const VOTE_DEVICE_KEY = "cuckle.device.v1";
    const VOTE_SEAT_KEY = "cuckle.seat.v1";
    // localStorage throws in private mode and when a quota is full. Memory is the fallback so
    // voting still works for the session rather than breaking the render.
    let voteMemory = null;

    // Supabase is the league store, superseding the Cloudflare Worker this feature's SDD first
    // recommended — see docs/SUPABASE_SETUP.md. Plain fetch, no SDK: there is no npm here.
    // The anon key belongs in the page. This site is static on GitHub Pages, so there is nowhere
    // to hide a secret, and the Row Level Security in db/schema.sql is the boundary — not the key.
    // A service_role / sb_secret_ key must NEVER appear here: it bypasses RLS entirely.
    const VOTE_API = "https://gtqyvnkkjiksmmtmzubw.supabase.co/rest/v1";
    // A legacy anon JWT, so Authorization: Bearer is valid alongside the always-required apikey
    // header. A newer sb_publishable_... key is not a JWT and is rejected on Bearer with
    // "Invalid JWT" — if this key is ever replaced with one of those, send apikey alone.
    const VOTE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0cXl2bmtramlrc21tdG16dWJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMjk2MzMsImV4cCI6MjEwMzYwNTYzM30.cyEU9bWTkRWTJxlwwPKEgXNT9WJukSluNcsj56WZib8";
    // Clearing a vote cannot delete the row: anon has no DELETE privilege, deliberately, because
    // a delete verb would let any league member erase everybody else's votes. A cleared vote is
    // this sentinel, which trade_vote_tallies filters out — see db/schema.sql section 3.
    const VOTE_CLEARED = "__none__";
    // A paused free-tier project can hang rather than refuse. Nothing about a vote may wait
    // forever on it.
    const VOTE_TIMEOUT = 8000;
    // The league tally as Supabase reports it. Stays null on any failure, so the UI falls back to
    // the committed book or to this device alone rather than inventing a count.
    //   { asOf, totals: { tx: { choice: n } }, mine: { tx: choice } }
    let voteLive = null;
    let voteLiveState = "idle";
    // Trades whose local vote has not been confirmed by Supabase yet. Drives the caption only —
    // the vote itself is already in localStorage, so nothing here can lose it.
    const votePending = new Set();

    function voteDeviceId() {
      try {
        const found = localStorage.getItem(VOTE_DEVICE_KEY);
        if (found) return found;
        const made = (crypto.randomUUID && crypto.randomUUID())
          || "d-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(VOTE_DEVICE_KEY, made);
        return made;
      } catch (err) {
        return "device-unavailable";
      }
    }

    // The card lives on league home, and going home clears the selected seat by design, so a
    // live seat is rarely there to read. Remember the last seat this device picked instead.
    // It is an unverified claim either way — see docs/VOTES_SDD.md — and voting never waits on it.
    function voteSeatRemember(uid) {
      try { if (uid) localStorage.setItem(VOTE_SEAT_KEY, uid); }
      catch (err) { /* private mode: the vote still records, just without an identity */ }
    }

    function voteSeatId() {
      if (me && me.user_id) return me.user_id;
      try { return localStorage.getItem(VOTE_SEAT_KEY) || null; }
      catch (err) { return null; }
    }

    /**
     * Soft-delete for the alert feed. UI-gated to TrumanCooper; the write is a stamp on
     * deleted_at / deleted_by (anon has no DELETE — see db/schema.sql). League home clears
     * me, so this uses the remembered seat the same way votes do: pick TrumanCooper via
     * Teams once, then Home still unlocks Remove.
     *
     * This is not real auth. Anyone with the anon key can PATCH those columns. Acceptable for
     * ten friends; the button simply is not offered to anyone else.
     */
    const NEWS_ADMIN_UID = "458342725222133760";
    const NEWS_ADMIN_NAME = "TrumanCooper";

    function isNewsAdmin() {
      return voteSeatId() === NEWS_ADMIN_UID;
    }

    function newsSubmissionId(itemId) {
      const m = /^tweet:(\\d+)$/.exec(String(itemId || ""));
      return m ? m[1] : null;
    }

    /** Stable fingerprint of what the feed is showing — ids + generated stamp. */
    function newsSig(book) {
      if (!book || book.v !== 1 || !Array.isArray(book.items)) return "";
      return String(book.generated || "") + "|" + book.items.map((it) => it && it.id).filter(Boolean).join(",");
    }

    function newsAtTop(box) {
      return !box || box.scrollTop < 40;
    }

    function newsPendingCount() {
      if (!newsPendingBook) return 0;
      const pending = new Set(
        ((newsPendingBook.items) || []).map((it) => it && it.id).filter((id) => id && !newsGone.has(id)),
      );
      const cur = new Set(
        (((news && news.items) || [])).map((it) => it && it.id).filter((id) => id && !newsGone.has(id)),
      );
      let n = 0;
      for (const id of pending) if (!cur.has(id)) n++;
      // Soft-deletes / revoices with the same ids still count as a refresh worth applying.
      if (!n && newsSig(newsPendingBook) !== newsSig(news)) n = Math.max(1, pending.size);
      return n;
    }

    function setNewsStatus(msg, ms) {
      newsStatus = msg || "";
      if (newsStatusTimer) clearTimeout(newsStatusTimer);
      newsStatusTimer = null;
      if (msg && ms) {
        newsStatusTimer = setTimeout(() => {
          newsStatus = "";
          newsStatusTimer = null;
          paintNewsLiveChrome();
        }, ms);
      }
      paintNewsLiveChrome();
    }

    /** Update the live chrome without a full render (keeps scroll + focus). */
    function paintNewsLiveChrome() {
      const host = document.getElementById("app");
      if (!host) return;
      const live = host.querySelector("[data-news-live]");
      if (!live) return;
      const pending = newsPendingCount();
      let html = "";
      if (pending > 0) {
        const label = pending === 1 ? "1 new post" : pending + " new posts";
        html += '<button type="button" class="news-new" data-news-apply="1">'
          + esc(label) + " · tap to show</button>";
      }
      if (newsStatus) {
        html += '<span class="news-pull" aria-live="polite">' + esc(newsStatus) + "</span>";
      }
      live.innerHTML = html;
    }

    function paintNewsPullHint(box) {
      if (!box) return;
      let tip = box.querySelector("[data-news-pull]");
      if (!tip) {
        tip = document.createElement("div");
        tip.className = "news-pull";
        tip.setAttribute("data-news-pull", "1");
        tip.setAttribute("aria-hidden", "true");
        box.insertBefore(tip, box.firstChild);
      }
      if (newsRefreshing) {
        tip.hidden = false;
        tip.textContent = "Refreshing…";
        return;
      }
      if (newsPullPx >= 56) {
        tip.hidden = false;
        tip.textContent = "Release to refresh";
      } else if (newsPullPx > 12) {
        tip.hidden = false;
        tip.textContent = "Pull to refresh";
      } else {
        tip.hidden = true;
        tip.textContent = "";
      }
    }

    async function fetchNewsBook() {
      // Bust CDN / browser cache. DATA_V is a page-wide key and does not move when only
      // news.json changes between full page rebuilds — see NEWS_SDD §7.
      const res = await fetch("data/ui/news.json?news=" + Date.now());
      if (!res.ok) throw new Error("news.json " + res.status);
      const book = await res.json();
      return book && book.v === 1 && Array.isArray(book.items) ? book : null;
    }

    /**
     * Re-read news.json (and soft-deletes). Applies immediately when the reader is at the top
     * of the box or forced a pull; otherwise parks the book behind the "new posts" pill.
     */
    async function refreshNewsFeed(opts) {
      const reason = (opts && opts.reason) || "poll";
      const force = !!(opts && opts.force);
      if (newsRefreshing) return;
      newsRefreshing = true;
      newsPullPx = 0;
      paintNewsPullHint(document.querySelector(".news-box"));
      if (reason === "pull" || reason === "tap") setNewsStatus("Refreshing…", 0);
      try {
        const book = await fetchNewsBook();
        try { await loadNewsDeleted({ quiet: true }); } catch (err) { /* soft-deletes optional */ }
        if (!book) {
          if (reason === "pull" || reason === "tap") setNewsStatus("Could not refresh", 2500);
          return;
        }
        if (newsSig(book) === newsSig(news) && !newsPendingBook) {
          if (reason === "pull" || reason === "tap") setNewsStatus("You’re up to date", 1800);
          return;
        }
        const box = document.querySelector(".news-box");
        const applyNow = force || reason === "pull" || reason === "tap" || newsAtTop(box);
        if (applyNow) {
          news = book;
          newsPendingBook = null;
          setNewsStatus(reason === "poll" ? "" : "Updated", reason === "poll" ? 0 : 1600);
          render();
        } else {
          newsPendingBook = book;
          setNewsStatus("", 0);
          paintNewsLiveChrome();
        }
      } catch (err) {
        if (reason === "pull" || reason === "tap") setNewsStatus("Could not refresh", 2500);
      } finally {
        newsRefreshing = false;
        paintNewsPullHint(document.querySelector(".news-box"));
      }
    }

    function newsOnLeagueHome() {
      return view === "home" && !me;
    }

    function stopNewsPoll() {
      if (newsPollTimer) { clearInterval(newsPollTimer); newsPollTimer = null; }
    }

    function startNewsPoll() {
      stopNewsPoll();
      newsPollTimer = setInterval(() => {
        if (document.hidden || !newsOnLeagueHome()) return;
        refreshNewsFeed({ reason: "poll" });
      }, NEWS_POLL_MS);
    }

    function unbindNewsFeed() {
      newsBoundBox = null;
      newsTouchStartY = null;
      newsPullArmed = false;
      newsPullPx = 0;
    }

    /**
     * Wire pull-to-refresh on the news box. Re-bound after every render because innerHTML
     * replaces the node. Touch: pull down at scrollTop 0. Wheel: scroll up past the top.
     */
    function bindNewsFeed() {
      const box = document.querySelector(".news-box[data-news-feed]");
      if (!box || box === newsBoundBox) {
        if (!box) unbindNewsFeed();
        paintNewsLiveChrome();
        paintNewsPullHint(box);
        return;
      }
      newsBoundBox = box;
      paintNewsLiveChrome();
      paintNewsPullHint(box);

      box.addEventListener("touchstart", (e) => {
        if (!e.touches || !e.touches.length) return;
        newsTouchStartY = box.scrollTop <= 0 ? e.touches[0].clientY : null;
        newsPullArmed = newsTouchStartY != null;
      }, { passive: true });

      box.addEventListener("touchmove", (e) => {
        if (!newsPullArmed || newsTouchStartY == null || !e.touches || !e.touches.length) return;
        if (box.scrollTop > 0) {
          newsPullPx = 0;
          paintNewsPullHint(box);
          return;
        }
        const dy = e.touches[0].clientY - newsTouchStartY;
        newsPullPx = dy > 0 ? Math.min(96, dy) : 0;
        paintNewsPullHint(box);
      }, { passive: true });

      box.addEventListener("touchend", () => {
        const fire = newsPullPx >= 56 && !newsRefreshing;
        newsTouchStartY = null;
        newsPullArmed = false;
        newsPullPx = 0;
        paintNewsPullHint(box);
        if (fire) refreshNewsFeed({ reason: "pull", force: true });
      }, { passive: true });

      box.addEventListener("touchcancel", () => {
        newsTouchStartY = null;
        newsPullArmed = false;
        newsPullPx = 0;
        paintNewsPullHint(box);
      }, { passive: true });

      // Desktop: wheel upward while already pinned to the top.
      let wheelAcc = 0;
      let wheelReset = null;
      box.addEventListener("wheel", (e) => {
        if (box.scrollTop > 0 || e.deltaY >= 0 || newsRefreshing) {
          wheelAcc = 0;
          return;
        }
        wheelAcc += -e.deltaY;
        if (wheelReset) clearTimeout(wheelReset);
        wheelReset = setTimeout(() => { wheelAcc = 0; }, 400);
        newsPullPx = Math.min(96, wheelAcc / 2);
        paintNewsPullHint(box);
        if (wheelAcc > 120) {
          wheelAcc = 0;
          newsPullPx = 0;
          paintNewsPullHint(box);
          refreshNewsFeed({ reason: "pull", force: true });
        }
      }, { passive: true });

      // If they scroll back to the top with a pending book, apply like Twitter.
      box.addEventListener("scroll", () => {
        if (newsPendingBook && newsAtTop(box) && !newsRefreshing) {
          applyPendingNews();
        }
      }, { passive: true });
    }

    /** Apply a book that arrived while the reader was scrolled down. */
    function applyPendingNews() {
      if (!newsPendingBook || newsRefreshing) return;
      news = newsPendingBook;
      newsPendingBook = null;
      setNewsStatus("", 0);
      render();
    }

    async function loadNewsDeleted(opts) {
      const quiet = !!(opts && opts.quiet);
      try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), VOTE_TIMEOUT);
        const res = await fetch(
          VOTE_API + "/news_submissions?select=id&deleted_at=not.is.null&order=id.desc&limit=200",
          {
            headers: { apikey: VOTE_ANON, Authorization: "Bearer " + VOTE_ANON },
            signal: ac.signal,
          },
        );
        clearTimeout(timer);
        if (!res.ok) return;
        const rows = await res.json();
        if (!Array.isArray(rows)) return;
        let changed = false;
        for (const row of rows) {
          const id = "tweet:" + row.id;
          if (!newsGone.has(id)) { newsGone.add(id); changed = true; }
        }
        if (changed && !quiet) render();
      } catch (err) {
        // Column missing until §3c SQL runs, or a paused project: the committed news.json still
        // shows. Remove will alert if the stamp cannot land.
      }
    }

    async function deleteNewsItem(itemId) {
      if (!isNewsAdmin()) return;
      const sid = newsSubmissionId(itemId);
      if (!sid || newsGone.has(itemId) || newsDelPending) return;
      if (!window.confirm("Remove this post from the alert feed?")) return;
      newsDelPending = itemId;
      render();
      try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), VOTE_TIMEOUT);
        const res = await fetch(VOTE_API + "/news_submissions?id=eq." + encodeURIComponent(sid), {
          method: "PATCH",
          headers: {
            apikey: VOTE_ANON,
            Authorization: "Bearer " + VOTE_ANON,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            deleted_at: new Date().toISOString(),
            deleted_by: NEWS_ADMIN_NAME,
          }),
          signal: ac.signal,
        });
        clearTimeout(timer);
        const rows = res.ok ? await res.json().catch(() => null) : null;
        if (!res.ok || !Array.isArray(rows) || rows.length === 0) {
          window.alert(
            "Could not remove that post. Paste the soft-delete SQL from docs/SUPABASE_SETUP.md "
            + "(section 3c) into the Supabase SQL editor, then try again.",
          );
          return;
        }
        newsGone.add(itemId);
      } catch (err) {
        window.alert("Could not reach the feed store to remove that post.");
      } finally {
        newsDelPending = null;
        render();
      }
    }

    function voteBoxRead() {
      if (voteMemory) return voteMemory;
      let box = null;
      try {
        const raw = localStorage.getItem(VOTE_KEY);
        const found = raw ? JSON.parse(raw) : null;
        if (found && found.v === 1 && found.votes) box = found;
      } catch (err) {
        console.error(err);
      }
      voteMemory = box || { v: 1, device: voteDeviceId(), votes: {} };
      return voteMemory;
    }

    function voteBoxWrite(box) {
      voteMemory = box;
      try { localStorage.setItem(VOTE_KEY, JSON.stringify(box)); }
      catch (err) { console.error(err); }
    }

    // ---- Supabase transport ----------------------------------------------------
    // Two doors above, one wire here. Nothing outside this block knows Supabase exists.

    function voteHeaders(extra) {
      return Object.assign({ apikey: VOTE_ANON, Authorization: "Bearer " + VOTE_ANON }, extra || {});
    }

    // AbortSignal.timeout is missing on Safari before 16, where undefined just means no timeout.
    function voteAbort() {
      try { return AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(VOTE_TIMEOUT) : undefined; }
      catch (err) { return undefined; }
    }

    async function voteGet(url) {
      const res = await fetch(url, { headers: voteHeaders(), signal: voteAbort() });
      if (!res.ok) throw new Error(url + " " + res.status);
      return res.json();
    }

    // Local time of day. The committed book renders an ISO date; a live tally is minutes old at
    // most, so a clock reads truer than a timestamp.
    function voteStamp(d) {
      try { return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
      catch (err) { return d.toISOString(); }
    }

    // The voter recorded with a vote is the seat picked at vote time, or the device otherwise, so
    // one device can own more than one voter id over its life and a seat picked later must not
    // orphan an earlier vote. This is every id we might have written as.
    // The charset guard keeps a hand-edited localStorage value from breaking out of the in.()
    // list below; ids are Sleeper snowflakes or uuids, so nothing real is filtered.
    function voteVoterIds() {
      const ids = [voteDeviceId()];
      const seat = voteSeatId();
      if (seat) ids.push(seat);
      const votes = voteBoxRead().votes;
      for (const tx of Object.keys(votes)) {
        const s = votes[tx].seat;
        if (s && ids.indexOf(s) < 0) ids.push(s);
      }
      return ids.filter((x) => x && x !== "device-unavailable" && /^[\\w.-]+$/.test(x));
    }

    // One read of the whole tally per page load — the view returns every trade at once and it is
    // a handful of rows, so no card ever fires its own request.
    //
    // Plus one narrow read of our own ballots. That second read is load bearing: the view has
    // aggregated the ballots away, so there is no way to tell from it whether the total for a
    // trade already counts us. Without it the choice is between double-counting our own vote and
    // hiding it, and both are wrong.
    async function voteLoad() {
      voteLiveState = "loading";
      const ids = voteVoterIds();
      try {
        const [rows, mineRows] = await Promise.all([
          voteGet(VOTE_API + "/trade_vote_tallies?select=*"),
          ids.length
            ? voteGet(VOTE_API + "/trade_votes?select=transaction_id,choice&voter=in.(" + ids.join(",") + ")")
            : Promise.resolve([]),
        ]);
        const totals = {};
        for (const r of rows || []) {
          // The view already excludes the sentinel. Dropped again here so the percentages stay
          // right on a project whose view has not been re-run since the fix.
          if (!r || !r.transaction_id || !r.choice || r.choice === VOTE_CLEARED) continue;
          const box = totals[r.transaction_id] || (totals[r.transaction_id] = {});
          box[r.choice] = (box[r.choice] || 0) + (r.votes || 0);
        }
        const mine = {};
        for (const r of mineRows || []) {
          if (!r || !r.transaction_id || !r.choice || r.choice === VOTE_CLEARED) continue;
          mine[r.transaction_id] = r.choice;
        }
        voteLive = { asOf: voteStamp(new Date()), totals: totals, mine: mine };
        voteLiveState = "ok";
      } catch (err) {
        // Unreachable, blocked, offline, or a paused project. Degrade to exactly the behaviour
        // that shipped before Supabase existed, and keep the copy honest: never render a league
        // tally we did not actually receive.
        console.error(err);
        voteLive = null;
        voteLiveState = "fail";
      }
      voteHeal();
      render();
    }

    // localStorage owns "my vote", so a trade where Supabase disagrees gets the local vote pushed
    // again. This is the retry for a write that failed while offline.
    //
    // Deliberately one-directional: a trade with no local vote is NOT cleared on the server just
    // because this device has not heard of it. The same person on a phone and a laptop resolves to
    // the same voter once they pick a seat, and inferring a clear from local absence would have
    // the second device silently delete the first device's vote. A clear is only ever sent when
    // someone actually taps to clear.
    function voteHeal() {
      if (voteLiveState !== "ok") return;
      const votes = voteBoxRead().votes;
      for (const tx of Object.keys(votes)) {
        const local = votes[tx].choice || null;
        if (local && voteLive.mine[tx] !== local) votePush(tx, local, votes[tx].seat);
      }
    }

    // Optimistic: the vote is in localStorage and on screen before this runs. The upsert names
    // its conflict target explicitly because PostgREST otherwise infers the primary key, which is
    // the surrogate id — leave it off and a second vote fails on the unique constraint.
    function votePush(transactionId, choice, seat) {
      const voter = seat || voteDeviceId();
      const sent = choice == null ? VOTE_CLEARED : choice;
      votePending.add(transactionId);
      fetch(VOTE_API + "/trade_votes?on_conflict=transaction_id,voter", {
        method: "POST",
        headers: voteHeaders({
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        }),
        body: JSON.stringify({ transaction_id: transactionId, choice: sent, voter: voter }),
        signal: voteAbort(),
      }).then((res) => {
        if (!res.ok) throw new Error("vote write " + res.status);
        return res.json();
      }).then((rows) => {
        // Settle on the row the database echoed, not on what we hoped we sent.
        const row = (rows || [])[0];
        voteSettle(transactionId, row && row.choice ? row.choice : sent);
      }).catch((err) => {
        // The vote is already saved locally, so this loses nothing. The trade stays pending and
        // the caption says so; the next page load retries it through voteHeal.
        console.error(err);
        render();
      });
    }

    // Fold a confirmed write into the cached tally so the count converges without a second read.
    // Only our own contribution moves; everyone else's stands.
    function voteSettle(transactionId, choice) {
      votePending.delete(transactionId);
      if (voteLive) {
        const totals = voteLive.totals[transactionId] || (voteLive.totals[transactionId] = {});
        const was = voteLive.mine[transactionId] || null;
        const now = choice === VOTE_CLEARED ? null : choice;
        if (was !== now) {
          if (was) totals[was] = Math.max(0, (totals[was] || 0) - 1);
          if (now) totals[now] = (totals[now] || 0) + 1;
        }
        if (now) voteLive.mine[transactionId] = now;
        else delete voteLive.mine[transactionId];
        // asOf is deliberately NOT advanced. It dates the league read, and our own vote landing
        // says nothing about anyone else's. Moving it would claim the other counts were rechecked.
      }
      render();
    }

    // ---- The two doors ---------------------------------------------------------
    // readVotes(transactionId) -> { choice, seat, tally, votes, league, asOf, source, pending }
    // choice is the seat user_id this device voted for, or null. tally maps seat user_id to a
    // count. Precedence for that count: a live Supabase tally, else the committed
    // data/ui/votes.json, else this device alone. localStorage is the source of truth for
    // "my vote"; Supabase is the source of truth for "the league tally".
    function readVotes(transactionId) {
      const mine = voteBoxRead().votes[transactionId] || null;
      const local = (mine && mine.choice) || null;
      let tally, league, asOf, source;
      if (voteLive) {
        tally = Object.assign({}, voteLive.totals[transactionId] || {});
        // Where the server's record of our ballot disagrees with localStorage, localStorage wins
        // on screen and the difference is exactly what is still in flight. This is what makes a
        // fresh vote show up at once and a failed write show up as ours rather than as nobody's.
        const onServer = voteLive.mine[transactionId] || null;
        if (onServer !== local) {
          if (onServer) tally[onServer] = Math.max(0, (tally[onServer] || 0) - 1);
          if (local) tally[local] = (tally[local] || 0) + 1;
        }
        league = true;
        asOf = voteLive.asOf;
        source = "live";
      } else {
        const entry = (voteBook && voteBook.votes && voteBook.votes[transactionId]) || null;
        tally = Object.assign({}, (entry && entry.totals) || {});
        // A committed voters map tells us our vote is already in the league totals, so it is
        // added locally only when it is not.
        const alreadyCounted = !!(entry && entry.voters && mine && mine.seat && entry.voters[mine.seat]);
        if (local && !alreadyCounted) tally[local] = (tally[local] || 0) + 1;
        league = !!entry;
        asOf = (voteBook && voteBook.generated_at) || null;
        source = entry ? "book" : "local";
      }
      let votes = 0;
      // Object.keys snapshots, so dropping the emptied seats mid-loop is safe. A seat at zero is
      // not a seat with no votes to show — it must not sit in the denominator.
      for (const k of Object.keys(tally)) {
        if (!tally[k]) delete tally[k];
        else votes += tally[k];
      }
      return {
        choice: local,
        seat: (mine && mine.seat) || null,
        tally: tally,
        votes: votes,
        league: league,
        asOf: asOf,
        source: source,
        pending: votePending.has(transactionId),
      };
    }

    // writeVote(transactionId, choice) -> void. One vote per trade; a null choice clears it.
    // The selected seat rides along as the voter identity so the store can key on a manager
    // rather than a device, but voting is not gated on picking a seat.
    function writeVote(transactionId, choice) {
      const box = voteBoxRead();
      const prev = box.votes[transactionId] || null;
      // On a clear the local entry is about to go, so the voter it was written under has to be
      // read first — otherwise a vote cast as a seat would be cleared under the device id and the
      // real row would survive.
      const seat = choice == null ? (prev && prev.seat) || voteSeatId() : voteSeatId();
      if (choice == null) delete box.votes[transactionId];
      else box.votes[transactionId] = { choice: choice, seat: seat, ts: new Date().toISOString() };
      voteBoxWrite(box);
      votePush(transactionId, choice, seat);
    }

    function voteSeats(r) {
      const sides = (league && league.trade_boards && league.trade_boards.sides) || [];
      const seats = [];
      for (const s of sides) {
        if (s.transaction_id !== r.transaction_id) continue;
        if (!seats.some((x) => x.uid === s.user_id)) seats.push({ uid: s.user_id, name: s.name });
      }
      return seats;
    }

    function voteParties(r) {
      const cached = seatCache[r.user_id];
      const hit = cached && (cached.trades || []).find((t) => t.transaction_id === r.transaction_id);
      return hit ? 1 + ((hit.others || []).length) : voteSeats(r).length;
    }

    function voteBlock(r) {
      const seats = voteSeats(r);
      const head = '<div class="vote"><div class="vote-h">Who actually won it?</div>';
      // N-way trades get no vote: "which side won" has no head-to-head answer across three
      // bags, and N-way is already the special case that carries no Value Adjustment.
      if (seats.length !== 2 || voteParties(r) > 2) {
        return head + '<p class="caption">Three-team trade. There is no two-sided answer to score, so voting is off here.</p></div>';
      }
      const v = readVotes(r.transaction_id);
      const opts = seats.map((s) => {
        const on = v.choice === s.uid;
        const n = v.tally[s.uid] || 0;
        const line = v.votes
          ? n + (n === 1 ? " vote · " : " votes · ") + Math.round(n / v.votes * 100) + "%"
          : "tap to vote";
        return '<button type="button" class="vote-opt' + (on ? " on" : "") + '"'
          + ' data-vote="' + esc(r.transaction_id) + '" data-vote-seat="' + esc(s.uid) + '"'
          + ' aria-pressed="' + (on ? "true" : "false") + '">'
          + "<b>" + seatLabel(s.name) + "</b><span>" + line + "</span></button>";
      }).join("");
      // Only ever claims a league tally we actually received. A live tally counts votes as they
      // land; the committed book counts them as of the last rebuild; with neither, this is one
      // device's opinion and says so.
      const note = v.league
        ? "League tally as of " + esc(v.asOf || "the last rebuild") + "; "
          + (v.source === "live"
            ? (v.pending
              ? "your vote is saved here and still on its way to it."
              : "votes join it as they land.")
            : "your vote joins it on the next rebuild.")
        : voteLiveState === "fail"
          ? "Your vote, on this device only — the league tally is out of reach right now."
          : "Your vote, on this device only — the league tally lights up once the vote store answers.";
      return head
        + '<div class="vote-opts">' + opts + "</div>"
        + '<p class="caption">' + note + " Opinion only: votes never enter the value book.</p></div>";
    }

    // Recency, not a clock: the card is named for the newest date on the tape, so there is no
    // empty state to caption and no "today" that can disagree with league.today.
    function daySides() {
      const sides = (league && league.trade_boards && league.trade_boards.sides) || [];
      let day = "";
      for (const r of sides) if (r.date > day) day = r.date;
      const by = new Map();
      for (const r of sides) {
        if (r.date !== day) continue;
        const prev = by.get(r.transaction_id);
        if (!prev || (me && r.user_id === me.user_id)) by.set(r.transaction_id, r);
      }
      return { day: day, rows: [...by.values()] };
    }

    /**
     * The championship game, as the card reads it: the two teams, their records, the final
     * score and the champion's top scorer in that game. Returns escaped HTML fragments.
     *
     * The bout is the scoreboard row -- champion, score, runner-up -- and is null for a season
     * with no usable final, which falls back to the tail pair and the old one-line caption
     * rather than rendering half a scoreboard.
     */
    function champFinalCaption(champ, rec) {
      const f = champ && champ.final;
      // The sketch reads "190 - 162.8" against true values of 189.98 and 162.82: one decimal,
      // and a trailing .0 dropped. Applied to both figures so the pair cannot read as though
      // one were rounded harder than the other. The detail screen keeps full precision.
      const rec2 = (r) => r && r.wins != null ? r.wins + "–" + r.losses : "";
      if (!f || f.champ_points == null || f.opponent_points == null) {
        return {
          bout: null,
          tail: rec.fpts_rank === 1 ? " · points race" : " · bracket",
          tailNum: "", top: "", topNum: "",
        };
      }
      // Words and figure are returned apart so the card can pin the figure and let only the
      // name ellipsise. Joined into one nowrap string, the score was at the far end of the
      // line and so was the first thing off the edge: a 33-character player name took
      // "45.0" with it, which is the one thing on this line that had to survive.
      return {
        bout: {
          champName: seatLabel(champ.name),
          champRec: rec2(rec),
          oppName: seatLabel(f.opponent),
          oppRec: rec2(f.opponent_record),
          // Winner green, loser red. A tie leaves both halves uncoloured (the gold default).
          score: f.tie
            ? scoreShort(f.champ_points) + "–" + scoreShort(f.opponent_points)
            : '<span class="bout-w">' + scoreShort(f.champ_points) + "</span>"
              + '<span class="bout-dash">–</span>'
              + '<span class="bout-l">' + scoreShort(f.opponent_points) + "</span>",
        },
        tail: " · " + (f.tie ? "tied" : "beat") + " " + seatLabel(f.opponent),
        tailNum: score1(f.champ_points) + "–" + score1(f.opponent_points),
        top: f.top && f.top.points != null ? "Top scorer · " + esc(f.top.player) : "",
        topNum: f.top && f.top.points != null ? score1(f.top.points) : "",
      };
    }

    function dayAlert() {
      const tape = daySides();
      // The card is a doorway now, not an accordion: it opens the trade as a whole screen.
      const chips = tape.rows.map((r) => {
        // Same windows[lens] and the same rounding the trades list uses, so the card cannot drift.
        const w = (r.windows && r.windows[lens]) || {};
        const got = w.incomplete && !w.got ? "—" : fmt(w.got);
        const sent = w.incomplete && !w.sent ? "—" : fmt(w.sent);
        const s = windowScore(r);
        return '<button type="button" class="day-in" data-board-open="' + esc(r.user_id) + '" data-id="' + esc(r.transaction_id) + '">'
          + "<b>" + seatLabel(r.name) + " vs " + seatLabel(r.other) + "</b>"
          + '<span class="day-in-vals">'
          + '<span class="day-in-val"><i>' + seatLabel(r.name) + "</i>" + tapeMargin(s) + "<em>" + got + "</em></span>"
          + '<span class="day-in-val"><i>' + seatLabel(r.other) + "</i>" + tapeMargin(s == null ? null : -s) + "<em>" + sent + "</em></span>"
          + "</span></button>";
      }).join("")
        || '<div class="date">No trades on the tape yet.</div>';
      const champ = ((titles && titles.titles) || [])[0];
      const rec = champ && champ.record || {};
      const fin = champFinalCaption(champ, rec);
      // Four rows: the heading, the season, the scoreboard, the two records under the names
      // they belong to. The top scorer stays as a fifth -- it was asked for, and a sketch
      // that does not draw a line is not a request to delete it.
      const bout = fin.bout
        ? '<div class="champ-bout">'
          + '<span class="bout-team">' + fin.bout.champName + "</span>"
          + '<b class="bout-score">' + fin.bout.score + "</b>"
          + '<span class="bout-team bout-r">' + fin.bout.oppName + "</span>"
          + '<span class="bout-rec">' + fin.bout.champRec + "</span>"
          + '<span class="bout-rec bout-r">' + fin.bout.oppRec + "</span>"
          + "</div>"
        // No final on file for this season, so there is no scoreboard to draw. Falls back to
        // the caption this replaced rather than to an empty row.
        : '<div class="date champ-fig"><span>' + rec.wins + "–" + rec.losses + fin.tail + "</span>"
          + (fin.tailNum ? "<b>" + fin.tailNum + "</b>" : "") + "</div>";
      const champBox = champ
        ? '<a class="champ-alert" href="?view=titles" data-view="titles">'
          + '<div class="day-alert-h">Champions Path</div>'
          + '<div class="champ-line">' + esc(champ.season) + " Championship</div>"
          + bout
          + (fin.top ? '<div class="date champ-fig"><span>' + fin.top + "</span><b>" + fin.topNum + "</b></div>" : "")
          + "</a>"
        : "";
      // The door to every league trade sits in the header row, a sibling of the trade buttons
      // rather than inside one. That is what keeps one tap from meaning two things: the #app
      // handler tests [data-trades-list] before [data-board-open], and because no trade button
      // is an ancestor of this one, only one of those branches can ever match a given click.
      // A list of rows says "all of them" where a bare arrow would read as "the next one".
      const allBtn = '<button type="button" class="all-trades" data-trades-list="1"'
        + ' aria-label="All trades in the league">'
        + '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false">'
        + '<path fill="currentColor" d="M3 4.4h3.4v3.4H3zM9 4.9h12v2.4H9zM3 10.3h3.4v3.4H3z'
        + 'M9 10.8h12v2.4H9zM3 16.2h3.4v3.4H3zM9 16.7h12v2.4H9z"/></svg>'
        + "<span>All trades</span></button>";
      return '<div class="alert-row"><div class="day-alert">'
        + '<div class="day-alert-top">'
        + '<div class="day-alert-h">Recent Trade' + (tape.day ? "<span>" + esc(tape.day) + "</span>" : "") + "</div>"
        + allBtn
        + "</div>"
        + chips
        + "</div>" + champBox + "</div>";
    }

    function renderTeamHome() {
      const pool = (data.trades || []).filter((t) => chipLived(t.date) && tradeDelta(t) != null)
        .slice().sort((a, b) => tradeDelta(b) - tradeDelta(a));
      const best = pool[0];
      const worst = pool.length > 1 ? pool[pool.length - 1] : null;
      const names = new Set();
      for (const t of pool) {
        if ((t.others || []).length === 1) names.add(t.others[0]);
      }
      const partners = [...names].map((n) => partnerPer(data, n))
        .filter((p) => p.n).sort((a, b) => b.per - a.per);
      const take = partners[0];
      const pay = partners.length > 1 ? partners[partners.length - 1] : null;
      const empty = pool.length ? "" : ((data.trades || []).length
        ? '<p class="caption">No trade here has lived ' + esc(clockName()) + " yet. Score as Since trade to see them.</p>"
        : '<p class="caption">No trades on this seat yet.</p>');
      return teamMarks()
        + markChart()
        + empty
        + (best ? "<h2>Best deal</h2>" + tradeRow(best) : "")
        + (worst && (!best || worst.transaction_id !== best.transaction_id) ? "<h2>Worst deal</h2>" + tradeRow(worst) : "")
        + ((take || pay) ? "<h2>Partners</h2>" : "")
        + (take ? partnerLine(take) : "")
        + (pay && take && pay.name !== take.name ? partnerLine(pay) : "")
        + ((data.hit || data.miss) ? "<h2>Draft</h2>" : "")
        + draftLine(data.hit, "hit")
        + draftLine(data.miss, "miss");
    }

    function renderHome() {
      return me && data ? renderTeamHome() : renderLeagueHome();
    }

    function tradeParties(t, extra) {
      const s = sideOf(t);
      const mine = (me && me.name) || extra && extra.winner || s.name || "This seat";
      const other = extra && extra.winner && extra.loser
        ? (mine === extra.winner ? extra.loser : extra.winner)
        : ((t.others || []).join(" · ") || "Them");
      return { s: s, mine: mine, other: other, multi: (t.others || []).length > 1 };
    }

    function tradeBags(t, extra) {
      const p = tradeParties(t, extra);
      const gotTitle = p.mine + " received";
      const sentTitle = p.multi ? p.mine + " gave up" : p.other + " received";
      let bags = bagBlock(gotTitle, p.s.legs, p.s.today, p.s.unpriced, p.s.value_adjust)
        + bagBlock(sentTitle, p.s.sent, p.s.sent_today, p.s.sent_unpriced, p.s.value_adjust_sent);
      if (p.multi) {
        bags += (t.other_bags || []).map((b) => {
          const side = applyVa((b.windows && b.windows[lens]) || b.even || b.realized, true);
          if (!side) return "";
          return bagBlock(b.name + " received", side.legs, side.today, side.unpriced, side.value_adjust);
        }).join("");
      }
      const sparkSrc = t.even_year_ends || t.year_ends;
      return '<div class="bags">' + bags + "</div>"
        + spark((sparkSrc || []).map((row) => ({ as_of: row.as_of, ...row.points })));
    }

    /**
     * A trade as a row. The flat form renders it for a screen that is already only this trade:
     * always open, and the summary is not a toggle, because there is nothing on that screen to
     * collapse back to. The layout and the bags are the same code either way.
     */
    function tradeRow(t, extra, flat) {
      const p = tradeParties(t, extra);
      const open = !!flat || openId === t.transaction_id;
      const incomplete = t.incomplete || p.s.incomplete;
      const gotShow = p.s.unpriced && !p.s.today ? "—" : fmt(p.s.today);
      const sentShow = p.s.sent_unpriced && !p.s.sent_today ? "—" : fmt(p.s.sent_today);
      const dlt = incomplete ? null : displayDelta(p.s.today, p.s.sent_today);
      // A side's delta is always its own bag minus the other bag on this row. On a two-team
      // trade those two bags are the two seats, so each side's delta is that seat's result and
      // the pair is an exact mirror. Above two seats no single counterparty mirrors this seat,
      // so the right column is the counterparties together: their names joined, and the bag
      // this seat gave up between them. Its delta is therefore this seat's result negated,
      // which by conservation is also those seats' combined result -- exact to within the +-1
      // that rounding three bags separately can leave. It is not any one of them alone, so the
      // caption says "combined", and the expanded detail below breaks out each seat's own bag.
      const top = '<div class="row-top tape">'
        + '<div class="side"><div class="side-line"><span class="names">' + seatLabel(p.mine) + "</span>" + tapeFigures(dlt, gotShow) + "</div></div>"
        + '<div class="side right"><div class="side-line"><span class="names">' + seatLabel(p.other) + "</span>" + tapeFigures(dlt == null ? null : -dlt, sentShow) + "</div></div>"
        // On the trade's own screen the caption above already dates it, so the flat form drops
        // the second copy. The incomplete badge is a warning rather than a repeat and stays,
        // and so does the multi-seat note: it is what makes the right column's sign readable.
        + (flat
          ? ((p.multi || incomplete)
            ? '<div class="tape-sub">'
              + (p.multi ? '<span class="date sub-when">' + ((t.others || []).length + 1) + "-team · combined</span>" : "")
              + (incomplete ? '<span class="badge ' + (p.multi ? "sub-note" : "sub-when") + '">no DP row</span>' : "")
              + "</div>"
            : "")
          : '<div class="tape-sub"><span class="date sub-when">' + esc(t.date) + "</span>"
            + (p.multi ? '<span class="date sub-note">' + ((t.others || []).length + 1) + "-team · combined</span>" : "")
            + (incomplete ? '<span class="badge sub-note">no DP row</span>' : "")
            + "</div>")
        + "</div>";
      return '<div class="row-x' + (open ? " open" : "") + '">'
        + (flat
          ? '<div class="row-x-head">' + top + "</div>"
          : '<button type="button" class="row-x-btn" data-id="' + esc(t.transaction_id) + '"'
            + ' aria-expanded="' + (open ? "true" : "false") + '">' + top + "</button>")
        + (open ? '<div class="detail">' + tradeBags(t, extra) + "</div>" : "")
        + "</div>";
    }

    function draftKey(p) {
      return p.asset_key || (p.season + ":" + p.round + ":" + (p.pick_no || p.player));
    }

    function acquiredHop(p) {
      const tape = picks && p.asset_key && picks[p.asset_key];
      if (!tape || !(tape.hops || []).length) return null;
      const mine = (me && me.name) || "";
      const incoming = tape.hops.filter((h) => h.to === mine);
      return incoming.length ? incoming[incoming.length - 1] : null;
    }

    function draftSpark(p) {
      const pts = [];
      if (p.as_of && p.pick_cost != null) pts.push({ as_of: p.as_of, value: p.pick_cost });
      for (const m of p.year_ends || []) {
        if (m.player != null) pts.push({ as_of: m.as_of, value: m.player });
      }
      if (pts.length < 2 && p.player_today != null) {
        pts.push({ as_of: (league && league.today) || p.as_of || "", value: p.player_today });
      }
      return spark(pts);
    }

    function pickOrigin(p) {
      const mine = (me && me.name) || "";
      if (p.own || (p.origin_team && p.origin_team === mine)) return "Own pick";
      if (p.origin_team) return p.origin_team + "'s pick";
      return acquiredHop(p) ? "Someone else's pick" : "Own pick";
    }

    // renderDrafts pins the lens to "all" for the whole tab, so the window always ends today.
    function pickGot(p) {
      const end = (league && league.today) || "";
      const pts = (p.year_ends || []).filter((m) => {
        if (m.player == null) return false;
        if (lens === "t0") return m.as_of === p.as_of;
        return (!p.as_of || m.as_of >= p.as_of) && (!end || m.as_of <= end);
      });
      if (!pts.length) return lens === "all" ? p.player_today : null;
      if (lens === "t0") return pts[0].player;
      return pts.reduce((a, m) => a + m.player, 0) / pts.length;
    }

    // Startup picks carry a pick_cost too, so they are graded on surplus like every other row.
    function pickDelta(p) {
      const got = pickGot(p);
      if (got == null || p.pick_cost == null) return null;
      return displayDelta(got, p.pick_cost);
    }

    function pickRow(p) {
      const key = draftKey(p);
      const open = openDraft === key;
      const hop = acquiredHop(p);
      const trade = hop && (data.trades || []).find((t) => t.transaction_id === hop.transaction_id);
      const origin = pickOrigin(p);
      const slot = (p.season || "") + " " + (p.startup ? "startup" : (Number(p.round) === 1 ? "1st" : Number(p.round) === 2 ? "2nd" : Number(p.round) === 3 ? "3rd" : p.round + "th"));
      const got = pickGot(p);
      const gotShow = got == null ? "—" : fmt(got);
      const sentShow = p.pick_cost == null ? "—" : fmt(p.pick_cost);
      // The two sides here are what the pick became and what the pick cost at the draft, so
      // the surplus signs the player and its negative signs the slot. Same mirror, same helper.
      const dlt = pickDelta(p);
      const clock = clockName();
      let detail = "";
      if (open) {
        const used = [{ label: p.player, value: got, kind: "player" }];
        const cost = [{ label: slot + (p.pick_no ? " · pick " + p.pick_no : ""), value: p.pick_cost, kind: "pick", asset_key: p.asset_key }];
        detail = '<div class="detail">'
          + (trade ? tradeBags(trade) : '<div class="date">' + origin + " · no trade to get it</div>")
          + '<div class="bags">'
          + bagBlock(p.player + " · " + clock, used, got, got == null ? 1 : 0)
          + bagBlock("Pick at draft", cost, p.pick_cost, p.pick_cost == null ? 1 : 0)
          + "</div>"
          + draftSpark(p)
          + (p.asset_key && picks && picks[p.asset_key] && (picks[p.asset_key].hops || []).length ? hopHtml(p.asset_key) : "")
          + "</div>";
      }
      const own = origin === "Own pick";
      return '<div class="row-x' + (open ? " open" : "") + (own ? " own-pick" : " away-pick") + '">'
        + '<button type="button" class="row-x-btn" data-draft="' + esc(key) + '"'
        + ' aria-expanded="' + (open ? "true" : "false") + '">'
        + '<div class="row-top tape">'
        + '<div class="side"><div class="side-line"><span class="names">' + esc(p.player) + "</span>" + tapeFigures(dlt, gotShow) + "</div></div>"
        + '<div class="side right"><div class="side-line"><span class="names">' + esc(slot) + "</span>" + tapeFigures(dlt == null ? null : -dlt, sentShow) + "</div></div>"
        + '<div class="tape-sub"><span class="date sub-when">' + esc(p.as_of || "") + "</span>"
        + '<span class="date origin sub-note ' + (own ? "own" : "away") + '">' + esc(origin) + "</span></div>"
        + "</div></button>"
        + detail + "</div>";
    }

    function renderTrades() {
      const all = (data && data.trades) || [];
      const years = [...new Set(all.map((t) => t.season))].sort().reverse();
      let list = all;
      if (year !== "all") list = list.filter((t) => t.season === year);
      // Home tiles exclude trades that have not lived the selected clock; this list must too.
      const lived = list.filter((t) => chipLived(t.date));
      const hint = year === "all" ? "Filter by year" : "Filter by year · " + year;
      const yearBtn = '<button type="button" class="filter-btn' + (year !== "all" || yearFilterOpen ? " on" : "") + '" data-yfilter="1" aria-label="Filter by year" aria-expanded="' + (yearFilterOpen ? "true" : "false") + '">'
        + '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M4 5h16l-6.2 7.2V19l-3.6 1.8v-8.6L4 5z"/></svg>'
        + (year !== "all" ? '<span class="dot"></span>' : "")
        + "</button>"
        + '<div class="caption">' + hint + "</div>";
      const empty = !all.length
        ? '<p class="caption">No trades on this seat yet.</p>'
        : !list.length
          ? '<p class="caption">No trades in ' + esc(year) + '. Clear the year filter to see the rest.</p>'
          : !lived.length
            ? '<p class="caption">No trade here has lived ' + esc(clockName()) + " yet. Score as Since trade to see them.</p>"
            : "";
      return '<div class="filter-wrap">'
        + filterRow(yearBtn)
        + (yearFilterOpen
          // Exactly one year at a time, so these are radios, not checkboxes.
          ? '<div class="filter-panel" id="yearFilters" role="radiogroup" aria-label="Year">'
            + [["all", "All"]].concat(years.map((y) => [y, y])).map((row) =>
              '<label data-year="' + esc(row[0]) + '"><input type="radio" name="yearFilter" value="' + esc(row[0]) + '"'
              + (year === row[0] ? " checked" : "") + "> " + esc(row[1]) + "</label>"
            ).join("")
            + "</div>"
          : "")
        + "</div>"
        + '<div class="caption">' + esc(livedHint(lived.length, list.length, "deal")) + "</div>"
        + empty
        + lived.map((t) => tradeRow(t)).join("");
    }

    function clockName() {
      return ((WINDOWS.find((w) => w[0] === lens) || [])[1] || "");
    }

    function livedHint(shown, all, noun) {
      if (!all) return "";
      const one = noun || "deal";
      const many = one + "s";
      if (lens === "t0" || lens === "all" || shown === all) return shown + " " + (shown === 1 ? one : many);
      const span = { y1: "1 year", y2: "2 years", y3: "3 years" }[lens] || clockName();
      return shown + " of " + all + " lived " + span;
    }

    function scoreOpt(row) {
      return '<button type="button" class="score-opt' + (lens === row[0] ? " on" : "") + '" data-lens="' + row[0] + '">'
        + "<b>" + row[1] + "</b><span>" + row[2] + "</span></button>";
    }

    /**
     * The two screens the clock cannot move, and therefore the two the header control hides on.
     *
     * Champions Path reads no clock at all: renderTitles() never calls lens, chipLived() or
     * clockName(), so every figure on it is a finals score. The Drafts tab pins lens to "all"
     * for the whole of its render and puts it back afterwards, so every pick is graded from
     * accept day to today whatever the control says.
     *
     * Showing it there would leave a control on screen that visibly does nothing, which is the
     * defect this app has already removed once -- the ticker shipped "Most active" and "Least
     * active" as buttons carrying an empty destination, and every tap on them was ignored. The
     * set of screens the clock is offered on is therefore exactly the set it was offered on
     * before it moved: league home, a seat's home, both trades lists, partners and the
     * full-screen trade. The move changed where the control lives, not where it applies.
     *
     * The selected window survives a trip through either screen -- lens is state, not markup --
     * so leaving Drafts brings the control back reading whatever it read on the way in.
     */
    function lensApplies() {
      return view !== "titles" && view !== "drafts";
    }

    /**
     * The clock control lives in the brand header, outside #app, so it is painted rather than
     * rendered -- render() replaces #app's whole subtree and would destroy a control that has
     * to survive every navigation. Only the trigger's own state passes through here; changing
     * the window calls render(), because that is what moves the figures.
     */
    function paintLens() {
      const wrap = document.getElementById("lensWrap");
      const btn = document.getElementById("lensBtn");
      const panel = document.getElementById("scoreAs");
      if (!lensApplies()) {
        lensOpen = false;
        wrap.hidden = true;
        panel.hidden = true;
        panel.innerHTML = "";
        return;
      }
      wrap.hidden = false;
      const name = clockName();
      btn.className = "score-btn" + (lens !== "all" || lensOpen ? " on" : "");
      btn.setAttribute("aria-label", "Score as " + name);
      btn.setAttribute("aria-expanded", lensOpen ? "true" : "false");
      // The label is the window alone; "Score as" is in the accessible name above.
      btn.innerHTML = esc(name) + ' <span class="chev">▾</span>'
        + (lens !== "all" ? '<span class="dot"></span>' : "");
      panel.hidden = !lensOpen;
      panel.innerHTML = lensOpen ? WINDOWS.map(scoreOpt).join("") : "";
    }

    /**
     * The screen-local filter row the clock control used to share: the year filter on the Trades
     * tab and the round filter on Drafts. One emitter, because both were typing the same two
     * divs and the clock's departure left them identical.
     */
    function filterRow(left) {
      return '<div class="lens-row"><div class="lens-row-left">' + left + "</div></div>";
    }

    function renderDrafts() {
      const prev = lens;
      lens = "all";
      const raw = []
        .concat((data.drafts && data.drafts.rookie) || [], draftStartup ? (data.drafts && data.drafts.startup) || [] : [])
        .filter((p) => p.startup ? draftStartup : !!draftRounds[p.round]);
      let list = raw.filter((p) => chipLived(p.as_of));
      list = list.slice().sort((a, b) => {
        const date = Number(a.season) - Number(b.season) || (a.pick_no || 0) - (b.pick_no || 0);
        if (draftSort === "old") return date;
        if (draftSort === "gain" || draftSort === "loss") {
          const da = pickDelta(a), db = pickDelta(b);
          if (da == null && db == null) return -date;
          if (da == null) return 1;
          if (db == null) return -1;
          return draftSort === "gain" ? db - da : da - db;
        }
        return -date;
      });
      const graded = list.map(pickDelta).filter((d) => d != null);
      const avg = graded.length ? graded.reduce((a, b) => a + b, 0) / graded.length : null;
      const filtered = draftSort !== "new" || draftStartup || !draftRounds[1] || !draftRounds[2] || !draftRounds[3] || !draftRounds[4];
      const rounds = [["1", "1st round"], ["2", "2nd round"], ["3", "3rd round"], ["4", "4th round"]];
      const sorts = [
        ["new", "Newest"],
        ["old", "Oldest"],
        ["gain", "Value high to low"],
        ["loss", "Value low to high"],
      ];
      const draftBtn = '<button type="button" class="filter-btn' + (filtered || draftFilterOpen ? " on" : "") + '" data-dfilter="1" aria-label="Filter drafts" aria-expanded="' + (draftFilterOpen ? "true" : "false") + '">'
        + '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M4 5h16l-6.2 7.2V19l-3.6 1.8v-8.6L4 5z"/></svg>'
        + (filtered ? '<span class="dot"></span>' : "")
        + "</button>"
        + '<div class="caption">' + tapeMargin(avg) + " / pick"
        + " · " + graded.length + " graded · " + esc(livedHint(list.length, raw.length, "pick")) + "</div>";
      const html = filterRow(draftBtn)
        + (draftFilterOpen
          ? '<div class="filter-panel" id="draftFilters">'
            + '<div class="filter-h">Date</div>'
            + sorts.slice(0, 2).map((s) => '<label data-dsort="' + s[0] + '"><input type="radio" name="dsort"' + (draftSort === s[0] ? " checked" : "") + "> " + s[1] + "</label>").join("")
            + '<div class="filter-h">Value</div>'
            + sorts.slice(2).map((s) => '<label data-dsort="' + s[0] + '"><input type="radio" name="dsort"' + (draftSort === s[0] ? " checked" : "") + "> " + s[1] + "</label>").join("")
            + '<hr class="rule">'
            + rounds.map((r) => '<label data-dround="' + r[0] + '"><input type="checkbox"' + (draftRounds[r[0]] ? " checked" : "") + "> " + r[1] + "</label>").join("")
            + '<hr class="rule">'
            + '<label data-dstartup="1"><input type="checkbox"' + (draftStartup ? " checked" : "") + "> Include startup picks</label>"
            + "</div>"
          : "")
        + (list.length ? "" : '<p class="caption">No graded picks with these filters. Widen the rounds, or include startup picks.</p>')
        + list.map((p) => pickRow(p)).join("");
      lens = prev;
      return html;
    }

    function renderPartners() {
      const list = (data && data.partners) || [];
      // One per-partner number, scored once. Sorting used to call it twice per comparison.
      const scored = list.map((p) => ({ p: p, w: partnerPer(data, p.name) }))
        .sort((a, b) => (b.w.per ?? -1e9) - (a.w.per ?? -1e9));
      const rows = scored.map((row) => {
        const p = row.p, per = row.w.per;
        return '<button type="button" class="row' + (partnerName === p.name ? " open" : "") + '" data-partner="' + esc(p.name) + '">'
          + '<div class="row-top"><div><div class="names">' + seatLabel(p.name) + "</div>"
          + '<div class="date">' + p.complete + " complete · " + p.trades + " deals · "
          + '<span class="' + gradeCls(row.w.grade) + '">' + gradeLabel(row.w.grade) + "</span></div></div>"
          + '<div class="margin">' + tapeMargin(per) + "</div></div></button>";
      }).join("");
      let detail = "";
      if (partnerName) {
        const p = list.find((x) => x.name === partnerName);
        const deals = ((data && data.trades) || [])
          .filter((t) => (t.others || []).length === 1 && t.others[0] === partnerName && chipLived(t.date));
        detail = p
          ? "<h2>" + seatLabel(p.name) + "</h2>"
            + (deals.length ? deals.map((t) => tradeRow(t)).join("")
              : '<p class="caption">No deal with ' + seatLabel(p.name) + " has lived " + esc(clockName()) + " yet.</p>")
          : "";
      }
      const empty = list.length ? "" : '<p class="caption">No trade partners yet on this seat.</p>';
      return empty + rows + detail;
    }

    function render() {
      const app = document.getElementById("app");
      if (view !== "home" && VIEWS.indexOf(view) < 0) view = "home";
      if (!me && SEATLESS.indexOf(view) < 0) view = "home";
      // The League Data Sets dropdown exists on league home and nowhere else, so an open one
      // cannot survive a navigation off it. Done here rather than in each of the six functions
      // that leave, so the next one added cannot forget. Same condition as the renderer below.
      if (!(view === "home" && !(me && data))) dsOpen = false;
      // A full-screen trade is not a section of a seat, so the four tabs do not frame it.
      const tabs = me && view !== "titles" && view !== "trade" ? ["home", "trades", "partners", "drafts"] : [];
      // The four tabs are sections of one manager's page and none of them names that manager,
      // so this does -- once, above the row, on every one of them. It doubles as the screen
      // heading those four screens never had: focusNext = ".screen-h" now lands on the name of
      // the seat you just took instead of falling through to the panel, and the outline no
      // longer skips from the brand h1 straight to an h2 inside the body. Gated on tabs, so
      // Champions Path and a full-screen trade -- both league-wide, both already titled -- are
      // untouched, and league home with no seat gains nothing.
      const seatName = tabs.length
        ? '<h2 class="screen-h seat-h" tabindex="-1"><span class="sr-only">Team: </span>'
          + seatLabel(me.name) + "</h2>"
        : "";
      const nav = (tabs.length
        ? '<div class="nav" role="tablist" aria-label="Sections">'
          + tabs.map((v) =>
            '<button type="button" role="tab" aria-selected="' + (view === v ? "true" : "false") + '"'
            + ' tabindex="' + (view === v ? "0" : "-1") + '"'
            + ' class="tab' + (view === v ? " on" : "") + '" data-view="' + v + '">' + v + "</button>"
          ).join("")
          + "</div>"
        : "");
      const body = view === "home" ? renderHome()
        // ?view=trades means this seat's Trades tab when a seat is set, and the league-wide
        // list of every trade when none is.
        : view === "trades" ? (me && data ? renderTrades() : renderLeagueTrades())
        : view === "trade" ? renderTradeScreen()
        : view === "partners" ? renderPartners()
        : view === "drafts" ? renderDrafts()
        : view === "titles" ? renderTitles()
        : renderLeagueHome();
      // render() replaces the whole subtree, so expanding trade #40 used to drop focus to
      // <body> and lose the keyboard's place. Re-find the same control by its data-* attrs.
      const keep = focusSelector(document.activeElement);
      // The news feed is its own scroll container, and innerHTML resets it to the top. Without
      // this, any re-render (a vote settling, a seat file arriving) throws the reader back to
      // the first row -- the rebuild is invisible to them, so it reads as the page jumping for
      // no reason.
      const newsBox = app.querySelector(".news-box");
      const newsScroll = newsBox ? newsBox.scrollTop : 0;
      app.innerHTML = seatName + nav + body;
      if (newsScroll) {
        const box = app.querySelector(".news-box");
        if (box) box.scrollTop = newsScroll;
      }
      // A new screen puts focus on its own heading and starts at the top, so a keyboard or a
      // screen reader lands on the new content instead of holding the old screen's place.
      const navigated = focusNext !== null;
      const land = focusNext ? app.querySelector(focusNext) : null;
      focusNext = null;
      if (land) land.focus({ preventScroll: true });
      // League home leads with cards rather than a title, so there is no heading to land on.
      // The panel itself is the defined start of the new content. A seat always has one now.
      else if (navigated) app.focus({ preventScroll: true });
      else if (keep) {
        const back = app.querySelector(keep);
        if (back) back.focus({ preventScroll: true });
      }
      if (navigated) window.scrollTo(0, 0);
      // After the body, not before: renderDrafts() pins lens to "all" for its own render and
      // restores it on the way out, so the trigger must be painted from the settled value.
      paintLens();
      syncUrl();
      // News box is replaced with the subtree — re-bind pull-to-refresh and live chrome.
      bindNewsFeed();
      if (newsOnLeagueHome()) startNewsPoll();
      else stopNewsPoll();
    }

    /** Open one trade as its own screen. uid is the seat whose side frames it. */
    function openTrade(tx, uid) {
      if (!tx) return;
      view = "trade";
      openId = tx;
      tradeSeat = uid || null;
      partnerName = null;
      openPick = null;
      openDraft = null;
      markOpen = null;
      lensOpen = false;
      yearFilterOpen = false;
      draftFilterOpen = false;
      titleYear = null;
      voteToast = null;
      focusNext = ".screen-h";
      if (tradeSeat && !seatCache[tradeSeat]) seatData(tradeSeat).then(() => render());
      render();
    }

    /**
     * The league-wide trades list: ?view=trades with no seat. Any selected seat is dropped,
     * because with a seat that same view means the seat's own Trades tab. In practice nothing
     * reaches here with a seat set — every door to it is on a league-wide screen. Those doors
     * are the vote cast on a trade's own screen, that screen's footer chip, its back chip on a
     * cold deep link, and ?view=trades typed with no seat. League home deliberately has none:
     * this list is where a vote lands, not a place to browse to (§8a is satisfied because
     * renderLeagueTrades carries its own <h2>, so the destination is still named).
     */
    function openTradesList(toast) {
      me = null;
      data = null;
      view = "trades";
      openId = null;
      tradeSeat = null;
      partnerName = null;
      openPick = null;
      openDraft = null;
      markOpen = null;
      titleYear = null;
      year = "all";
      yearFilterOpen = false;
      draftFilterOpen = false;
      lensOpen = false;
      voteToast = toast || null;
      focusNext = ".screen-h";
      say("");
      render();
    }

    /** A selector that survives an innerHTML rebuild: the tag plus every data-* attribute. */
    function focusSelector(el) {
      if (!el || !el.closest || !el.closest("#app")) return null;
      // A screen heading carries no data-* of its own, and a screen usually has a second render
      // behind it — the seat file arriving, or a vote settling. Without this, that render threw
      // focus back to <body> a moment after a navigation had just placed it.
      if (el.classList && el.classList.contains("screen-h")) return ".screen-h";
      const parts = [...el.attributes]
        .filter((a) => a.name.startsWith("data-"))
        .map((a) => "[" + a.name + '="' + a.value.replace(/["\\\\]/g, "\\\\$&") + '"]');
      return parts.length ? el.tagName.toLowerCase() + parts.join("") : null;
    }

    document.getElementById("goHome").addEventListener("click", () => clearLeague());
    document.querySelector("h1.brand a").addEventListener("click", (e) => { e.preventDefault(); clearLeague(); });
    /**
     * The clock control's own listener. It has to be its own, because #app's delegated handler
     * cannot see a control that lives in the brand header -- the same split the seat picker had
     * while it was mounted there.
     */
    document.getElementById("lensWrap").addEventListener("click", (e) => {
      const opt = e.target.closest("[data-lens]");
      if (opt) {
        lens = opt.dataset.lens;
        lensOpen = false;
        render();
        // The option that was clicked no longer exists and was never inside #app, so
        // focusSelector() cannot put the keyboard back. The trigger is where it came from.
        document.getElementById("lensBtn").focus({ preventScroll: true });
        return;
      }
      if (!e.target.closest("[data-score]")) return;
      lensOpen = !lensOpen;
      if (!lensOpen) {
        // Closing changes nothing a screen renders, so it does not pay for a full render.
        paintLens();
        return;
      }
      // Every other popup is exclusive with this one, and this one paints above all of them,
      // so opening from the header has to close them rather than cover an open menu.
      teamsOpen = false;
      dsOpen = false;
      yearFilterOpen = false;
      draftFilterOpen = false;
      render();
    });
    /**
     * An outside click closes it. Capture phase, and paint rather than render: #app's handler
     * returns early on a dozen paths, and an open panel must not survive over the screen the
     * click just navigated to. Running first also means the fall-through branch at the bottom of
     * #app's handler sees the flag already cleared and does not schedule a second render.
     */
    document.addEventListener("click", (e) => {
      if (!lensOpen || e.target.closest("#lensWrap")) return;
      lensOpen = false;
      paintLens();
    }, true);
    // An outside click closes the seat menu. #app's own handler runs first and has already
    // cleared the flag for a click on the chip or on an option, so this only ever fires for a
    // click that landed somewhere else on the page.
    document.addEventListener("click", (e) => {
      if (!teamsOpen) return;
      if (e.target.closest("#teamMenu") || e.target.closest("[data-teams-open]")) return;
      teamsOpen = false;
      render();
    });

    /**
     * The Teams chip's mount of the seat menu, and the only one: the brand header's picker was
     * removed when the chips became the access points. It lives inside #app, so it is rendered
     * rather than painted, and closing it returns focus to the chip -- the menu it came from is
     * about to stop existing, and #app's innerHTML rebuild would otherwise drop focus to <body>.
     *
     * showMenu() is the half the header mount never needed. That trigger sat in the brand row at
     * the top of the page, so its menu was on screen by construction; this one opens from the
     * middle of league home, where focusing the selected option scrolls that option into view and
     * leaves the rest of the list below the fold.
     */
    function openTeams() {
      teamsOpen = true;
      dsOpen = false;
      lensOpen = false;
      yearFilterOpen = false;
      draftFilterOpen = false;
      render();
      const menu = document.getElementById("teamMenu");
      if (!menu) return;
      const sel = menu.querySelector('[aria-selected="true"]') || menu.querySelector("button");
      if (sel) sel.focus({ preventScroll: true });
      showMenu(menu);
    }

    function closeTeams() {
      teamsOpen = false;
      render();
      const btn = document.querySelector("[data-teams-open]");
      if (btn) btn.focus({ preventScroll: true });
    }

    /** Everything the app pops open, closed by Escape in the order a user expects. */
    function closeTopmost() {
      if (teamsOpen) { closeTeams(); return true; }
      if (lensOpen) {
        lensOpen = false;
        paintLens();
        document.getElementById("lensBtn").focus({ preventScroll: true });
        return true;
      }
      if (dsOpen) { closeDataSets(); return true; }
      if (yearFilterOpen) { yearFilterOpen = false; render(); return true; }
      if (draftFilterOpen) { draftFilterOpen = false; render(); return true; }
      if (openPick) { openPick = null; render(); return true; }
      if (openDraft) { openDraft = null; render(); return true; }
      // On the trade's own screen openId is the screen, not an open row, so Escape leaves the
      // screen the same way the back chip does rather than blanking it.
      if (view === "trade") { goBack(() => openTradesList()); return true; }
      if (openId) { openId = null; render(); return true; }
      if (partnerName) { partnerName = null; render(); return true; }
      return false;
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (closeTopmost()) e.preventDefault();
        return;
      }
      // Team picker: a listbox, so the arrows move between options and never scroll the page.
      // Matched on the class rather than on the menu's id, because the class is what any mount
      // of this list carries -- there were two mounts until the header picker was removed, and
      // a second copy of this block is how one of them quietly lost Home/End.
      const inWho = e.target.closest && e.target.closest(".who-menu");
      if (teamsOpen && inWho) {
        const opts = [...inWho.querySelectorAll("button")];
        const i = opts.indexOf(document.activeElement);
        let next = -1;
        if (e.key === "ArrowDown") next = (i + 1) % opts.length;
        else if (e.key === "ArrowUp") next = (i - 1 + opts.length) % opts.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = opts.length - 1;
        else if (e.key === "Tab") { closeTeams(); return; }
        if (next >= 0) { e.preventDefault(); opts[next].focus(); }
        return;
      }
      // League Data Sets: the same listbox keyboard as the seat picker above, for the same
      // reason -- five options in a popup are a list to move through, not five tab stops.
      const inDs = e.target.closest && e.target.closest("#dataSets");
      if (dsOpen && inDs) {
        const opts = [...document.querySelectorAll("#dataSets button")];
        const i = opts.indexOf(document.activeElement);
        let next = -1;
        if (e.key === "ArrowDown") next = (i + 1) % opts.length;
        else if (e.key === "ArrowUp") next = (i - 1 + opts.length) % opts.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = opts.length - 1;
        else if (e.key === "Tab") { closeDataSets(); return; }
        if (next >= 0) { e.preventDefault(); opts[next].focus(); }
        return;
      }
      // Roving tabs: one stop in the tab order, arrows move between the four sections.
      const tab = e.target.closest && e.target.closest('[role="tab"]');
      if (tab) {
        const tabs = [...document.querySelectorAll('.nav [role="tab"]')];
        const i = tabs.indexOf(tab);
        let next = -1;
        if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
        else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = tabs.length - 1;
        if (next >= 0) { e.preventDefault(); tabs[next].focus(); tabs[next].click(); }
      }
    });
    /**
     * Put one data set on screen. The menu is the only caller now that the ticker is gone, so
     * the heading is focused without scrolling -- the panel opens under the trigger the user
     * just pressed.
     */
    function selectDataSet(id) {
      if (!id || !DATA_SETS.some((d) => d[0] === id)) return;
      dataSet = id;
      dsOpen = false;
      render();
      const head = document.querySelector("#dsBody .ds-h");
      if (head) head.focus({ preventScroll: true });
    }

    /**
     * Back to nothing selected, from the "None" option at the top of the menu. The heading that
     * selectDataSet() focuses is about to stop existing, so focus goes to the trigger instead --
     * a keyboard that opened the menu with Enter ends up back on the control it opened, rather
     * than on <body> with the page scrolled somewhere.
     */
    function clearDataSet() {
      dataSet = null;
      dsOpen = false;
      render();
      const btn = document.querySelector("[data-dset-open]");
      if (btn) btn.focus({ preventScroll: true });
    }

    function closeDataSets() {
      dsOpen = false;
      render();
      const btn = document.querySelector("[data-dset-open]");
      if (btn) btn.focus({ preventScroll: true });
    }

    function openDataSets() {
      dsOpen = true;
      teamsOpen = false;
      lensOpen = false;
      yearFilterOpen = false;
      draftFilterOpen = false;
      render();
      const menu = document.getElementById("dataSets");
      if (!menu) return;
      const sel = menu.querySelector('[aria-selected="true"]') || menu.querySelector("button");
      // preventScroll, then showMenu: focusing an option scrolls that option into view and
      // nothing else, which left four of the six sets below the fold at 320px.
      if (sel) sel.focus({ preventScroll: true });
      showMenu(menu);
    }

    function openTitles() {
      view = "titles";
      titleYear = null;
      openId = null;
      tradeSeat = null;
      markOpen = null;
      lensOpen = false;
      voteToast = null;
      focusNext = ".screen-h";
      render();
    }

    document.getElementById("app").addEventListener("click", (e) => {
      // Before everything: leaving a screen must not read as a click on what is on it.
      const backBtn = e.target.closest("[data-back]");
      if (backBtn) {
        // Only ever reached on a cold deep link, where there is no entry behind us to pop.
        goBack(() => {
          if (view === "trade") openTradesList();
          else if (view === "titles" && titleYear) openTitles();
          else clearLeague();
        });
        return;
      }
      const listBtn = e.target.closest("[data-trades-list]");
      if (listBtn) { openTradesList(); return; }
      // The Teams chip and the menu it opens. Both live inside #app, which is why the seat is
      // taken from here rather than from a listener bound to the menu: the menu is rendered and
      // re-rendered rather than painted once, so the handler is on the container that survives.
      const teamsBtn = e.target.closest("[data-teams-open]");
      if (teamsBtn) {
        if (teamsOpen) closeTeams();
        else openTeams();
        return;
      }
      const seatPick = e.target.closest("[data-who]");
      if (seatPick) {
        teamsOpen = false;
        if (seatPick.dataset.who) selectMe(seatPick.dataset.who);
        return;
      }
      // Before [data-dset]: "None" carries no set id, and an empty data-dset would be the dead
      // pill defect all over again. It is its own attribute, so it can never read as a set.
      const dsNoneBtn = e.target.closest("[data-dset-none]");
      if (dsNoneBtn) { clearDataSet(); return; }
      const dsetBtn = e.target.closest("[data-dset]");
      if (dsetBtn) { selectDataSet(dsetBtn.dataset.dset); return; }
      const dsOpenBtn = e.target.closest("[data-dset-open]");
      if (dsOpenBtn) {
        if (dsOpen) closeDataSets();
        else openDataSets();
        return;
      }
      // Admin soft-delete on a shared tweet. Early return so it cannot fall through to any
      // row handler — same defect-A1 discipline as every other control nested near a list.
      const newsDelBtn = e.target.closest("[data-news-del]");
      if (newsDelBtn) {
        deleteNewsItem(newsDelBtn.dataset.newsDel);
        return;
      }
      const newsApplyBtn = e.target.closest("[data-news-apply]");
      if (newsApplyBtn) {
        if (newsPendingBook) applyPendingNews();
        else refreshNewsFeed({ reason: "tap", force: true });
        return;
      }
      // Before the row handlers: the vote block is a sibling of the open row, not inside it,
      // so a vote must not read as a click on the accordion.
      const voteBtn = e.target.closest("[data-vote]");
      if (voteBtn) {
        const tx = voteBtn.dataset.vote;
        const pick = voteBtn.dataset.voteSeat;
        const next = readVotes(tx).choice === pick ? null : pick;
        writeVote(tx, next);
        // Casting a vote is the last thing the trade's own screen is for, so it hands the user
        // the league list — named, so being moved does not read as being thrown out. Clearing a
        // vote is not casting one and stays put, or the screen would vanish under the user.
        if (view === "trade" && next) {
          const won = voteSeats({ transaction_id: tx }).find((s) => s.uid === next);
          openTradesList({ tx: tx, name: (won && won.name) || "" });
        } else {
          render();
        }
        return;
      }
      const pickBtn = e.target.closest("[data-pick]");
      if (pickBtn) {
        openPick = openPick === pickBtn.dataset.pick ? null : pickBtn.dataset.pick;
        render();
        return;
      }
      // Every league-wide row — the Recent Trade card, Most lopsided, the league trades list —
      // opens the trade as a whole screen instead of expanding inside its card.
      const boardOpen = e.target.closest("[data-board-open]");
      if (boardOpen) {
        openTrade(boardOpen.dataset.id, boardOpen.dataset.boardOpen);
        return;
      }
      const markBtn = e.target.closest("[data-mark]");
      if (markBtn) {
        const id = markBtn.dataset.mark;
        // marks.json carries all ten seats, so the chart no longer downloads every seat file.
        markOpen = markOpen === id ? null : id;
        render();
        return;
      }
      const titleBtn = e.target.closest("[data-title]");
      if (titleBtn) {
        view = "titles";
        titleYear = titleBtn.dataset.title || null;
        openId = null;
        tradeSeat = null;
        markOpen = null;
        lensOpen = false;
        voteToast = null;
        focusNext = ".screen-h";
        render();
        return;
      }
      const viewBtn = e.target.closest("[data-view]");
      if (viewBtn) {
        if (viewBtn.tagName === "A") e.preventDefault();
        view = viewBtn.dataset.view;
        openId = null;
        tradeSeat = null;
        openDraft = null;
        if (view !== "home") markOpen = null;
        if (view !== "drafts") draftFilterOpen = false;
        if (view !== "trades") yearFilterOpen = false;
        partnerName = null;
        titleYear = null;
        lensOpen = false;
        voteToast = null;
        render();
        return;
      }
      const partnerBtn = e.target.closest("[data-partner]");
      if (partnerBtn) {
        // A second tap on the open partner closes its detail. That is this screen's way out:
        // the list stays on screen above the detail, so there is nothing to navigate back to,
        // and the four tabs could not clear it before because view was already "partners".
        const want = partnerBtn.dataset.partner;
        partnerName = partnerName === want ? null : want;
        view = "partners";
        openId = null;
        render();
        return;
      }
      const filterBtn = e.target.closest("[data-dfilter]");
      if (filterBtn) { draftFilterOpen = !draftFilterOpen; if (draftFilterOpen) lensOpen = false; render(); return; }
      const yfilterBtn = e.target.closest("[data-yfilter]");
      if (yfilterBtn) { yearFilterOpen = !yearFilterOpen; if (yearFilterOpen) lensOpen = false; render(); return; }
      if (e.target.closest("#draftFilters") || e.target.closest("#yearFilters")
        || e.target.closest("#dataSets")) return;
      let closedFilter = false;
      if (dsOpen) {
        dsOpen = false;
        closedFilter = true;
      }
      if (draftFilterOpen && !e.target.closest("#draftFilters")) {
        draftFilterOpen = false;
        closedFilter = true;
      }
      if (yearFilterOpen && !e.target.closest("#yearFilters")) {
        yearFilterOpen = false;
        closedFilter = true;
      }
      const draftBtn = e.target.closest("[data-draft]");
      if (draftBtn) {
        openDraft = openDraft === draftBtn.dataset.draft ? null : draftBtn.dataset.draft;
        openPick = null;
        render();
        return;
      }
      const row = e.target.closest(".row[data-id], .row-x-btn[data-id]");
      if (row) { openId = openId === row.dataset.id ? null : row.dataset.id; render(); }
      else if (closedFilter) render();
    });
    document.addEventListener("change", (e) => {
      const yearLab = e.target.closest("[data-year]");
      if (yearLab) {
        year = e.target.checked ? yearLab.dataset.year : "all";
        yearFilterOpen = true;
        render();
        return;
      }
      const sortLab = e.target.closest("[data-dsort]");
      if (sortLab) {
        draftSort = sortLab.dataset.dsort;
        draftFilterOpen = true;
        render();
        return;
      }
      const roundLab = e.target.closest("[data-dround]");
      if (roundLab) {
        draftRounds[roundLab.dataset.dround] = e.target.checked;
        draftFilterOpen = true;
        render();
        return;
      }
      if (e.target.closest("[data-dstartup]")) {
        draftStartup = e.target.checked;
        draftFilterOpen = true;
        render();
      }
    });
    // The live tally is read after the page has painted, not before it. Awaiting Supabase here
    // would put a paused free-tier project between the reader and the whole dashboard, and votes
    // are the least important thing on it. Its own .catch keeps a vote failure out of the fatal
    // path below — a missing tally is a caption, not a broken page.
    loadMembers()
      .then(() => voteLoad().catch((err) => console.error(err)))
      .then(() => loadNewsDeleted().catch((err) => console.error(err)))
      .then(() => {
        startNewsPoll();
        document.addEventListener("visibilitychange", () => {
          if (document.hidden) return;
          if (!newsOnLeagueHome()) return;
          refreshNewsFeed({ reason: "poll" });
        });
      })
      .catch((err) => {
        document.getElementById("app").hidden = false;
        document.getElementById("lead").textContent = "Could not load league data. Hard-refresh, or serve this folder over http.";
        console.error(err);
      });
  </script>
</body>
</html>`;

// The whole page is one template literal, so a git conflict marker landing inside it is valid
// JavaScript -- a string is a string -- and `node --check` passes. That happened during this
// change's second rebase: `<<<<<<< HEAD`, two DATA_V lines and `>>>>>>>` shipped into index.html
// without a single error. Nothing may leave here carrying one.
for (const marker of ["<<<<<<<", ">>>>>>>", "\n=======\n"]) {
  if (html.includes(marker)) throw new Error(`generated page carries a git conflict marker: ${marker.trim()}`);
}
// One DATA_V, or the cache key is whichever line the browser reached last.
const dataVs = html.match(/const DATA_V = "[^"]*"/g) || [];
if (dataVs.length !== 1) throw new Error(`expected exactly one DATA_V, found ${dataVs.length}: ${dataVs.join(", ")}`);

// A lone backslash inside the template literal above is swallowed before it reaches the browser,
// which once turned /^pick:\d{4}:4:/ into /^pick:d{4}:4:/ and cost the browser's applyVa its
// late-4th half weight. Escapes are written \\ in the template; assert they survived.
const inline = html.slice(html.indexOf("<script>"));
for (const need of ["/^pick:\\d{4}:4:/", "/\\.0$/", "/^[\\w.-]+$/"]) {
  if (!inline.includes(need)) throw new Error(`generated script lost a regex escape: ${need}`);
}
// The champ card caption reads titles.json at runtime, so assert the builder shipped at all.
for (const need of ["function champFinalCaption", "champFinalCaption(champ, rec)", "Top scorer · "]) {
  if (!inline.includes(need)) throw new Error(`generated script lost the champ final caption: ${need}`);
}
// The scoreboard row. Each of these is one deletion away from a card that still renders and
// still says something plausible, which is exactly the failure mode worth asserting against:
//   scoreShort      the sketch's format -- one decimal, trailing .0 dropped, both halves alike
//   .bout-rec x2    the runner-up's record is the half of the row that did not exist before,
//                   and an absent one leaves a row that looks deliberate and is not
//   .bout-r         both right-hand cells pinned to track 3; lose it and the record slides
//                   under the score instead of under the name it belongs to
for (const need of ["const scoreShort =", 'scoreShort(f.champ_points) + "–" + scoreShort(f.opponent_points)',
  '<div class="champ-bout">', '<span class="bout-team">', '<span class="bout-team bout-r">',
  '<span class="bout-rec">', '<span class="bout-rec bout-r">', '<b class="bout-score">',
  'class="bout-w"', 'class="bout-l"', 'class="bout-dash"',
  "fin.bout.champRec", "fin.bout.oppRec", "f.opponent_record"]) {
  if (!inline.includes(need)) throw new Error(`generated script lost a champ scoreboard part: ${need}`);
}
// The .0 strip is a lone backslash inside the template literal, the exact hazard that shipped
// /^pick:d{4}:4:/. yearsOn() carries the same escape, so the shared list above cannot tell the
// two apart -- assert this one against its own call site.
if (!inline.includes('score1(n).replace(/\\.0$/, "")')) {
  throw new Error("scoreShort lost its trailing-zero strip -- the card would read 190.0, not 190");
}
// Both records ellipsise and the score does not, and the two rows are one grid so a record
// stays under its own name. Losing any of these is how a scoreboard silently becomes a stack.
for (const need of ["a.champ-alert .champ-bout {",
  "grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);",
  "a.champ-alert .champ-bout > * { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
  "a.champ-alert .bout-r { grid-column: 3; text-align: right; }",
  "a.champ-alert .bout-score {",
  "a.champ-alert .bout-score .bout-w { color: var(--green); }",
  "a.champ-alert .bout-score .bout-l { color: var(--red); }"]) {
  if (!html.includes(need)) throw new Error(`generated stylesheet lost a champ scoreboard rule: ${need}`);
}
// One signed-delta convention, one emitter. If any of these goes missing the dashboard is
// back to a bare or unsigned number somewhere, which is the defect this replaced: the
// explicit signs, the em dash for a delta that does not exist, and the single tapeMargin
// span every screen renders. The full-width caption row ships with them -- lose it and the
// tape's grid swallows the name tracks again.
for (const need of ['return (r > 0 ? "+" : "−") + fmt(Math.abs(r));', 'if (d == null || Number.isNaN(d)) return "—";',
  'return \'<span class="delta \' + signedCls(d) + \'">\' + signedNum(d) + "</span>";',
  'return \'<span class="figs">\' + tapeMargin(d) + \'<span class="val">\' + valHtml + "</span></span>";',
  '"tape-sub"', 'date sub-when']) {
  if (!inline.includes(need)) throw new Error(`generated script lost a signed-delta part: ${need}`);
}
// A tape side's delta and bag total must be the one .figs child, or the narrow layout wraps
// them apart and strands the total on a line of its own, left-aligned under a right-aligned
// side. tapeFigures() is the only place the pair is built, so .val is emitted exactly once.
const valEmits = (inline.match(/<span class="val">/g) || []).length;
if (valEmits !== 1) {
  throw new Error(`a tape side builds its own total instead of calling tapeFigures: ${valEmits} .val emitters, want 1`);
}
for (const sideLine of inline.match(/<div class="side(?: right)?"><div class="side-line">[^\n]*?<\/div><\/div>/g) || []) {
  if (!sideLine.includes("tapeFigures(")) throw new Error(`a tape side skips tapeFigures: ${sideLine.slice(0, 120)}`);
}
// Every delta figure goes through tapeMargin(). Nothing may format one by hand again, which
// is how four conventions for the same quantity accumulated in the first place.
for (const need of ['cls(dlt)', 'cls(s)', 'cls(-s)', 'cls(-dlt)', 'cls(p.per)', 'cls(p.surplus)',
  'cls(avg)', 'cls(per)', '(total > 0 ? "+" : "")', '(va > 0 ? "+" : "")']) {
  if (inline.includes(need)) throw new Error(`a delta is formatted by hand instead of by tapeMargin: ${need}`);
}
// The stacked phone tape and the wide tape are one rule set; either half alone is broken.
for (const need of ["grid-column: 1 / -1", "@media (max-width: 700px)", ".row-top.tape .figs { margin-left: auto; }",
  "grid-template-columns: minmax(0, 1fr)", "overflow-wrap: anywhere",
  "justify-content: flex-start; gap: 4px 10px; flex-wrap: wrap;",
  ".row-top.tape .figs { display: flex; gap: 6px; align-items: baseline; flex: 0 0 auto; }",
  ".row-top.tape .side.right .figs { flex-direction: row-reverse; }",
  ".row-top.tape .side.right .figs { flex-direction: row; }",
  ".delta.pos { color: var(--green); }", ".delta.neg { color: var(--red); }"]) {
  if (!html.includes(need)) throw new Error(`generated stylesheet lost a tape-row rule: ${need}`);
}
// A clip on h1.brand hid the seat picker, the most-used control in the app, twice (fixed in
// 7f97711, reintroduced by f9fdb39). The picker's removal left this guard protecting nothing and
// it was kept anyway; the clock control's move back into the header makes it load-bearing again.
// #scoreAs is absolutely positioned against .lens-wrap inside this h1, so overflow: hidden here
// would clip a 418px panel to the 44px header and reproduce the original defect exactly -- and
// getBoundingClientRect would still report the full panel, so only a hit test would show it.
const brandRule = html.slice(html.indexOf("    h1.brand {"));
if (!brandRule.slice(0, brandRule.indexOf("}")).includes("overflow: visible")) {
  throw new Error("h1.brand must declare overflow: visible -- a clip here hides #scoreAs");
}

// The Recent Trade card is now the only door on league home to the league-wide list, so losing
// any part of that button strands the screen a vote lands on. The 44px tap area is a painted
// ::after rather than layout, which no source read would reveal is load-bearing -- assert both
// halves, and assert nothing put the standalone control back on league home beside it.
for (const need of ['class="all-trades" data-trades-list="1"',
  'aria-label="All trades in the league"', "<span>All trades</span>", '"day-alert-top"']) {
  if (!inline.includes(need)) throw new Error(`generated script lost the all-trades icon: ${need}`);
}
for (const need of ["button.all-trades::after", "inset: -10px", ".day-alert-top .day-alert-h { min-width: 0; }"]) {
  if (!html.includes(need)) throw new Error(`generated stylesheet lost the all-trades tap area: ${need}`);
}
// League home's door is the icon in the card and nothing else. The trade screen keeps its own
// footer chip -- a different screen with a different parent -- so scope this to the one function
// rather than to the whole script, or the chip that survives on purpose trips it.
const homeFn = inline.slice(inline.indexOf("function renderLeagueHome()"));
if (homeFn.slice(0, homeFn.indexOf("\n    function ")).includes("data-trades-list")) {
  throw new Error("renderLeagueHome grew a standalone trades-list control -- the card's icon is the door");
}
// League home's five lists are one "League Data Sets" dropdown, not five stacked accordion packs.
// The trigger's label is the one thing the user specified by name, and the whole screen below it
// is a single selected set, so losing the trigger loses the only door to four of the five lists.
if (!inline.includes('"League Data Sets"')) {
  throw new Error('the League Data Sets trigger must ship -- it is the only door to four of the five sets');
}
if (!inline.includes('aria-label="League Data Sets, \' + esc(cur[1]) + \' selected"')) {
  throw new Error("the League Data Sets trigger must name the selected set in its accessible name");
}
// The label is a constant, the way the seat picker's is. If it starts reflecting the selection
// the two dropdowns on the same screen stop reading as the same kind of control.
if (!inline.includes('+ "League Data Sets" + \' <span class="chev">')) {
  throw new Error("the League Data Sets trigger label must stay a constant, not the selected set");
}
// A popup listbox, matching the seat picker rather than inventing a third, less accessible
// pattern: named options a screen reader can enumerate, the selection marked, the trigger
// announcing that it opens one.
for (const need of ['id="dataSets"', 'role="listbox" aria-label="League Data Sets"',
  "function closeDataSets()", "function openDataSets()",
  'e.target.closest("#dataSets")', 'if (dsOpen) { closeDataSets(); return true; }',
  'const opts = [...document.querySelectorAll("#dataSets button")];']) {
  if (!inline.includes(need)) throw new Error(`generated script lost a League Data Sets part: ${need}`);
}
// Scoped to the two emitters, because the seat picker carries role="option" and aria-selected of
// its own -- checked against the whole script these would pass on the seat menu alone.
const fnSrc = (name) => {
  const at = inline.indexOf(`    function ${name}(`);
  if (at < 0) throw new Error(`generated script lost ${name}()`);
  const rest = inline.slice(at + 4);
  return rest.slice(0, rest.indexOf("\n    function "));
};
/**
 * Just the function's own body, cut at its closing brace. fnSrc() runs to the next `function`
 * keyword, so it carries the following function's doc comment with it -- which is fine for a
 * "this string is present" check and useless for a "this string is absent" one. Every negative
 * assertion below uses this instead.
 */
const fnBody = (name) => {
  const src = fnSrc(name);
  const end = src.indexOf("\n    }");
  return end < 0 ? src : src.slice(0, end);
};
for (const need of ['role="option"', 'aria-selected="\' + (on ? "true" : "false") + \'"', 'data-dset="']) {
  if (!fnSrc("dsOpt").includes(need)) throw new Error(`a data set option lost ${need}`);
}
for (const need of ['aria-haspopup="listbox"', 'aria-expanded="\' + (dsOpen ? "true" : "false") + \'"',
  'data-dset-open="1"']) {
  if (!fnSrc("dataSetRow").includes(need)) throw new Error(`the League Data Sets trigger lost ${need}`);
}
// Exactly the five sets the five packs held, each with an id the ticker can name. Losing one
// deletes a list from the app with nothing left pointing at it.
for (const need of ['["wide", "Most lopsided trades"', '["passed", "Most passed around"',
  '["least", "Least traded"', '["forever", "Forever players"', '["home", "Homesteaders"']) {
  if (!inline.includes(need)) throw new Error(`generated script lost a data set: ${need}`);
}
const dsBlock = inline.slice(inline.indexOf("    const DATA_SETS = ["));
const dsIds = (dsBlock.slice(0, dsBlock.indexOf("\n    ];")).match(/\["\w+", "/g) || []).length;
if (dsIds !== 5) throw new Error(`DATA_SETS must hold exactly five sets, found ${dsIds}`);
// No set is chosen on a cold load: league home opens as the dropdown alone. This guard used to
// assert the opposite -- `let dataSet = "wide";`, so home would not be a lone control over empty
// space -- and the user asked for the empty space, so it now asserts the default it once forbade.
if (!inline.includes("let dataSet = null;")) {
  throw new Error("league home must open with no data set selected");
}
if (/let dataSet = "/.test(inline)) {
  throw new Error("a data set is pre-selected on load -- league home opens on the dropdown alone");
}
// The empty state is the panel emitting nothing, not a placeholder box. Scoped to the function,
// because `if (!dataSet) return "";` anywhere else would satisfy a whole-script check.
if (!fnSrc("dataSetPanel").includes('if (!dataSet) return "";')) {
  throw new Error("dataSetPanel must render nothing when no set is selected");
}
// The home icon returns league home to what a cold load shows. It used to reset to "wide"; that
// reset target moved with the default, and the two must not drift apart.
const clearFn = fnSrc("clearLeague");
if (!clearFn.includes("dataSet = null;")) {
  throw new Error("clearLeague must reset to no data set selected -- the home icon has to match a cold load");
}
if (/dataSet = "/.test(clearFn)) {
  throw new Error("the home icon resets to a selected data set -- it must match the empty first load");
}
// Nothing selected is reversible without a reload: a "None" option, first in the menu, at the
// same 44px as the five sets and in the same arrow-key run, so a keyboard reaches it.
for (const need of ['data-dset-none="1"', "function clearDataSet()",
  'e.target.closest("[data-dset-none]")', "if (dsNoneBtn) { clearDataSet(); return; }",
  "<b>None</b><span>"]) {
  if (!inline.includes(need)) throw new Error(`the clear-selection path lost a part: ${need}`);
}
// It is an option in the listbox, not a bare button, or a screen reader gets an unmarked control
// in a list of marked ones -- and it carries its own attribute rather than an empty data-dset,
// which is the dead-pill defect the ticker already shipped once.
for (const need of ['role="option"', 'aria-selected="\' + (on ? "true" : "false") + \'"',
  'class="ds-opt']) {
  if (!fnSrc("dsNoneOpt").includes(need)) throw new Error(`the None option lost ${need}`);
}
if (fnSrc("dsNoneOpt").includes('data-dset="')) {
  throw new Error("the None option must not carry a data-dset -- it names no set");
}
if (!fnSrc("dsMenu").includes("dsNoneOpt()")) {
  throw new Error("the None option must be composed into the menu, first, or the selection cannot be cleared");
}
const dsMenuSrc = fnSrc("dsMenu");
if (dsMenuSrc.indexOf("dsNoneOpt()") > dsMenuSrc.indexOf("DATA_SETS.map(dsOpt)")) {
  throw new Error("the None option must come before the five sets in the menu");
}
// With nothing selected there is no heading, so the trigger's accessible name is the only thing
// that says so. The label itself stays the constant, asserted above.
if (!fnSrc("dataSetRow").includes('aria-label="League Data Sets, none selected"')) {
  throw new Error("the trigger must say \"none selected\" when no set is on screen");
}
// Clearing removes the heading selectDataSet() focuses, so focus has to land on the trigger.
if (!fnSrc("clearDataSet").includes("btn.focus({ preventScroll: true })")) {
  throw new Error("clearDataSet must return focus to the trigger -- the heading it came from is gone");
}
// The accordion is gone. Any survivor of it is a second way to reach a list that the dropdown
// is now the only door to, and openPacks allowed several at once -- the thing being replaced.
for (const gone of ["openPacks", "togglePack", "data-pack", "pack-head"]) {
  if (inline.includes(gone)) throw new Error(`the accordion packs must not survive the dropdown: ${gone}`);
}
// The ticker was the other way into a data set and it is gone, so the menu option's call is the
// only one left. Without this, deleting the option handler would leave every set unreachable and
// no guard above would notice: they all assert the menu's *markup*, not that pressing it does
// anything. Asserted where it lives, not against the whole script.
if (!fnSrc("selectDataSet").includes("function selectDataSet(id)")) {
  throw new Error("selectDataSet lost its signature -- the reveal parameter went with the ticker and must not come back unused");
}
if (!inline.includes("if (dsetBtn) { selectDataSet(dsetBtn.dataset.dset); return; }")) {
  throw new Error("the data set menu lost its selectDataSet() call -- it is the only route into a set now");
}
// Selecting a set moves focus to the name of the set. A render this screen did not ask for --
// votes.json landing -- rebuilds the subtree, and without a data-* for focusSelector() to
// re-find, focus fell to <body> a moment after it had just been placed.
for (const need of ['data-dset-head="1"', 'head.focus({ preventScroll: true })']) {
  if (!inline.includes(need)) throw new Error(`the selected set's heading lost its focus handle: ${need}`);
}
if (/(pack|dset|view): ""/.test(inline)) {
  throw new Error("a control carries an empty destination -- drop it or make it a static element");
}
// Two controls on one screen, two unrelated axes. Score as picks the clock the figures are
// computed on and Most lopsided reads it; League Data Sets picks which list is on screen. They
// were nearly merged into one menu; keep them apart.
const homeBody = inline.slice(inline.indexOf("    function renderLeagueHome()"));
const homeSrc = homeBody.slice(0, homeBody.indexOf("\n    function "));
for (const need of ["homeChips()", "dataSetPanel()"]) {
  if (!homeSrc.includes(need)) throw new Error(`renderLeagueHome lost ${need} -- the lens and the data set are separate controls`);
}
// The data set trigger is one cell of the chip box now, so the composition is two hops. Assert
// the second hop as well: without it, dropping dataSetRow() out of the box would satisfy the
// check above and still leave four of the five sets with no door.
if (!fnSrc("homeChips").includes("dataSetRow()")) {
  throw new Error("the chip box lost the League Data Sets trigger -- it is the only door to four of the five sets");
}
// 44px on every option, and 56px on the chips that carry them, because a chip has to hold
// "League Data Sets" on two lines in a half-width cell at 320px. A formatting pass took 312
// sub-44px targets to zero; the floor here is above that, never below it.
for (const need of ["min-height: 56px; padding: 8px 10px;", "#dataSets button.ds-opt {"]) {
  if (!html.includes(need)) throw new Error(`the data set control lost its 44px target: ${need}`);
}
const dsOptRule = html.slice(html.indexOf("    #dataSets button.ds-opt {"));
if (!dsOptRule.slice(0, dsOptRule.indexOf("}")).includes("min-height: 44px")) {
  throw new Error("a data set option must stay a 44px target");
}
// The panel is absolutely positioned against .ds-wrap, so a clip anywhere up the chain hides
// options that are in the DOM and untappable -- which is exactly how the seat picker shipped
// broken twice. .ds-wrap is the one ancestor this file creates for it; assert it stays open.
const dsWrapRule = html.slice(html.indexOf("    .ds-wrap {"));
if (!dsWrapRule.slice(0, dsWrapRule.indexOf("}")).includes("overflow: visible")) {
  throw new Error("the .ds-wrap must declare overflow: visible -- a clip here hides #dataSets");
}
// Score as sits directly above and its open panel reaches down over this trigger, so the
// trigger's stacking context has to sit below .filter-wrap's.
if (!html.includes("z-index: 3; overflow: visible;")) {
  throw new Error("the .ds-wrap must stack below .filter-wrap, or Score as opens behind the trigger");
}
// Addressed by id so these beat the shared .filter-panel box rules declared later in the sheet.
// As a class the panel would inherit .filter-panel's 14px bottom margin and 4px 12px padding.
if (!html.includes("    #dataSets {")) {
  throw new Error("#dataSets must be addressed by id -- .filter-panel is declared after it and would win");
}

// ---- The clock control, in the brand header ---------------------------------------------------
// It moved out of the six screens that each rendered their own copy and into the header, where it
// is persistent chrome. Everything below is one deletion away from failing silently, because none
// of it changes what the page says -- only whether the control is there, reachable and honest.
//
// 1. The trigger ships in the served markup, so a cold load has it before any script runs. This
//    is the guard the task asked for by name: the control cannot silently revert to the body.
for (const need of ['<span class="lens-wrap" id="lensWrap">',
  'class="score-btn" id="lensBtn" data-score="1"',
  'aria-label="Score as Since trade"',
  'aria-expanded="false">Since trade <span class="chev">▾</span></button>',
  '<div id="scoreAs" hidden></div>']) {
  if (!html.includes(need)) {
    throw new Error(`the brand header's clock trigger must ship: ${need}`);
  }
}
// It is inside the h1, not merely somewhere on the page: the whole point is the top right of the
// brand row, and the h1 is the box the overflow guard above protects.
const brandMarkup = html.slice(html.indexOf('<h1 class="brand">'), html.indexOf("</h1>"));
if (!brandMarkup.includes('id="lensWrap"') || !brandMarkup.includes('id="lensBtn"')
  || !brandMarkup.includes('id="scoreAs"')) {
  throw new Error("the clock control must be mounted inside h1.brand -- that is the top right of the header");
}
// The trigger comes after the brand link, which carries margin-right: auto, so it is the last
// thing in the row and therefore on the right. Order in the markup is what puts it there.
if (brandMarkup.indexOf('id="lensWrap"') < brandMarkup.indexOf('href="./"')) {
  throw new Error("the clock trigger must come after the brand link, or it does not sit on the right");
}
// 2. One control, one place. Six screens used to render lensRow() and the user asked for a move,
//    not a copy. Assert the emitter is gone rather than that the call sites are: a re-added
//    lensRow() would have to be re-written from scratch to get past this.
for (const gone of ["lensRow", "scoreMenu", "score-k"]) {
  if (html.includes(gone)) {
    throw new Error(`the in-body clock control must stay removed -- one control, one place: ${gone}`);
  }
}
// The trigger is painted, never rendered, so nothing inside #app may emit one. data-score is the
// attribute its handler matches on, and a second one would give the header a rival.
const scoreTriggers = (inline.match(/data-score="1"/g) || []).length;
if (scoreTriggers !== 0) {
  throw new Error(`a screen renders its own clock trigger: ${scoreTriggers} in the script, want 0 -- the header's is static markup`);
}
// 3. It is painted from render(), after the body. renderDrafts() pins lens to "all" for its own
//    render and restores it on the way out, so painting first would show the pinned value.
const renderSrc = fnBody("render");
if (!renderSrc.includes("paintLens();")) {
  throw new Error("render() must paint the header clock -- without it the trigger never follows the page");
}
if (renderSrc.indexOf("app.innerHTML = seatName + nav + body;") > renderSrc.indexOf("paintLens();")) {
  throw new Error("paintLens() must run after the body is built -- renderDrafts pins lens and restores it");
}
// 4. It hides where the clock has no effect, and it must not be hidden anywhere else. Champions
//    Path reads no clock; Drafts pins it. A control that visibly does nothing is the dead-pill
//    defect the ticker already shipped once.
const appliesSrc = fnBody("lensApplies");
for (const need of ['view !== "titles"', 'view !== "drafts"']) {
  if (!appliesSrc.includes(need)) {
    throw new Error(`the header clock must hide where it changes nothing: ${need}`);
  }
}
if (!fnBody("paintLens").includes("if (!lensApplies()) {")) {
  throw new Error("paintLens must gate on lensApplies() -- the control would show on Champions Path and Drafts");
}
// Champions Path really does read no clock. If it ever starts, the gate above is wrong rather
// than the screen, and this is the assertion that says so before a user finds out.
const titlesSrc = fnSrc("renderTitles");
for (const banned of ["chipLived(", "clockName(", "lens "]) {
  if (titlesSrc.includes(banned)) {
    throw new Error(`Champions Path started reading the clock (${banned.trim()}) -- lensApplies() must stop hiding the control`);
  }
}
// Drafts pins the clock for the whole of its render. That pin is why the control hides there.
const draftsSrc = fnBody("renderDrafts");
if (!draftsSrc.includes('lens = "all";') || !draftsSrc.includes("lens = prev;")) {
  throw new Error("renderDrafts must pin and restore the clock -- the header control hides there because of this pin");
}
// 5. The panel is absolutely positioned against .lens-wrap, so a clip anywhere up that chain
//    hides options that are in the DOM and untappable. This is the A9 defect, and the chain is
//    one element long: .lens-wrap itself, inside the h1 already guarded above.
const lensWrapRule = html.slice(html.indexOf("    .lens-wrap {"));
if (lensWrapRule === html) throw new Error("the .lens-wrap lost its rule");
const lensWrapDecl = lensWrapRule.slice(0, lensWrapRule.indexOf("}"));
if (!lensWrapDecl.includes("position: relative")) {
  throw new Error("the .lens-wrap must be position: relative -- #scoreAs is positioned against it");
}
if (/overflow: *(hidden|clip)|clip-path|transform:|contain:|filter:|perspective:/.test(lensWrapDecl)) {
  throw new Error(".lens-wrap must not clip or contain -- #scoreAs is absolutely positioned against it");
}
// It stacks above every panel inside #app. .filter-wrap is 4 and .ds-wrap is 3, so the open
// clock panel paints over the year filter's trigger and over the chip box it drops across.
const lensZ = Number((lensWrapDecl.match(/z-index: *(\d+)/) || [])[1]);
const dsZ = Number((html.match(/\.ds-wrap \{[^}]*z-index: *(\d+)/) || [])[1]);
const filterZ = Number((html.match(/\.filter-wrap \{[^}]*z-index: *(\d+)/) || [])[1]);
if (!(lensZ > filterZ && filterZ > dsZ)) {
  throw new Error(`the clock panel must stack above the screens it drops over: .lens-wrap ${lensZ} > .filter-wrap ${filterZ} > .ds-wrap ${dsZ}`);
}
// Anchored to the trigger's own box. It used to be a fixed top: 52px, which was the height of a
// row at the top of a screen and is not where the trigger sits now.
if (!html.includes("      position: absolute; top: calc(100% + 4px); right: 0; left: auto; z-index: 12;")) {
  throw new Error("#scoreAs must hang off the trigger's own box -- a fixed top belongs to the row it left");
}
// display:flex on the base #scoreAs rule overrides [hidden] on engines without !important, and
// the empty panel paints as the thin card bar under the brand header. Flex only when open.
if (html.includes("    #scoreAs {\n") && /#scoreAs \{[^}]*display:\s*flex/.test(html)) {
  throw new Error("#scoreAs must not set display:flex on the base rule -- it overrides [hidden] and paints the empty bar");
}
if (!html.includes("    #scoreAs:not([hidden]) {")
  || !html.includes("    #scoreAs[hidden], #scoreAs:empty { display: none !important; }")) {
  throw new Error("#scoreAs must hide when [hidden]/empty and only flex when open");
}
if (html.includes('class="filter-panel" id="scoreAs"')) {
  throw new Error("#scoreAs must not carry .filter-panel -- that class's in-flow margin/padding is the empty bar");
}
// 6. The 44px rule, on the trigger and on all five options. A formatting pass took 312 sub-44px
//    targets to zero and none may come back.
const scoreBtnRule = html.slice(html.indexOf("    button.score-btn {"));
if (!scoreBtnRule.slice(0, scoreBtnRule.indexOf("}")).includes("min-height: 44px")) {
  throw new Error("the clock trigger must stay a 44px target");
}
const scoreOptRule = html.slice(html.indexOf("    #scoreAs button.score-opt {"));
if (!scoreOptRule.slice(0, scoreOptRule.indexOf("}")).includes("min-height: 44px")) {
  throw new Error("a clock option must stay a 44px target");
}
// 7. The label is the window alone. At 0.8125rem the "Score as" prefix costs a measured 54px,
//    which the 288px brand row at 320px does not have -- with it, the app's own name ellipsises
//    on every phone. The words stay in the accessible name, and the font step is what makes even
//    the widest window name fit: 107.7px of a 109.1px slot at 320px, against 116.7px without it.
if (!fnBody("paintLens").includes('btn.innerHTML = esc(name) + \' <span class="chev">▾</span>\'')) {
  throw new Error("the clock trigger's label must be the window alone -- the prefix does not fit at 320px");
}
if (!fnBody("paintLens").includes('btn.setAttribute("aria-label", "Score as " + name);')) {
  throw new Error("the clock trigger must keep \"Score as\" in its accessible name -- the visible label drops it");
}
// Scoped to the 460px block, not to the sheet: the step only exists to buy the phone widths, and
// a bare `#lensBtn { font-size` anywhere would satisfy a whole-sheet check while shrinking the
// trigger on the desktop too.
const brandMedia = html.slice(html.indexOf("    @media (max-width: 460px) {"));
if (!brandMedia.slice(0, brandMedia.indexOf("\n    }")).includes("#lensBtn { font-size: 0.75rem; }")) {
  throw new Error("the clock trigger must keep its 460px font step -- without it the brand row overflows at 320px");
}
// 8. Its own listener, because #app's delegated handler cannot see the header, and an outside
//    click and Escape both close it. All three were true of the control in the body; a control
//    that moved out of the delegated handler's reach has to bring them with it.
for (const need of ['document.getElementById("lensWrap").addEventListener("click"',
  'if (!lensOpen || e.target.closest("#lensWrap")) return;',
  'document.getElementById("lensBtn").focus({ preventScroll: true });']) {
  if (!inline.includes(need)) throw new Error(`the header clock lost a handler: ${need}`);
}
if (!inline.includes("if (lensOpen) {\n        lensOpen = false;\n        paintLens();")) {
  throw new Error("Escape must close the header clock");
}
// 9. The screen-local filter row it used to share is one emitter now. Two screens were typing
//    the same two divs, and the clock's departure left them identical.
if (!fnBody("renderTrades").includes("filterRow(yearBtn)")) {
  throw new Error("the Trades tab lost its year filter row");
}
if (!fnBody("renderDrafts").includes("filterRow(draftBtn)")) {
  throw new Error("the Drafts tab lost its round filter row");
}

// ---- League home's box of four chips ---------------------------------------------------------
// Four cells of equal size. Two lead somewhere -- the league's teams and the five data sets --
// and two are slots the user has not decided on. The two halves fail in opposite directions and
// both are asserted: a live chip can lose its menu, and a slot can grow into a fake button.
const chipSrc = fnBody("homeChips");
for (const need of ['<div class="chip-box ds-wrap">', '<div class="chip-grid">',
  "teamsChip()", "dataSetRow()", "chipSlot()", "teamsMenu()", "dsMenu()"]) {
  if (!chipSrc.includes(need)) throw new Error(`the chip box lost ${need}`);
}
const cells = (chipSrc.match(/\+ (?:teamsChip|dataSetRow|chipSlot)\(\)/g) || []).length;
if (cells !== 4) throw new Error(`the chip box must hold exactly four cells, found ${cells}`);
const slotCells = (chipSrc.match(/\+ chipSlot\(\)/g) || []).length;
if (slotCells !== 2) throw new Error(`the chip box must hold exactly two undecided slots, found ${slotCells}`);
// Both menus are emitted by the box, not by their triggers, so both hang off one anchor.
if (!/\+ \(teamsOpen \? teamsMenu\(\) : ""\)/.test(chipSrc) || !/\+ \(dsOpen \? dsMenu\(\) : ""\)/.test(chipSrc)) {
  throw new Error("a chip menu is emitted inside its own cell -- it would drop at the cell's width and clip against it");
}
// A slot is a span with no tab stop, no role and nothing for a handler to find. This is the
// dead-pill guard above, applied to the control that replaced the dropdown: the ticker shipped
// two <button> pills carrying an empty destination and every tap on them was ignored, and four
// large chips are a far bigger surface for the same defect.
const slotSrc = fnBody("chipSlot");
if (!slotSrc.includes('<span class="home-chip slot"')) {
  throw new Error("an undecided chip must be a <span> -- a button that goes nowhere is the dead-pill defect");
}
if (/<button|<a |tabindex|data-[a-z]|role=|href=/.test(slotSrc)) {
  throw new Error("an undecided chip grew an affordance -- it must not be focusable, activatable or addressable");
}
if (!slotSrc.includes('aria-hidden="true"')) {
  throw new Error("an undecided chip must be aria-hidden -- an em dash is a placeholder, not a reading");
}
const slotRule = html.slice(html.indexOf("    .home-chip.slot {"));
if (slotRule === html) throw new Error("the undecided chips lost their placeholder painting");
for (const need of ["border-style: dashed", "cursor: default", "background: transparent", "color: var(--dim)"]) {
  if (!slotRule.slice(0, slotRule.indexOf("}")).includes(need)) {
    throw new Error(`an undecided chip must not look pressable: ${need}`);
  }
}
// Equal cells, asserted as a grid property rather than left to the eye. minmax(0, 1fr) and not
// 1fr because a track's automatic minimum is min-content (§3a) -- "League Data Sets" would
// otherwise widen the row instead of wrapping inside its cell. grid-auto-rows: 1fr is what makes
// the phone layout's two rows equal to each other rather than each sized to its own tallest chip.
for (const need of ["grid-template-columns: repeat(2, minmax(0, 1fr));", "grid-auto-rows: 1fr;",
  "grid-template-columns: repeat(4, minmax(0, 1fr));"]) {
  if (!html.includes(need)) throw new Error(`the chip grid lost its equal-cell sizing: ${need}`);
}
// The box is the anchor for both menus, so it is the ancestor chain that has to stay open. The
// seat picker was completely unusable twice because one ancestor clipped an absolutely
// positioned menu; this is the same failure waiting on a different box.
const chipBoxRule = html.slice(html.indexOf("    .chip-box {"));
if (chipBoxRule === html) throw new Error("the chip box lost its card rules");
if (/overflow: *(hidden|clip)|clip-path|transform:|contain:/.test(chipBoxRule.slice(0, chipBoxRule.indexOf("}")))) {
  throw new Error(".chip-box must not clip or contain -- both menus are absolutely positioned against it");
}
if (!html.includes("    .chip-box .who-menu { left: 0; right: auto; }")) {
  throw new Error("the Teams chip's menu lost its anchor override -- it would open off the right of the box");
}

// ---- One team list, two triggers --------------------------------------------------------------
// The Teams chip is the one door into a seat: the brand header's picker was removed on the
// ruling that the chips are the access points. The emitter stays single anyway -- it was single
// while there were two mounts, and it is what a future second mount would have to render from,
// so the crown and the finishing order can only be typed once.
if (!inline.includes("    function whoOptions() {")) {
  throw new Error("the seat option list must be one emitter -- the Teams chip mounts it");
}
if (!fnBody("teamsMenu").includes("whoOptions()")) {
  throw new Error("the Teams chip stopped rendering from whoOptions() -- that is a second team list");
}
// One caller, and that caller is the chip's menu. This replaces the guard that asserted the
// header picker painted from whoOptions(): the risk it covered -- a mount rendering its own list
// -- lands on whichever mount exists, so count the calls rather than name a mount.
const whoOptCalls = (inline.match(/whoOptions\(\)/g) || []).length - 1; // less its own definition
if (whoOptCalls !== 1) {
  throw new Error(`whoOptions() is mounted in ${whoOptCalls} places, want 1 -- a second mount must be asserted, not assumed`);
}
// The header may not grow a second seat control again without this file being changed. Every
// part of the removed picker is named, because each one alone would put it back: the trigger,
// its menu, the wrapper they were positioned against, and the paint function that drove them.
for (const gone of ['id="who"', 'id="whoMenu"', "who-wrap", "paintWho", "whoOpen"]) {
  if (html.includes(gone)) {
    throw new Error(`the brand header's seat picker must stay removed -- the chips are the access points: ${gone}`);
  }
}
if (/button\.who[\s:.,{]/.test(html)) {
  throw new Error("the brand header's seat picker must stay removed -- button.who has no trigger to style");
}
// ---------------------------------------------------------------------------------------------
// The league ticker must stay removed. Same shape as the seat-picker guard above, and for the
// same reason: it was reviewed and deleted on the user's instruction, so putting any one piece
// of it back is a decision this file has to be edited to make.
//
// Every part is named because each one alone brings it back: the shell node the marquee mounted
// in, the two functions that built it, the paint call in render(), the classes, and the
// keyframes that moved it. Seven of the nine pills led to a data set the League Data Sets menu
// still opens, or to Champions Path, which the gold card still opens; the other two led nowhere.
//
// These run against the raw page, comments included, so a comment may not spell a removed token
// the way code would. That is deliberate and the surviving notes are written around it -- a
// blunt check has no branch that can be wrong, and prose has no reason to type the function names.
for (const gone of ['id="feed"', "paintFeed", "leagueBubbles", "ticker-track", "@keyframes ticker",
  "getElementById(\"feed\")", "class=\"bubble", "class=\"ticker"]) {
  if (html.includes(gone)) {
    throw new Error(`the league ticker must stay removed: ${gone}`);
  }
}
// The class selectors, which the substrings above would miss in a stylesheet.
for (const re of [/\.ticker[\s:.,{]/, /\.bubble[\s:.,{]/, /#feed[\s:.,{]/]) {
  if (re.test(html)) throw new Error(`the league ticker's stylesheet rules must stay removed: ${re}`);
}
// The whole-sheet "nothing animates" assertion that this removal makes possible is NOT here.
// It subsumes the scoped .news-box animation guard further down, and a guard that runs before
// the specific one makes the specific one incapable of failing -- the exact defect 3a records.
// It runs last instead, after every scoped animation check has had its chance. See the end of
// this file.
// ---------------------------------------------------------------------------------------------
// Only one place may build an option, so the crown and the 44px row cannot be re-typed elsewhere.
const optEmits = (inline.match(/data-who="' \+ esc\(id\) \+ '"/g) || []).length;
if (optEmits !== 1) throw new Error(`a seat option is built in ${optEmits} places, want 1`);
const whoOptSrc = fnBody("whoOptions");
for (const need of ['role="option"', 'aria-selected="\' + (on ? "true" : "false") + \'"',
  '<span class="who-name">', "seatLabel(label)"]) {
  if (!whoOptSrc.includes(need)) throw new Error(`the seat option emitter lost ${need}`);
}
// Crown is painted by seatLabel for the reigning champ — whoOptions must not paint a second one.
if (whoOptSrc.includes("CROWN") || whoOptSrc.includes("m.place === 1")) {
  throw new Error("whoOptions must not paint the crown itself — seatLabel owns the reigning-champ mark");
}
// The same CSS box as well as the same markup: the 220px width, the 44px options and the
// no-scroll cap are all .who-menu, so the chip's mount carries the class rather than a copy.
if (!fnBody("teamsMenu").includes('<div class="who-menu" id="teamMenu" role="listbox"')) {
  throw new Error("the Teams chip menu must be a .who-menu -- its width, its 44px options and its no-scroll cap are that rule");
}
// The listbox keyboard, matched on the class rather than on the menu's id, so it survives a
// remount. It ran for two mounts until the header picker was removed; it must still run here.
if (!inline.includes('e.target.closest(".who-menu")')) {
  throw new Error("the listbox keyboard must match .who-menu, or the seat menu loses its arrow keys");
}
if (!inline.includes("if (teamsOpen && inWho) {")) {
  throw new Error("the listbox keyboard must run for the Teams chip's menu");
}
// Escape closes it, an outside click closes it, and taking a seat closes it. All three were
// true of the removed header picker and have to stay true of the control that replaced it.
for (const need of ["if (teamsOpen) { closeTeams(); return true; }",
  "function openTeams()", "function closeTeams()",
  'e.target.closest("#teamMenu") || e.target.closest("[data-teams-open]")',
  "if (seatPick.dataset.who) selectMe(seatPick.dataset.who);"]) {
  if (!inline.includes(need)) throw new Error(`the Teams chip lost ${need}`);
}
// The Teams chip is a trigger for a popup listbox, announced as one, and it carries the seat in
// its accessible name for the same reason the header's picker does: the visible label is the
// constant "Teams" and says nothing about which seat is taken.
// The label and the accessible name are asserted below with the rest of the seat-menu rules,
// where the guards the removed header trigger used to carry were re-pointed onto this chip.
const teamsChipSrc = fnBody("teamsChip");
for (const need of ['data-teams-open="1"', 'aria-haspopup="listbox"',
  'aria-expanded="\' + (teamsOpen ? "true" : "false") + \'"']) {
  if (!teamsChipSrc.includes(need)) throw new Error(`the Teams chip lost ${need}`);
}

// The seat menu lists the managers in last season's order, crowns the champion, and must show
// every one of them without scrolling. Each half can break the other: a "Team" option back at
// the top pushes the list over the cap, and lowering the 44px target to fit is the fix that is
// explicitly not allowed. Assert the shape, then measure the list against the cap from the data.
if (/opt\(!me, "", "Team"\)/.test(inline)) {
  throw new Error('the seat menu must not carry a "Team" option -- the home icon clears the seat');
}
// The trigger names the control, never the selection. It used to swap to the selected manager's
// name, which read as that manager's own button rather than as the way to reach the other nine.
// These three guards were written against the header trigger -- the served markup carrying the
// constant, paintWho() repainting the constant, and the label never being computed. The header
// trigger is gone, so all three are re-pointed at the chip, which is the trigger that carries
// the same job now. Note "Teams" here is a different string from the removed "Team" option
// above, whose guard matches its whole call, so the two cannot be confused.
if (!teamsChipSrc.includes('+ "Teams" + \' <span class="chev">▾</span></span></button>')) {
  throw new Error('the Teams chip must render the constant "Teams", not the selected seat');
}
if (/<span class="chip-lab">'\s*\n?\s*\+ (?!")/.test(teamsChipSrc)) {
  throw new Error("the Teams chip's visible label went back to being computed from the selected seat");
}
if (!teamsChipSrc.includes('"Teams, " + me.name + seatFlairText(me.name) + " selected"')) {
  throw new Error("the Teams chip's accessible name must still say which seat is selected");
}
for (const need of ['<span class="who-name">', 'class="crown"', 'aria-hidden="true" focusable="false"',
  "reigningChampName", "members.sort((a, b) => (a.place || 99) - (b.place || 99))"]) {
  if (!inline.includes(need)) throw new Error(`generated script lost a seat-menu part: ${need}`);
}
// Seat flair is display-only. Bare Sleeper names stay in data; glyphs/images are painted.
if (!inline.includes("function seatLabel(name)") || !inline.includes("function seatFlairHtml(name)")) {
  throw new Error("seat flair must ship as display-only seatLabel() / seatFlairHtml()");
}
for (const need of [
  'SF69erss: { img: "data/ui/flair-sf69erss.png" }',
  'BubbaCuckShremp: { img: "data/ui/flair-bubbacuckshremp.png" }',
  'TedCumberbatch: { img: "data/ui/flair-tedcumberbatch.png" }',
  'TrumanCooper: { img: "data/ui/flair-trumancooper.png" }',
  'DarkWingDucks2023: { img: "data/ui/flair-darkwingducks2023.png" }',
  'ARae: { img: "data/ui/flair-arae.png" }',
  'ChiefGumby: { img: "data/ui/flair-chiefgumby.png" }',
  'KingHenryXXVI: { img: "data/ui/flair-kinghenryxxvi.png" }',
  'bigjberg: { img: "data/ui/flair-bigjberg.png" }',
  'TipsUp: { img: "data/ui/flair-tipsup.png" }',
]) {
  if (!inline.includes(need)) throw new Error(`seat flair map missing: ${need}`);
}
if (!html.includes("img.seat-flair, svg.crown {") || !html.includes("width: 1.15em; height: 1.15em;")) {
  throw new Error("seat-flair and crown must be emoji-sized (1.15em) beside the name");
}
// Reigning champ crown rides seatLabel everywhere: crown → name → flair.
if (!inline.includes("function reigningChampName()")
  || !fnSrc("seatLabel").includes("reigningChampName() === n ? CROWN + \" \"")
  || !fnSrc("seatLabel").includes("return crown + esc(n) + seatFlairHtml(n)")) {
  throw new Error("seatLabel must crown the most recent title winner before the name everywhere");
}
if (!inline.includes("function seatTitle(title)")) {
  throw new Error("bag headings must flair seat names through seatTitle()");
}
// The home icon is the only way out of a seat. That was already true once the menu's "Team"
// option went, and removing the header picker makes it the only way out of anything: the flow is
// home icon to leave a seat, Teams chip to enter another. Both halves are asserted -- the
// listener, and that clearLeague() actually drops the seat rather than only repainting -- because
// a handler that fires and does nothing is the failure this app has shipped before.
if (!inline.includes('document.getElementById("goHome").addEventListener("click", () => clearLeague());')) {
  throw new Error("the home icon must clear the seat -- it is the only exit from a seat now");
}
// Newline-anchored, because "me = null;" is a substring of "partnerName = null;" two lines below
// it -- a guard that cannot fail is the thing this file has the most of already.
const clearSrc = fnBody("clearLeague");
for (const need of ["\n      me = null;", "\n      data = null;", '\n      view = "home";',
  "\n      teamsOpen = false;", "\n      render();"]) {
  if (!clearSrc.includes(need)) {
    throw new Error(`clearLeague must still leave the seat entirely -- it is the only exit: ${need.trim()}`);
  }
}
// The brand link is the second half of the same door and shares the handler.
if (!inline.includes('document.querySelector("h1.brand a").addEventListener("click", (e) => { e.preventDefault(); clearLeague(); });')) {
  throw new Error("the brand link must clear the seat with the home icon");
}
const SEAT_MIN_H = 44;
const SEAT_MENU_CHROME = 10; // 4px padding top and bottom, 1px border top and bottom
const SEAT_CAP = 10 * SEAT_MIN_H + 16;
if (!html.includes(`max-height: min(calc(10 * ${SEAT_MIN_H}px + 16px), calc(100dvh - 88px));`)) {
  throw new Error("the seat menu lost its no-scroll cap");
}
if (!html.includes(`min-height: ${SEAT_MIN_H}px; padding: 6px 12px; cursor: pointer;`)) {
  throw new Error(`a seat option must stay ${SEAT_MIN_H}px -- raise the cap instead of shrinking the target`);
}
const seats = JSON.parse(fs.readFileSync(`${ROOT}data/ui/members.json`, "utf8"));
const seatPlaces = seats.map((m) => m.place);
if (seatPlaces.some((p) => !Number.isInteger(p)) || new Set(seatPlaces).size !== seats.length) {
  throw new Error("every member needs a unique integer place -- run title-path.mjs");
}
if (seatPlaces.filter((p) => p === 1).length !== 1) {
  throw new Error("exactly one member wears the crown");
}
if (seats.length * SEAT_MIN_H + SEAT_MENU_CHROME > SEAT_CAP) {
  throw new Error(`${seats.length} seats need ${seats.length * SEAT_MIN_H + SEAT_MENU_CHROME}px, cap is ${SEAT_CAP}px`);
}
// The League Data Sets menu, sized to its list the same way. Six options at the 76px a two-line
// option takes at 320px, five 4px gaps, 12px of panel padding and 2px of border. The old cap was
// min(100dvh - 96px, 480px) -- a number the list never reached, so it never bit and the panel
// simply hung off the bottom of the screen. Both halves are asserted: the rule, and the list
// against it, so a seventh set fails the build rather than shipping a menu you have to scroll.
const DS_ROW_H = 76;
const DS_MENU_CHROME = 34; // five 4px gaps, 6px padding top and bottom, 1px border top and bottom
const dsCount = dsIds + 1; // the five sets, plus the None option above them
if (!html.includes(`max-height: min(calc(${dsCount} * ${DS_ROW_H}px + ${DS_MENU_CHROME}px), calc(100dvh - 96px));`)) {
  throw new Error("the League Data Sets menu lost its list-sized cap -- a viewport-fraction cap never bites");
}
// A menu opened from the middle of the page is not on screen just because it is in the DOM.
// Focusing an option only scrolls that option into view, which left four of the six sets below
// the fold at 320px and five of six at 375px. Both menus in the chip box go through showMenu().
if (!inline.includes("    function showMenu(menu) {")) {
  throw new Error("showMenu() is what puts a chip's menu on screen -- both menus open from mid-page");
}
for (const opener of ["openTeams", "openDataSets"]) {
  const src = fnBody(opener);
  if (!src.includes("showMenu(menu);")) {
    throw new Error(`${opener}() must scroll its menu into view -- it opens from the middle of league home`);
  }
  if (!src.includes("focus({ preventScroll: true })")) {
    throw new Error(`${opener}() must focus without scrolling -- the browser's scroll lands on the option, not the menu`);
  }
}
// The seat picker's trigger names the control, not the selection, so the manager's name above
// the tab row is the only thing on those four screens that says whose page you are on. It is
// also the focus target render() lands on after a seat is taken. Both jobs are invisible to a
// source read -- the heading looks like decoration -- so assert the markup, the gate that keeps
// it off the seatless and already-titled screens, and its place ahead of the tab row.
for (const need of [
  '<h2 class="screen-h seat-h" tabindex="-1"><span class="sr-only">Team: </span>',
  "+ seatLabel(me.name) + \"</h2>\"",
  "app.innerHTML = seatName + nav + body;",
]) {
  if (!inline.includes(need)) throw new Error(`generated script lost the seat heading: ${need}`);
}
const seatHeadGate = inline.slice(inline.indexOf("      const seatName = "));
if (!seatHeadGate.slice(0, seatHeadGate.indexOf(";")).includes("tabs.length")) {
  throw new Error("the seat heading must be gated on tabs.length -- Champions Path and a full-screen trade carry their own");
}
// A heading cannot ellipsize, and DarkWingDucks2023 is 17 characters with no break opportunity.
const seatHeadRule = html.slice(html.indexOf("    h2.seat-h {"));
if (!seatHeadRule.slice(0, seatHeadRule.indexOf("}")).includes("overflow-wrap: anywhere")) {
  throw new Error("h2.seat-h must be able to break a long name -- a 17-character seat has overflowed this app twice");
}
// Navigation is the one thing a user cannot work around if it fails to ship: without real
// history entries Back leaves the site, and without a back chip the full-screen trade is a
// dead end. Assert both halves, and the arrow glyph the chips are labelled with.
for (const need of [
  "history.pushState(stateNow()",
  'window.addEventListener("popstate"',
  "function goBack(fallback)",
  "function renderTradeScreen()",
  "function renderLeagueTrades()",
  'class="chip back" data-back="1"',
  "← ",
]) {
  if (!inline.includes(need)) throw new Error(`generated script lost navigation: ${need}`);
}
// Text fitting, asserted rather than trusted. Each of these was a measured defect, and each
// is one deletion away from returning silently, because none of them changes what the page
// says -- only whether you can read all of it.
//   .leg.list      a pick list is not a figure; nowrap made it 1,051px wide inside 320px
//   champ-fig      the score is pinned so a long name, not the number, is what gives
//   min-width: 0   a grid or flex track will not shrink below min-content without it
for (const need of ['class="leg list"', 'class="date champ-fig"', "fin.tailNum", "fin.topNum",
  '<div class="bag"><h3><span>']) {
  if (!inline.includes(need)) throw new Error(`generated script lost a text-fitting fix: ${need}`);
}
for (const need of [".leg.list > b {", "a.champ-alert .champ-fig > b {",
  ".row-top > * { min-width: 0; }", ".bags > * { min-width: 0; }",
  ".mark-bar-top .names {", "@media (max-width: 360px)"]) {
  if (!html.includes(need)) throw new Error(`generated stylesheet lost a text-fitting rule: ${need}`);
}
// Numbers never truncate: every rule that pins a figure against a name that may ellipsise.
// Losing any one of them puts a value back in the position of first casualty.
const PINNED = [".row-top > .margin { flex: 0 0 auto; white-space: nowrap; }",
  ".hop > b { flex: 0 0 auto; white-space: nowrap; }",
  // The champ scoreboard's centre cell. `overflow: visible` is what exempts the score from
  // the ellipsis its two neighbours carry, so the names give way and the figure never does.
  "grid-column: 2; justify-self: center; overflow: visible;",
  ".mark-bar-top .lab { font-weight: 650; font-size: 0.85rem; flex: 0 0 auto; white-space: nowrap; }"];
for (const need of PINNED) {
  if (!html.includes(need)) throw new Error(`generated stylesheet unpinned a figure: ${need}`);
}

// News and Alerts. Every headline in this section is written by a stranger on the open internet,
// which makes it the highest-risk text this page renders. The guards below are in three groups
// and each one has already been a real defect somewhere in this app.
//
// 1. Escaping. Every field of a news row is third-party -- headline, summary, source label,
//    player and even the manager name, which comes from Sleeper. There is exactly one way any
//    of them may reach the DOM. Rather than list the fields, assert the negative: no
//    interpolation inside renderNews() may skip esc(). A `+ it.something +` that is not
//    wrapped is an injection, and it is one careless edit away at all times.
const newsFn = inline.slice(inline.indexOf("    function renderNews()"));
const newsBody = newsFn.slice(0, newsFn.indexOf("\n    function renderLeagueHome()"));
if (!newsBody || newsBody.length < 400) throw new Error("renderNews() did not ship");
// 0. It is actually called, and called inside the return rather than after it.
//
// This exact defect shipped once. Rebasing onto the League Data Sets dropdown left
// renderLeagueHome as "+ dataSetPanel();" followed by "+ renderNews();" -- a terminated return
// and then a dead expression statement. Valid JavaScript, `node --check` clean, every other
// guard below satisfied, and the feed simply absent from the page. Only the screenshot showed
// it. Assert the composition, not just the function's existence.
const homeCompose = inline.slice(inline.indexOf("    function renderLeagueHome() {"));
const homeReturn = homeCompose.slice(0, homeCompose.indexOf("\n    }"));
if (!/return[\s\S]*\+ renderNews\(\);/.test(homeReturn)) {
  throw new Error("renderLeagueHome must compose renderNews() inside its return -- a stray semicolon before it makes the feed dead code");
}
if (/;[\s\S]*\+ renderNews\(\)/.test(homeReturn)) {
  throw new Error("renderNews() sits after a terminated statement in renderLeagueHome -- it would never run");
}
for (const raw of newsBody.match(/\+ *it\.[A-Za-z_.]+/g) || []) {
  // it.also and it.published are read into locals and formatted by ago()/length before use;
  // everything else must be inside esc() at the point of concatenation.
  if (/it\.(also|published)\b/.test(raw)) continue;
  throw new Error(`renderNews interpolates a news field without esc(): ${raw.trim()}`);
}
for (const need of ["esc(it.league_line)", "esc(it.headline)", "esc(it.player)",
  "esc(it.source_label || it.source)", "esc(it.player_team)", "esc(it.player_position)",
  "esc(cat)", "esc(also)", "esc(when)", 'esc(safe) + \'" target="_blank"',
  // Manager tags: single or multi. Names go through seatLabel (esc + optional flair).
  "whoNames.map((n) => seatLabel(n))",
  // Shared-tweet citation. The full tweet_text stays off the row (link-out only); the handle
  // still ships in text and must be escaped. tweet_text remains a branch gate on the item.
  "esc(it.tweet_handle)",
  "esc(it.note)",
  '(it.submitted_by ? seatLabel(it.submitted_by) : esc("Someone"))']) {
  if (!newsBody.includes(need)) throw new Error(`renderNews stopped escaping a news field: ${need}`);
}
// A feed can ship "javascript:alert(1)" as an item link, and an <a href> is the one place on
// this page where a string becomes executable. The scheme gate is what stops it, and the
// regex's escapes have to survive the template literal -- the exact hazard that once turned
// /^pick:\d{4}:4:/ into /^pick:d{4}:4:/ and silently broke applyVa in the shipped page only.
if (!newsBody.includes('/^https?:\\/\\//i.test(url) ? url : ""')) {
  throw new Error("renderNews lost the http(s)-only href gate, or the template swallowed its escapes");
}
if (!newsBody.includes('rel="noopener noreferrer"')) {
  throw new Error("a news row opens a third-party URL in a new tab and must carry rel=noopener noreferrer");
}
// The shared tweet's link out is a second <a> on the same page and needs the same two guards.
if (!/news-tweet-link" href="' \+ esc\(xLink\)/.test(newsBody)
  || !/news-tweet-link[\s\S]{0,200}rel="noopener noreferrer"/.test(newsBody)) {
  throw new Error("the shared tweet's link out lost its esc()'d, scheme-gated href or its rel=noopener noreferrer");
}
// ...and a stricter gate than the row's, because its label promises a tweet on X. `safe`
// admits any http(s) URL, which would let a row reading "See tweet" open evil.com in a new
// tab. The backslashes have to survive the template literal, so the literal string is
// asserted rather than the behaviour -- this is the /^pick:\d{4}:4:/ hazard.
if (!newsBody.includes('/^https:\\/\\/x\\.com\\/[A-Za-z0-9_]{1,15}\\/status\\/[0-9]{1,25}$/.test(url) ? url : ""')) {
  throw new Error("the tweet link-out lost its x.com-only gate, or the template swallowed its escapes");
}
if (/news-tweet-link" href="' \+ esc\(safe\)/.test(newsBody)) {
  throw new Error("the tweet link-out reverted to the row's any-http gate, which lets a row labelled See tweet open another domain");
}
// 1b. Shared tweets are compact: locker-room line + citation, not the full tweet body.
//
// The requirement is that the row is a <div> (so See tweet is not nested inside a link --
// defect A1), that the summary ships escaped, that the citation is handle/time/link, and that
// the full tweet_text is NOT painted into the row (it ate the viewport). tweet_text still
// gates the branch so a row without oEmbed cannot ship. Each of these has a silent regression:
//
//   * Putting the full tweet back in .news-tweet-text reintroduces the sprawl.
//   * The row reverting to <a class="news-row"> for tweets would put See tweet inside a link.
//   * Dropping esc(it.league_line) would ship the roast raw or empty.
const tweetBranch = newsBody.slice(newsBody.indexOf('if (it.category === "tweet" && it.tweet_text) {'));
const tweetRender = tweetBranch.slice(0, tweetBranch.indexOf("\n        }"));
if (!tweetRender || tweetRender.length < 200) throw new Error("the shared tweet branch of renderNews() did not ship");
if (!tweetRender.includes("'<div class=\"news-row news-row-tweet\">'")) {
  throw new Error("a shared tweet row must be a <div>: an <a> around it would nest See tweet inside a link (defect A1)");
}
if (/<a class="news-row"/.test(tweetRender)) {
  throw new Error("a shared tweet row became a link, which nests See tweet inside another control (defect A1)");
}
if (!tweetRender.includes('esc(it.league_line)')) {
  throw new Error("the shared tweet must render the locker-room league_line, escaped");
}
if (!tweetRender.includes('class="news-line news-line-tweet"')) {
  throw new Error("the shared tweet summary must use the compact .news-line-tweet class");
}
if (tweetRender.includes('esc(it.tweet_text)') || tweetRender.includes("news-tweet-text")) {
  throw new Error("the full tweet_text must stay off the compact row; link out instead");
}
if (!tweetRender.includes('class="news-tweet-foot"')) {
  throw new Error("the shared tweet must ship a citation foot (handle · time · See tweet)");
}
if (!tweetRender.includes(">See tweet</a>")) {
  throw new Error('the tweet link-out must be labelled "See tweet"');
}
if (/data-news-expand|news-more|aria-expanded|Show the tweet|Hide the tweet|news-detail/.test(tweetRender)) {
  throw new Error("the shared tweet must not ship an expander or quoted detail block");
}
const linkRule = html.slice(html.indexOf("    .news-tweet-link {"));
if (!linkRule.slice(0, 300).includes("min-height: 44px")) {
  throw new Error("the tweet's link out is a tap target and must declare min-height: 44px");
}
if (html.includes("    .news-more {") || html.includes("    .news-tweet-text {") || html.includes("    .news-detail {")) {
  throw new Error("obsolete tweet expander / full-text / detail stylesheet must be gone");
}
// Admin soft-delete. Gated in the UI to TrumanCooper; the control must be a real button
// with an esc()'d item id, and its tap target must clear 44px. Absent until the admin
// seat is remembered — the markup is conditional — so assert the emitter and the CSS,
// not that every render contains the button.
if (!newsBody.includes('data-news-del="\' + esc(it.id)')) {
  throw new Error("admin Remove must put esc(it.id) in data-news-del");
}
if (!newsBody.includes("isNewsAdmin()")) {
  throw new Error("admin Remove must be gated on isNewsAdmin()");
}
if (!inline.includes('NEWS_ADMIN_UID = "458342725222133760"')) {
  throw new Error("news admin must stay pinned to TrumanCooper's Sleeper user_id");
}
const delRule = html.slice(html.indexOf("    .news-del {"));
if (!delRule.slice(0, 400).includes("min-height: 44px")) {
  throw new Error("admin Remove is a tap target and must declare min-height: 44px");
}
// Rendering X's own embed would mean running their script on this page. The whole detail panel
// exists so that the tweet can be shown as our own escaped text instead.
for (const banned of ["platform.twitter.com", "twitter-tweet", "widgets.js", "blockquote class"]) {
  if (html.includes(banned)) {
    throw new Error(`the page reaches for X's embed script or markup (${banned}) -- the tweet must be rendered as our own escaped text`);
  }
}
// 2. No marquee on the news box. League home has been animation-free since the ticker was
//    removed. The news box scrolls because a finger moves it. If an animation ever lands on it,
//    it must at minimum be pausable -- so the honest guard is that there is none.
const newsRule = html.slice(html.indexOf("    .news-box {"));
const newsCss = newsRule.slice(0, newsRule.indexOf("\n    .news-empty"));
if (/animation|@keyframes|transition: *transform/.test(newsCss)) {
  throw new Error("the news feed grew an animation -- league home has been animation-free since the ticker was removed, and a self-moving region needs a pause control (WCAG 2.2.2)");
}
for (const need of ["max-height: 420px; overflow-y: auto;", "overscroll-behavior: contain;"]) {
  if (!newsCss.includes(need)) throw new Error(`the news box lost its scroll containment: ${need}`);
}
// A scroll container that is not a tab stop is unreachable by keyboard below its fold, and an
// unnamed region is an unlabelled landmark to a screen reader.
if (!newsBody.includes('tabindex="0" role="region" aria-label="News and alerts, ')) {
  throw new Error("the news box must stay a named, focusable scroll region");
}
// 2b. The empty state, which is now the state this feed is *expected* to be in.
//
// The feed is manual submissions only, so it is genuinely bare for any member who has not
// shared anything, and it will be bare on a fresh league forever until somebody does. That
// makes the empty copy load-bearing rather than a fallback nobody sees, and it has to do two
// things a generic "nothing here" cannot: distinguish an empty feed from a broken one, and say
// how an item gets into it.
const emptyBranch = newsBody.slice(newsBody.indexOf("      if (!items.length) {"));
const emptyRender = emptyBranch.slice(0, emptyBranch.indexOf("\n      }"));
if (!emptyRender || emptyRender.length < 200) throw new Error("renderNews() lost its empty state");
// Two distinct strings on the two branches of `book`. One string for both would mean the page
// tells a user "nothing has been shared yet" when what actually happened is that news.json
// failed to load -- reassuring, and false.
// Three distinct strings: load failed, book empty, book full of soft-deleted rows. Collapsing
// any two would mean the page lies about why the box is blank.
if (!/const blank = !book\s*\n?\s*\?/.test(emptyRender) && !/const blank = book\s*\n?\s*\?/.test(emptyRender)) {
  throw new Error("the empty state must distinguish an empty feed from a feed that failed to load");
}
const emptyStrings = emptyRender.match(/"[^"]{20,}"/g) || [];
if (emptyStrings.length < 2 || new Set(emptyStrings).size < 2) {
  throw new Error("the empty feed and the failed-load feed must not print the same sentence");
}
// Soft-delete emptied the book: that is not "nothing shared yet" and not a load failure.
if (!/No posts in the feed right now/.test(emptyRender)) {
  throw new Error("the empty state must name the all-deleted case separately from never-shared");
}
// The one fact the empty state exists to carry. A member looking at a blank feed has no other
// way to learn that sharing from X is what fills it.
if (!/Nothing shared yet[\s\S]{0,200}from X/.test(emptyRender)) {
  throw new Error("the empty state must tell the reader that shares from X are what fill this feed");
}
if (!/could not be loaded/.test(emptyRender)) {
  throw new Error("the failed-load state must say the feed failed rather than that it is empty");
}
// 2c. The heading stands alone: no descriptive paragraph between it and the box.
//
// This guard used to assert the opposite -- that a caption existed and described the manual
// feed rather than the automated roster feed it replaced. The caption is now removed, so the
// guard is inverted rather than dropped: the section had two successive rewrites of this
// sentence, and each was wrong about the feed by the time it shipped. Asserting its absence is
// what stops a third from arriving.
//
// Absence alone is a weak thing to assert, so this also pins what must still be there. `head`
// has to be exactly the heading, and both branches of renderNews() -- empty and populated --
// have to return it, or removing the caption would have taken the heading with it.
const newsCaption = newsBody.match(/<p class="caption">([^<]*)<\/p>/);
if (newsCaption) {
  throw new Error("a descriptive caption came back to the news section, which was deliberately removed: " + newsCaption[1].slice(0, 80));
}
const headDecl = newsBody.match(/const head = ('|")(.*?)\1;/);
if (!headDecl) throw new Error("renderNews() lost its `head` declaration");
if (headDecl[2] !== "<h2>News and Alerts</h2>") {
  throw new Error("the news heading is no longer the whole of `head`: " + headDecl[2].slice(0, 80));
}
// Both exits compose `head`. The empty branch returns `head + ...` and the populated branch
// returns `head` as its first term; a heading dropped from either is a section with no title.
// Both exits compose `head` (+ live chrome) then the news-box. The empty branch and the
// populated branch must each still return the heading, or removing the caption would have
// taken the title with it.
if (!/return head \+ live[\s\S]{0,120}class="news-box" data-news-feed="1"[\s\S]{0,160}news-empty/.test(newsBody)) {
  throw new Error("the empty news state must still return the heading above the box");
}
if (!/return head\s*\n\s*\+ live\s*\n\s*\+ '<div class="news-box" data-news-feed="1" tabindex="0"/.test(newsBody)) {
  throw new Error("the populated news feed must still return the heading above the box");
}
// Live refresh: pull-to-refresh + poll must ship, and news.json polls must bust cache
// independently of DATA_V (NEWS_SDD §7 / §10c).
if (!inline.includes("function refreshNewsFeed(") || !inline.includes("function bindNewsFeed(")) {
  throw new Error("the news feed lost its live refresh (refreshNewsFeed / bindNewsFeed)");
}
if (!inline.includes('fetch("data/ui/news.json?news=" + Date.now())')) {
  throw new Error("live news refresh must cache-bust news.json with ?news=<timestamp>");
}
if (!inline.includes("NEWS_POLL_MS") || !inline.includes("startNewsPoll(")) {
  throw new Error("the news feed must auto-poll while the reader is on league home");
}
// 3. The 44px rule. A pass took 312 sub-44px targets to zero and none may come back. Every
//    news row is a link, so every news row is a target.
if (!html.includes(".news-row {") || !html.slice(html.indexOf(".news-row {")).slice(0, 260).includes("min-height: 44px")) {
  throw new Error("a news row is a tap target and must declare min-height: 44px");
}
// News is additive. It must never be able to take the page down with it, and it must never be
// read from a schema this UI does not know.
if (!inline.includes("news = book && book.v === 1 && Array.isArray(book.items) ? book : null;")) {
  throw new Error("news.json must be version-gated on load");
}
const newsLoad = inline.slice(inline.indexOf('const book = await getJson("data/ui/news.json");'));
if (!newsLoad.slice(0, 200).includes("catch (err) { news = null; }")) {
  throw new Error("a missing or malformed news.json must cost the news section and nothing else");
}
// News must never touch a value, a delta, a lens window or a grade. The whole point of the
// separate payload is that a headline cannot move a number, so assert the section does not
// reach for one -- this is the guard that keeps a future edit from blending news into the book.
for (const banned of ["today_delta", "value_adjust", "applyVa", "windowScore", "tapeMargin", "signedNum", "fmt("]) {
  if (newsBody.includes(banned)) {
    throw new Error(`renderNews touched the value book: ${banned} -- news is not allowed to move a number`);
  }
}

// ---------------------------------------------------------------------------------------------
// Nothing on this page may move itself. This is the claim the ticker's removal buys, and it is
// the last check in the file on purpose.
//
// Before the removal, league home ran a 48-second marquee with no pause control -- the app's
// only WCAG 2.2.2 failure and, measured across the whole document, its only running animation.
// With it gone the count is zero, which means the guard can be a negative over the entire
// stylesheet instead of a list of animation names that could never be complete.
//
// It runs LAST because it subsumes every scoped animation guard above it -- the .news-box one in
// particular. Placed earlier it would answer first, and the scoped guard would become a check
// that cannot fail, which is the failure mode 3a exists to record. Ordered this way each scoped
// guard still fires on its own region with its own message, and this one catches the rest of the
// page.
//
// Comments are stripped first: the notes above .alert-row and .news-box both discuss animation
// at length, and a naive substring check would be satisfied by prose forever.
const sheetRules = html
  .slice(html.indexOf("<style>"), html.indexOf("</style>"))
  .replace(/\/\*[\s\S]*?\*\//g, "");
if (/@keyframes/.test(sheetRules)) {
  throw new Error("the stylesheet grew a @keyframes -- this page has had no self-animating region since the ticker was removed, and a new one needs a pause control (WCAG 2.2.2)");
}
if (/(^|[;{\s])animation(-[a-z]+)?\s*:/.test(sheetRules)) {
  throw new Error("the stylesheet grew an animation property -- nothing on this page may move itself without a pause control (WCAG 2.2.2)");
}
// The reduced-motion branch existed only to stop the ticker. An empty one left behind would read
// as though something still moves, and the next author would write into it.
if (/prefers-reduced-motion/.test(sheetRules)) {
  throw new Error("a prefers-reduced-motion branch survived the ticker -- there is no motion left for it to reduce; delete it, or the motion it guards is unasserted");
}
// ---------------------------------------------------------------------------------------------

fs.writeFileSync(`${ROOT}index.html`, html);
console.log(JSON.stringify({ page: `${ROOT}index.html` }, null, 2));
