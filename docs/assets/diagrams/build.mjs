// Draws the documentation's diagrams as SVG files.
//   node docs/assets/diagrams/build.mjs        from the repository root
// One style for all of them is kept here: change it in one place and draw them again. The files
// it writes are committed; nothing else reads this script. Open each picture after a change.
//
// Each picture is one file that carries its own ground and both sets of colours: it is light
// or dark by the reader's own setting (prefers-color-scheme), and readable on any page, since
// it does not rely on the page's ground. Every shape also has the light colours as plain
// attributes, for a viewer that does not read the style sheet. A page shows it with the plain Markdown form of an
// image, which every viewer of Markdown understands.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// The four colours, one meaning each, in every picture: slate for what is not TabGoblin (the
// agent, Chrome, other systems), green for TabGoblin and what runs with its leave, amber for what
// waits for the user's answer, red for what is refused or out of reach. A fill is its colour at
// low opacity; text and ground differ by theme.
//
// Lines mean one thing each, too. A solid line with a head: a request goes that way, and its answer
// comes back the same way. Heads at both ends (the data-flow picture only): data goes both ways.
// Dashed without a head: files read and written, or what is built from a definition; no request
// goes there. Red and dashed without a head: there is no path at all. A dashed box is a trust
// boundary; a solid one only groups. A control is named enforced, configurable or best effort, as
// in the security model's summary of controls.
const SLATE = '#64748B';
const GREEN = '#16A34A';
const AMBER = '#D97706';
const RED = '#DC2626';
const COLOUR = { slate: SLATE, green: GREEN, amber: AMBER, red: RED };
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const STYLE = `
svg { --ground: #FFFFFF; --edge: #D0D7DE; --text: #0F172A; --soft: #475569; --line: #64748B; --tint: 0.07; --red-text: #B91C1C; --green-text: #15803D; --amber-text: #B45309; }
@media (prefers-color-scheme: dark) {
  svg { --ground: #0D1117; --edge: #30363D; --text: #E2E8F0; --soft: #94A3B8; --line: #94A3B8; --tint: 0.14; --red-text: #F87171; --green-text: #4ADE80; --amber-text: #FBBF24; }
}
.ground { fill: var(--ground); stroke: var(--edge); }
.name { fill: var(--text); font-weight: 600; }
.sub { fill: var(--soft); }
.red-text { fill: var(--red-text); }
.green-text { fill: var(--green-text); }
.amber-text { fill: var(--amber-text); }
.tint { fill-opacity: var(--tint); }
.half { fill-opacity: calc(var(--tint) / 2); }
.wire { fill: none; stroke: var(--line); stroke-width: 1.25; }
.wire.red { stroke: ${RED}; }
.wire.green { stroke: ${GREEN}; }
.wire.amber { stroke: ${AMBER}; }
.tip { fill: var(--line); }
.rule { stroke: var(--line); stroke-opacity: 0.35; }
`;

// Widths of Helvetica's characters in thousandths of the font size, near enough for the
// system fonts the pictures name: enough to space a legend evenly, where a fixed width per
// character left wide gaps after long words.
const WIDTHS = { ' ': 278, '·': 278, ',': 278, '.': 278, ':': 278, '/': 278, "'": 191, '-': 333, '(': 333, ')': 333,
  f: 278, i: 222, j: 222, l: 222, r: 333, t: 278, m: 833, w: 722, c: 500, k: 500, s: 500, v: 500, x: 500, y: 500, z: 500,
  I: 278, J: 500, L: 556, F: 611, T: 611, Z: 611, M: 833, W: 944, C: 722, D: 722, H: 722, N: 722, R: 722, U: 722, G: 778, O: 778, Q: 778 };
