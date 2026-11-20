// The tree's data and every change to it, as plain functions (no Herdr calls), so the
// sidebar, its popups and the agent API all change it the same way.
//
// v2, in shared "spaces-tree.tree":
//   { v: 2,
//     groups:  [{ id, name, parent: groupId | null, color: string | null }]   (sibling order = array order)
//     of:      { spaceId: groupId }                                           (a space's group)
//     folded:  [groupId], open: [spaceId]                                     (folded groups, spaces showing agents)
//     dormant: [{ id, name, folder, argv: string[] | null, machine: string | null,
//                 group: groupId | null, space: spaceId | null }] }          (space: the open space it backs)
// v1, in shared "spaces-tree.groups": { order: [name], of: { spaceId: name }, folded: [name], open: [spaceId] }.
// v1 is read once and never written, so it stays as it was.

export const TREE = "spaces-tree.tree";
export const V1 = "spaces-tree.groups";

export const empty = () => ({ v: 2, groups: [], of: {}, folded: [], open: [], dormant: [] });

// Friendly color names, stored as the avatar palette's names.
export const COLOR_NAMES = { teal: "ansi6", orange: "ansi3", blue: "ansi4", purple: "ansi5", green: "ansi2", pink: "ansi1" };

export class TreeError extends Error {}
const fail = (msg) => { throw new TreeError(msg); };

// v1 → v2. Deterministic ids (g1, g2, ...): the result is the same on every read until it is saved.
export function migrate(v1) {
  const t = empty();
  if (!v1 || !Array.isArray(v1.order)) return t;
  const ids = {};
  v1.order.forEach((name, i) => {
    if (typeof name !== "string" || ids[name]) return;
    ids[name] = `g${i + 1}`;
    t.groups.push({ id: ids[name], name, parent: null, color: null });
  });
  for (const [space, name] of Object.entries(v1.of ?? {})) if (ids[name]) t.of[space] = ids[name];
  t.folded = (v1.folded ?? []).map((n) => ids[n]).filter(Boolean);
  t.open = [...(v1.open ?? [])];
  return t;
}

// Whatever was stored, as a well-formed v2 tree: unknown parents go to the top, loops are cut.
export function normalize(raw) {
  const t = empty();
  if (!raw || typeof raw !== "object") return t;
  const seen = new Set();
  for (const g of Array.isArray(raw.groups) ? raw.groups : []) {
    if (!g || typeof g.id !== "string" || seen.has(g.id) || typeof g.name !== "string") continue;
    seen.add(g.id);
    t.groups.push({ id: g.id, name: g.name, parent: typeof g.parent === "string" ? g.parent : null, color: typeof g.color === "string" ? g.color : null });
  }
  for (const g of t.groups) if (g.parent && !seen.has(g.parent)) g.parent = null;
  for (const g of t.groups) {   // a parent chain that comes back to itself: cut it here
    const path = new Set([g.id]);
    for (let p = g.parent; p; p = byId(t, p)?.parent ?? null) {
      if (path.has(p)) { g.parent = null; break; }
      path.add(p);
    }
  }
  for (const [s, gid] of Object.entries(raw.of ?? {})) if (seen.has(gid)) t.of[s] = gid;
  t.folded = (Array.isArray(raw.folded) ? raw.folded : []).filter((id) => seen.has(id));
  t.open = (Array.isArray(raw.open) ? raw.open : []).filter((id) => typeof id === "string");
  const dseen = new Set();
  for (const d of Array.isArray(raw.dormant) ? raw.dormant : []) {
    if (!d || typeof d.id !== "string" || dseen.has(d.id) || typeof d.name !== "string" || typeof d.folder !== "string") continue;
    dseen.add(d.id);
    t.dormant.push({
      id: d.id, name: d.name, folder: d.folder,
      argv: Array.isArray(d.argv) && d.argv.length && d.argv.every((a) => typeof a === "string") ? [...d.argv] : null,
      machine: typeof d.machine === "string" && d.machine ? d.machine : null,
      group: seen.has(d.group) ? d.group : null,
      space: typeof d.space === "string" ? d.space : null,
    });
  }
  return t;
}

// The tree to show: v2 if saved, else v1 migrated, else empty.
export function load(v2, v1) {
  return v2 && v2.v === 2 ? normalize(v2) : migrate(v1);
}

export const clone = (t) => JSON.parse(JSON.stringify(t));
export const byId = (t, id) => t.groups.find((g) => g.id === id) ?? null;
export const children = (t, parent) => t.groups.filter((g) => g.parent === parent);
export const roots = (t) => children(t, null);

