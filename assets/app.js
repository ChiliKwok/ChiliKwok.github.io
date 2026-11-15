/* 图多盖洛 · 页面渲染与交互 */
(function () {
  var page = document.body.getAttribute("data-page") || "player";
  var chapters = (window.GUIDE && window.GUIDE[page]) || [];
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  };

  /* ---------- 指令：把 "关键词 {占位} {?可选}" 变成可填写的指令条 ---------- */
  function cmdHTML(cmd) {
    var first = true;
    var body = cmd.c.split("\n").map(function (line) {
      var out = "", re = /\{(\??)([^}]+)\}/g, last = 0, m;
      var push = function (text) {
        if (!text) return;
        if (first) {
          var k = text.match(/^(\S+)([\s\S]*)$/);
          if (k) { out += "<b>" + esc(k[1]) + "</b>" + esc(k[2]); first = false; return; }
        }
        out += esc(text);
      };
      while ((m = re.exec(line))) {
        push(line.slice(last, m.index));
        first = false;
        out += '<span class="ph' + (m[1] ? " opt" : "") + '"' + (m[1] ? ' title="可以不填"' : "") + ">" + esc(m[2]) + "</span>";
        last = re.lastIndex;
      }
      push(line.slice(last));
      return out;
    }).join("\n");
    return '<button class="cmd" type="button" title="点一下复制"><code>' + body + "</code>" +
      '<span class="copy" aria-hidden="true">复制</span></button>' +
      (cmd.n ? '<div class="cmd-note">' + esc(cmd.n) + "</div>" : "");
  }

  function featureHTML(f) {
    var h = '<article class="feature reveal' + (f.legend ? " wide" : "") + '"><h3>' + esc(f.title) +
      (f.where ? '<span class="tag">' + esc(f.where) + "发送</span>" : "") +
      (f.isNew ? '<span class="tag new">NEW</span>' : "") + "</h3>";
    if (f.desc) h += "<p>" + esc(f.desc) + "</p>";
    h += (f.cmds || []).map(cmdHTML).join("");
    if (f.legend) h += '<div class="legend">' + f.legend.map(function (l) { return "<span>" + l.i + " " + esc(l.x) + "</span>"; }).join("") + "</div>";
    h += (f.notes || []).map(function (n) { return '<div class="note ' + (n.t === "warn" ? "warn" : "") + '">' + esc(n.x) + "</div>"; }).join("");
    return h + "</article>";
  }

  var main = $("#chapters"), rail = $("#rail");
  main.innerHTML = chapters.map(function (c) {
    return '<section class="chapter" id="' + c.id + '"><header class="ch-head"><span class="ch-num" aria-hidden="true">' + c.num +
      '</span><div class="ch-en">Chapter ' + esc(c.en) + "</div><h2>" + esc(c.title) + "</h2><p>" + esc(c.intro) +
      '</p></header><div class="features">' + c.features.map(featureHTML).join("") + "</div></section>";
  }).join("") + '<div class="empty"><b>没有找到这条指令</b>换个说法试试，比如「心动信」「小群」「背包」。</div>';
  rail.innerHTML = '<div class="rail-title">CONTENTS</div>' + chapters.map(function (c) {
    return '<a href="#' + c.id + '" data-id="' + c.id + '"><i>' + c.num + "</i>" + esc(c.title) + "</a>";
  }).join("");

  /* ---------- 复制 ---------- */
  function cmdText(code) {
    var out = "";
    code.childNodes.forEach(function (n) {
      if (n.nodeType === 1 && n.classList.contains("opt")) return; // 可选项不复制
      out += n.textContent;
    });
    return out.split("\n").map(function (l) { return l.replace(/[ \t]{2,}/g, " ").replace(/\s+$/, ""); }).join("\n");
  }
  var toast = $("#toast"), toastTimer;
  function say(msg) {
    toast.textContent = msg; toast.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 1600);
  }
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (ok, fail) {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy") ? ok() : fail(); } catch (err) { fail(err); }
      document.body.removeChild(ta);
    });
  }
  main.addEventListener("click", function (e) {
    var row = e.target.closest(".cmd");
    if (!row) return;
    var btn = $(".copy", row), text = cmdText($("code", row));
    var px = e.clientX || (row.getBoundingClientRect().right - 40), py = e.clientY || row.getBoundingClientRect().top;
    copy(text).then(function () {
      var paw = document.createElement("span");
      paw.className = "paw pawicon"; paw.style.left = px + "px"; paw.style.top = py + "px";
      document.body.appendChild(paw); setTimeout(function () { paw.remove(); }, 900);
      btn.textContent = "已复制"; row.classList.add("done"); say("已复制，去 QQ 粘贴后把灰框里的字换成自己的");
      setTimeout(function () { btn.textContent = "复制"; row.classList.remove("done"); }, 1400);
    }, function () { say("复制失败，请长按指令手动复制"); });
  });

  /* ---------- 搜索 ---------- */
  var input = $("#q"), meta = $("#q-meta"), box = $(".search");
  function runSearch() {
    var q = input.value.trim().toLowerCase();
    box.classList.toggle("has-value", !!q);
    document.body.classList.toggle("searching", !!q);
    var hits = 0;
    main.querySelectorAll(".chapter").forEach(function (ch) {
      var any = false;
      ch.querySelectorAll(".feature").forEach(function (f) {
        var hit = !q || f.textContent.toLowerCase().indexOf(q) > -1;
        f.classList.toggle("hide", !hit);
        if (hit) { any = true; hits += f.querySelectorAll(".cmd").length; f.classList.add("in"); }
      });
      ch.classList.toggle("hide", !any);
    });
    document.body.classList.toggle("no-hit", !!q && !hits);
    meta.textContent = q ? (hits ? "找到 " + hits + " 条相关指令" : "") : "";
  }
  input.addEventListener("input", runSearch);
  $("#q-clear").addEventListener("click", function () { input.value = ""; runSearch(); input.focus(); });

  /* ---------- 章节高亮、入场动画 ---------- */
  if ("IntersectionObserver" in window) {
    var links = {};
    rail.querySelectorAll("a").forEach(function (a) { links[a.getAttribute("data-id")] = a; });
    var spy = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (!en.isIntersecting) return;
        Object.keys(links).forEach(function (k) { links[k].classList.toggle("on", k === en.target.id); });
        var a = links[en.target.id];
        if (a && rail.scrollWidth > rail.clientWidth) rail.scrollTo({ left: a.offsetLeft - 16, behavior: "smooth" });
      });
    }, { rootMargin: "-30% 0px -60% 0px" });
    main.querySelectorAll(".chapter").forEach(function (s) { spy.observe(s); });

    var show = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); show.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".reveal").forEach(function (el) { show.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- 通行证：跟随指针微微倾斜 ---------- */
  var stage = $(".pass-stage"), pass = $(".pass");
  if (stage && window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    stage.addEventListener("pointermove", function (e) {
      var r = stage.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      pass.style.setProperty("--ry", (x * 14).toFixed(2) + "deg");
      pass.style.setProperty("--rx", (-y * 12).toFixed(2) + "deg");
      pass.style.setProperty("--sheen", (x * 60).toFixed(1) + "%");
    });
    stage.addEventListener("pointerleave", function () {
      pass.style.setProperty("--ry", "0deg"); pass.style.setProperty("--rx", "0deg"); pass.style.setProperty("--sheen", "-30%");
    });
  }

  /* ---------- 常用指令：点一下跳到对应卡片 ---------- */
  document.querySelectorAll("[data-jump]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (input.value) { input.value = ""; runSearch(); }
      var key = b.getAttribute("data-jump"), target = null;
      main.querySelectorAll(".feature h3").forEach(function (h) {
        if (!target && h.firstChild.textContent.indexOf(key) === 0) target = h.parentNode;
      });
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.classList.remove("flash"); void target.offsetWidth; target.classList.add("flash");
    });
  });

  /* ---------- 回到顶部 ---------- */
  var top = $("#top");
  if (top) {
    window.addEventListener("scroll", function () { top.classList.toggle("show", window.scrollY > 700); }, { passive: true });
    top.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
  }

  /* ---------- 飘落的粉色光点（很淡，12 颗） ---------- */
  var sky = $(".sky");
  if (sky && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var motes = "";
    for (var i = 0; i < 12; i++) {
      var size = 3 + Math.random() * 5;
      motes += '<i class="mote" style="left:' + (Math.random() * 100).toFixed(1) + "%;width:" + size.toFixed(1) + "px;height:" + size.toFixed(1) +
        "px;animation-duration:" + (14 + Math.random() * 16).toFixed(1) + "s;animation-delay:-" + (Math.random() * 30).toFixed(1) +
        "s;--drift:" + (Math.random() * 80 - 40).toFixed(0) + 'px"></i>';
    }
    sky.insertAdjacentHTML("beforeend", motes);
  }

  document.querySelectorAll("[data-version]").forEach(function (el) { el.textContent = window.GUIDE.version; });
})();
