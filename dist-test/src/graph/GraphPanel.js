"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphPanel = void 0;
const vscode = __importStar(require("vscode"));
class GraphPanel {
    static async show(context, cli, repoPath, repoTitle) {
        const key = `graph:${repoPath}`;
        const existing = GraphPanel._panels.get(key);
        if (existing) {
            existing._panel.reveal(vscode.ViewColumn.Active);
            await existing._load(cli, repoPath);
            return;
        }
        const instance = new GraphPanel(context, key, repoTitle, repoPath);
        GraphPanel._panels.set(key, instance);
        await instance._load(cli, repoPath);
    }
    constructor(_context, _key, title, _repoPath) {
        this._context = _context;
        this._key = _key;
        this._repoPath = _repoPath;
        this._panel = vscode.window.createWebviewPanel("srsGraph", `Relations: ${title}`, { viewColumn: vscode.ViewColumn.Active, preserveFocus: false }, {
            enableScripts: true,
            localResourceRoots: [],
            retainContextWhenHidden: true,
        });
        this._panel.webview.onDidReceiveMessage((msg) => {
            if (msg.type === "openEntity" && typeof msg.id === "string") {
                vscode.commands.executeCommand("srs.openEntityById", msg.id, msg.kind ?? "note", this._repoPath);
            }
        });
        this._panel.onDidDispose(() => {
            GraphPanel._panels.delete(this._key);
        });
    }
    async _load(cli, repoPath) {
        this._panel.webview.html = loadingHtml();
        try {
            const [relPayload, notePayload, recordPayload] = await Promise.all([
                cli.runOk(repoPath, ["relation", "list"]),
                cli.runOk(repoPath, ["note", "list"]).catch(() => ({ notes: [] })),
                cli.runOk(repoPath, ["record", "list"]).catch(() => ({ records: [] })),
            ]);
            const labelMap = new Map();
            const kindMap = new Map();
            for (const n of notePayload.notes) {
                labelMap.set(n.instanceId, n.title);
                kindMap.set(n.instanceId, "note");
            }
            for (const r of recordPayload.records) {
                labelMap.set(r.instanceId, r.displayLabel);
                kindMap.set(r.instanceId, "record");
            }
            const nodeIds = new Set();
            const edges = [];
            for (const r of relPayload.relations) {
                nodeIds.add(r.sourceId);
                nodeIds.add(r.targetId);
                edges.push({
                    id: r.relationId,
                    source: r.sourceId,
                    target: r.targetId,
                    label: r.relationType,
                });
            }
            const nodes = Array.from(nodeIds).map((id) => ({
                id,
                label: labelMap.get(id) ?? id.slice(0, 8),
                kind: kindMap.get(id) ?? "note",
            }));
            this._panel.webview.html = graphHtml(nodes, edges);
        }
        catch (err) {
            this._panel.webview.html = errorHtml(String(err));
        }
    }
    dispose() {
        this._panel.dispose();
    }
}
exports.GraphPanel = GraphPanel;
GraphPanel._panels = new Map();
// ---- HTML generators ----
function loadingHtml() {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>body{display:flex;align-items:center;justify-content:center;height:100vh;margin:0;
  font-family:var(--vscode-font-family);color:var(--vscode-foreground);
  background:var(--vscode-editor-background)}</style>
  </head><body><p>Loading relation graph…</p></body></html>`;
}
function errorHtml(msg) {
    const safe = msg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);
  background:var(--vscode-editor-background);padding:2em}</style>
  </head><body><h2>Failed to load graph</h2><pre>${safe}</pre></body></html>`;
}
function graphHtml(nodes, edges) {
    const nodesJson = JSON.stringify(nodes);
    const edgesJson = JSON.stringify(edges);
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0; overflow: hidden;
    background: var(--vscode-editor-background);
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    user-select: none;
  }
  #toolbar {
    position: absolute; top: 8px; left: 8px; z-index: 10;
    display: flex; gap: 6px; align-items: center;
  }
  button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none; padding: 3px 10px; cursor: pointer; border-radius: 3px;
    font-size: 0.85em;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  #info {
    font-size: 0.8em; color: var(--vscode-descriptionForeground); padding: 2px 6px;
  }
  #empty {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    color: var(--vscode-descriptionForeground); font-style: italic;
    display: none;
  }
  svg { display: block; width: 100vw; height: 100vh; }
  .edge { stroke: var(--vscode-editorWidget-border, #555); stroke-width: 1.5; fill: none; }
  .edge-label {
    font-size: 10px; fill: var(--vscode-descriptionForeground);
    pointer-events: none; text-anchor: middle;
  }
  .node circle {
    fill: var(--vscode-badge-background, #0078d4);
    stroke: var(--vscode-focusBorder, #007acc);
    stroke-width: 1.5; cursor: pointer;
  }
  .node circle:hover { fill: var(--vscode-button-hoverBackground, #005a9e); }
  .node.pinned circle { stroke: var(--vscode-charts-yellow, #f9b700); stroke-width: 2.5; }
  .node text {
    font-size: 11px; fill: var(--vscode-foreground);
    pointer-events: none; dominant-baseline: middle; text-anchor: middle;
  }
  .arrow { fill: var(--vscode-editorWidget-border, #555); }
</style>
</head>
<body>
<div id="toolbar">
  <button id="btnReset">Reset layout</button>
  <span id="info"></span>
</div>
<div id="empty">No relations in this repository.</div>
<svg id="svg">
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="14" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" class="arrow"/>
    </marker>
  </defs>
  <g id="root">
    <g id="edgeGroup"></g>
    <g id="nodeGroup"></g>
  </g>
</svg>
<script>
(function() {
  const NODES = ${nodesJson};
  const EDGES = ${edgesJson};

  const vscode = acquireVsCodeApi();

  const svg = document.getElementById('svg');
  const root = document.getElementById('root');
  const edgeGroup = document.getElementById('edgeGroup');
  const nodeGroup = document.getElementById('nodeGroup');
  const info = document.getElementById('info');

  if (NODES.length === 0) {
    document.getElementById('empty').style.display = 'block';
    return;
  }

  info.textContent = NODES.length + ' nodes · ' + EDGES.length + ' edges';

  // ---- Layout state ----
  const W = () => window.innerWidth;
  const H = () => window.innerHeight;

  // Initialise node positions in a circle
  const pos = new Map(); // id -> {x, y, vx, vy, pinned}
  NODES.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / NODES.length;
    const r = Math.min(W(), H()) * 0.32;
    pos.set(n.id, {
      x: W() / 2 + r * Math.cos(angle),
      y: H() / 2 + r * Math.sin(angle),
      vx: 0, vy: 0,
      pinned: false,
    });
  });

  // Build adjacency for edge bundles
  const edgePairs = new Map(); // "a|b" -> count (for multi-edge offset)

  // ---- DOM elements ----
  const edgeEls = EDGES.map((e, i) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'edge');
    path.setAttribute('marker-end', 'url(#arrow)');
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('class', 'edge-label');
    text.textContent = e.label;
    edgeGroup.appendChild(path);
    edgeGroup.appendChild(text);
    return { path, text, edge: e };
  });

  const nodeEls = NODES.map((n) => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'node');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', '20');
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    const label = n.label.length > 12 ? n.label.slice(0, 11) + '…' : n.label;
    text.textContent = label;
    g.appendChild(circle);
    g.appendChild(text);
    nodeGroup.appendChild(g);

    // Drag
    let dragging = false;
    let dragOx = 0, dragOy = 0;
    circle.addEventListener('mousedown', (ev) => {
      ev.stopPropagation();
      dragging = true;
      const p = pos.get(n.id);
      const svgPt = svgPoint(ev);
      dragOx = svgPt.x - p.x;
      dragOy = svgPt.y - p.y;
      p.pinned = true;
      p.vx = 0; p.vy = 0;
      g.classList.add('pinned');
    });
    circle.addEventListener('dblclick', (ev) => {
      ev.stopPropagation();
      const p = pos.get(n.id);
      p.pinned = false;
      g.classList.remove('pinned');
    });
    circle.addEventListener('click', (ev) => {
      if (!dragging) {
        vscode.postMessage({ type: 'openEntity', id: n.id, kind: n.kind });
      }
    });

    svg.addEventListener('mousemove', (ev) => {
      if (!dragging) return;
      const p = pos.get(n.id);
      const svgPt = svgPoint(ev);
      p.x = svgPt.x - dragOx;
      p.y = svgPt.y - dragOy;
      p.vx = 0; p.vy = 0;
    });
    svg.addEventListener('mouseup', () => { dragging = false; });

    // Tooltip
    g.setAttribute('title', n.id);

    return { g, circle, text, node: n };
  });

  // SVG pan/zoom
  let panX = 0, panY = 0, scale = 1;
  let panning = false, panStartX = 0, panStartY = 0, panStartPanX = 0, panStartPanY = 0;

  svg.addEventListener('mousedown', (ev) => {
    if (ev.target === svg || ev.target === root) {
      panning = true;
      panStartX = ev.clientX;
      panStartY = ev.clientY;
      panStartPanX = panX;
      panStartPanY = panY;
    }
  });
  svg.addEventListener('mousemove', (ev) => {
    if (!panning) return;
    panX = panStartPanX + (ev.clientX - panStartX);
    panY = panStartPanY + (ev.clientY - panStartY);
    applyTransform();
  });
  svg.addEventListener('mouseup', () => { panning = false; });
  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const delta = ev.deltaY > 0 ? 0.9 : 1.1;
    scale = Math.max(0.1, Math.min(5, scale * delta));
    applyTransform();
  }, { passive: false });

  function applyTransform() {
    root.setAttribute('transform', \`translate(\${panX},\${panY}) scale(\${scale})\`);
  }

  document.getElementById('btnReset').addEventListener('click', () => {
    panX = 0; panY = 0; scale = 1;
    applyTransform();
    NODES.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / NODES.length;
      const r = Math.min(W(), H()) * 0.32;
      const p = pos.get(n.id);
      p.x = W() / 2 + r * Math.cos(angle);
      p.y = H() / 2 + r * Math.sin(angle);
      p.vx = 0; p.vy = 0;
      p.pinned = false;
    });
    nodeEls.forEach(({g}) => g.classList.remove('pinned'));
  });

  // ---- Force simulation ----
  const REPULSION = 4000;
  const SPRING_LEN = 140;
  const SPRING_K = 0.04;
  const DAMPING = 0.85;
  const CENTER_K = 0.008;

  function tick() {
    const nodes = NODES.map(n => pos.get(n.id));

    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist2 = dx * dx + dy * dy + 1;
        const dist = Math.sqrt(dist2);
        const force = REPULSION / dist2;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (!a.pinned) { a.vx -= fx; a.vy -= fy; }
        if (!b.pinned) { b.vx += fx; b.vy += fy; }
      }
    }

    // Spring (edges)
    for (const e of EDGES) {
      const a = pos.get(e.source), b = pos.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const stretch = dist - SPRING_LEN;
      const force = SPRING_K * stretch;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!a.pinned) { a.vx += fx; a.vy += fy; }
      if (!b.pinned) { b.vx -= fx; b.vy -= fy; }
    }

    // Weak center pull
    const cx = W() / 2, cy = H() / 2;
    for (const p of nodes) {
      if (!p.pinned) {
        p.vx += (cx - p.x) * CENTER_K;
        p.vy += (cy - p.y) * CENTER_K;
      }
    }

    // Integrate
    for (const p of nodes) {
      if (p.pinned) continue;
      p.vx *= DAMPING;
      p.vy *= DAMPING;
      p.x += p.vx;
      p.y += p.vy;
    }

    // Update DOM
    nodeEls.forEach(({ g, text, node }) => {
      const p = pos.get(node.id);
      g.setAttribute('transform', \`translate(\${p.x},\${p.y})\`);
    });

    edgeEls.forEach(({ path, text, edge }) => {
      const a = pos.get(edge.source), b = pos.get(edge.target);
      if (!a || !b) return;
      // Self-loop
      if (edge.source === edge.target) {
        const lx = a.x + 30, ly = a.y - 30;
        path.setAttribute('d', \`M \${a.x} \${a.y} C \${lx} \${a.y}, \${lx} \${ly}, \${a.x} \${a.y}\`);
        text.setAttribute('x', String(lx));
        text.setAttribute('y', String(ly - 6));
        return;
      }
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      // Shorten to node radius
      const r = 22;
      const sx = a.x + (dx / dist) * r, sy = a.y + (dy / dist) * r;
      const ex = b.x - (dx / dist) * r, ey = b.y - (dy / dist) * r;
      path.setAttribute('d', \`M \${sx} \${sy} L \${ex} \${ey}\`);
      text.setAttribute('x', String((sx + ex) / 2));
      text.setAttribute('y', String((sy + ey) / 2 - 5));
    });

    requestAnimationFrame(tick);
  }

  tick();

  // ---- Helpers ----
  function svgPoint(ev) {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const ctm = root.getScreenCTM();
    return pt.matrixTransform(ctm ? ctm.inverse() : undefined);
  }
})();
</script>
</body>
</html>`;
}
//# sourceMappingURL=GraphPanel.js.map