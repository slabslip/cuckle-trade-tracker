# Projected finish — app leverage plan

**Status:** v1 shipping with [`PROJECTED_FINISH_SDD.md`](../PROJECTED_FINISH_SDD.md).  
**Direction:** Tonight’s Cuckle session — make the live race the spine for pick
bands and manager homepage insights, without a sixth tab.

---

## What we renamed / added

| Was | Now |
| --- | --- |
| How I finished | **Manager avg finish** (career, completed seasons) |
| (bag-window pick bands only) | **Projected finish** door + SoS book |

---

## Homepage / dashboard targeting (per manager)

When a seat is claimed, every surface should answer four questions:

1. **Where am I?** — place now, projected finish, pick band (team home caption).
2. **Who is climbing / falling?** — `delta_place` on the league board.
3. **Whose picks are Early?** — Draft picks hub columns + deal lines.
4. **Who should I ping?** — Team Ideas / fill-holes weighted toward:
   - Win-now seats holding **your** Early origin
   - Tank seats holding Late capital you can buy with youth
   - Mid board seats with PF/PA mismatch (soft schedule still ahead)

### Surface map

```text
Home (pill)
  └─ top doors can pin Projected finish (default board includes it)
  └─ Team Ideas (later): “Chase Chief’s Early” from proj band

Teams → seat home
  └─ Projected Nth · record · PF/PA · band + League board chip
  └─ Team analyzer stays bag truth; proj is race truth

League Data
  └─ Manager avg finish (career)
  └─ Projected finish (this season)
  └─ Draft picks (bands from proj book for 2027)

Calculator
  └─ Open from pick hub with Early already on their bag
```

---

## Full app review — keep / cut / build

### Keep (law)

- Five tabs: Home | Teams | News | Ledger | Menu
- Pipeline owns arithmetic; browser formats
- Votes / Ledger / News never write the needle
- Overnight letter as morning paper (dynasty)
- Cosmetics Wave 1 paired catalog

### Build next (from this spine)

Full sequence (icons, arcs, archetypes, proxy-first incentive):
[`manager_intel_spine.md`](./manager_intel_spine.md).

Phase A–C (shipping on manager-intel build):

1. **Race movers on overnight letter** when `|delta_place| ≥ 1`
2. **Team Ideas** weighted by proj band + archetype (proxy / bubble / tank)
3. **Who has firsts** sorted by projected slot (holder · origin · proxy tag)
4. **Season arcs** + **Manager type** doors + team-home archetype caption

### Do not

- Sixth tab named “Standings”
- Merge PR #108’s four top-tab chrome
- Floor today with MIN_ACTIVE
- Write proj slot into DynastyProcess price keys

---

## Success check

A manager opens their seat and in one glance knows: record, projected place,
whether they are Early/Mid/Late for 2027, and can jump to the league board or
calc a pick chase — without leaving the five-tab spine.