const textWidth = (text, size) => [...text].reduce((sum, ch) => sum + (WIDTHS[ch] ?? (/[A-Z]/.test(ch) ? 667 : 556)), 0) * size / 1000;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** One picture: shapes are added to it, and it is written as one file. */
function picture(width, height, title, desc, draw) {
  const out = [];
  const api = {
    /** A component: a bold name and smaller lines under it. Returns where its edges are. */
    node(x, y, w, h, name, lines = [], kind = 'slate', opts = {}) {
      const c = COLOUR[kind];
      out.push(`<rect class="tint" fill-opacity="0.07" x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${c}" stroke="${c}" stroke-width="1.25"${opts.dashed ? ' stroke-dasharray="5 4"' : ''}/>`);
      const rows = 1 + lines.length;
      const [big, small, step] = opts.big ? [18, 14, 22] : [14, 12, 16];
      const first = y + h / 2 - ((rows - 1) * step) / 2 + big / 3;
      out.push(`<text class="name" fill="#0F172A" font-weight="600" x="${x + w / 2}" y="${first}" text-anchor="middle" font-size="${big}">${esc(name)}</text>`);
      lines.forEach((line, i) => out.push(
        `<text class="sub" fill="#475569" x="${x + w / 2}" y="${first + step * (i + 1)}" text-anchor="middle" font-size="${small}">${esc(line)}</text>`));
      return { x, y, w, h, cx: x + w / 2, cy: y + h / 2, top: y, bottom: y + h, left: x, right: x + w };
    },
    /** A container. Dashed is a trust boundary; solid says only what belongs together. Its label can stand in the middle, out of the way of connectors. */
    box(x, y, w, h, label, kind = 'slate', dashed = false, at = 'left') {
      const c = COLOUR[kind];
      out.push(`<rect${dashed ? ' fill="none"' : ` class="half" fill-opacity="0.035" fill="${c}"`} x="${x}" y="${y}" width="${w}" height="${h}" rx="12" stroke="${c}" stroke-width="${label ? 1 : 1.5}"${dashed ? ' stroke-dasharray="6 5"' : label ? ' stroke-opacity="0.55"' : ''}/>`);
      if (label) out.push(`<text class="${kind === 'green' ? 'green-text' : 'sub'}" fill="${kind === 'green' ? '#15803D' : '#475569'}" x="${at === 'centre' ? x + w / 2 : x + 14}" y="${y + 20}"${at === 'centre' ? ' text-anchor="middle"' : ''} font-size="11" font-weight="600" letter-spacing="0.6">${esc(label.toUpperCase())}</text>`);
    },
    /** A connector through points, with an arrow head at its end unless told otherwise. */
    line(points, opts = {}) {
      const kind = ['red', 'green', 'amber'].includes(opts.kind) ? opts.kind : '';
      const head = opts.head === false ? '' : ` marker-end="url(#head${kind ? `-${kind}` : ''})"`;
      const tail = opts.both ? ' marker-start="url(#head)"' : '';
      out.push(`<polyline class="wire${kind ? ` ${kind}` : ''}" fill="none" stroke="${kind ? COLOUR[kind] : SLATE}" stroke-width="1.25" points="${points.map((p) => p.join(',')).join(' ')}"${opts.dashed ? ' stroke-dasharray="4 4"' : ''}${head}${tail}/>`);
    },
    /** A heading inside a container, centred. */
    heading(x, y, text) {
      out.push(`<text class="name" fill="#0F172A" font-weight="600" x="${x}" y="${y}" text-anchor="middle" font-size="19">${esc(text)}</text>`);
    },
    /** What the colours mean, said in words under the picture: a thin rule, then a dot and a word for each. */
    legend(y, items = [['slate', 'Components'], ['green', 'TabGoblin'], ['red', 'Denied']]) {
      out.push(`<line class="rule" stroke="#64748B" stroke-opacity="0.35" x1="24" y1="${y}" x2="${width - 24}" y2="${y}" stroke-width="1"/>`);
      // Each item is a dot, its word, and the same gap before the next dot; the row is centred.
      const GAP = 32;
      const room = (word) => 12 + textWidth(word, 12);
      let x = width / 2 - (items.reduce((sum, [, word]) => sum + room(word), 0) + GAP * (items.length - 1)) / 2 + 5;
      for (const [kind, word] of items) {
        out.push(`<circle cx="${x}" cy="${y + 24}" r="5" fill="${COLOUR[kind]}"/>`);
        out.push(`<text class="sub" fill="#475569" x="${x + 12}" y="${y + 28}" font-size="12">${esc(word)}</text>`);
        x += room(word) + GAP;
      }
    },
    /** A small label beside a connector. */
    label(x, y, text, opts = {}) {
      const cls = opts.kind === 'red' ? 'red-text' : opts.kind === 'green' ? 'green-text' : opts.kind === 'amber' ? 'amber-text' : 'sub';
      const lines = Array.isArray(text) ? text : [text];
      lines.forEach((line, i) => out.push(
        `<text class="${cls}" fill="${{ red: '#B91C1C', green: '#15803D', amber: '#B45309' }[opts.kind] ?? '#475569'}" x="${x}" y="${y + i * 14}" text-anchor="${opts.anchor ?? 'start'}" font-size="11"${opts.bold ? ' font-weight="600"' : ''}${opts.spaced ? ' letter-spacing="0.6"' : ''}>${esc(line)}</text>`));
    },
  };
  draw(api);
  const tip = (id, fill) => `<marker id="${id}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0.8 L7,4 L0,7.2 z" ${fill}/></marker>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="t d" font-family="${FONT}">
<title id="t">${esc(title)}</title>
<desc id="d">${esc(desc)}</desc>
<style>${STYLE}</style>
<defs>
${tip('head', `class="tip" fill="${SLATE}"`)}
${tip('head-red', `fill="${RED}"`)}
${tip('head-green', `fill="${GREEN}"`)}
${tip('head-amber', `fill="${AMBER}"`)}
</defs>
<rect class="ground" fill="#FFFFFF" stroke="#D0D7DE" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="12" stroke-width="1"/>
${out.join('\n')}
</svg>
`;
  writeFileSync(join(HERE, `${title.file}.svg`), svg);
}

