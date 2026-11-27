/* 挂线墙 */
(function () {
  var W = window.Wall, sb = W.sb, esc = W.esc, $ = W.$;
  var seasons = [], lines = [], q = "";
  var main = $("#seasons"), nav = $("#snav");

  async function load() {
    var a = await sb.from("seasons").select("*").order("sort").order("id");
    var b = await sb.from("lines").select("*").order("sort").order("id");
    if (a.error || b.error) { main.innerHTML = '<div class="w-empty glass">挂线墙暂时连不上，请稍后刷新。</div>'; return; }
    seasons = a.data; lines = b.data;
    render();
  }

  function cardHTML(l) {
    var quote = (l.quote || "").split(/\n+/).filter(Boolean).map(function (x) { return "<p>" + esc(x) + "</p>"; }).join("");
    return '<article class="line-card" data-id="' + l.id + '" data-q="' + esc((l.a + " " + l.b + " " + l.quote).toLowerCase()) + '">' +
      '<div class="pair"><b>' + esc(l.a) + '</b><i class="heart" aria-hidden="true"></i><b>' + esc(l.b) + "</b></div>" +
      (quote ? '<div class="quote">' + quote + "</div>" : "") +
      '<div class="adm"><button type="button" data-act="edit-line">编辑</button><button type="button" data-act="del-line">删除</button></div></article>';
  }

  function render() {
    var keep = window.pageYOffset;
    var names = {};
    lines.forEach(function (l) { names[l.a] = 1; names[l.b] = 1; });
    $("#st-s").textContent = seasons.length; $("#st-l").textContent = lines.length; $("#st-n").textContent = Object.keys(names).length;
    nav.innerHTML = seasons.map(function (s) {
      return '<a href="#s-' + s.id + '" data-t="s-' + s.id + '"><b>' + esc(s.code) + "</b>" + esc(s.title) + "</a>";
    }).join("");
    main.innerHTML = seasons.map(function (s) {
      var ls = lines.filter(function (l) { return l.season_id === s.id; });
      return '<section class="season" id="s-' + s.id + '" data-id="' + s.id + '">' +
        '<header class="season-head' + (s.cover_url ? " has-cover" : "") + '"' + (s.cover_url ? ' style="--cover:url(&quot;' + esc(s.cover_url) + '&quot;)"' : "") + ">" +
        '<div class="sh-in"><span class="code">' + esc(s.code) + "</span><h2>" + esc(s.title) + "</h2>" +
        '<p>' + ls.length + " 条挂线" + (s.archive_id ? ' · <a class="to-archive" href="../archive/read.html?id=' + encodeURIComponent(s.archive_id) + '">读戏录 →</a>' : "") + "</p></div>" +
        '<div class="adm"><button type="button" data-act="add-line">＋ 挂线</button><button type="button" data-act="edit-season">编辑这一季</button></div></header>' +
        '<div class="line-grid">' + (ls.length ? ls.map(cardHTML).join("") : '<p class="w-none">这一季还没有挂线。</p>') + "</div></section>";
    }).join("");
    applySearch();
    window.scrollTo(0, keep);
  }

  /* 搜索 */
  function applySearch() {
    var hits = 0;
    main.querySelectorAll(".season").forEach(function (sec) {
      var any = false;
      sec.querySelectorAll(".line-card").forEach(function (c) {
        var ok = !q || c.dataset.q.indexOf(q) > -1;
        c.classList.toggle("off", !ok); if (ok) { any = true; hits++; }
      });
      sec.classList.toggle("off", !!q && !any);
    });
    nav.querySelectorAll("a").forEach(function (a) { var s = document.getElementById(a.dataset.t); a.classList.toggle("off", !!s && s.classList.contains("off")); });
    $("#q-meta").textContent = q ? (hits ? "找到 " + hits + " 条挂线" : "没有找到，换个名字试试") : "";
  }
  $("#q").addEventListener("input", function () { q = this.value.trim().toLowerCase(); applySearch(); });

  /* 随机一条 */
  $("#rand").addEventListener("click", function () {
    var cards = Array.prototype.slice.call(main.querySelectorAll(".line-card:not(.off)"));
    if (!cards.length) return;
    var c = cards[Math.floor(Math.random() * cards.length)];
    var y = c.getBoundingClientRect().top + window.pageYOffset - window.innerHeight / 2 + c.offsetHeight / 2;
    window.scrollTo({ top: y, behavior: "smooth" });
    main.querySelectorAll(".line-card.lucky").forEach(function (x) { x.classList.remove("lucky"); });
    void c.offsetWidth; c.classList.add("lucky");
  });

  /* 季度导航：跳转 + 高亮 */
  function stickH() { return ($(".bar") ? $(".bar").offsetHeight : 0) + $("#snavWrap").offsetHeight; }
  nav.addEventListener("click", function (e) {
    var a = e.target.closest("a[data-t]"); if (!a) return;
    e.preventDefault();
    var el = document.getElementById(a.dataset.t);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - stickH() - 10, behavior: "instant" });
  });
  var tick = false;
  window.addEventListener("scroll", function () {
    if (tick) return; tick = true;
    requestAnimationFrame(function () {
      tick = false;
      var line = stickH() + 30, cur = null;
      main.querySelectorAll(".season:not(.off)").forEach(function (s) { if (s.getBoundingClientRect().top <= line) cur = s; });
      nav.querySelectorAll("a").forEach(function (a) {
        var on = cur && a.dataset.t === cur.id;
        if (on && !a.classList.contains("on")) nav.scrollTo({ left: a.offsetLeft - nav.clientWidth / 2 + a.offsetWidth / 2, behavior: "smooth" });
        a.classList.toggle("on", !!on);
      });
      $("#rtop").classList.toggle("show", window.pageYOffset > 900);
    });
  }, { passive: true });
  $("#rtop").addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });

  /* ---------- 管理 ---------- */
  function sid(el) { return +el.closest(".season").dataset.id; }
  function lineFields(l) {
    return [
      { k: "a", label: "角色 A", value: l && l.a },
      { k: "b", label: "角色 B", value: l && l.b },
      { k: "quote", label: "台词 / 描述", type: "textarea", rows: 5, value: l && l.quote, hint: "可以多行" }
    ];
  }
  async function run(p, okMsg) {
    var r = await p;
    if (r && r.error) { W.toast("保存失败：" + r.error.message, true); return false; }
    if (okMsg) W.toast(okMsg);
    await load();
    return true;
  }
  main.addEventListener("click", async function (e) {
    var b = e.target.closest("button[data-act]"); if (!b || !W.isAdmin()) return;
    var act = b.dataset.act;
    if (act === "add-line") {
      var r = await W.form("新增挂线", lineFields());
      if (!r || !r.a || !r.b) return;
      var s = sid(b), max = lines.filter(function (l) { return l.season_id === s; }).reduce(function (m, l) { return Math.max(m, l.sort); }, 0);
      run(sb.from("lines").insert({ season_id: s, a: r.a, b: r.b, quote: r.quote, sort: max + 1 }), "已挂上");
    } else if (act === "edit-line" || act === "del-line") {
      var id = +b.closest(".line-card").dataset.id, l = lines.filter(function (x) { return x.id === id; })[0];
      if (act === "del-line") { if (confirm("删除「" + l.a + " × " + l.b + "」这条挂线？")) run(sb.from("lines").delete().eq("id", id), "已删除"); return; }
      var r2 = await W.form("编辑挂线", lineFields(l));
      if (r2) run(sb.from("lines").update({ a: r2.a, b: r2.b, quote: r2.quote }).eq("id", id), "已保存");
    } else if (act === "edit-season") {
      var s2 = seasons.filter(function (x) { return x.id === sid(b); })[0];
      var r3 = await W.form("编辑「" + s2.code + "」", [
        { k: "code", label: "编号", value: s2.code, placeholder: "S1 / SP1" },
        { k: "title", label: "季名", value: s2.title },
        { k: "cover", label: "换封面（可不选）", type: "file", hint: "会自动压缩；横图效果最好" },
        { k: "archive_id", label: "戏录馆编号（可空）", value: s2.archive_id || "", hint: "填了会出现「读戏录」入口" },
        { k: "sort", label: "排序（数字小的在前）", value: String(s2.sort) }
      ], { danger: "删除这一季" });
      if (!r3) return;
      if (r3.__danger) { if (confirm("删除「" + s2.title + "」和它的全部挂线？此操作无法撤销。")) run(sb.from("seasons").delete().eq("id", s2.id), "已删除"); return; }
      var patch = { code: r3.code, title: r3.title, archive_id: r3.archive_id || null, sort: +r3.sort || 0 };
      if (r3.cover) { W.toast("封面上传中……"); try { patch.cover_url = await W.uploadCover(r3.cover, "season-" + s2.id); } catch (err) { W.toast("封面上传失败：" + err.message, true); return; } }
      run(sb.from("seasons").update(patch).eq("id", s2.id), "已保存");
    }
  });
  $("#addSeason").addEventListener("click", async function () {
    var r = await W.form("新增一季", [
      { k: "code", label: "编号", placeholder: "S32" },
      { k: "title", label: "季名" },
      { k: "cover", label: "封面（可不选）", type: "file" }
    ]);
    if (!r || !r.title) return;
    var max = seasons.reduce(function (m, s) { return Math.max(m, s.sort); }, 0), row = { code: r.code || "S" + (seasons.length + 1), title: r.title, sort: max + 1 };
    if (r.cover) { try { row.cover_url = await W.uploadCover(r.cover, "season-new"); } catch (err) { W.toast("封面上传失败：" + err.message, true); } }
    run(sb.from("seasons").insert(row), "新的一季已开张");
  });

  W.live(["seasons", "lines"], load);
  load();
})();
