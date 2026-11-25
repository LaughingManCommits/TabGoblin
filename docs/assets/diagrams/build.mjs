// Draws the documentation's diagrams as SVG files, each once for a light and once for a dark page.
//   node docs/assets/diagrams/build.mjs        from the repository root
// One style for all of them is kept here: change it in one place and draw them again. The files
// it writes are committed; nothing else reads this script. Open each picture after a change.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// The three colours, and the text for each ground. A fill is its colour at low opacity.
const SLATE = '#64748B';
const GREEN = '#16A34A';
const RED = '#DC2626';
const THEMES = {
  light: { text: '#0F172A', soft: '#475569', line: SLATE, fill: 0.07, redText: '#B91C1C', greenText: '#15803D' },
  dark: { text: '#E2E8F0', soft: '#94A3B8', line: '#94A3B8', fill: 0.14, redText: '#F87171', greenText: '#4ADE80' },
};
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const COLOUR = { slate: SLATE, green: GREEN, red: RED };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** One picture: shapes are added to it, and it writes itself for a theme. */
function picture(width, height, title, desc, draw) {
  for (const [name, t] of Object.entries(THEMES)) {
    const out = [];
    const api = {
      t,
      /** A component: a bold name and smaller lines under it. Returns where its edges are. */
      node(x, y, w, h, name, lines = [], kind = 'slate', opts = {}) {
        const c = COLOUR[kind];
        out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${c}" fill-opacity="${t.fill}" stroke="${c}" stroke-width="1.25"${opts.dashed ? ' stroke-dasharray="5 4"' : ''}/>`);
        const rows = 1 + lines.length;
        const [big, small, step] = opts.big ? [18, 14, 22] : [14, 12, 16];
        const first = y + h / 2 - ((rows - 1) * step) / 2 + big / 3;
        out.push(`<text x="${x + w / 2}" y="${first}" text-anchor="middle" font-size="${big}" font-weight="600" fill="${t.text}">${esc(name)}</text>`);
        lines.forEach((line, i) => out.push(
          `<text x="${x + w / 2}" y="${first + step * (i + 1)}" text-anchor="middle" font-size="${small}" fill="${t.soft}">${esc(line)}</text>`));
        return { x, y, w, h, cx: x + w / 2, cy: y + h / 2, top: y, bottom: y + h, left: x, right: x + w };
      },
      /** A container. Dashed is a trust boundary; solid says only what belongs together. */
      box(x, y, w, h, label, kind = 'slate', dashed = false) {
        const c = COLOUR[kind];
        out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${c}" fill-opacity="${dashed ? 0 : t.fill / 2}" stroke="${c}" stroke-width="${label ? 1 : 1.5}"${dashed ? ' stroke-dasharray="6 5"' : label ? ' stroke-opacity="0.55"' : ''}/>`);
        if (label) out.push(`<text x="${x + 14}" y="${y + 20}" font-size="11" font-weight="600" letter-spacing="0.6" fill="${kind === 'green' ? t.greenText : t.soft}">${esc(label.toUpperCase())}</text>`);
      },
      /** A connector through points, with an arrow head at its end unless told otherwise. */
      line(points, opts = {}) {
        const c = opts.kind === 'red' ? RED : opts.kind === 'green' ? GREEN : t.line;
        const head = opts.head === false ? '' : ` marker-end="url(#${opts.kind === 'red' ? 'head-red' : opts.kind === 'green' ? 'head-green' : 'head'})"`;
        const tail = opts.both ? ` marker-start="url(#tail)"` : '';
        out.push(`<polyline points="${points.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${c}" stroke-width="1.25"${opts.dashed ? ' stroke-dasharray="4 4"' : ''}${head}${tail}/>`);
      },
      /** A heading inside a container, centred. */
      heading(x, y, text) {
        out.push(`<text x="${x}" y="${y}" text-anchor="middle" font-size="19" font-weight="600" fill="${t.text}">${esc(text)}</text>`);
      },
      /** What the colours mean, said in words under the picture: a thin rule, then a dot and a word for each. */
      legend(y, items = [['slate', 'Components'], ['green', 'TabGoblin'], ['red', 'Denied']]) {
        out.push(`<line x1="24" y1="${y}" x2="${width - 24}" y2="${y}" stroke="${t.line}" stroke-opacity="0.35" stroke-width="1"/>`);
        const each = 118;
        let x = width / 2 - (items.length * each) / 2 + 10;
        for (const [kind, word] of items) {
          out.push(`<circle cx="${x}" cy="${y + 24}" r="5" fill="${COLOUR[kind]}"/>`);
          out.push(`<text x="${x + 12}" y="${y + 28}" font-size="12" fill="${t.soft}">${esc(word)}</text>`);
          x += each;
        }
      },
      /** A small label beside a connector. */
      label(x, y, text, opts = {}) {
        const fill = opts.kind === 'red' ? t.redText : opts.kind === 'green' ? t.greenText : t.soft;
        const lines = Array.isArray(text) ? text : [text];
        lines.forEach((line, i) => out.push(
          `<text x="${x}" y="${y + i * 14}" text-anchor="${opts.anchor ?? 'start'}" font-size="11"${opts.bold ? ' font-weight="600"' : ''}${opts.spaced ? ' letter-spacing="0.6"' : ''} fill="${fill}">${esc(line)}</text>`));
      },
    };
    draw(api);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" role="img" aria-labelledby="t d" font-family="${FONT}">
<title id="t">${esc(title)}</title>
<desc id="d">${esc(desc)}</desc>
<defs>
<marker id="head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0.8 L7,4 L0,7.2 z" fill="${t.line}"/></marker>
<marker id="tail" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0.8 L7,4 L0,7.2 z" fill="${t.line}"/></marker>
<marker id="head-red" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0.8 L7,4 L0,7.2 z" fill="${RED}"/></marker>
<marker id="head-green" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0.8 L7,4 L0,7.2 z" fill="${GREEN}"/></marker>
</defs>
${out.join('\n')}
</svg>
`;
    writeFileSync(join(HERE, name === 'light' ? `${title.file}.svg` : `${title.file}-dark.svg`), svg);
  }
}

/** A title that also carries the file's name. */
const named = (file, text) => Object.assign(new String(text), { file });

// ---- 1. Overview: the README's picture, after the owner's reference

picture(760, 742, named('overview', 'TabGoblin at a glance'),
  'An AI coding agent reaches TabGoblin through the CLI or through MCP, side by side. Both lead into the TabGoblin bridge, which checks identity, validates the request and applies the policy. The bridge leads to the browser extension, where execution is under the user\'s control: it reaches the tabs the user authorized, and every other tab is denied.', (d) => {
    const big = { big: true };
    const plain = { head: false };
    const agent = d.node(210, 20, 340, 64, 'AI coding agent', [], 'slate', big);
    const cli = d.node(40, 132, 320, 80, 'CLI', ['Local execution'], 'slate', big);
    const mcp = d.node(400, 132, 320, 80, 'MCP', ['Native integration'], 'slate', big);
    // One trunk from the agent, forked to the two interfaces, and joined again below them.
    d.line([[agent.cx, agent.bottom], [agent.cx, 108]], plain);
    d.line([[cli.cx, cli.top], [cli.cx, 108], [mcp.cx, 108], [mcp.cx, mcp.top]], plain);
    d.line([[cli.cx, cli.bottom], [cli.cx, 236], [mcp.cx, 236], [mcp.cx, mcp.bottom]], plain);
    d.line([[agent.cx, 236], [agent.cx, 260]], plain);

    d.box(80, 260, 600, 168, '', 'green');
    d.heading(380, 296, 'TabGoblin bridge');
    d.node(104, 318, 172, 84, 'Identity', ['agent key'], 'green', { big: true });
    d.node(294, 318, 172, 84, 'Validation', ['every request'], 'green', { big: true });
    d.node(484, 318, 172, 84, 'Policy', ['sites and limits'], 'green', { big: true });

    const ext = d.node(160, 476, 440, 80, 'Browser extension', ['User-controlled execution'], 'green', big);
    d.line([[380, 428], [380, ext.top]], plain);

    const tabs = d.node(40, 604, 320, 56, 'Tabs you authorized', [], 'slate', big);
    const other = d.node(400, 604, 320, 56, 'Every other tab', [], 'red', { big: true, dashed: true });
    d.line([[ext.cx, ext.bottom], [ext.cx, 580]], plain);
    d.line([[tabs.cx, tabs.top], [tabs.cx, 580], [ext.cx, 580]], plain);
    d.line([[ext.cx, 580], [other.cx, 580], [other.cx, other.top]], { head: false, kind: 'red', dashed: true });
    d.legend(692);
  });

// ---- 2. Components: the architecture's picture

picture(760, 1040, named('components', 'The components of TabGoblin'),
  'The CLI and the MCP link are two interfaces to one TabGoblin server, which has one set of tool definitions, one service and one WebSocket endpoint. In Chrome, the extension has a popup for the user, a worker that holds the rules, and a content script that works in the authorized tab.', (d) => {
    const agent = d.node(190, 20, 240, 48, 'Coding agent');

    d.box(40, 108, 540, 110, 'Integration interfaces', 'slate');
    const cli = d.node(70, 140, 220, 56, 'CLI', ['one process per command']);
    const link = d.node(330, 140, 220, 56, 'MCP link', ['one process per agent']);
    d.line([[agent.cx - 40, agent.bottom], [agent.cx - 40, 88], [cli.cx, 88], [cli.cx, cli.top]]);
    d.line([[agent.cx + 40, agent.bottom], [agent.cx + 40, 88], [link.cx, 88], [link.cx, link.top]]);
    d.label(cli.cx - 8, 102, 'runs a command', { anchor: 'end' });
    d.label(link.cx + 8, 102, 'MCP over stdio');

    d.box(40, 268, 540, 314, 'TabGoblin server', 'green');
    const tools = d.node(170, 300, 280, 56, 'Tool definitions', ['one set for both interfaces'], 'green');
    d.line([[cli.cx, cli.bottom], [cli.cx, 244], [tools.cx - 50, 244], [tools.cx - 50, tools.top]]);
    d.line([[link.cx, link.bottom], [link.cx, 244], [tools.cx + 50, 244], [tools.cx + 50, tools.top]]);
    d.label(link.cx + 10, 226, ['loopback socket: proof of token', 'and agent key, then tool calls']);
    const svc = d.node(170, 396, 280, 72, 'Service', ['validation · blocked sites', 'policy · submission ids'], 'green');
    d.line([[tools.cx, tools.bottom], [tools.cx, svc.top]]);
    const ws = d.node(170, 508, 280, 56, 'WebSocket endpoint', ['one port per agent'], 'green');
    d.line([[svc.cx, svc.bottom], [svc.cx, ws.top]]);

    const files = d.node(606, 396, 140, 72, 'Home folder', ['token · agent keys', 'settings · audit']);
    d.line([[svc.right, svc.cy], [files.left, svc.cy]], { dashed: true, head: false });

    d.box(40, 632, 706, 342, 'Chrome', 'slate', true);
    d.box(60, 660, 666, 208, 'TabGoblin extension', 'green');
    const worker = d.node(170, 690, 280, 56, 'Extension worker', ['sessions · rules · flows'], 'green');
    d.line([[ws.cx, ws.bottom], [ws.cx, worker.top]]);
    d.label(ws.cx + 10, 604, ['WebSocket on 127.0.0.1', 'paired · protocol 3']);
    const content = d.node(170, 790, 280, 56, 'Content script', ['fixed page operations'], 'green');
    d.line([[worker.cx, worker.bottom], [worker.cx, content.top]]);
    d.label(worker.cx + 10, 772, 'one operation');
    const popup = d.node(560, 690, 146, 56, 'Popup', ["the user's decisions"], 'green');
    d.line([[popup.left, popup.cy], [worker.right, popup.cy]]);
    d.label(505, popup.cy - 8, 'grants, answers', { anchor: 'middle' });
    const tab = d.node(170, 902, 280, 48, 'Authorized tab');
    d.line([[content.cx, content.bottom], [tab.cx, tab.top]]);
    d.legend(996, [['slate', 'Components'], ['green', 'TabGoblin']]);
  });

// ---- 3. Where a command is checked: the security model's picture

picture(800, 1066, named('command-checks', 'Where a command is checked'),
  'A command from the CLI or from MCP passes two checks in the TabGoblin server and four in the TabGoblin extension before one fixed operation runs in the authorized tab. A check that fails refuses the command with an error code. Whether the user is asked about a submission is configurable; the other checks are enforced. Taking credential-like text out of the result is best effort.', (d) => {
    const X = 150;
    const W = 280;
    const RX = 474;
    const RW = 276;
    const check = (y, h, name, lines, cls, codes, kind = 'green', no = 'no') => {
      const n = d.node(X, y, W, h, name, lines, kind, { dashed: cls === 'CONFIGURABLE' });
      d.label(X - 14, n.cy + 4, cls, { anchor: 'end', bold: true, spaced: true, kind: cls === 'ENFORCED' ? 'green' : undefined });
      if (codes) {
        const r = d.node(RX, n.cy - 26, RW, 52, 'Refused', codes, 'red');
        d.line([[n.right, n.cy], [r.left, n.cy]], { kind: 'red' });
        d.label(n.right + 6, n.cy - 7, no, { kind: 'red', bold: true });
      }
      return n;
    };
    const down = (a, b, text = 'yes') => {
      d.line([[a.cx, a.bottom], [b.cx, b.top]]);
      if (text) d.label(a.cx + 10, (a.bottom + b.top) / 2 + 4, text);
    };

    const agent = d.node(X, 20, W, 52, 'Coding agent', ['a CLI command or an MCP call']);
    d.box(20, 104, 760, 826, 'One operating-system account · application checks, not isolation between programs', 'slate', true);

    d.box(36, 134, 728, 222, 'TabGoblin server', 'green');
    const s1 = check(164, 72, 'Who is asking?', ['pairing token and agent key proven', 'agent not revoked'], 'ENFORCED', ['connection refused', 'AGENT_REVOKED']);
    const s2 = check(268, 72, 'Is the request allowed here?', ['arguments valid · site not blocked', 'within the policy'], 'ENFORCED', ['INVALID_ARGUMENT · SITE_BLOCKED', 'SITE_NOT_ALLOWED · ACCESS_RESTRICTED']);
    down(agent, s1, '');
    down(s1, s2);

    d.box(36, 378, 728, 430, 'TabGoblin extension · in Chrome', 'green');
    const e1 = check(408, 72, 'Is the session valid?', ["this agent's · not paused or expired", 'tab on its authorized origins'], 'ENFORCED', ['NOT_AUTHORIZED · SESSION_NOT_OWNED', 'PAUSED · SESSION_SUSPENDED']);
    const e2 = check(512, 56, 'Does the access level cover it?', ['Read · Explore · Read / Write'], 'ENFORCED', ['EXPLORE_NOT_AUTHORIZED', 'WRITE_NOT_AUTHORIZED']);
    const e3 = check(600, 72, 'A submission: ask the user?', ["the user's setting decides · always under", 'the strict profile or for high impact'], 'CONFIGURABLE', ['SUBMIT_DENIED', 'SUBMIT_NOT_CONFIRMED'], 'slate', 'deny');
    const e4 = check(704, 72, 'Still allowed?', ['checked again right before', 'the page is touched'], 'ENFORCED', ['CANCELLED · ORIGIN_MISMATCH', 'APPROVAL_STALE']);
    down(s2, e1);
    down(e1, e2);
    down(e2, e3);
    down(e3, e4, 'allowed, or not asked');

    const tab = d.node(X, 838, W, 56, 'Authorized tab', ['one fixed operation']);
    down(e4, tab);
    const result = d.node(X, 942, W, 56, 'Result to the agent', ['only allowlisted text · enforced', 'credentials taken out · best effort']);
    d.line([[tab.cx, tab.bottom], [result.cx, result.top]]);
    d.label(RX, result.cy - 3, ['Nothing is retried. A refusal ends', 'the command where it happens.']);
    d.legend(1022, [['slate', 'Components'], ['green', 'Enforced by TabGoblin'], ['red', 'Refused']]);
  });

// ---- 4. Deployment and data flow: the corporate assessment's picture

picture(760, 830, named('data-flow', 'Deployment boundary and data flow'),
  "Everything of TabGoblin runs on the developer's workstation under one operating-system account: the CLI and MCP interfaces, the TabGoblin server, and the TabGoblin extension in Chrome. Two flows leave the workstation, and TabGoblin makes neither: the agent's prompts to its model provider, and the tab's own HTTPS session with the web application.", (d) => {
    d.box(20, 20, 560, 640, "Developer's workstation · one operating-system account", 'slate', true);
    const agent = d.node(160, 54, 280, 48, 'Coding agent');
    const model = d.node(606, 54, 140, 48, 'Model provider');
    d.line([[agent.right, agent.cy], [model.left, agent.cy]]);
    d.label(606, 122, ['prompts that include', 'tool results']);

    const cli = d.node(50, 152, 230, 56, 'CLI', ['commands in · JSON out']);
    const mcp = d.node(320, 152, 230, 56, 'MCP', ['MCP over stdio']);
    d.line([[agent.cx - 40, agent.bottom], [agent.cx - 40, 128], [cli.cx, 128], [cli.cx, cli.top]], { both: true });
    d.line([[agent.cx + 40, agent.bottom], [agent.cx + 40, 128], [mcp.cx, 128], [mcp.cx, mcp.top]], { both: true });

    const server = d.node(160, 270, 280, 88, 'TabGoblin server', ['checks: agent key · arguments', 'blocked sites · policy', 'page content in transit only'], 'green');
    d.line([[cli.cx, cli.bottom], [cli.cx, 238], [server.cx - 50, 238], [server.cx - 50, server.top]], { both: true });
    d.line([[mcp.cx, mcp.bottom], [mcp.cx, 238], [server.cx + 50, 238], [server.cx + 50, server.top]], { both: true });
    d.label(mcp.cx + 10, 232, 'loopback sockets');

    const disk = d.node(456, 392, 108, 72, 'Home folder', ['token · keys', 'settings · audit']);
    d.line([[server.right, server.cy], [disk.cx, server.cy], [disk.cx, disk.top]], { dashed: true, head: false });

    d.box(40, 420, 400, 222, "Chrome · the developer's profile", 'slate', true);
    const ext = d.node(60, 452, 360, 88, 'TabGoblin extension', ['checks: session · origin · access level', 'policy · approval', 'four permissions, no host permissions'], 'green');
    d.line([[server.cx - 60, server.bottom], [server.cx - 60, ext.top]], { both: true });
    d.label(server.cx - 50, 392, ['WebSocket on 127.0.0.1', 'commands and results']);
    const tab = d.node(60, 578, 360, 48, 'Authorized tab');
    d.line([[ext.cx, ext.bottom], [tab.cx, tab.top]], { both: true });
    d.label(ext.cx + 10, 563, 'fixed page operations');

    const app = d.node(60, 716, 360, 48, 'Web application');
    d.line([[tab.cx, tab.bottom], [app.cx, app.top]], { both: true });
    d.label(tab.cx + 10, 692, ["HTTPS · the developer's own session"]);
    d.label(456, 736, ['TabGoblin itself makes no', 'connection out of the workstation.']);
    d.legend(786, [['slate', 'Components'], ['green', 'TabGoblin']]);
  });

console.log('8 files written to docs/assets/diagrams');