/** A title that also carries the file's name. */
const named = (file, text) => Object.assign(new String(text), { file });

// What a control is, said in the same three words in every picture and in the security model's
// summary of controls: enforced (always, by TabGoblin), configurable (by the user's settings, and
// enforced once set), best effort (it helps, and has holes).
const CLASS_KIND = { ENFORCED: 'green', CONFIGURABLE: undefined, 'BEST EFFORT': undefined };

// ---- 1. Overview: the README's picture, after the owner's reference

picture(760, 742, named('overview', 'TabGoblin at a glance'),
  "An AI coding agent reaches TabGoblin through the CLI or through MCP, two interfaces side by side. Both lead to the one TabGoblin server, which proves who is asking, validates every request (enforced) and applies the user's settings (configurable). The server sends the command to the TabGoblin extension, which checks the session, the origin and the access level again (enforced) and asks the user before a submission (configurable). The command reaches only the tabs the user authorized; every other tab is denied, and no path leads there.", (d) => {
    const big = { big: true };
    const plain = { head: false };
    const agent = d.node(210, 20, 340, 64, 'AI coding agent', [], 'slate', big);
    const cli = d.node(40, 132, 320, 80, 'CLI', ['one process per command'], 'green', big);
    const mcp = d.node(400, 132, 320, 80, 'MCP', ['one link per agent'], 'green', big);
    // One trunk from the agent, forked to the two interfaces, and joined again below them.
    d.line([[agent.cx, agent.bottom], [agent.cx, 108]], plain);
    d.line([[cli.cx, 108], [mcp.cx, 108]], plain);
    d.line([[cli.cx, 108], [cli.cx, cli.top]]);
    d.line([[mcp.cx, 108], [mcp.cx, mcp.top]]);
    d.line([[cli.cx, cli.bottom], [cli.cx, 236], [mcp.cx, 236], [mcp.cx, mcp.bottom]], plain);
    d.line([[agent.cx, 236], [agent.cx, 260]]);

    d.box(80, 260, 600, 168, '', 'green');
    d.heading(380, 296, 'TabGoblin server');
    d.node(104, 318, 172, 84, 'Identity', ['token · agent key', 'enforced'], 'green', big);
    d.node(294, 318, 172, 84, 'Validation', ['every request', 'enforced'], 'green', big);
    d.node(484, 318, 172, 84, 'Policy', ['your settings', 'configurable'], 'green', big);

    const ext = d.node(160, 476, 440, 80, 'TabGoblin extension', ['session · origin · access level: enforced', 'asks you before a submission: configurable'], 'green', big);
    d.line([[380, 428], [380, ext.top]]);

    const tabs = d.node(40, 604, 320, 56, 'Tabs you authorized', [], 'green', big);
    const other = d.node(400, 604, 320, 56, 'Every other tab', [], 'red', { big: true, dashed: true });
    d.line([[ext.cx, ext.bottom], [ext.cx, 580]], plain);
    d.line([[ext.cx, 580], [tabs.cx, 580], [tabs.cx, tabs.top]], { kind: 'green' });
    // No arrow: nothing goes there.
    d.line([[ext.cx, 580], [other.cx, 580], [other.cx, other.top]], { head: false, kind: 'red', dashed: true });
    d.legend(692, [['slate', 'Your agent'], ['green', 'TabGoblin · authorized'], ['red', 'Denied']]);
  });

