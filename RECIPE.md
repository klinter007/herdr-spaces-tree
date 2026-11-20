# Spaces Tree

The sidebar's spaces list as a folder tree. A person (or an agent, from a shell) puts spaces in groups they name, and groups in groups; each group is a folder row with what it holds under it, and each space opens to show its agents with their state. A group can also hold dormant entries: projects with no open space, which open one on a click.

![Spaces Tree](preview.png)

**What you see:**

- Everything Herdr's `spaces` mod shows (this is a fork of it, 0.1.15): the "Spaces" header with +, a 30 px row per space with an 18 px colored avatar, the name, and the repo or branch at the right; machines as headers when there is more than one.
- Spaces in no group first, then dormant entries in no group, then one folder row per top-level group, 28 px: a chevron, a folder icon (open and `accent` when open, closed and `muted` when folded, or the group's own color), the name, the number of spaces inside it at any depth at the right. A folded folder also shows the loudest state inside it, at any depth.
- Under an open folder: its spaces, its dormant entries, then its groups, each one level (18 px) further in.
- The tree's guides: each level has a 1 px line under the chevron of the row it comes from, and a 9 px tick to each row; the last row of a level ends its line at the tick. A line goes on past a nested group while its own level has more rows below.
- Every space row starts with a 10 px chevron when it has agents. Closed: the loudest state and the number of agents at the right. Open: one 24 px row per agent under it, with its own guide, a 12 px state icon, the program's logo (13 px), the tab's name or the agent's title, and the title in `dim` after a named tab.
- A dormant entry: a 30 px row with a hollow 18 px avatar (a 1 px `dim` border and letter), its name in `muted`, and "open" in `dim` when hovered ("opening…" while its space starts).
- States: working `#3fae6a` (the shipped spinner, turning), blocked `#e5534b` (a disc with "!"), done `#e8a23d` (a dot), idle (a ring in `dim`). Loudest first: blocked, working, done.
- Hovering a space shows "⋯" at its right.

**How it behaves:**

- A click on a folder folds or opens it. A click on a space's chevron opens or closes its agents. A click on an agent runs `agent.focus { terminal }`.
- Drag a space onto a folder: it joins that group. Drag a folder onto another folder: it goes inside it (not into itself or a group under it). Drop either on the "Spaces" title: out of every group. Drop a space on another space: it goes beside it and into that space's group.
- "⋯" opens a popup: every group, indented by depth (the current one ticked), "No group", and a field for a new group (a path such as `Clients/Acme` makes each group on the way). A right click on a folder: rename it, "Move to the top level" (a nested one), or delete it; what it held goes up one level.
- A click on a dormant entry runs `space.new { name, folder, argv, machine }`, waits for the new space and files it where the entry is. While that space is open the entry is not drawn; the space is. When the space closes (its machine's layout is readable and the space is gone), the entry sleeps again in the group the space was last in. A right click on it: "Open a space here" or "Remove from the tree".
- The spaces are kept in the tree's order in Herdr (`space.move`), so space.next and space.prev follow it.
- `props { demo: true }` shows made-up spaces, nested groups, dormant entries and agents and changes nothing.

**The agent API:**

- `bin/spaces-tree` (python3) writes `<app home>/data/spaces-tree/inbox/<time>-<random>.json` = `{ op, args }` (by a hidden temp file and a rename), runs `herdr-app do spaces-tree.inbox`, and waits for `outbox/<same>.json` = `{ ok: true, ... }` or `{ ok: false, error }`, which it prints and deletes. Exit 0, 1 (refused) or 2 (no answer: it deletes its request; if the request is already gone, it says the outcome is unknown).
- The sidebar copy (not a popup, not the demo, not during `herdr-app check`) makes both folders, removes answers older than 10 minutes, then handles the inbox on start, on every `watchFolder(inbox)` wake and on the `inbox` command. One request at a time, in name order. It claims each by creating `outbox/<id>.claim` (`writeTextFile` with `expected: null`), so two copies never both apply one.
- Ops: `list`, `group.add {name, parent?, color?}` (an existing name in that place returns it with `existed: true`), `group.rename {group, name}`, `group.rm {group}`, `group.move {group, parent, before?}`, `group.color {group, color}`, `group.fold {group, folded?}`, `space.put {space, group, first?, before?}`, `dormant.add {name, folder, argv?, machine?, group?} | {space, ...}`, `dormant.put {dormant, group}`, `dormant.rm {dormant}`, `dormant.open {dormant, focus?}`.
- A group is its id, its path, or a name only one group has (case doesn't matter); a space is its id or a unique name; a dormant entry is its id or a unique name.

**Built from:**

- `mods/spaces-tree/`: `main.js` (Herdr's `spaces` with the additions), `tree.js` (the tree's data and every change to it, plain functions), `bin/spaces-tree`, `mod.json`, `folder.svg`, `folder-open.svg`. It uses the shipped `mods/workspace-chrome/*.svg` and opens the shipped `menu` mod for a space's menu.
- The tree: shared `spaces-tree.tree` = `{ v: 2, groups: [{ id, name, parent, color }], of: { spaceId: groupId }, folded: [groupId], open: [spaceId], dormant: [{ id, name, folder, argv, machine, group, space }] }`. Sibling order is array order. Until the first change it is read from v1's `spaces-tree.groups` (`{ order: [name], of, folded, open }`) with ids `g1`, `g2`, ... in order; v1 is never written.
- `herdr`: as `spaces`, plus `agents()`, `props`, `closeOverlay`, `appHome`, `checking`, `nextCommand`, `writeTextFile`, `watchFolder`, `fs/promises`; `gpui-base`: `InputState`, `Input` for the popups, which are this same mod opened with `openOverlay({ mod: "spaces-tree", kind: "popup", props: { pick: spaceId } | { group: groupId } | { dormant: entryId } })`. A popup's "Open a space here" sets shared `spaces-tree.wake = { id, at }`, and the sidebar copy opens it: a popup's own tasks stop when it closes.

**Watch out:**

- In the narrow rail (the sidebar under 160 px) there are no folders, only the spaces.
- The demo must never write shared state: it skips the tree and color saves.
- A worktree space goes with its checkout's group.
- `run("space.new")` returns nothing: the new space is the one that was not there before (by name, else the only new one), looked for every 100 ms for 10 s.
- A dormant entry goes back to sleep only once its machine's layout is `ready`: at start, or with a machine away, a missing space is not yet a closed one.
- The shipped `spaces` mod changes with Herdr; this fork does not take those changes by itself.

**Done when:**

- `herdr-app check ~/.config/herdr-app/mods/spaces-tree` passes.
- With `props { demo: true }` it shows seven spaces and two dormant entries: one space at the top, Work with a Design group inside it, Side projects, and Home folded; the first space open with four agents.
- `spaces-tree group add C --parent A/B` makes a third level, and `spaces-tree list` shows it.
- A space dragged onto a folder shows under it, and still does after a restart.
- `spaces-tree dormant open X` opens a space in the entry's group; closing that space shows the entry again.
- A folded folder with a blocked agent anywhere inside shows the red "!".