export function depthOf(t, id) {
  let n = 0;
  for (let g = byId(t, id); g?.parent; g = byId(t, g.parent)) n++;
  return n;
}

export function pathOf(t, id) {
  const names = [];
  for (let g = byId(t, id); g; g = g.parent ? byId(t, g.parent) : null) names.unshift(g.name);
  return names.join("/");
}

// The group and every group under it.
export function subtree(t, id) {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const g of t.groups) if (g.parent && out.has(g.parent) && !out.has(g.id)) { out.add(g.id); grew = true; }
  }
  return out;
}

// Groups in the order the sidebar shows them (a group, then the groups under it): id -> rank.
export function ranks(t) {
  const rank = {};
  let n = 0;
  const visit = (parent) => { for (const g of children(t, parent)) { rank[g.id] = n++; visit(g.id); } };
  visit(null);
  return rank;
}

// A group by id, by path ("Personal/Tools") or by a name only one group has. Case doesn't matter.
export function resolve(t, ref) {
  if (ref === null || ref === undefined || ref === "") return null;
  if (typeof ref !== "string") fail("a group is named by its id, its path or its name");
  if (byId(t, ref)) return ref;
  const want = ref.replace(/^\/+|\/+$/g, "").toLowerCase();
  if (ref.includes("/")) {
    const hit = t.groups.find((g) => pathOf(t, g.id).toLowerCase() === want);
    return hit ? hit.id : fail(`no group "${ref}"`);
  }
  const hits = t.groups.filter((g) => g.name.toLowerCase() === want);
  if (hits.length > 1) fail(`more than one group is called "${ref}" (${hits.map((g) => pathOf(t, g.id)).join(", ")}): use its path or id`);
  return hits.length ? hits[0].id : fail(`no group "${ref}"`);
}

function checkName(t, name, parent, except) {
  if (typeof name !== "string" || !name.trim()) fail("a group needs a name");
  name = name.trim();
  if (name.includes("/")) fail('a group name cannot contain "/"');
  const twin = children(t, parent).find((g) => g.id !== except && g.name.toLowerCase() === name.toLowerCase());
  return { name, twin };
}