// ---- 2. Components: the architecture's picture

picture(760, 1166, named('components', 'The components of TabGoblin'),
  "The CLI and the MCP link are two interfaces of TabGoblin, one process per command and one per agent. Both connect over a WebSocket on the server's one port, path /link, to the one TabGoblin server, whose link endpoint checks the proofs of the pairing token and the agent's key. A command goes to the command adapter (call, cancel, result) and an MCP call to the MCP adapter; neither runs through the other, both are built from one set of tool definitions, and both lead into one service that validates and applies the policy. The service sends the command, named for its agent, through the server's one WebSocket connection to the extension's worker in Chrome, which takes the user's decisions from the popup and has the content script carry out one operation in the authorized tab.", (d) => {
    const agent = d.node(190, 20, 240, 48, 'Coding agent');

    d.box(40, 108, 540, 110, 'Integration interfaces', 'green', false, 'centre');
    const cli = d.node(70, 140, 220, 56, 'CLI', ['one process per command'], 'green');
    const link = d.node(330, 140, 220, 56, 'MCP link', ['one process per agent'], 'green');
    d.line([[agent.cx - 40, agent.bottom], [agent.cx - 40, 84], [cli.cx, 84], [cli.cx, cli.top]]);
    d.line([[agent.cx + 40, agent.bottom], [agent.cx + 40, 84], [link.cx, 84], [link.cx, link.top]]);
    d.label(cli.cx - 8, 99, 'runs a command', { anchor: 'end' });
    d.label(link.cx + 8, 99, 'MCP over stdio');

    d.box(40, 268, 540, 440, 'TabGoblin server', 'green');
    const door = d.node(170, 300, 280, 56, 'Link endpoint', ['path /link · proofs: token · agent key'], 'green');
    d.line([[cli.cx, cli.bottom], [cli.cx, 244], [door.cx - 50, 244], [door.cx - 50, door.top]]);
    d.line([[link.cx, link.bottom], [link.cx, 244], [door.cx + 50, 244], [door.cx + 50, door.top]]);
    d.label(link.cx + 10, 237, ['WebSocket on the one port: the proofs,', "then the interface's own messages"]);

    const cmd = d.node(52, 396, 156, 72, 'Command adapter', ['call · cancel · result', 'no MCP'], 'green');
    const tools = d.node(228, 396, 164, 72, 'Tool definitions', ['one set for both', "in no protocol's terms"], 'green');
    const sdk = d.node(412, 396, 156, 72, 'MCP adapter', ['the official MCP SDK', 'tools · cancellation'], 'green');
    d.line([[door.cx - 50, door.bottom], [door.cx - 50, 376], [cmd.cx, 376], [cmd.cx, cmd.top]]);
    d.line([[door.cx + 50, door.bottom], [door.cx + 50, 376], [sdk.cx, 376], [sdk.cx, sdk.top]]);
    // Built from the definitions: no request goes this way.
    d.line([[tools.left, tools.cy], [cmd.right, tools.cy]], { dashed: true, head: false });
    d.line([[tools.right, tools.cy], [sdk.left, tools.cy]], { dashed: true, head: false });

    const svc = d.node(170, 520, 280, 72, 'Service', ['validation · blocked sites', 'policy · submission ids'], 'green');
    d.line([[cmd.cx, cmd.bottom], [cmd.cx, 500], [svc.cx - 50, 500], [svc.cx - 50, svc.top]]);
    d.line([[sdk.cx, sdk.bottom], [sdk.cx, 500], [svc.cx + 50, 500], [svc.cx + 50, svc.top]]);
    d.label(svc.cx, 490, 'one path from here', { anchor: 'middle' });
    const ws = d.node(170, 632, 280, 56, 'WebSocket endpoint', ['one port · one connection · every agent'], 'green');
    d.line([[svc.cx, svc.bottom], [svc.cx, ws.top]]);

    const files = d.node(606, 520, 140, 72, 'Home folder', ['token · agent keys', 'settings · audit']);
    d.line([[svc.right, svc.cy], [files.left, svc.cy]], { dashed: true, head: false });

    d.box(40, 758, 706, 342, 'Chrome', 'slate', true);
    d.box(60, 786, 666, 208, 'TabGoblin extension', 'green');
    const worker = d.node(170, 816, 280, 56, 'Extension worker', ['sessions · rules · flows'], 'green');
    d.line([[ws.cx, ws.bottom], [ws.cx, worker.top]]);
    d.label(ws.cx + 10, 730, ['WebSocket on 127.0.0.1, paired once', 'each command names its agent · protocol 1']);
    const content = d.node(170, 916, 280, 56, 'Content script', ['fixed page operations'], 'green');
    d.line([[worker.cx, worker.bottom], [worker.cx, content.top]]);
    d.label(worker.cx + 10, 898, 'one operation');
    const popup = d.node(560, 816, 146, 56, 'Popup', ["the user's decisions"], 'green');
    d.line([[popup.left, popup.cy], [worker.right, popup.cy]]);
    d.label(505, popup.cy - 8, 'grants, answers', { anchor: 'middle' });
    const tab = d.node(170, 1028, 280, 48, 'Authorized tab', [], 'green');
    d.line([[content.cx, content.bottom], [tab.cx, tab.top]], { kind: 'green' });
    d.legend(1122, [['slate', 'Not TabGoblin'], ['green', 'TabGoblin · authorized']]);
  });

