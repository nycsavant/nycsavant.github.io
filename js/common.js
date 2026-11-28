/* Shared helpers: data loading, route bullets, tooltips, sortable tables, formats. */
const S = window.S = {};

S.cache = {};
S.load = (name) => S.cache[name] || (S.cache[name] = d3.json(`data/${name}`));

S.css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

S.fmt = {
  pct: (x) => x == null ? "–" : `${(x * 100).toFixed(1)}%`,
  pct0: (x) => x == null ? "–" : `${Math.round(x * 100)}%`,
  num: (x, d = 0) => x == null ? "–" : (+x).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }),
  signed: (x, d = 1) => x == null ? "–" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(d)}`,
  // seconds -> "+1:23" / "−0:45"
  mmss: (s) => {
    if (s == null || isNaN(s)) return "–";
    const sign = s > 0 ? "+" : s < 0 ? "−" : "";
    const a = Math.round(Math.abs(s));
    return `${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
  },
  mins: (s) => s == null ? "–" : `${(s / 60).toFixed(1)} min`,
  clock: (s) => {
    s = ((Math.round(s) % 86400) + 86400) % 86400;
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    return `${(h % 12) || 12}:${String(m).padStart(2, "0")}${h < 12 ? "a" : "p"}`;
  },
  date: (d) => new Date(d + "T12:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
};

/* ---------- routes ---------- */
S.lineInfo = {};
S.routeOrder = ["1","2","3","4","5","6","6X","7","7X","A","C","E","B","D","F","FX","M","G","J","Z","L","N","Q","R","W","GS","FS","H","SI"];
S.label = (r) => ({ GS: "S", FS: "S", H: "S", "6X": "6", "7X": "7", FX: "F" }[r] || r);
S.bullet = (r, size = "") => {
  const L = S.lineInfo[r] || { color: "#808183", text: "#fff" };
  const diamond = /X$/.test(r) ? " diamond" : "";
  const txt = r === "SI" ? "SIR" : S.label(r);
  const fs = r === "SI" ? "font-size:9px;" : "";
  return `<span class="bullet ${size}${diamond}" title="${r}" style="background:${L.color};color:${L.text};${fs}"><span>${txt}</span></span>`;
};
// the same bullet drawn in SVG, for labels inside charts (HTML in a foreignObject
// gets clipped, and Safari misplaces rotated diamonds there)
S.svgBullet = (sel, r, cx, cy, d = 16) => {
  const L = S.lineInfo[r] || { color: "#808183", text: "#fff" };
  const g = sel.append("g").attr("transform", `translate(${cx},${cy})`);
  g.append("title").text(r);
  if (/X$/.test(r)) {
    const s = d / Math.SQRT2;
    g.append("rect").attr("x", -s / 2).attr("y", -s / 2).attr("width", s).attr("height", s).attr("rx", 2)
      .attr("transform", "rotate(45)").attr("fill", L.color);
  } else {
    g.append("circle").attr("r", d / 2).attr("fill", L.color);
  }
  g.append("text").attr("text-anchor", "middle").attr("dy", "0.36em").style("fill", L.text)
    .attr("font-size", r === "SI" ? d * 0.42 : d * 0.62).attr("font-weight", 700)
    .text(r === "SI" ? "SIR" : S.label(r));
  return g;
};
S.busRoute = (r) => `<span class="busroute${r.includes("+") ? " sbs" : ""}">${r.replace("+", " SBS")}</span>`;
S.sortRoutes = (rs) => rs.slice().sort((a, b) => {
  const ia = S.routeOrder.indexOf(a), ib = S.routeOrder.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
});

/* ---------- tooltip ---------- */
const tipEl = () => document.getElementById("tip");
S.tip = (html, ev) => {
  const t = tipEl();
  t.innerHTML = html;
  t.hidden = false;
  const pad = 14, w = t.offsetWidth, h = t.offsetHeight;
  let x = ev.clientX + pad, y = ev.clientY + pad;
  if (x + w > innerWidth - 8) x = ev.clientX - w - pad;
  if (y + h > innerHeight - 8) y = ev.clientY - h - pad;
  t.style.left = x + "px"; t.style.top = y + "px";
};
S.untip = () => { tipEl().hidden = true; };

/* ---------- sortable table ----------
   cols: [{key, label, fmt?, cls?, html?}]  rows: array of objects */
S.table = (el, cols, rows, { sort, desc = true, onClick, rank = true, limit } = {}) => {
  let key = sort || cols[0].key, d = desc;
  const wrap = d3.select(el).html("");
  const table = wrap.append("table").attr("class", "t");
  const head = table.append("thead").append("tr");
  if (rank) head.append("th").attr("class", "l rank").text("#");
  head.selectAll("th.c").data(cols).join("th").attr("class", (c) => "c " + (c.cls || ""))
    .text((c) => c.label).attr("title", (c) => c.title || null)
    .on("click", (_, c) => { if (key === c.key) d = !d; else { key = c.key; d = c.desc !== false; } draw(); });
  const body = table.append("tbody");
  function draw() {
    head.selectAll("th.c").classed("sorted", (c) => c.key === key);
    const s = rows.slice().sort((a, b) => {
      const x = a[key], y = b[key];
      if (x == null) return 1; if (y == null) return -1;
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * (d ? -1 : 1);
    });
    const shown = limit ? s.slice(0, limit) : s;
    const tr = body.selectAll("tr").data(shown).join("tr").on("click", (_, r) => onClick && onClick(r));
    tr.html((r, i) => (rank ? `<td class="l rank">${i + 1}</td>` : "") + cols.map((c) =>
      `<td class="${c.cls || ""}">${c.html ? c.html(r) : c.fmt ? c.fmt(r[c.key]) : r[c.key] ?? "–"}</td>`).join(""));
  }
  draw();
  return { redraw: (newRows) => { rows = newRows; draw(); } };
};

/* rows-from-cols helper for the compact JSON the exporter writes */
S.objs = (blob, key = "rows") => blob[key].map((r) => Object.fromEntries(blob.cols.map((c, i) => [c, r[i]])));

/* percentile rank (0-100) of v within arr, higher-is-better unless invert */
S.pctile = (arr, v, invert = false) => {
  const a = arr.filter((x) => x != null);
  if (v == null || !a.length) return null;
  const below = a.filter((x) => (invert ? x > v : x < v)).length;
  const eq = a.filter((x) => x === v).length;
  return Math.round(((below + eq / 2) / a.length) * 100);
};

/* Savant-style diverging color: blue (poor) -> gray -> red (great) */
S.savantColor = (p) => {
  const mid = S.css("--mid"), good = S.css("--good"), bad = S.css("--bad");
  return p >= 50 ? d3.interpolateRgb(mid, good)((p - 50) / 50) : d3.interpolateRgb(bad, mid)(p / 50);
};
/* diverging scale for delay: blue = faster than normal, gray = normal, red = slower */
S.delayColor = (rel, max = 40) => {
  if (rel == null) return "transparent";
  const mid = S.css("--mid"), red = "#d03b3b", blue = S.css("--series-1");
  const t = Math.max(-1, Math.min(1, rel / max));
  return t >= 0 ? d3.interpolateRgb(mid, red)(t) : d3.interpolateRgb(mid, blue)(-t);
};

S.el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };

/* map projection fit to the subway system */
S.projection = (w, h, stations, pad = 12) => d3.geoMercator().fitExtent([[pad, pad], [w - pad, h - pad]],
  { type: "MultiPoint", coordinates: stations.map((s) => [s.lon, s.lat]) });