export function checkColor(color) {
  if (color === null || color === undefined || color === "") return null;
  if (typeof color !== "string") fail("a color is a name, ansi0..ansi15 or #rrggbb");
  const c = color.trim().toLowerCase();
  if (COLOR_NAMES[c]) return COLOR_NAMES[c];
  if (/^ansi(1[0-5]|[0-9])$/.test(c) || /^#[0-9a-f]{6}$/.test(c)) return c;
  fail(`unknown color "${color}": use ${Object.keys(COLOR_NAMES).join(", ")}, ansi0..ansi15 or #rrggbb`);
}

function newId(t, prefix) {
  const taken = new Set([...t.groups.map((g) => g.id), ...t.dormant.map((d) => d.id)]);
  for (let n = 1; ; n++) {
    const id = `${prefix}${Date.now().toString(36).slice(-4)}${n}`;
    if (!taken.has(id)) return id;
  }
}

// Each change below edits `t` in place and returns what the caller reports.

// Adding a group that is already there (same name, same parent) returns it: agents can repeat a step.
export function addGroup(t, { name, parent = null, color = null }) {
  const pid = resolve(t, parent);
  const checked = checkName(t, name, pid);
  if (checked.twin) {
    if (color !== null && color !== undefined) checked.twin.color = checkColor(color);
    return { id: checked.twin.id, path: pathOf(t, checked.twin.id), existed: true };
  }
  const id = newId(t, "g");
  t.groups.push({ id, name: checked.name, parent: pid, color: checkColor(color) });
  return { id, path: pathOf(t, id), existed: false };
}

export function renameGroup(t, { group, name }) {
  const id = resolve(t, group) ?? fail("which group?");
  const g = byId(t, id), checked = checkName(t, name, g.parent, id);
  if (checked.twin) fail(`"${checked.name}" is already a group there`);
  g.name = checked.name;
  return { id, path: pathOf(t, id) };
}

// What was in it goes up one level (to no group at the top).
export function removeGroup(t, { group }) {
  const id = resolve(t, group) ?? fail("which group?");
  const up = byId(t, id).parent;
  for (const g of t.groups) if (g.parent === id) g.parent = up;
  for (const [s, gid] of Object.entries(t.of)) if (gid === id) { if (up) t.of[s] = up; else delete t.of[s]; }
  for (const d of t.dormant) if (d.group === id) d.group = up;
  t.groups = t.groups.filter((g) => g.id !== id);
  t.folded = t.folded.filter((f) => f !== id);
  return { id, movedTo: up };
}

// parent null: the top level. before: a sibling to go in front of; else it goes last.
export function moveGroup(t, { group, parent = null, before = null }) {
  const id = resolve(t, group) ?? fail("which group?");
  const pid = resolve(t, parent);
  if (pid && subtree(t, id).has(pid)) fail("a group cannot go inside itself");
  const g = byId(t, id);
  if (checkName(t, g.name, pid, id).twin) fail(`there is already a group "${g.name}" there`);
  t.groups = t.groups.filter((x) => x.id !== id);
  g.parent = pid;
  const bid = resolve(t, before);
  if (bid && byId(t, bid)?.parent !== pid) fail("before: a group in the same place");
  const at = bid ? t.groups.findIndex((x) => x.id === bid) : t.groups.length;
  t.groups.splice(at, 0, g);
  return { id, path: pathOf(t, id) };
}

export function colorGroup(t, { group, color }) {
  const id = resolve(t, group) ?? fail("which group?");
  byId(t, id).color = checkColor(color);
  return { id, color: byId(t, id).color };
}

export function foldGroup(t, { group, folded }) {
  const id = resolve(t, group) ?? fail("which group?");
  const set = new Set(t.folded);
  if (folded === undefined ? !set.has(id) : folded) set.add(id); else set.delete(id);
  t.folded = [...set];
  return { id, folded: set.has(id) };
}

// group null: out of every group. A dormant entry that backs the space moves with it.
export function putSpace(t, { space, group = null }) {
  if (typeof space !== "string" || !space) fail("which space?");
  const gid = resolve(t, group);
  if (gid) t.of[space] = gid; else delete t.of[space];
  for (const d of t.dormant) if (d.space === space) d.group = gid;
  return { space, group: gid, path: gid ? pathOf(t, gid) : null };
}

export function resolveDormant(t, ref) {
  if (typeof ref !== "string" || !ref) fail("which dormant entry?");
  const exact = t.dormant.find((d) => d.id === ref);
  if (exact) return exact;
  const hits = t.dormant.filter((d) => d.name.toLowerCase() === ref.toLowerCase());
  if (hits.length > 1) fail(`more than one dormant entry is called "${ref}": use its id`);
  return hits[0] ?? fail(`no dormant entry "${ref}"`);
}

export function addDormant(t, { name, folder, argv = null, machine = null, group = null, space = null }) {
  if (typeof name !== "string" || !name.trim()) fail("a dormant entry needs a name");
  if (typeof folder !== "string" || !folder.trim()) fail("a dormant entry needs a folder");
  if (argv !== null && argv !== undefined && !(Array.isArray(argv) && argv.length && argv.every((a) => typeof a === "string"))) fail("argv is a list of strings");
  if (space && t.dormant.some((d) => d.space === space)) fail(`space ${space} already backs a dormant entry`);
  const gid = resolve(t, group);
  const id = newId(t, "d");
  t.dormant.push({ id, name: name.trim(), folder: folder.trim(), argv: argv?.length ? [...argv] : null, machine: machine || null, group: gid, space: space || null });
  if (space) { if (gid) t.of[space] = gid; else delete t.of[space]; }
  return { id, group: gid };
}

export function putDormant(t, { dormant, group = null }) {
  const d = resolveDormant(t, dormant);
  d.group = resolve(t, group);
  if (d.space) { if (d.group) t.of[d.space] = d.group; else delete t.of[d.space]; }
  return { id: d.id, group: d.group };
}

// Forgets the entry; an open space it backs stays open, as a plain space.
export function removeDormant(t, { dormant }) {
  const d = resolveDormant(t, dormant);
  t.dormant = t.dormant.filter((x) => x.id !== d.id);
  return { id: d.id, space: d.space };
}

// The spaces of dormant entries that are gone (closed): those entries sleep again, where the
// space last was. `live(space)`: true while it exists; null when that can't be known yet.
export function settle(t, live) {
  let changed = false;
  for (const d of t.dormant) {
    if (!d.space || live(d) !== false) continue;
    if (t.of[d.space] && byId(t, t.of[d.space])) d.group = t.of[d.space];
    delete t.of[d.space];
    t.open = t.open.filter((s) => s !== d.space);
    d.space = null;
    changed = true;
  }
  return changed;
}