// ---- 3. Where a command is checked: the security model's picture

picture(800, 1186, named('command-checks', 'Where a command is checked'),
  "A command from the CLI or from MCP passes three checks in the TabGoblin server and four in the TabGoblin extension before one fixed operation runs in the authorized tab. A check that fails refuses the command with an error code, and nothing after it runs. Who is asking, the arguments, the session, the access level and the check right before the page are enforced; the user's settings and whether the user is asked about a submission are configurable; only allowlisted text leaves the page (enforced), and credential-like text is taken out of it (best effort). A cancel, pause or revoke stops the command at the next check before the page.", (d) => {
    const X = 150;
    const W = 280;
    const RX = 474;
    const RW = 276;
    const check = (y, h, name, lines, cls, codes, kind = 'green', no = 'no') => {
      const n = d.node(X, y, W, h, name, lines, kind);
      d.label(X - 14, n.cy + 4, cls, { anchor: 'end', bold: true, spaced: true, kind: CLASS_KIND[cls] });
      const rh = Math.max(52, 20 + 16 * (codes.length + 1));
      const r = d.node(RX, n.cy - rh / 2, RW, rh, 'Refused', codes, 'red');
      d.line([[n.right, n.cy], [r.left, n.cy]], { kind: 'red' });
      d.label(n.right + 6, n.cy - 7, no, { kind: 'red', bold: true });
      return n;
    };
    const down = (a, b, text = 'yes', at = (a.bottom + b.top) / 2 + 4) => {
      d.line([[a.cx, a.bottom], [b.cx, b.top]]);
      if (text) d.label(a.cx + 10, at, text);
    };

    d.box(20, 6, 760, 1124, 'One operating-system account · application checks, not isolation between programs', 'slate', true);
    const agent = d.node(X, 44, W, 52, 'Coding agent', ['a CLI command or an MCP call']);

    d.box(36, 134, 728, 318, 'TabGoblin server', 'green');
    const s1 = check(164, 72, 'Who is asking?', ['pairing token and agent key proven', 'agent not revoked'], 'ENFORCED', ['link refused, nothing passes', 'AGENT_REVOKED']);
    const s2 = check(268, 56, 'Are the arguments valid?', ['every argument against its tool'], 'ENFORCED', ['INVALID_ARGUMENT']);
    const s3 = check(356, 72, 'Do your settings allow it?', ['interface · blocked and allowed sites', 'level · screenshots · in both parts'], 'CONFIGURABLE', ['INTERFACE_NOT_ALLOWED · SITE_BLOCKED', 'SITE_NOT_ALLOWED · ACCESS_RESTRICTED', 'SCREENSHOTS_DISABLED']);
    down(agent, s1, '');
    down(s1, s2);
    down(s2, s3);

    d.box(36, 474, 728, 432, 'TabGoblin extension · in Chrome', 'green');
    const e1 = check(504, 88, 'Is the session valid?', ["this agent's · not expired", 'not paused or suspended', 'tab on its authorized origins'], 'ENFORCED', ['NOT_AUTHORIZED · SESSION_NOT_OWNED', 'AUTHORIZATION_EXPIRED · PAUSED', 'SESSION_SUSPENDED · ORIGIN_MISMATCH']);
    const e2 = check(624, 56, 'Does the access level cover it?', ['Read · Explore · Read / Write'], 'ENFORCED', ['EXPLORE_NOT_AUTHORIZED', 'WRITE_NOT_AUTHORIZED']);
    const e3 = check(712, 72, 'A submission: ask the user?', ["the user's setting decides · always under", 'the strict profile or for high impact'], 'CONFIGURABLE', ['SUBMIT_DENIED', 'SUBMIT_NOT_CONFIRMED'], 'amber', 'deny');
    const e4 = check(816, 72, 'Still allowed, still the same?', ['checked again right before', 'each step that touches the page'], 'ENFORCED', ['CANCELLED · the codes above, again', 'APPROVAL_STALE']);
    down(s3, e1);
    down(e1, e2);
    down(e2, e3);
    down(e3, e4, 'allowed, or not asked');

    const tab = d.node(X, 950, W, 56, 'Authorized tab', ['one fixed operation'], 'green');
    down(e4, tab, 'yes', 932);
    const result = d.node(X, 1054, W, 56, 'Result to the agent', ['only allowlisted text', 'credential-like text taken out']);
    d.line([[tab.cx, tab.bottom], [result.cx, result.top]]);
    // The result's two lines, each with its class beside it.
    d.label(X - 14, result.y + 33, 'ENFORCED', { anchor: 'end', bold: true, spaced: true, kind: 'green' });
    d.label(X - 14, result.y + 49, 'BEST EFFORT', { anchor: 'end', bold: true, spaced: true });
    d.label(RX, result.cy - 17, ['Nothing is retried. A refusal ends', 'the command where it happens.', 'A cancel, pause or revoke stops it at', 'the next check before the page.']);
    d.legend(1142, [['slate', 'Components'], ['green', 'Checked by TabGoblin'], ['amber', 'Asks the user'], ['red', 'Refused']]);
  });

