/* 饼墙：进度实况 + 饼库（猫粮投喂排行）+ 长期群 + 已完成 */
(function () {
  var W = window.Wall, sb = W.sb, esc = W.esc, $ = W.$;
  var EMPTY = { scheduled: "还没有定好档期的饼，小白猫在日历上画圈圈等着喵～" };
  var STATUS = { running: "正在进行", recruiting: "正在招募", scheduled: "定档预热", idea: "画饼中", long: "长期群", done: "已完成" };
  // 管理员可选的状态：「正在进行」「已完成」由档期时间自动判断，也可以手动指定
  var PICK = ["idea", "scheduled", "long", "done"];

  /* ---------- 按北京时间自动判断状态 ---------- */
  function today() { return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); }
  function days(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5); }
  function stateOf(p) {
    // 只有「定档预热」的饼才按日期自动流转；改成画饼中、长期群等就不再看日期
    if (p.start_date && p.end_date && (p.status === "scheduled" || p.status === "running" || p.status === "recruiting")) {
      var t = today();
      if (t < p.start_date) return "scheduled";
      if (t <= p.end_date) return "running";
      return "done";
    }
    return p.status === "recruiting" ? "scheduled" : p.status;
  }
  // 数据库还没加日期列时（没运行 4_档期时间窗.sql），表单里先不出现日期
  function hasDates() { return pies.length > 0 && "start_date" in pies[0]; }
  function md(d) { var x = d.split("-"); return +x[1] + "." + +x[2]; }
  function whenHTML(p) {
    if (!p.start_date || !p.end_date) return p.schedule ? '<div class="sched">档期 · ' + esc(p.schedule) + "</div>" : "";
    var t = today(), st = stateOf(p), range = md(p.start_date) + " – " + md(p.end_date), tip = "";
    if (st === "scheduled") { var n = days(t, p.start_date); tip = n <= 1 ? "明天开播" : "距开播还有 " + n + " 天"; }
    else if (st === "running") tip = "进行中 · D" + days(p.start_date, t);
    else tip = "已于 " + md(p.end_date) + " 完结";
    return '<div class="sched"><span>档期 · ' + esc(p.schedule || range) + '</span><b class="when when-' + st + '">' + tip + "</b></div>";
  }
  var pies = [], cat = "全部", mine = {};
  try { mine = JSON.parse(localStorage.getItem("fed-pies") || "{}"); } catch (e) {}

  async function load() {
    var r = await sb.from("pies").select("*").order("sort").order("id");
    if (r.error) { $("#live").innerHTML = '<div class="w-empty glass">饼墙暂时连不上，请稍后刷新。</div>'; return; }
    pies = r.data; render();
  }

  function tagsHTML(p, max) {
    var t = p.tags || [], more = t.length - max;
    return '<div class="tags">' + t.slice(0, max).map(function (x) { return "<span>#" + esc(x) + "</span>"; }).join("") +
      (more > 0 ? '<span class="more" data-act="more">+' + more + "</span>" : "") + "</div>";
  }
  function cardHTML(p, rank) {
    var q = (p.quote || "").split(/\n+/).filter(Boolean).map(function (x) { return esc(x); }).join("<br>");
    // PDF 导入的简介按版面折了行：没有以句末标点结尾的行，和下一行接起来
    var paras = [], buf = "";
    (p.intro || "").split(/\n+/).forEach(function (x) {
      x = x.trim(); if (!x) return;
      buf += x;
      if (/[。！？!?…”」）)~～]$/.test(x)) { paras.push(buf); buf = ""; }
    });
    if (buf) paras.push(buf);
    var intro = paras.map(function (x) { return "<p>" + esc(x) + "</p>"; }).join("");
    var showRank = rank && rank <= 3 && p.feed_count > 0;
    return '<article class="pie' + (showRank ? " top top" + rank : "") + '" data-id="' + p.id + '">' +
      (showRank ? '<span class="rank">No.' + rank + "</span>" : "") +
      '<span class="st st-' + stateOf(p) + '">' + STATUS[stateOf(p)] + "</span>" +
      "<h3>《" + esc(p.title) + "》</h3>" +
      (q ? '<blockquote>' + q + "</blockquote>" : "") +
      tagsHTML(p, rank === undefined ? 99 : 6) +
      (intro ? '<div class="intro' + (paras.join("").length > 90 ? " clamp" : "") + '" data-act="intro">' + intro + "</div>" : "") +
      whenHTML(p) +
      (p.link ? '<a class="join" href="' + esc(p.link) + '" target="_blank" rel="noopener">报名 / 详情 →</a>' : "") +
      '<footer><span class="bowl"><i class="kib" aria-hidden="true"></i><b class="cnt">' + p.feed_count + "</b> 粒猫粮" +
      (mine[p.id] ? '<small>你喂过 ' + mine[p.id] + "</small>" : "") + '</span>' +
      '<button type="button" class="feed" data-act="feed">投喂 <span class="pawicon"></span></button></footer>' +
      '<div class="adm"><button type="button" data-act="edit">编辑</button><button type="button" data-act="del">删除</button></div></article>';
  }

  function render() {
    var by = function (s) { return pies.filter(function (p) { return stateOf(p) === s; }); };
    $("#st-total").textContent = pies.filter(function (p) { return stateOf(p) !== "done"; }).length;
    $("#st-feed").textContent = pies.reduce(function (n, p) { return n + p.feed_count; }, 0);
    $("#st-done").textContent = by("done").length;

    // 进度实况
    // 进度实况：正在进行（有才显示）+ 定档预热
    var bydate = function (a, b) { return String(a.start_date || "9999").localeCompare(String(b.start_date || "9999")) || a.sort - b.sort; };
    $("#live").innerHTML = ["running", "scheduled"].map(function (s) {
      var list = by(s).sort(bydate);
      if (!list.length && s === "running") return "";
      return '<div class="live-col"><h3><i class="dot dot-' + s + '"></i>' + STATUS[s] + "<small>" + list.length + "</small></h3>" +
        (list.length ? '<div class="pie-grid">' + list.map(function (p) { return cardHTML(p); }).join("") + "</div>" :
          '<div class="live-empty"><span class="pawicon"></span><p>' + EMPTY[s] + "</p></div>") + "</div>";
    }).join("");

    // 饼库：按猫粮排序
    var ideas = by("idea"), cats = [];
    ideas.forEach(function (p) { if (p.category && cats.indexOf(p.category) < 0) cats.push(p.category); });
    if (cat !== "全部" && cats.indexOf(cat) < 0) cat = "全部";
    $("#cats").innerHTML = ["全部"].concat(cats).map(function (c) {
      var n = c === "全部" ? ideas.length : ideas.filter(function (p) { return p.category === c; }).length;
      return '<button type="button" data-cat="' + esc(c) + '"' + (c === cat ? ' class="on"' : "") + ">" + esc(c) + "<small>" + n + "</small></button>";
    }).join("");
    var shown = ideas.filter(function (p) { return cat === "全部" || p.category === cat; })
      .sort(function (a, b) { return b.feed_count - a.feed_count || a.sort - b.sort; });
    $("#ideas").innerHTML = shown.map(function (p, i) { return cardHTML(p, i + 1); }).join("") || '<p class="w-none">这一格还没有饼，小白猫已经在和面了喵～</p>';

    $("#long").innerHTML = by("long").map(function (p) { return cardHTML(p); }).join("") || '<p class="w-none">暂时没有长期群，小白猫先去占个座喵～</p>';
    var done = by("done").sort(function (a, b) { return String(b.end_date || "").localeCompare(String(a.end_date || "")) || a.sort - b.sort; });
    $("#doneN").textContent = done.length;
    $("#done").innerHTML = done.map(function (p) {
      return '<div class="done-row" data-id="' + p.id + '"><b>《' + esc(p.title) + "》</b>" + (p.schedule || p.end_date ? "<span>" + esc(p.schedule || (md(p.start_date) + " – " + md(p.end_date))) + "</span>" : "") +
        '<div class="tags">' + (p.tags || []).slice(0, 5).map(function (x) { return "<span>#" + esc(x) + "</span>"; }).join("") + "</div>" +
        '<div class="adm"><button type="button" data-act="edit">编辑</button></div></div>';
    }).join("");
    masonry();
  }

  /* 瀑布流：按顺序把卡片放进当前最矮的一列（排名从左到右、从上到下） */
  function colsFor(w) { return w >= 960 ? 3 : w >= 640 ? 2 : 1; }
  function masonry() {
    document.querySelectorAll(".pie-grid").forEach(function (g) {
      var cards = Array.prototype.slice.call(g.querySelectorAll(".pie"));
      if (!cards.length) return;
      var n = colsFor(g.clientWidth || g.parentNode.clientWidth);
      var laid = g.firstElementChild && g.firstElementChild.classList.contains("m-col");
      if (laid && g.dataset.n === String(n) && !g.dataset.dirty) return;
      var cols = [];
      for (var i = 0; i < n; i++) { var c = document.createElement("div"); c.className = "m-col"; cols.push(c); }
      g.innerHTML = ""; cols.forEach(function (c) { g.appendChild(c); });
      g.classList.add("masonry"); g.style.setProperty("--n", n);
      cards.forEach(function (card) {
        var low = cols.reduce(function (a, b) { return b.offsetHeight < a.offsetHeight ? b : a; });
        low.appendChild(card);
      });
      g.dataset.n = n; delete g.dataset.dirty;
    });
  }
  var rz; window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(function () { document.querySelectorAll(".pie-grid").forEach(function (g) { g.dataset.dirty = 1; }); masonry(); }, 150); });

  $("#cats").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-cat]"); if (!b) return;
    cat = b.dataset.cat; render();
  });

  /* ---------- 投喂 ---------- */
  function burst(btn) {
    var r = btn.getBoundingClientRect();
    for (var i = 0; i < 7; i++) {
      var k = document.createElement("i");
      k.className = "kibble";
      k.style.left = r.left + r.width / 2 + "px"; k.style.top = r.top + "px";
      k.style.setProperty("--dx", (Math.random() * 120 - 60).toFixed(0) + "px");
      k.style.setProperty("--dy", (-40 - Math.random() * 70).toFixed(0) + "px");
      k.style.animationDelay = (i * 25) + "ms";
      document.body.appendChild(k);
      setTimeout(function (x) { x.remove(); }.bind(null, k), 900);
    }
    var plus = document.createElement("span");
    plus.className = "plus1"; plus.textContent = "+1";
    plus.style.left = r.left + r.width / 2 + "px"; plus.style.top = r.top - 6 + "px";
    document.body.appendChild(plus); setTimeout(function () { plus.remove(); }, 900);
  }
  async function feed(card, btn) {
    var id = +card.dataset.id, p = pies.filter(function (x) { return x.id === id; })[0];
    var cnt = card.querySelector(".cnt");
    p.feed_count++; cnt.textContent = p.feed_count; cnt.classList.remove("pop"); void cnt.offsetWidth; cnt.classList.add("pop");
    burst(btn);
    mine[id] = (mine[id] || 0) + 1;
    try { localStorage.setItem("fed-pies", JSON.stringify(mine)); } catch (e) {}
    var r = await sb.rpc("feed_pie", { p_pie: id, p_count: 1 });
    if (r.error) { p.feed_count--; cnt.textContent = p.feed_count; mine[id]--; W.toast(r.error.message || "猫碗打翻了，稍后再喂一次喵", true); return; }
    p.feed_count = r.data; cnt.textContent = r.data;
    $("#st-feed").textContent = pies.reduce(function (n, x) { return n + x.feed_count; }, 0);
  }

  /* ---------- 管理 ---------- */
  function fields(p) {
    p = p || {};
    return [
      { k: "title", label: "名字（不用加书名号）", value: p.title },
      { k: "status", label: "状态（选「定档预热」并填日期，会按北京时间自动变成 正在进行 → 已完成；改回画饼中即取消定档）", type: "select",
        value: p.status === "recruiting" || p.status === "running" ? "scheduled" : (p.status || "idea"), options: PICK.map(function (k) { return [k, STATUS[k]]; }) },
    ].concat(hasDates() ? [
      { k: "start_date", label: "开始日期（含 D0，可空）", type: "date", value: p.start_date || "" },
      { k: "end_date", label: "结束日期（可空）", type: "date", value: p.end_date || "" }
    ] : []).concat([
      { k: "category", label: "题材分类", value: p.category || "", placeholder: "架空历史 / 玄幻特辑 / 现代未来 / 欧风魔幻 …" },
      { k: "quote", label: "引文（可空）", type: "textarea", rows: 3, value: p.quote },
      { k: "tags", label: "标签（空格或 # 分隔）", value: (p.tags || []).join(" "), placeholder: "#武侠 #BG #PVE" },
      { k: "intro", label: "简介 / 梗概（可空）", type: "textarea", rows: 4, value: p.intro },
      { k: "schedule", label: "档期写法（可空，不填就按上面的日期显示）", value: p.schedule, placeholder: "12.1-12.6（含D0）" },
      { k: "link", label: "报名 / 详情链接（可空）", value: p.link || "" }
    ]);
  }
  function toRow(r) {
    return { title: r.title.replace(/^《|》$/g, ""), status: r.status, category: r.category, quote: r.quote, intro: r.intro, schedule: r.schedule, link: r.link || null,
      ...(hasDates() ? (r.status === "scheduled" || r.status === "done"
        ? { start_date: r.start_date || null, end_date: r.end_date || null }
        : { start_date: null, end_date: null }) : {}),
      tags: r.tags.split(/[#＃\s]+/).map(function (x) { return x.trim(); }).filter(Boolean) };
  }
  async function run(p, msg) {
    var r = await p;
    if (r && r.error) { W.toast("保存失败：" + r.error.message, true); return; }
    if (msg) W.toast(msg);
    load();
  }
  document.addEventListener("click", async function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    var card = b.closest("[data-id]");
    var act = b.dataset.act;
    if (act === "feed") return feed(card, b);
    if (act === "intro") { b.classList.toggle("open"); return; }
    if (act === "more") { card.classList.add("all-tags"); var p0 = pies.filter(function (x) { return x.id === +card.dataset.id; })[0]; b.parentNode.outerHTML = tagsHTML(p0, 99); return; }
    if (!W.isAdmin()) return;
    var id = card && +card.dataset.id, p = pies.filter(function (x) { return x.id === id; })[0];
    if (act === "del") { if (confirm("删除《" + p.title + "》？")) run(sb.from("pies").delete().eq("id", id), "已删除"); return; }
    if (act === "edit") {
      var r = await W.form("编辑《" + p.title + "》", fields(p));
      if (r) run(sb.from("pies").update(toRow(r)).eq("id", id), "已保存");
    }
  });
  $("#addPie").addEventListener("click", async function () {
    var r = await W.form("新增一个饼", fields());
    if (!r || !r.title) return;
    var row = toRow(r); row.sort = pies.reduce(function (m, p) { return Math.max(m, p.sort); }, 0) + 1;
    run(sb.from("pies").insert(row), "新饼出炉");
  });

  /* ---------- 实时：别人投喂时数字直接跳，内容变化时重排 ---------- */
  var t;
  sb.channel("pies-live").on("postgres_changes", { event: "*", schema: "public", table: "pies" }, function (pl) {
    if (pl.eventType === "UPDATE") {
      var p = pies.filter(function (x) { return x.id === pl.new.id; })[0];
      if (p && p.status === pl.new.status && p.start_date === pl.new.start_date && p.end_date === pl.new.end_date && p.category === pl.new.category && p.title === pl.new.title &&
          JSON.stringify(p.tags) === JSON.stringify(pl.new.tags) && p.quote === pl.new.quote && p.intro === pl.new.intro) {
        if (pl.new.feed_count > p.feed_count) {
          p.feed_count = pl.new.feed_count;
          document.querySelectorAll('.pie[data-id="' + p.id + '"] .cnt').forEach(function (c) { c.textContent = p.feed_count; c.classList.remove("pop"); void c.offsetWidth; c.classList.add("pop"); });
          $("#st-feed").textContent = pies.reduce(function (n, x) { return n + x.feed_count; }, 0);
        }
        clearTimeout(t); t = setTimeout(function () { document.querySelectorAll(".pie-grid").forEach(function (g) { g.dataset.dirty = 1; }); render(); }, 4000);   // 排名稍后再重排，避免正在点的卡片跳走
        return;
      }
    }
    clearTimeout(t); t = setTimeout(load, 300);
  }).subscribe();

  window.PieWall = { pies: function () { return pies; }, reload: load };
  window.addEventListener("scroll", function () { $("#rtop").classList.toggle("show", window.pageYOffset > 900); }, { passive: true });
  $("#rtop").addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
  load();
})();
