# Spaces Tree

Your [Herdr](https://herdr.dev) spaces as a folder tree, with their agents inside.

![Spaces Tree](preview.png)

*The picture shows the mod's demo data (`props { demo: true }`), not a real project.*

## What it does

- **Groups you name.** A group is a folder row (Work, Side projects, ...) with its spaces under it, joined by tree lines. A click folds it. Spaces in no group stay at the top.
- **Agents in the same tree.** A space with agents has a chevron that opens them: one row per agent with its program's logo and what it is on. A click shows that agent. It replaces the separate Agents list.
- **States as icons.** A green ring that turns: active. A red "!": needs you. An orange dot: finished and not looked at yet. A grey ring: idle. A closed space and a folded group show the loudest state of what is inside.
- **Moving a space:** drag it onto a folder, or hover it and press **⋯** to pick a group, leave its group, or type a new group's name. A right click on a folder renames or deletes the group.
- Everything else is Herdr's own spaces list: colored avatars, worktrees under their checkout, drag to reorder, the space menu on right click, machines.

## Install

Built and tested on **Herdr app 0.1.16 with herdr-core 0.1.21**, macOS. It is a fork of the `spaces` mod of Herdr 0.1.15.

Ask your agent in Herdr:

> Add the mod herdr.dev/mods/klinter007/herdr-spaces-tree and use it in my sidebar in place of spaces and agents

Or by hand: copy the folder, then in your own layout file (`~/.config/herdr-app/layouts/<name>.json`; clone the shipped layout first with `layout.clone`) change the sidebar's `spaces` block to this mod and remove the `agents` block:

```sh
git clone https://github.com/klinter007/herdr-spaces-tree
cp -R herdr-spaces-tree/mods/spaces-tree ~/.config/herdr-app/mods/
herdr-app check ~/.config/herdr-app/mods/spaces-tree
```

```json
{ "id": "spaces", "type": "block", "content": { "mod": "spaces-tree" } }
```

## Good to know

- The mod puts your spaces in the tree's order in Herdr too, so next and previous space follow the groups.
- The groups are kept in Herdr's shared state (`spaces-tree.groups`).
- You see an agent only when its space is open in the tree; a closed space shows the count and the loudest state.

## License

The changes are MIT. The base is Herdr's `spaces` mod; see [LICENSE](LICENSE).