// ---- 4. Deployment and data flow: the corporate assessment's picture

picture(760, 830, named('data-flow', 'Deployment boundary and data flow'),
  "Everything of TabGoblin runs on the developer's workstation under one operating-system account: the CLI and MCP interfaces, the TabGoblin server, and the TabGoblin extension in Chrome. Two flows leave the workstation, and TabGoblin makes neither: the agent's prompts to its model provider, and the tab's own HTTPS session with the web application.", (d) => {
    d.box(20, 20, 560, 640, "Developer's workstation · one operating-system account", 'slate', true);
    const agent = d.node(160, 54, 280, 48, 'Coding agent');
    const model = d.node(606, 54, 140, 48, 'Model provider');
    d.line([[agent.right, agent.cy], [model.left, agent.cy]]);
    d.label(606, 122, ['prompts that include', 'tool results']);

    const cli = d.node(50, 152, 230, 56, 'CLI', ['commands in · JSON out'], 'green');
    const mcp = d.node(320, 152, 230, 56, 'MCP', ['MCP over stdio'], 'green');
    d.line([[agent.cx - 40, agent.bottom], [agent.cx - 40, 128], [cli.cx, 128], [cli.cx, cli.top]], { both: true });
    d.line([[agent.cx + 40, agent.bottom], [agent.cx + 40, 128], [mcp.cx, 128], [mcp.cx, mcp.top]], { both: true });

    const server = d.node(160, 270, 280, 88, 'TabGoblin server', ['checks: agent key · arguments', 'blocked sites · policy', 'page content in transit only'], 'green');
    d.line([[cli.cx, cli.bottom], [cli.cx, 238], [server.cx - 50, 238], [server.cx - 50, server.top]], { both: true });
    d.line([[mcp.cx, mcp.bottom], [mcp.cx, 238], [server.cx + 50, 238], [server.cx + 50, server.top]], { both: true });
    d.label(mcp.cx + 10, 232, 'loopback sockets');

    const disk = d.node(456, 392, 108, 72, 'Home folder', ['token · keys', 'settings · audit']);
    d.line([[server.right, server.cy], [disk.cx, server.cy], [disk.cx, disk.top]], { dashed: true, head: false });

    d.box(40, 420, 400, 222, 'Chrome profile', 'slate', true);
    const ext = d.node(60, 452, 360, 88, 'TabGoblin extension', ['checks: session · origin · access level', 'policy · approval', 'four permissions, no host permissions'], 'green');
    d.line([[server.cx - 60, server.bottom], [server.cx - 60, ext.top]], { both: true });
    d.label(server.cx - 50, 392, ['WebSocket on 127.0.0.1', 'commands and results']);
    const tab = d.node(60, 578, 360, 48, 'Authorized tab', [], 'green');
    d.line([[ext.cx, ext.bottom], [tab.cx, tab.top]], { both: true });
    d.label(ext.cx + 10, 563, 'fixed page operations');

    const app = d.node(60, 716, 360, 48, 'Web application');
    d.line([[tab.cx, tab.bottom], [app.cx, app.top]], { both: true });
    d.label(tab.cx + 10, 692, ["HTTPS · the developer's own session"]);
    d.label(456, 736, ['TabGoblin itself makes no', 'connection out of the workstation.']);
    d.legend(786, [['slate', 'Not TabGoblin'], ['green', 'TabGoblin · authorized']]);
  });

