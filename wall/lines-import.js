/* 挂线墙 · 批量粘贴识别（管理员）
   粘进来自动认出：季标题「S32：xxx」/ 挂线「A×B」/ 台词；单独一行的「-」分隔。预览确认后一次导入。 */
(function () {
  var W = window.Wall, sb = W.sb, esc = W.esc, $ = W.$;

  var SEASON_RE = /^(S\d+|SP\d+)\s*[：:]\s*(.+)$/i;
  var PAIR_RE = /^([^“”"「」，。！？…：:\s][^“”"「」，。！？…]{0,14}?)\s*[×xX＆&✕]\s*([^“”"「」，。！？…：:\s][^“”"「」，。！？…]{0,14}?)\s*[：:]?$/;

  function parse(text) {
    var L = text.replace(/\r/g, "").split("\n").map(function (x) { return x.trim(); });
    // 单独一行的右引号并到上一行（石墨复制常见）
    var M = [];
    L.forEach(function (l) {
      var prev = M[M.length - 1] || "";
      var open = (prev.match(/[“「『]/g) || []).length > (prev.match(/[”」』]/g) || []).length;
      if (/^[”」"』]$/.test(l) && open) M[M.length - 1] += l;
      else if (/^[”」"』]$/.test(l)) return;
      else M.push(l);
    });
    var seasons = [], cur = null, line = null;
    function ensure() { if (!cur) { cur = { code: "", title: "", lines: [] }; seasons.push(cur); } }
    M.forEach(function (l) {
      if (!l) return;
      var s = l.match(SEASON_RE);
      if (s) { cur = { code: s[1].toUpperCase(), title: s[2].trim(), lines: [] }; seasons.push(cur); line = null; return; }
      if (/^[-—－–]+$/.test(l)) { line = null; return; }
      var p = l.match(PAIR_RE) || l.match(/^([^“”"「」，。！？…：:\s]{1,15})\s*[×xX＆&✕]\s*([？?])\s*[：:]?$/);
      if (p && l.length <= 32 && !/[“”"「」]/.test(l)) {
        ensure(); line = { a: p[1].trim(), b: p[2].trim(), quote: [] }; cur.lines.push(line); return;
      }
      if (line) line.quote.push(l);
    });
    seasons.forEach(function (s) { s.lines.forEach(function (l) { l.quote = l.quote.join("\n"); }); });
    return seasons.filter(function (s) { return s.lines.length || s.title; });
  }

  function open() {
    var LW = window.LineWall, exist = LW ? LW.seasons() : [], allLines = LW ? LW.lines() : [];
    var wrap = document.createElement("div");
    wrap.className = "w-modal";
    wrap.innerHTML = '<div class="w-dialog glass imp"><header><b>批量粘贴识别 · 挂线</b><button type="button" class="w-x" aria-label="关闭">✕</button></header>' +
      '<div class="w-body"><p class="hint" style="margin:10px 0 0">粘进来会自动认出：季标题（如「S32：重生之军校生」）、挂线「A×B」、下面的台词；用单独一行的「-」分隔每条挂线。没写季标题的，导入到下面选的那一季。</p>' +
      '<label class="field"><span>没有季标题时，放进哪一季</span><select id="limSeason">' +
      exist.map(function (s) { return '<option value="' + s.id + '">' + esc(s.code + " · " + s.title) + "</option>"; }).reverse().join("") + "</select></label>" +
      '<label class="field"><span>粘贴内容</span><textarea id="limText" rows="9" placeholder="S32：季名（可省略）\n甲×乙\n“台词……”\n-\n丙×丁\n台词……"></textarea></label><div id="limPrev"></div></div>' +
      '<footer><span class="sp" id="limMsg"></span><button type="button" class="btn ghost" id="limRead">识别</button><button type="button" class="btn" id="limGo" disabled>导入</button></footer></div>';
    document.body.appendChild(wrap); document.body.classList.add("w-lock");
    var groups = [];
    function close() { wrap.remove(); document.body.classList.remove("w-lock"); }
    wrap.querySelector(".w-x").onclick = function () { if (!groups.length || confirm("还没导入，确定关闭吗？")) close(); };

    function findSeason(g) {
      if (!g.code && !g.title) return exist.filter(function (s) { return String(s.id) === wrap.querySelector("#limSeason").value; })[0];
      return exist.filter(function (s) { return (g.code && s.code.toUpperCase() === g.code) || (g.title && s.title === g.title); })[0];
    }
    function key(a, b, q) { return a + "×" + b + "|" + String(q || "").replace(/\s+/g, ""); }
    function preview() {
      var prev = wrap.querySelector("#limPrev"), total = 0;
      if (!groups.length) { prev.innerHTML = '<p class="w-none">没有认出「A×B」格式的挂线，检查一下？</p>'; count(); return; }
      prev.innerHTML = groups.map(function (g, gi) {
        var target = findSeason(g);
        g.target = target;
        var seen = {};
        if (target) allLines.filter(function (l) { return l.season_id === target.id; }).forEach(function (l) { seen[key(l.a, l.b, l.quote)] = 1; });
        return '<div class="imp-group"><div class="imp-head">' + (target ? "放进已有的 <b>" + esc(target.code + " · " + target.title) + "</b>" :
          '新建一季 <b>' + esc((g.code || "") + (g.code ? " · " : "") + (g.title || "（未命名）")) + "</b>") + " · " + g.lines.length + " 条</div>" +
          g.lines.map(function (l, li) {
            var dup = !!seen[key(l.a, l.b, l.quote)];
            if (l.on === undefined) l.on = !dup;
            total++;
            return '<div class="imp-row' + (l.on ? "" : " skip") + '" data-g="' + gi + '" data-l="' + li + '"><label class="imp-chk"><input type="checkbox"' + (l.on ? " checked" : "") + '></label><div class="imp-main">' +
              '<div class="imp-title"><b>' + esc(l.a) + " ♡ " + esc(l.b) + "</b>" + (dup ? '<span class="imp-dup">已存在，默认不导入</span>' : "") + "</div>" +
              (l.quote ? '<div class="imp-q">' + esc(l.quote).replace(/\n/g, "<br>") + "</div>" : "") + "</div></div>";
          }).join("") + "</div>";
      }).join("");
      count();
    }
    function count() {
      var n = 0; groups.forEach(function (g) { g.lines.forEach(function (l) { if (l.on) n++; }); });
      var go = wrap.querySelector("#limGo"); go.disabled = !n; go.textContent = "导入 " + n + " 条";
    }
    wrap.querySelector("#limRead").onclick = function () { groups = parse(wrap.querySelector("#limText").value); preview(); };
    wrap.querySelector("#limSeason").onchange = function () { if (groups.length) preview(); };
    wrap.querySelector("#limPrev").addEventListener("change", function (e) {
      var row = e.target.closest(".imp-row"); if (!row || e.target.type !== "checkbox") return;
      groups[+row.dataset.g].lines[+row.dataset.l].on = e.target.checked; row.classList.toggle("skip", !e.target.checked); count();
    });
    wrap.querySelector("#limGo").onclick = async function () {
      var btn = this; btn.disabled = true; wrap.querySelector("#limMsg").textContent = "导入中……";
      var maxSort = exist.reduce(function (m, s) { return Math.max(m, s.sort); }, 0), n = 0;
      try {
        for (var i = 0; i < groups.length; i++) {
          var g = groups[i], pick = g.lines.filter(function (l) { return l.on; });
          if (!pick.length) continue;
          var sid = g.target && g.target.id;
          if (!sid) {
            var ins = await sb.from("seasons").insert({ code: g.code || "S" + (exist.length + 1), title: g.title || "未命名", sort: ++maxSort }).select("id").single();
            if (ins.error) throw ins.error;
            sid = ins.data.id;
          }
          var base = allLines.filter(function (l) { return l.season_id === sid; }).reduce(function (m, l) { return Math.max(m, l.sort); }, 0);
          var r = await sb.from("lines").insert(pick.map(function (l, k) { return { season_id: sid, a: l.a, b: l.b, quote: l.quote, sort: base + k + 1 }; }));
          if (r.error) throw r.error;
          n += pick.length;
        }
        close(); W.toast("小白猫把 " + n + " 条挂线挂上墙了喵！");
        if (LW) LW.reload();
      } catch (err) {
        btn.disabled = false; wrap.querySelector("#limMsg").textContent = "";
        W.toast("导入失败：" + err.message + (n ? "（前 " + n + " 条已导入）" : ""), true);
        if (LW) LW.reload();
      }
    };
  }

  document.addEventListener("DOMContentLoaded", function () { var b = $("#importLines"); if (b) b.addEventListener("click", open); });
  window.LineImport = { parse: parse };
})();
