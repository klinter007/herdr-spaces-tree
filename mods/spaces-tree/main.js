// Workspace spaces: stable colored avatars, worktrees under their checkout,
// grouped by machine when more than one is known. After a space's name, the repo
// its first terminal is in now, only where unusual: branch, ahead/behind. Agent state lives in the agents list, not here. Click to
// switch, right-click for its menu, drag to reorder.
//
// spaces-tree, a fork of Herdr's spaces: spaces also sit in groups the person names (Work,
// Personal, ...). A group is a header row with its spaces under it; a click folds it, and a
// folded group still says when a space in it works or needs you. Drag a space onto a header,
// or use the dots at the right of a hovered row, to move it. A right click on a header renames
// or deletes the group. Spaces in no group come first. The groups live in shared GROUPS.
// The agents are in the same tree, in place of the separate Agents list: a space with agents has
// a chevron that opens them, one row each, with its state as an icon: active (a green ring that
// turns), needs you (red "!"), finished and not looked at yet (an orange dot), idle (a grey
// ring). A closed space, and a folded group, show the loudest state of what is inside.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, machines, panes, agents, run, openOverlay, closeOverlay, props, exec, hc, theme, shared, setShared, watchFolder, window, layout } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// Where a space is now: its first terminal's live folder, else where it was made.
// `ps`: panes(), read once by the caller (each read copies every pane).
function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}
const rowHeight = ({ tree }) => (tree ? 28 : 30);
const RAIL_CELL = 32;
const railCell = (el) => h_flex().flex_none().justify_center().child(el);
const where = (s, ps) => JSON.stringify([s.machine ?? null, place(s, ps)]);
const base = (path) => path.replace(/\/+$/, "").split("/").pop();
// Changes made outside Herdr (an editor's save, a commit in another app): looked
// for this often, in repos the list shows, while the window is in front.
const FALLBACK = 60000;

// What a stored color name looks like on an avatar (the same in every mod
// that draws space avatars): one strong color per hue, light and dark alike.
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };

// A space speaks up only when something in it needs you.
export function glyph(status) {
  return status === "blocked" || status === "done" ? "●" : "·";
}

export function tone(t, status) {
  return t[status] ?? t.unknown;
}

// An agent's state, as the tree marks it. The loudest first.
const LOUD = ["blocked", "working", "done", "idle"];
const STATE = { working: "#3fae6a", blocked: "#e5534b", done: "#e8a23d" };
const LOGO = { "claude-code": "icons/claude.svg", codex: "icons/codex.svg", "cursor-agent": "icons/cursor.svg", pi: "icons/pi.svg", gemini: "icons/gemini.svg", grok: "icons/grok.svg" };
function stateIcon(t, status, size = 12) {
  if (status === "working") return svg("mods/workspace-chrome/spinner.svg").size(size).flex_none().text_color(STATE.working).spin(900);
  if (status === "blocked") return div().size(size).flex_none().rounded_full().bg(STATE.blocked).flex().items_center().justify_center().text_size(size - 3.5).font_bold().text_color("#ffffff").child("!");
  if (status === "done") return div().w(size).h(size).flex_none().flex().items_center().justify_center().child(div().size(size - 4).rounded_full().bg(STATE.done));
  return div().w(size).h(size).flex_none().flex().items_center().justify_center().child(div().size(size - 4).rounded_full().border(1.5).border_color(t.dim));
}
const loudest = (list) => LOUD.find((s) => list.some((a) => a.status === s)) ?? null;