// ---- 5. The security boundary: the README's second picture, one idea only

picture(760, 494, named('security-boundary', 'What an agent can reach'),
  'TabGoblin checks every command from the agent: who is asking, whether the tab is authorized for it, whether the page is still on its website, whether the access level covers the action, and whether the policy allows it. What passes reaches only the tabs the user authorized (enforced). A submission is shown to the user first by default (configurable); one the user denies or does not answer is not sent. Other tabs, cookies, request headers, website storage, password fields, scripts, the debugger and network requests are out of reach: there is no tool or permission for them (enforced).', (d) => {
    const agent = d.node(230, 24, 300, 52, 'AI coding agent', ['through the CLI or MCP'], 'slate');
    const gate = d.node(80, 110, 600, 92, 'TabGoblin checks every command', [
      'the agent is who it says · the tab is authorized for it',
      'the page is on its website · the level covers it · the policy allows it'], 'green', { big: true });
    d.line([[agent.cx, agent.bottom], [agent.cx, gate.top]]);

    const tab = d.node(30, 262, 220, 112, 'Authorized tabs', ['only the tabs you chose', 'on their exact websites', 'Read, Explore or Read / Write'], 'green');
    const ask = d.node(270, 262, 220, 112, 'Submissions', ['declared by the agent', 'shown to you first by default', 'you allow or deny'], 'amber');
    const no = d.node(510, 262, 220, 112, 'Out of reach', ['other tabs and websites', 'cookies, headers, site storage', 'password fields', 'scripts, debugger, requests'], 'red', { dashed: true });
    d.line([[gate.cx, gate.bottom], [gate.cx, 232]], { head: false });
    d.line([[gate.cx, 232], [tab.cx, 232], [tab.cx, tab.top]], { kind: 'green' });
    d.line([[gate.cx, 232], [ask.cx, ask.top]], { kind: 'amber' });
    // No arrow: nothing goes there.
    d.line([[gate.cx, 232], [no.cx, 232], [no.cx, no.top]], { kind: 'red', dashed: true, head: false });
    // What each one is, and where a submission ends when the answer is no.
    d.label(tab.cx, 396, 'ENFORCED', { anchor: 'middle', bold: true, spaced: true, kind: 'green' });
    d.label(ask.cx, 396, 'CONFIGURABLE', { anchor: 'middle', bold: true, spaced: true });
    d.label(ask.cx, 412, ['allowed: it runs in the tab', 'denied or unanswered: not sent'], { anchor: 'middle', kind: 'amber' });
    d.label(no.cx, 396, 'ENFORCED', { anchor: 'middle', bold: true, spaced: true, kind: 'green' });
    d.label(no.cx, 412, 'no tool, no permission for it', { anchor: 'middle', kind: 'red' });
    d.legend(446, [['slate', 'Your agent'], ['green', 'TabGoblin · authorized'], ['amber', 'Asks you'], ['red', 'Denied']]);
  });

