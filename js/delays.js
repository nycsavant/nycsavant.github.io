/* Delays: a week of ridership and train speed, linked to a map; worst segments. */
S.pages = S.pages || {};

S.pages.delays = async (root) => {
  const [dw, net, segs] = await Promise.all([S.load("delay_week.json"), S.load("network.json"), S.load("segments.json")]);
  const pos = new Map(net.stations.map((s) => [s[0], s]));
  const name = (id) => (pos.get(id) || [id, id])[1];
  root.innerHTML = `
    <div class="kicker">Riders and trains</div>
    <h1>When the trains slow down</h1>
    <p class="lede">The top chart is how many people entered the subway each hour this week. Below it, each row is a line and each cell is
    ten minutes: red means trains took longer than normal between stations, blue means faster. Hover anywhere to see that hour on the map.</p>
    <div class="card">
      <div class="chart" id="d-week"></div>
      <div class="legend">Train speed vs. normal for that hour
        <span>faster</span><span class="ramp" style="background:linear-gradient(90deg,${S.delayColor(-40)},${S.delayColor(0)},${S.delayColor(40)})"></span><span>slower (+40% or more)</span>
        <span><i style="background:var(--ink-3);opacity:.35"></i>Entries per hour, all stations</span></div>
    </div>
    <div class="grid2" style="margin-top:16px">
      <div class="card"><h3 style="margin-top:0" id="d-maptitle">Map</h3><div class="chart" id="d-map"></div></div>
      <div class="card"><h3 style="margin-top:0">Where the time goes</h3>
        <p class="note" style="margin-top:0">Station-to-station segments ranked by minutes lost per day: time beyond the schedule, added up over every train.</p>
        <div class="tablewrap" id="d-segs" style="max-height:470px"></div></div>
    </div>`;

  // ---------- week chart: entries (area) + line heat strips, one shared x ----------
  const el = root.querySelector("#d-week");
  const days = dw.days, nb = days.length * 144;
  const keys = Object.keys(dw.series);
  const routes = S.sortRoutes(Array.from(new Set(keys.map((k) => k.split("|")[0]))));
  const rowsData = routes.map((r) => {
    const a = dw.series[`${r}|0`] || [], b = dw.series[`${r}|1`] || [];
    return { r, v: d3.range(nb).map((i) => { const xs = [a[i], b[i]].filter((x) => x != null); return xs.length ? d3.mean(xs) : null; }) };
  });
  const W = Math.max(900, el.clientWidth), m = { t: 8, r: 10, b: 26, l: 46 }, AH = 110, RH = 19;
  const H = m.t + AH + 12 + routes.length * RH + m.b;
  const x = d3.scaleLinear([0, nb], [m.l, W - m.r]);
  const svg = d3.select(el).append("svg").attr("width", W).attr("height", H);
  const ent = (dw.entries || []).flatMap((d) => (d || new Array(24).fill(null)));
  const hasEnt = ent.some((v) => v != null);
  if (!hasEnt) {
    svg.append("text").attr("x", m.l + 8).attr("y", m.t + AH / 2).attr("class", "note").attr("fill", "var(--ink-3)")
      .text("Station entries for these days aren't published yet (NY Open Data runs a few days to weeks behind).");
  } else {
    const ya = d3.scaleLinear([0, d3.max(ent) || 1], [m.t + AH, m.t]).nice();
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(ya).ticks(3).tickFormat(d3.format("~s")));
    svg.append("path").datum(ent).attr("fill", "var(--ink-3)").attr("fill-opacity", 0.3)
      .attr("d", d3.area().defined((d) => d != null).x((_, i) => x(i * 6 + 3)).y0(ya(0)).y1((d) => ya(d)).curve(d3.curveStep));
  }
  const top = m.t + AH + 12;
  const cw = (W - m.l - m.r) / nb;
  rowsData.forEach((row, ri) => {
    const g = svg.append("g").attr("transform", `translate(0,${top + ri * RH})`);
    S.svgBullet(g, row.r, m.l - 14, (RH - 3) / 2, 15);
    // canvas-like: merge runs of equal color to keep the DOM light
    let i = 0;
    while (i < nb) {
      const c = S.delayColor(row.v[i] == null ? null : Math.round(row.v[i] / 5) * 5);
      let j = i + 1;
      while (j < nb && S.delayColor(row.v[j] == null ? null : Math.round(row.v[j] / 5) * 5) === c) j++;
      if (c !== "transparent") g.append("rect").attr("x", x(i)).attr("width", (j - i) * cw).attr("y", 0).attr("height", RH - 3).attr("fill", c);
      i = j;
    }
  });
  days.forEach((d, i) => {
    svg.append("line").attr("x1", x(i * 144)).attr("x2", x(i * 144)).attr("y1", m.t).attr("y2", H - m.b).attr("stroke", "var(--rule)");
    svg.append("text").attr("x", x(i * 144 + 72)).attr("y", H - 8).attr("text-anchor", "middle").text(S.fmt.date(d));
  });
  const cross = svg.append("line").attr("y1", m.t).attr("y2", H - m.b).attr("stroke", "var(--ink)").style("display", "none");
  svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.t - m.b).attr("fill", "transparent")
    .on("mousemove", (ev) => {
      const [px, py] = d3.pointer(ev);
      const bin = Math.max(0, Math.min(nb - 1, Math.floor(x.invert(px))));
      cross.style("display", null).attr("x1", x(bin + 0.5)).attr("x2", x(bin + 0.5));
      const di = Math.floor(bin / 144), sec = (bin % 144) * 600, hb = di * 24 + Math.floor(sec / 3600);
      const ri = Math.floor((py - top) / RH);
      let html = `<b>${S.fmt.date(days[di])}, ${S.fmt.clock(sec)}</b>`;
      if (hasEnt && ent[hb] != null) html += `<br>${S.fmt.num(ent[hb])} entries that hour`;
      if (ri >= 0 && ri < rowsData.length) {
        const v = rowsData[ri].v[bin];
        html += `<br>${S.bullet(rowsData[ri].r, "sm")} ${v == null ? "no trains" : `${S.fmt.signed(v, 0)}% vs. normal`}`;
      }
      S.tip(html, ev);
      paintMap(hb);
    }).on("mouseleave", () => { cross.style("display", "none"); S.untip(); });

  // ---------- map ----------
  const mel = root.querySelector("#d-map");
  const MW = Math.max(320, mel.clientWidth || 520), MH = 520;
  const proj = S.projection(MW, MH, net.stations.map((s) => ({ lat: s[2], lon: s[3] })));
  const msvg = d3.select(mel).append("svg").attr("width", MW).attr("height", MH);
  Object.values(net.lines).forEach((L) => {
    const sh = (L.dirs["1"] || Object.values(L.dirs)[0]).shape;
    if (sh && sh.length) msvg.append("path").attr("d", d3.line()(sh.map((p) => proj(p)))).attr("fill", "none")
      .attr("stroke", "var(--grid)").attr("stroke-width", 5).attr("stroke-linecap", "round");
  });
  // one map segment per station pair, averaging directions and lines
  const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const pairs = new Map();
  dw.segments.forEach((s, i) => {
    const k = pairKey(s[2], s[3]);
    if (!pos.has(s[2]) || !pos.has(s[3])) return;
    if (!pairs.has(k)) pairs.set(k, { a: s[2], b: s[3], idx: [] });
    pairs.get(k).idx.push(i);
  });
  const segSel = msvg.append("g").selectAll("line").data(Array.from(pairs.values())).join("line")
    .attr("x1", (d) => proj([pos.get(d.a)[3], pos.get(d.a)[2]])[0]).attr("y1", (d) => proj([pos.get(d.a)[3], pos.get(d.a)[2]])[1])
    .attr("x2", (d) => proj([pos.get(d.b)[3], pos.get(d.b)[2]])[0]).attr("y2", (d) => proj([pos.get(d.b)[3], pos.get(d.b)[2]])[1])
    .attr("stroke-width", 5).attr("stroke-linecap", "round");
  msvg.append("g").selectAll("circle").data(net.stations).join("circle")
    .attr("cx", (s) => proj([s[3], s[2]])[0]).attr("cy", (s) => proj([s[3], s[2]])[1]).attr("r", 1.6)
    .attr("fill", "var(--surface-1)").attr("stroke", "var(--ink-3)").attr("stroke-width", 0.8)
    .on("mousemove", (ev, s) => S.tip(`<b>${s[1]}</b><br>${S.sortRoutes(s[4].match(/[0-9A-Z]X?/g) || []).map((r) => S.bullet(r, "sm")).join(" ")}`, ev))
    .on("mouseleave", S.untip);
  const title = root.querySelector("#d-maptitle");
  function paintMap(hb) {
    const row = dw.hourly[hb] || [];
    segSel.attr("stroke", (d) => {
      const v = d.idx.map((i) => row[i]).filter((x) => x != null);
      return v.length ? S.delayColor(d3.mean(v), 25) : "var(--grid)";
    });
    const di = Math.floor(hb / 24);
    title.textContent = `Train speed, ${S.fmt.date(days[di])} ${S.fmt.clock((hb % 24) * 3600)}`;
  }
  paintMap(Math.min(dw.hourly.length - 1, 8 + 24 * Math.max(0, days.findIndex((d) => new Date(d + "T12:00").getDay() === 2))));

  // ---------- worst segments ----------
  const rows = S.objs(segs).slice(0, 300);
  S.table(root.querySelector("#d-segs"), [
    { key: "route_id", label: "", cls: "l", html: (r) => S.bullet(r.route_id, "sm") },
    { key: "from", label: "Segment", cls: "l wrap", html: (r) => `${name(r.from)} → ${name(r.to)}` },
    { key: "sched", label: "Sched", fmt: S.fmt.mins, desc: false },
    { key: "median", label: "Average", fmt: S.fmt.mins },
    { key: "lost_min_per_day", label: "Min lost/day", fmt: (x) => S.fmt.num(x, 0) },
  ], rows, { sort: "lost_min_per_day" });
};