// The groups: { order: [name], of: { spaceId: name }, folded: [name], open: [spaceId] }.
const GROUPS = "spaces-tree.groups";
const EMPTY = { order: [], of: {}, folded: [], open: [] };
// props { demo: true }: made-up spaces and agents, for a picture of the mod.
const DEMO = {
  groups: { order: ["Work", "Side projects", "Home"], of: { s1: "Work", s2: "Work", s3: "Work", s4: "Side projects", s5: "Side projects", s6: "Home" }, folded: ["Home"], open: ["s1"] },
  colors: { s0: "ansi5", s1: "ansi4", s2: "ansi3", s3: "ansi6", s4: "ansi2", s5: "ansi1", s6: "ansi4" },
  spaces: [["s0", "scratch"], ["s1", "shop-api", true], ["s2", "mobile-app"], ["s3", "design-system"], ["s4", "recipe-bot"], ["s5", "chess-engine"], ["s6", "home-server"]],
  agents: [
    { address: "a1", space: "s1", status: "working", app: "claude-code", tab_name: "coordinator", title: "Plan the checkout rewrite", seq: 9 },
    { address: "a2", space: "s1", status: "working", app: "codex", tab_name: "checkout", title: "Cart totals and tax", seq: 8 },
    { address: "a3", space: "s1", status: "blocked", app: "claude-code", tab_name: "payments", title: "Which provider first?", seq: 7 },
    { address: "a4", space: "s1", status: "done", app: "claude-code", tab_name: "docs", title: "API reference", seq: 6 },
    { address: "a5", space: "s2", status: "working", app: "claude-code", tab_name: "1", title: "Fix the login screen", seq: 5 },
    { address: "a6", space: "s3", status: "idle", app: "cursor-agent", tab_name: "1", title: "Button variants", seq: 4 },
    { address: "a7", space: "s4", status: "done", app: "codex", tab_name: "1", title: "Parse ingredient lists", seq: 3 },
    { address: "a8", space: "s5", status: "idle", app: "claude-code", tab_name: "1", title: "Move ordering", seq: 2 },
    { address: "a9", space: "s6", status: "blocked", app: "claude-code", tab_name: "1", title: "Backup schedule", seq: 1 },
  ],
};
const demo = () => Boolean(props()?.demo);
const groups = () => (demo() ? DEMO.groups : shared(GROUPS) ?? EMPTY);
const saveGroups = (g) => { if (!demo()) setShared(GROUPS, { order: [...g.order], of: { ...g.of }, folded: [...(g.folded ?? [])], open: [...(g.open ?? [])] }); };
const allAgents = () => (demo() ? DEMO.agents : agents());

export default class Spaces extends View {
  init(_props, cx) {
    // The popups this mod opens over itself: a space's group, a group's name.
    if (props()?.pick || props()?.group) {
      this.popup = true;
      this.input = InputState.new({ placeholder: props()?.group ? "New name" : "New group…", value: props()?.group ?? "" });
      this.input.on("submit", (_e, cx) => this.entered(cx));
      cx.timer.after(0, () => this.input.focus());
      return;
    }
    this.hot = null; // the row under the pointer
    this.git = {}; // where() -> { name, branch, ahead, behind, repo, linked }, null: not a repo
    this.checked = {}; // where() -> when it was last looked at
    this.unsure = new Set(); // where()s git couldn't answer for (a machine away)
    this.pending = new Set(); // where()s to look at next
    this.busy = {}; // pane -> an agent working or a program in front of its shell
    this.ready = {}; // machine -> its layout was readable at the last look
    this.at = {}; // space -> its where() at the last look
    this.watching = new Set(); // local repos' git folders
    // Spaces made while this runs wait (at most a moment) for their git, so a
    // worktree appears under its repo instead of jumping there.
    this.shown = new Set(spaces().map((s) => s.id));
    this.born = {};
    this.pressed = null;
    this.over = null;
    this.machines = [];
    this.reconnecting = JSON.parse(localStorage.getItem("machines.reconnecting") ?? "{}");
    for (const state of Object.values(this.reconnecting)) state.busy = false;
    this.folded = new Set(JSON.parse(localStorage.getItem("machines.folded") ?? "[]"));
    this.refreshMachines(cx);
    cx.timer.every(15000, cx => this.refreshMachines(cx));
    // Refresh only when the refs could have changed (see `due`).
    cx.timer.every(250, (cx) => this.checkNew(cx));
  }