// ---- 6. How a change keeps the pages true: the development page's picture

picture(760, 650, named('documentation', 'How a change keeps the documentation true'),
  'AGENTS.md is the entry every agent reads: it holds the rule that documentation is part of a change, and the definition of done. The rules themselves are owned by one section of docs/development.md: what a change owes the pages, the impact review by kind of change, the contract for diagrams and pictures, the grades of a security claim, and the checks. They apply to three kinds of artefact: the pages, the pictures (the SVG diagrams drawn by one script, the Mermaid diagrams in the pages, the screenshots made by their scripts) and the six agent skills. Before a change is done, the impact review and the checks run: the contract tests, the link, personal and drift checks, the diagram check. A change is complete when it ends with the documentation review summary.', (d) => {
    const guide = d.node(230, 24, 300, 56, 'AGENTS.md', ['the entry: the rule and the definition of done'], 'green');
    const rules = d.node(170, 124, 420, 72, 'docs/development.md · Documentation', ['owns the rules: what a change owes, the impact review,', 'diagrams and pictures, security claims, the checks'], 'green');
    d.line([[guide.cx, guide.bottom], [guide.cx, rules.top]]);

    const pages = d.node(30, 264, 220, 72, 'Pages', ['guides · references', 'security model · assessment'], 'green');
    const pictures = d.node(270, 264, 220, 72, 'Pictures', ['SVG by one script · Mermaid', 'screenshots by their scripts'], 'green');
    const skills = d.node(510, 264, 220, 72, 'Skills', ['three for the CLI, three for MCP', 'the same from the status on'], 'green');
    // One trunk from the rules, forked to the three kinds, and joined again below them.
    d.line([[rules.cx, rules.bottom], [rules.cx, 230]], { head: false });
    d.line([[pages.cx, 230], [skills.cx, 230]], { head: false });
    for (const kind of [pages, pictures, skills]) d.line([[kind.cx, 230], [kind.cx, kind.top]]);
    d.line([[pages.cx, pages.bottom], [pages.cx, 370], [skills.cx, 370], [skills.cx, skills.bottom]], { head: false });

    const checks = d.node(150, 404, 460, 104, 'Before a change is done', [
      'the impact review, whatever files changed',
      'ToolReferenceTest · SkillsTest · the diagram script',
      'links · nothing personal · drift · the diagrams parse'], 'green');
    d.line([[rules.cx, 370], [rules.cx, checks.top]]);
    const done = d.node(190, 556, 380, 56, 'Change complete', ['ends with the documentation review summary'], 'green');
    d.line([[checks.cx, checks.bottom], [checks.cx, done.top]]);
  });

console.log('6 files written to docs/assets/diagrams');
