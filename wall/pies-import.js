/* 饼墙 · 批量粘贴识别（管理员）
   把石墨里的一段直接粘进来：自动识别 分组标题 / 《题目》 / 引文 / #标签 / 简介 / 档期，预览确认后一次导入。 */
(function () {
  var W = window.Wall, sb = W.sb, esc = W.esc, $ = W.$;
  var STATUS = { idea: "画饼中", scheduled: "定档预热", long: "长期群", done: "已完成" };

  /* ---------- 识别 ---------- */
  function cleanHeader(l) {
    // 去掉表情、装饰符号，例如「🥰已完成·四🎉」→「已完成·四」
    return l.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "").replace(/^[\s·•\-—~～]+|[\s·•\-—~～]+$/g, "").trim();
  }
  function headerInfo(h) {
    if (/已完成|已完结|完结/.test(h)) return { status: "done", category: "已完成" };
    if (/长期/.test(h)) return { status: "long", category: "长期群" };
    if (/定档|预热|招募|进行中/.test(h)) return { status: "scheduled", category: "" };
    return { status: "idea", category: h.replace(/[·・].*$/, "").replace(/特辑$/, "特辑") };
  }
  function parse(text, base) {
    var L = text.replace(/\r/g, "").split("\n").map(function (x) { return x.trim(); });
    var out = [], cur = null, grp = { status: base.status, category: base.category };
    function flush() { if (cur) { cur.quote = cur.quote.join("\n"); cur.intro = cur.intro.join("\n"); out.push(cur); cur = null; } }
    for (var i = 0; i < L.length; i++) {
      var l = L[i];
      if (!l) continue;
      if (/^[-—－–]+$/.test(l)) { flush(); continue; }
      if (l.indexOf("《") === 0) {
        flush();
        var t = l;
        while (t.indexOf("》") < 0 && i + 1 < L.length) { i++; t += L[i]; }
        var rest = t.slice(t.indexOf("》") + 1).trim();
        cur = { title: t.slice(1, t.indexOf("》")).trim(), status: grp.status, category: grp.category, quote: [], intro: [], tags: [], schedule: "" };
        if (rest) l = rest; else continue;
      }
      if (!cur) {
        var h = cleanHeader(l);
        if (h && h.length <= 20 && !/[#＃《]/.test(l)) { var g = headerInfo(h); grp = { status: g.status, category: g.category || grp.category }; }
        continue;
      }
      if (/^[#＃]/.test(l)) { cur.tags = cur.tags.concat(l.split(/[#＃]/).map(function (x) { return x.trim(); }).filter(Boolean)); continue; }
      var m = l.match(/^档期\s*[：:]\s*(.+)$/);
      if (m) { cur.schedule = m[1]; continue; }
      var openQ = cur.quote.length && !/[”」"』]$/.test(cur.quote[cur.quote.length - 1]);
      if (/^[“「"『]/.test(l) || openQ) { cur.quote.push(l); continue; }
      // 不在分组里却像分组标题的行（如下一组的「🧊玄幻特辑🧊」）：结束当前饼并切换分组
      var hh = cleanHeader(l);
      if (hh !== l && hh.length <= 20) { flush(); var g2 = headerInfo(hh); grp = { status: g2.status, category: g2.category || grp.category }; continue; }
      cur.intro.push(l);
    }
    flush();
    return out;
  }

  /* ---------- 界面 ---------- */
  function norm(t) { return String(t).replace(/^心跳节律/, "").replace(/^S[P]?\d+[：:\s]*/i, "").replace(/\s+/g, ""); }
  function open() {
    var wrap = document.createElement("div");
    wrap.className = "w-modal";
    wrap.innerHTML = '<div class="w-dialog glass imp"><header><b>批量粘贴识别</b><button type="button" class="w-x" aria-label="关闭">✕</button></header>' +
      '<div class="w-body">' +
      '<p class="hint" style="margin:10px 0 0">把石墨里的一段直接粘进来。会自动认出：分组标题（如「🥰已完成·四🎉」「🧊玄幻特辑🧊」）、《题目》、引文、#标签、简介、档期：…；用单独一行的「-」分隔每个饼。</p>' +
      '<div class="imp-defaults"><label class="field"><span>没有分组标题时，默认状态</span><select id="impStatus">' +
      Object.keys(STATUS).map(function (k) { return '<option value="' + k + '">' + STATUS[k] + "</option>"; }).join("") + "</select></label>" +
      '<label class="field"><span>默认题材分类</span><input id="impCat" placeholder="可空，例如 架空历史"></label></div>' +
      '<label class="field"><span>粘贴内容</span><textarea id="impText" rows="9" placeholder="《饼的名字》\n“引文……”\n#标签 #标签\n-\n《下一个饼》…"></textarea></label>' +
      '<div id="impPrev"></div></div>' +
      '<footer><span class="sp" id="impMsg"></span><button type="button" class="btn ghost" id="impRead">识别</button><button type="button" class="btn" id="impGo" disabled>导入</button></footer></div>';
    document.body.appendChild(wrap); document.body.classList.add("w-lock");
    var items = [];
    function close() { wrap.remove(); document.body.classList.remove("w-lock"); }
    wrap.querySelector(".w-x").onclick = function () { if (!items.length || confirm("还没导入，确定关闭吗？")) close(); };
    var existing = {};
    (window.PieWall ? window.PieWall.pies() : []).forEach(function (p) { existing[norm(p.title)] = p; });

    function preview() {
      var prev = wrap.querySelector("#impPrev");
      if (!items.length) { prev.innerHTML = '<p class="w-none">没有认出任何《题目》，检查一下格式？</p>'; wrap.querySelector("#impGo").disabled = true; return; }
      prev.innerHTML = '<div class="imp-head">认出 ' + items.length + " 个饼，勾选要导入的：</div>" + items.map(function (it, i) {
        var dup = existing[norm(it.title)];
        it.on = it.on === undefined ? !dup : it.on;
        return '<div class="imp-row' + (it.on ? "" : " skip") + '" data-i="' + i + '"><label class="imp-chk"><input type="checkbox"' + (it.on ? " checked" : "") + '></label><div class="imp-main">' +
          '<div class="imp-title"><b>《' + esc(it.title) + '》</b>' + (dup ? '<span class="imp-dup">已存在，默认不导入</span>' : "") + "</div>" +
          '<div class="imp-meta"><select data-k="status">' + Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + (k === it.status ? " selected" : "") + ">" + STATUS[k] + "</option>"; }).join("") + "</select>" +
          '<input data-k="category" value="' + esc(it.category) + '" placeholder="题材分类">' + (it.schedule ? "<span>档期 " + esc(it.schedule) + "</span>" : "") + "</div>" +
          (it.quote ? '<div class="imp-q">' + esc(it.quote).replace(/\n/g, "<br>") + "</div>" : "") +
          (it.tags.length ? '<div class="tags">' + it.tags.map(function (t) { return "<span>#" + esc(t) + "</span>"; }).join("") + "</div>" : "") +
          (it.intro ? '<div class="imp-i">' + esc(it.intro).replace(/\n/g, "<br>") + "</div>" : "") + "</div></div>";
      }).join("");
      count();
    }
    function count() {
      var n = items.filter(function (x) { return x.on; }).length;
      var go = wrap.querySelector("#impGo"); go.disabled = !n; go.textContent = "导入 " + n + " 个";
    }
    wrap.querySelector("#impRead").onclick = function () {
      items = parse(wrap.querySelector("#impText").value, { status: wrap.querySelector("#impStatus").value, category: wrap.querySelector("#impCat").value.trim() });
      preview();
    };
    wrap.querySelector("#impPrev").addEventListener("change", function (e) {
      var row = e.target.closest(".imp-row"); if (!row) return;
      var it = items[+row.dataset.i];
      if (e.target.type === "checkbox") { it.on = e.target.checked; row.classList.toggle("skip", !it.on); count(); }
      else it[e.target.dataset.k] = e.target.value.trim();
    });
    wrap.querySelector("#impGo").onclick = async function () {
      var pick = items.filter(function (x) { return x.on; });
      var max = (window.PieWall ? window.PieWall.pies() : []).reduce(function (m, p) { return Math.max(m, p.sort); }, 0);
      var rows = pick.map(function (it, k) {
        return { title: it.title, status: it.status, category: it.category, quote: it.quote, intro: it.intro, tags: it.tags, schedule: it.schedule, sort: max + k + 1 };
      });
      this.disabled = true; wrap.querySelector("#impMsg").textContent = "导入中……";
      var r = await sb.from("pies").insert(rows);
      if (r.error) { this.disabled = false; wrap.querySelector("#impMsg").textContent = ""; W.toast("导入失败：" + r.error.message, true); return; }
      close(); W.toast("小白猫收下了 " + rows.length + " 个新饼喵！");
      if (window.PieWall) window.PieWall.reload();
    };
  }

  document.addEventListener("DOMContentLoaded", function () {
    var b = $("#importPie"); if (b) b.addEventListener("click", open);
  });
  window.PieImport = { parse: parse };
})();