  checkNew(cx) {
    const now = Date.now();
    const sp = spaces();
    for (const s of sp) if (!this.shown.has(s.id)) this.born[s.id] ??= now;
    const due = this.due(now, sp, panes());
    if (due.size) this.refreshGit(due, cx);
    if (sp.some((s) => !this.shown.has(s.id)) || this.orderingDue(now)) cx.notify();
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a
  // command or an agent's turn just ended (a checkout, a commit, edits), those on
  // a machine that is back, and repos in view whose fallback is due.
  due(now, sp, ps) {
    // Moved there: what it knew of that place may be old.
    const at = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set(Object.values(at).filter((k) => JSON.parse(k)[1]));
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const busy = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
    }
    this.busy = busy;
    for (const m of machines()) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (JSON.parse(k)[0] === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    if (window().active) {
      for (const k of keys) {
        const asks = this.git[k] || this.unsure.has(k);
        if (asks && !this.folded.has(JSON.parse(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
      }
    }
    return due;
  }

  // `key` and the other places in its repo (a commit there moves their ahead/behind).
  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  refreshMachines(cx) {
    cx.spawn(async cx => {
      try { const r = await hc(["machine", "ls", "--json"]); if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary); } catch {}
      cx.notify();
    });
  }

  rebuilt(machine) {
    return machine?.state === "unreachable" && /^a different core answers there \("[^"]+"\)$/.test(machine.why ?? "");
  }

  reconnect(machine, cx) {
    const name = machine.name;
    if (this.reconnecting[name]?.busy) return;
    const state = this.reconnecting[name] ??= { machine, removed: false };
    state.busy = true;
    state.error = null;
    localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
    cx.notify();
    cx.spawn(async cx => {
      try {
        const ask = async args => {
          const r = await hc([...args, "--json"]);
          if (r.code !== 0) {
            let error;
            try { error = JSON.parse(r.stdout || r.stderr).error?.message; } catch {}
            throw new Error(error || r.stderr || r.stdout || "Couldn't connect.");
          }
        };
        if (!state.removed) {
          await ask(["machine", "rm", name]);
          state.removed = true;
          localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
        }
        const args = ["machine", "add"];
        if (machine.via) args.push("--via", machine.target);
        else args.push(machine.target);
        args.push("--name", name);
        if (machine.session) args.push("--session", machine.session);
        if (machine.temporary) args.push("--temp");
        await ask(args);
        this.folded.delete(name);
        localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
        delete this.reconnecting[name];
      } catch (e) {
        state.error = String(e.message ?? e);
        state.busy = false;
      }
      localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
      this.refreshMachines(cx);
      cx.notify();
    });
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  refreshGit(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const keys = [...this.pending];
        this.pending.clear();
        await Promise.all(keys.map((key) => this.check(key, cx)));
      }
      const used = new Set(Object.values(this.git).filter(Boolean).map((g) => JSON.parse(g.repo)).filter(([on]) => !on).map(([, repo]) => repo));
      for (const repo of this.watching) if (!used.has(repo)) this.watching.delete(repo);
      this.refreshing = false;
      cx.notify();
    });
  }

  // One place's git: branch, ahead/behind, its repo.
  async check(key, cx) {
    const [on, cwd] = JSON.parse(key);
    this.checked[key] = Date.now();
    this.unsure.delete(key);
    try {
      // Ref-only reads avoid scanning the worktree or waking its index watch.
      // Two reads: a folder name may itself contain a newline.
      const [r, common] = await Promise.all([
        exec("git", ["rev-parse", "--path-format=absolute", "--show-toplevel"], { cwd, on }),
        exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on }),
      ]);
      if (r.code !== 0 || common.code !== 0) {
        // Only git's own "no" is remembered as no repo; anything else is asked again.
        if (!/not a git repository/i.test(r.code !== 0 ? r.stderr : common.stderr)) this.unsure.add(key);
        this.git[key] = null;
        return;
      }
      // The repo's own .git folder names it; a worktree's top differs from it.
      const top = r.stdout.replace(/\n$/, ""), repo = common.stdout.replace(/\n$/, "");
      const [branch, counts] = await Promise.all([
        exec("git", ["symbolic-ref", "-q", "HEAD"], { cwd, on }),
        exec("git", ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], { cwd, on }),
      ]);
      const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
      const [ahead, behind] = counts.code === 0 ? counts.stdout.trim().split(/\s+/).map(Number) : [0, 0];
      const info = { name, branch: branch.code === 0 ? branch.stdout.trim().replace(/^refs\/heads\//, "") : "(detached)", ahead, behind, repo: JSON.stringify([on, repo]), linked: repo !== `${top}/.git` };
      this.git[key] = info;
      if (!on) this.watch(repo, cx);
    } catch {
      // Couldn't ask (the machine is away): keep what it showed, look again later.
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    this.watching.add(repo);
    cx.spawn(async (cx) => {
      try {
        while (this.watching.has(repo)) {
          await watchFolder(repo);
          const mine = JSON.stringify([null, repo]);
          if (this.watching.has(repo)) this.refreshGit(Object.keys(this.git).filter((k) => this.git[k]?.repo === mine), cx);
        }
      } catch { this.watching.delete(repo); }
    });
  }

  menu(w) {
    // A popup is as tall as its items; height is only the most.
    openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: w.id } } });
  }

  orderingDue(now) {
    return this.ordering && now - this.ordering.at >= 1000
      && this.ordering.machines.every(name => machines().some(m => m.name === name && m.layout === "ready"));
  }

  // Spaces in order, each worktree space moved under its main checkout's.
  ordered() {
    if (demo()) {   // the made-up spaces, in their groups, with nothing asked of Herdr
      const G = DEMO.groups, rank = (id) => G.order.indexOf(G.of[id]);
      return DEMO.spaces.map(([id, name, active], i) => ({ w: { id, name, active: Boolean(active), machine: null, tabs: [] }, i, g: null, tree: null, group: G.of[id] ?? null }))
        .sort((a, b) => rank(a.w.id) - rank(b.w.id));
    }
    const sp = spaces(), ps = panes();
    const ready = (w) => this.shown.has(w.id) || where(w, ps) in this.git || Date.now() - (this.born[w.id] ??= Date.now()) > 1500;
    for (const w of sp) if (!this.shown.has(w.id) && ready(w)) this.shown.add(w.id);
    const list = sp.map((w, i) => ({ w, i, g: this.git[where(w, ps)] ?? null }));
    const mains = new Set(list.filter((r) => r.g && !r.g.linked).map((r) => r.g.repo));
    const nested = (r) => r.g?.linked && mains.has(r.g.repo);
    const out = [];
    const placed = new Set(); // repos whose worktrees are listed (under the first of its spaces)
    for (const r of list) {
      if (nested(r)) continue;
      out.push({ ...r, tree: null });
      if (!r.g || r.g.linked || placed.has(r.g.repo)) continue;
      placed.add(r.g.repo);
      const kids = list.filter((k) => nested(k) && k.g.repo === r.g.repo);
      kids.forEach((k, n) => out.push({ ...k, tree: n === kids.length - 1 ? "└─" : "├─" }));
    }
    // Groups: the spaces of no group first, then each group in order; a worktree goes with its checkout.
    const G = groups(), rank = (name) => { const n = G.order.indexOf(name); return n < 0 ? -1 : n; };
    let last = null;
    for (const r of out) { r.group = r.tree ? last : (G.order.includes(G.of[r.w.id]) ? G.of[r.w.id] : null); last = r.group; }
    out.sort((a, b) => rank(a.group) - rank(b.group)); // stable: the order inside a group stays
    // Simulate the batch so later indexes include earlier moves. An attempted
    // write can lose a sync conflict: allow the echo to settle before retrying.
    const order = sp.map(w => w.id);
    const target = out.map(r => r.w.id);
    const key = JSON.stringify([order, target, machines()]);
    if (order.every((id, i) => id === target[i])) {
      this.ordering = null;
    } else if (this.ordering?.key !== key || this.orderingDue(Date.now())) {
      const moved = new Set();
      this.ordering = { key, at: Date.now(), machines: [] };
      for (let i = 0; i < out.length; i++) {
        const from = order.indexOf(out[i].w.id);
        if (from === i) continue;
        run("space.move", { id: out[i].w.id, index: i + 1 });
        moved.add(out[i].w.machine ?? null);
        order.splice(i, 0, order.splice(from, 1)[0]);
      }
      this.ordering.machines = [...moved];
    }
    return out.filter(r => this.shown.has(r.w.id));
  }

  // The rows, under a header per machine once one isn't this computer.
  grouped(t, collapsed) {
    const rows = this.ordered();
    const draw = (r) => (collapsed ? this.compact(r, t) : this.row(r, t));
    const remote = [...new Set([...rows.map(r => r.w.machine).filter(Boolean), ...this.machines.map(m => m.name), ...Object.keys(this.reconnecting)])].sort();
    const loading = m => {
      const layout = machines().find(k => k.name === m)?.layout;
      return layout === "loading" || (!layout && this.machines.some(k => k.name === m && k.state === "connected"))
        || spaces().some(s => (s.machine ?? null) === m && !this.shown.has(s.id));
    };
    const loadingRow = m => h_flex().id(`machine-loading-${m ?? "local"}`).h(28).flex_none().px(collapsed ? 0 : 8).items_center().when(collapsed, el => el.justify_center()).text_size(12).text_color(t.dim).child(collapsed ? "…" : "Loading…");
    if (!remote.length) return loading(null) && !rows.length ? [loadingRow(null)] : this.sections(rows, draw, t, collapsed);
    const machineNames = [null, ...remote];
    return machineNames.flatMap((m) => {
      const mine = rows.filter((r) => (r.w.machine ?? null) === m);
      const repair = this.reconnecting[m];
      const machine = this.machines.find(k => k.name === m) ?? repair?.machine;
      const connected = !m || machine?.state === "connected";
      const rebuilt = this.rebuilt(machine) || !!repair;
      const login = machine?.state === "needs_login" ? `hc machine login ${m}` : null;
      const folded = this.folded.has(m);
      const icon = svg(`mods/workspace-chrome/${m ? "server" : "monitor"}.svg`).size(13).flex_none();
      const badge = div().absolute().right(-3).bottom(-2).size(6).rounded(3).border_1().border_color(t.chrome).bg(connected ? t.ansi2 : t.dim);
      const head = h_flex().id(`machine-${m ?? "local"}`).h(26).flex_none().px(collapsed ? 0 : 8).gap(7).items_center().text_size(11).text_color(t.dim)
        .when(collapsed, el => el.mt(4).w(RAIL_CELL).justify_center().rounded(6).tooltip(login ? `${m} needs a login: run ${login}. Click for Copy.` : m ? `${m} · ${connected ? "connected" : (machine?.state ?? "asleep").replace(/_/g, " ")}` : "This computer"))
        .cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_e, cx) => {
          if (collapsed && login) { run("app.settings", { section: "machines" }); return; }
          folded ? this.folded.delete(m) : this.folded.add(m);
          localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
          cx.notify();
        })
        .when(!collapsed, el => el.child(icon))
        .when(collapsed, el => el.child(div().relative().flex_none().child(icon).when(Boolean(m), el => el.child(badge))))
        .when(!collapsed, el => el.child(div().flex_1().truncate().child(m ?? "This computer"))
          .when(!connected && !rebuilt && !login, el => el.child(div().flex_none().child((machine?.state ?? "asleep").replace(/_/g, " "))))
          .when(rebuilt, el => el.child(h_flex().flex_none().gap(3).items_center()
            .child(div().max_w(140).truncate().child(repair?.error || "rebuilt ·"))
            .child(div().id(`machine-connect-${m}`).text_color(repair?.error ? t.blocked : t.muted)
              .hover(s => s.text_color(t.foreground))
              .tooltip(repair?.error || "This machine was rebuilt or replaced. Click to connect to the new one.")
              .on_click((_e, cx) => { cx.stop_propagation(); this.reconnect(machine, cx); })
              .child(repair?.busy ? "Connecting…" : "Connect"))))
          .when(connected, el => el.child(div().id(`machine-add-${m ?? "local"}`).flex_none().px(4).rounded(4).hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => { cx.stop_propagation(); run("space.new", { machine: m ?? "" }); }).child("+")))
          .child(div().size(6).rounded(3).flex_none().bg(connected ? t.ansi2 : t.dim))
          .child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(11).flex_none()));
      const empty = h_flex().id(`machine-new-${m ?? "local"}`).h(28).flex_none().px(collapsed ? 0 : 8).gap(7).items_center().rounded(7)
        .text_size(12).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => run("space.new", { machine: m ?? "" }))
        .when(collapsed, el => el.w(RAIL_CELL).rounded(6).justify_center().tooltip(`New space on ${m ?? "this computer"}`)
          .child(h_flex().size(18).rounded(5).border_1().border_color(t.dim).items_center().justify_center()
            .child(svg("mods/workspace-chrome/plus.svg").size(10))))
        .when(!collapsed, el => el.child(svg("mods/workspace-chrome/plus.svg").size(12)).child("New space there"));
      if (!collapsed && rebuilt) return [head];
      const cell = collapsed ? railCell : (el) => el;
      const guidance = !collapsed && login ? [v_flex().px(8).pb(6).gap(3).flex_none()
        .child(div().text_size(11).text_color(t.blocked).child("needs a login: run"))
        .child(h_flex().gap(5).items_center()
          .child(div().flex_1().min_w(0).truncate().tooltip(login).text_size(11).text_color(t.muted).child(login))
          .child(div().id(`machine-login-copy-${m}`).flex_none().px(5).py(2).rounded(4)
            .text_size(11).text_color(t.foreground).bg(t.raised).cursor_pointer().hover(s => s.bg(t.hover))
            .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(login); this.copiedLogin = login; cx.notify(); })
            .child(this.copiedLogin === login ? "Copied" : "Copy")))] : [];
      return [cell(head), ...guidance, ...(folded ? [] : mine.length ? this.sections(mine, draw, t, collapsed) : [loading(m) ? loadingRow(m) : cell(empty)])];
    });
  }

  // Rows under their group's header. In the narrow rail there are no headers.
  sections(rows, draw, t, collapsed) {
    if (collapsed) return rows.map(draw);
    const G = groups(), all = allAgents(), open = new Set(G.open ?? []);
    const team = (id) => all.filter((a) => a.space === id).sort((a, b) => b.seq - a.seq);
    // a space's row, then its agents when it is open
    const withAgents = (r) => {
      const mine = team(r.w.id), shown = open.has(r.w.id) && mine.length > 0;
      return [draw({ ...r, team: mine, opened: shown }), ...(shown ? mine.map((a, n) => this.agentRow(a, t, { group: r.group, spaceLast: r.last, last: n === mine.length - 1 })) : [])];
    };
    const out = rows.filter((r) => !r.group).flatMap(withAgents);
    for (const name of G.order) {
      const mine = rows.filter((r) => r.group === name), folded = (G.folded ?? []).includes(name);
      const loud = loudest(mine.flatMap((r) => team(r.w.id)).filter((a) => a.status !== "idle"));
      const drop = this.pressed !== null && this.overGroup === name;
      out.push(h_flex().id(`group-${name}`).h(28).flex_none().px(8).gap(7).items_center().rounded(8).cursor_pointer()
        .text_color(drop ? t.foreground : t.muted).when(drop, (el) => el.bg(t.selected)).hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => {
          const g = groups(), f = new Set(g.folded ?? []);
          f.has(name) ? f.delete(name) : f.add(name);
          saveGroups({ ...g, folded: [...f] });
          cx.notify();
        })
        .on_mouse_down("right", () => openOverlay({ mod: "spaces-tree", kind: "popup", width: 210, height: 110, props: { group: name } }))
        .on_mouse_move((_e, cx) => { if (this.pressed !== null && this.overGroup !== name) { this.overGroup = name; this.over = null; cx.notify(); } })
        .on_mouse_up("left", (_e, cx) => {
          // a space dropped on the header joins the group
          if (this.pressed !== null && this.overGroup === name) { const g = groups(); saveGroups({ ...g, of: { ...g.of, [this.pressed]: name } }); }
          this.pressed = null; this.over = null; this.overGroup = null; cx.notify();
        })
        .child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(10).flex_none().text_color(t.dim))
        .child(svg(`mods/spaces-tree/${folded ? "folder" : "folder-open"}.svg`).size(15).flex_none().text_color(folded ? t.muted : t.accent))
        .child(div().flex_1().min_w(0).truncate().font_medium().child(name))
        .when(folded && Boolean(loud), (el) => el.child(stateIcon(t, loud)))
        .child(div().flex_none().text_size(10.5).text_color(t.dim).child(String(mine.length))));
      if (!folded) out.push(...mine.flatMap((r, n) => withAgents({ ...r, last: n === mine.length - 1 })));
    }
    return out;
  }

  // One agent, under its space: the tree's guides, its state, its program, what it is on.
  agentRow(a, t, { group, spaceLast, last }) {
    const H = 24, guide = (kind) => div().relative().w(12).h(H).flex_none()
      .when(kind !== "none", (el) => el.child(div().absolute().left(5).top(0).w(1).h(kind === "elbow" ? H / 2 : H).bg(t.input)))
      .when(kind === "tee" || kind === "elbow", (el) => el.child(div().absolute().left(5).top(H / 2).w(8).h(1).bg(t.input)));
    const tab = String(a.tab_name ?? "").trim(), named = tab && !/^\d+$/.test(tab);
    const title = String(a.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
    return h_flex().id(`agent-${a.address}`).h(H).flex_none().px(8).gap(7).items_center().rounded(7).cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(() => run("agent.focus", { terminal: a.address }))
      .when(Boolean(group), (el) => el.child(div().ml(4).child(guide(spaceLast ? "none" : "pipe"))))
      .child(div().ml(group ? 9 : 13).child(guide(last ? "elbow" : "tee")))
      .child(stateIcon(t, a.status))
      .child(image(LOGO[a.app] ?? "icons/agent.svg").size(13).flex_none().opacity(a.status === "idle" ? 0.5 : 1))
      .child(div().flex_shrink(0).max_w(120).truncate().text_size(12).text_color(a.status === "idle" ? t.muted : t.foreground).child(named ? tab : title || a.app || a.address))
      .when(named && Boolean(title), (el) => el.child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(title)));
  }

  // The popups: a space's group (pick), a group's name (group).
  entered(cx) {
    const text = this.input.value().trim(), g = groups();
    if (props()?.pick) {
      if (!text) return;
      const name = g.order.find((n) => n.toLowerCase() === text.toLowerCase()) ?? text;
      saveGroups({ ...g, order: g.order.includes(name) ? g.order : [...g.order, name], of: { ...g.of, [props().pick]: name } });
    } else if (text && text !== props().group && !g.order.includes(text)) {
      const old = props().group;
      saveGroups({ order: g.order.map((n) => (n === old ? text : n)), of: Object.fromEntries(Object.entries(g.of).map(([id, n]) => [id, n === old ? text : n])),
        folded: (g.folded ?? []).map((n) => (n === old ? text : n)) });
    }
    closeOverlay(props().overlay);
  }

  popupView(t) {
    const g = groups(), id = props()?.pick, now = id ? g.of[id] ?? null : null;
    const item = (key, label, on, act, color) => h_flex().id(key).h(26).px(10).gap(8).items_center().rounded(6).cursor_pointer().text_size(12.5)
      .text_color(color ?? t.foreground).hover((s) => s.bg(t.hover))
      .on_click(() => { act(); closeOverlay(props().overlay); })
      .child(div().w(12).flex_none().text_color(t.accent).child(on ? "✓" : "")).child(div().flex_1().min_w(0).truncate().child(label));
    const field = Input.new(this.input).h(26).mx(6).px(8).rounded(6).bg(t.input).text_size(12.5);
    const root = v_flex().size_full().p(4).gap(1).bg(t.popover).text_color(t.foreground);
    if (id) {
      return root
        .children(g.order.map((n) => item(`pick-${n}`, n, n === now, () => saveGroups({ ...groups(), of: { ...groups().of, [id]: n } }))))
        .child(item("pick-none", "No group", !now, () => { const x = groups(), of = { ...x.of }; delete of[id]; saveGroups({ ...x, of }); }, t.muted))
        .child(div().h(1).my(3).bg(t.border)).child(field);
    }
    return root.child(div().px(10).pt(4).pb(2).text_size(11).text_color(t.dim).child("Rename the group")).child(field)
      .child(div().h(1).my(3).bg(t.border))
      .child(item("group-delete", "Delete the group", false, () => {
        const x = groups(), old = props().group;
        saveGroups({ order: x.order.filter((n) => n !== old), of: Object.fromEntries(Object.entries(x.of).filter(([, n]) => n !== old)), folded: (x.folded ?? []).filter((n) => n !== old) });
      }, t.blocked));
  }

  // Only what's unusual, after the name: "herdr \u00b7 spike \u21912 \u21931". The repo or
  // branch goes when the name already says it (a worktree is named after its branch),
  // and master/main go: nearly every space is on one.
  gitTail(g, tree, name, t) {
    const raw = g.branch ?? "detached";
    const same = (a) => a.toLowerCase() === name.toLowerCase();
    const branch = same(raw) || raw === "master" || raw === "main" ? "" : raw;
    const repo = tree || same(g.name) ? "" : g.name;
    const where = [repo, branch].filter(Boolean).join(" \u00b7 ");
    return h_flex()
      .flex_1()
      .min_w(0)
      .gap(5)
      .justify_end()
      .items_center()
      .text_size(11.5)
      .text_color(t.dim)
      .when(Boolean(where), (el) => el.child(div().min_w(0).truncate().child(where)))
      .when(g.ahead > 0, (el) => el.child(div().flex_none().text_color(t.ansi2).child(`\u2191${g.ahead}`)))
      .when(g.behind > 0, (el) => el.child(div().flex_none().text_color(t.ansi1).child(`\u2193${g.behind}`)));
  }

  row({ w, i, g, tree, group, last, team = [], opened = false }, t) {
    const loud = loudest(team.filter((a) => a.status !== "idle"));
    const on = w.active;
    const fromIndex = this.pressed === null ? -1 : spaces().findIndex(s => s.id === this.pressed);
    const colors = demo() ? DEMO.colors : shared("space.colors") ?? {};
    const color = colors[w.id] ?? "ansi6";
    const fill = color.startsWith("#") ? color : (MARK[color] ?? t[color]);
    return v_flex()
      .relative()
      .id(`space-${w.id}`)
      .px(8)
      .h(rowHeight({ tree }))
      .flex_none()
      .justify_center()
      .rounded(8)
      .on_hover((over, cx) => { const next = over ? w.id : this.hot === w.id ? null : this.hot; if (next !== this.hot) { this.hot = next; cx.notify(); } })
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .when(this.pressed === w.id && this.over !== w.id, (el) => el.opacity(0.5))
      .when(this.pressed !== null && this.over === w.id && this.pressed !== w.id, (el) => el.child(
        div().absolute().left(0).right(0).h(2).bg(t.accent)
          .when(fromIndex < i, line => line.bottom(0))
          .when(fromIndex > i, line => line.top(0)),
      ))
      .on_mouse_down("left", () => {
        this.pressed = w.id;
        this.over = w.id;
      })
      .on_mouse_move((_e, cx) => {
        const source = spaces().find(s => s.id === this.pressed);
        const over = source && (source.machine ?? null) === (w.machine ?? null) ? w.id : null;
        if (this.pressed !== null && (this.over !== over || this.overGroup)) {
          this.over = over;
          this.overGroup = null;
          cx.notify();
        }
      })
      .on_mouse_up("left", (_e, cx) => {
        const from = this.pressed;
        const over = this.over;
        this.pressed = null;
        this.over = null;
        if (from !== null && over === w.id && from !== w.id) {
          // dropped on a space: beside it, and into its group
          const G = groups(), of = { ...G.of };
          if (G.of[w.id]) of[from] = G.of[w.id]; else delete of[from];
          saveGroups({ ...G, of });
          const index = spaces().findIndex(s => s.id === w.id);
          if (index !== -1) run("space.move", { id: from, index: index + 1 });
        } else if (from === w.id) run("space.select", { id: w.id });
        cx.notify();
      })
      .on_mouse_down("right", () => this.menu(w))
      .child(
        h_flex()
          .gap(9)
          .items_center()
          // in a group: the tree's guide, a line down from the folder with a tick to this row
          .when(Boolean(group), (el) => el.child(div().relative().w(12).h(rowHeight({ tree })).flex_none().ml(4)
            .child(div().absolute().left(5).top(0).w(1).h(last ? rowHeight({ tree }) / 2 : rowHeight({ tree })).bg(t.input))
            .child(div().absolute().left(5).top(rowHeight({ tree }) / 2).w(9).h(1).bg(t.input))))
          // a space with agents opens: the chevron shows or hides them
          .child(div().id(`open-${w.id}`).w(10).h(18).flex_none().flex().items_center().justify_center().rounded(3)
            .when(team.length > 0, (el) => el.cursor_pointer().hover((s) => s.bg(t.raised))
              .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
              .on_mouse_up("left", (_e, cx) => {
                cx.stop_propagation();
                this.pressed = null;
                const G = groups(), set = new Set(G.open ?? []);
                set.has(w.id) ? set.delete(w.id) : set.add(w.id);
                saveGroups({ ...G, open: [...set] });
                cx.notify();
              })
              .child(svg(`mods/workspace-chrome/chevron-${opened ? "down" : "right"}.svg`).size(9).text_color(t.dim))))
          .when(Boolean(tree), el => el.pl(22).child(svg("mods/workspace-chrome/branch.svg").size(13).text_color(t.dim)))
          .when(!tree, el => el.child(h_flex().size(18).flex_none().rounded(5).bg(fill).items_center().justify_center().text_size(10.5).font_bold().text_color("#ffffff").child([...w.name][0]?.toUpperCase() ?? "?")))
          .child(div().flex_shrink(0).max_w(150).truncate().text_color(t.foreground).child(w.name))
          .child(g ? this.gitTail(g, tree, w.name, t) : div().flex_1())
          // closed: the loudest state of its agents, and how many there are
          .when(!opened && team.length > 0, (el) => el
            .when(Boolean(loud), (e) => e.child(stateIcon(t, loud)))
            .child(div().flex_none().text_size(10.5).text_color(t.dim).child(String(team.length))))
          // the dots: this space's group
          .when(this.hot === w.id && !tree && this.pressed === null, (el) => el.child(div().id(`dots-${w.id}`).w(18).h(18).flex_none().flex().items_center().justify_center()
            .rounded(4).text_size(12).text_color(t.muted).hover((s) => s.bg(t.raised).text_color(t.foreground)).tooltip("Move to a group")
            .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .on_mouse_up("left", (_e, cx) => {
              cx.stop_propagation();
              this.pressed = null;
              openOverlay({ mod: "spaces-tree", kind: "popup", width: 190, height: 320, props: { pick: w.id } });
            })
            .child("⋯"))),
      );
  }

  compact({ w, i }, t) {
    return railCell(h_flex()
      .id(`space-${w.id}`)
      .relative()
      .w(RAIL_CELL)
      .h(26)
      .rounded(6)
      .justify_center()
      .items_center()
      .when(w.active, (el) => el.bg(t.selected))
      .when(!w.active, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click(() => run("space.select", { id: w.id }))
      .child(div().text_color(w.active ? t.foreground : t.muted).child(String(i + 1)))
      .child(div().absolute().right(5).text_color(tone(t, w.status)).child(glyph(w.status))));
  }

  render() {
    const t = theme();
    if (this.popup) return this.popupView(t);
    const collapsed = narrow();
    const palette = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
    const sp = demo() ? [] : spaces();
    const ids = new Set(sp.map(p => p.id));
    const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
    let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
    for (const p of sp) {
      if (kept[p.id] || p.name === "~") continue;
      const uses = c => Object.values(kept).filter(v => v === c).length;
      kept[p.id] = palette.reduce((best, c) => uses(c) < uses(best) ? c : best);
      changed = true;
    }
    if (changed && !demo()) setShared("space.colors", kept);   // the demo never touches the real colours
    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      .child(h_flex().h(31).pl(16).pr(10).items_center().justify_between().text_size(11.5).text_color(t.dim)
        .when(collapsed, el => el.pl(0).pr(0).justify_center())
        .when(!collapsed, el => el.child("Spaces"))
        .child(div().id("space-new").size(26).flex_none().flex().items_center().justify_center().rounded(6).hover(s => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => run("space.new")).child(svg("mods/workspace-chrome/plus.svg").size(14))))
      .child(v_flex().flex_1().min_h(0).px(collapsed ? 0 : 8).pb(14).overflow_y_scrollbar().mode("always")
        .on_mouse_up("left", (_e, cx) => { this.pressed = null; cx.notify(); })
        .children(this.grouped(t, collapsed)));
  }
}
