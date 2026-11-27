/* 戏录馆 · 阅读排版
   Reader.render(容器, 书, 取图函数)。取图函数 (编号) → Promise<图片地址>。
   上传页的预览和正式阅读页共用这一份排版。 */
(function (g) {
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }
  /* 角色颜色：全部取粉紫色系，靠色相和深浅区分；按角色出场顺序依次分配，尽量不撞色 */
  var HUES = ["#f0a8f0", "#b48cf2", "#e39ef5", "#d9b8ff", "#c77fe6", "#9f86e9", "#f5bff5", "#a875e0", "#ec95e6", "#a8a0ff", "#dcb0f0", "#8f6fd8", "#f2a6ec", "#c4a0f5"];
  var colorMap = {};
  function hue(name) {
    if (colorMap[name]) return colorMap[name];
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return HUES[h % HUES.length];
  }
  function assignColors(book) {
    colorMap = {}; var k = 0;
    function add(n) { if (n && !colorMap[n]) colorMap[n] = HUES[k++ % HUES.length]; }
    book.days.forEach(function (d) {
      d.scenes.forEach(function (sc) { (sc.who || []).forEach(add); (sc.lines || []).forEach(function (l) { add(l.s); }); });
    });
  }

  /* 一段内容：文字 + 图片，按原顺序 */
  function partsHTML(parts, letter) {
    var out = "", buf = "";
    function line(x) {
      if (letter) {
        var m = x.match(/^\s*(发信人|收信人|传递方式)[：:]\s*(.*)$/);
        if (m) return '<p class="lt-meta"><span>' + m[1] + "</span>" + esc(m[2]) + "</p>";
        x = x.replace(/^\s*内容[：:]\s*/, "");
        if (!x.trim()) return "";
      }
      return "<p>" + esc(x) + "</p>";
    }
    function flush() {
      if (!buf) return;
      out += buf.split(/\n+/).filter(function (x) { return x.trim(); }).map(line).join("");
      buf = "";
    }
    (parts || []).forEach(function (p) {
      if (typeof p === "string") buf += p;
      else if (p && p.i !== undefined) { flush(); out += '<figure class="pic" data-i="' + p.i + '"><div class="pic-box"></div></figure>'; }
    });
    flush();
    return out;
  }
  function chars(parts) { var n = 0; (parts || []).forEach(function (p) { if (typeof p === "string") n += p.replace(/\s+/g, "").length; }); return n; }
  function fmtN(n) { return n >= 10000 ? (n / 10000).toFixed(n >= 100000 ? 0 : 1) + "万" : String(n); }
  function whoLabel(sc, sep) { return (sc.who || []).length ? sc.who.join(sep || " × ") : (sc.place || sc.raw || ""); }
  function text(parts) { return (parts || []).filter(function (p) { return typeof p === "string"; }).join(""); }

  function sceneHTML(sc) {
    var tags = "";
    if (sc.type) tags += '<span class="sc-type">' + esc(sc.type) + "</span>";
    if (sc.place && (sc.who || []).length) tags += '<span class="sc-pl">' + esc(sc.place) + "</span>";
    if (sc.time) tags += '<span class="sc-time">' + esc(sc.time) + "</span>";
    var who = (sc.who || []).map(function (n) { return '<span class="who" style="--c:' + hue(n) + '">' + esc(n) + "</span>"; }).join('<i class="x">×</i>');
    var info = (sc.info || []).filter(function (kv) { return !/^(邀请人|被邀请人|时间|地点)$/.test(kv[0]); })
      .map(function (kv) { return '<div class="sc-info"><b>' + esc(kv[0]) + "</b>" + esc(kv[1]) + "</div>"; }).join("");
    var len = 0, prev = null, k = 0;
    var body = (sc.lines || []).map(function (ln) {
      len += chars(ln.p);
      if (ln.s !== prev) k++;
      prev = ln.s;
      var alt = k % 2 ? "" : " alt";
      if (!ln.s) return '<div class="ln plain' + alt + '">' + partsHTML(ln.p) + "</div>";
      return '<div class="ln' + alt + '" style="--c:' + hue(ln.s) + '"><div class="sp">' + esc(ln.s) + '</div><div class="tx">' + partsHTML(ln.p) + "</div></div>";
    }).join("");
    if (len) tags += '<span class="sc-len">' + fmtN(len) + " 字</span>";
    return '<article class="scene" id="' + esc(sc.id) + '" data-who="' + esc((sc.who || []).join("|")) + '">' +
      '<header class="sc-head"><div class="sc-no">' + esc(sc.id) + "</div>" +
      '<h3 class="sc-place">' + (who || esc(sc.place || sc.raw || "")) + "</h3>" +
      '<div class="sc-tags">' + tags + "</div>" + info + "</header>" +
      '<div class="sc-body">' + (body || '<p class="empty-sc">（这场没有留下戏录）</p>') + "</div></article>";
  }

  function pairOf(s) {
    var m = String(s).match(/^(.+?)x(.+)$/);
    return m && m[1] && m[2] ? [m[1], m[2]] : null;
  }
  function mailHTML(kind, group, dayId, idx) {
    var label = kind === "letters" ? "心动信" : "小纸条";
    return '<section class="mail ' + kind + '" id="' + dayId + "-" + kind + '"><h3 class="mail-title"><span>' + label + "</span>" +
      '<small>' + group.reduce(function (n, g) { return n + g.items.length; }, 0) + (kind === "letters" ? " 封" : " 张") + "</small></h3>" +
      group.map(function (g) {
        var who = [g.to];
        var items = g.items.map(function (it) {
          var pair = kind === "notes" ? pairOf(it.from) : null, from = pair ? pair[0] : it.from;
          who.push(from); if (pair) who.push(pair[1]);
          var label = pair ? '<b style="--c:' + hue(pair[0]) + '">' + esc(pair[0]) + '</b><i>→</i><b style="--c:' + hue(pair[1]) + '">' + esc(pair[1]) + "</b>"
            : '<b style="--c:' + hue(from) + '">' + esc(from) + "</b>";
          return '<div class="mail-item' + (pair && pair[0] !== g.to ? " mine" : "") + '"><div class="from">' + label + '</div><div class="tx">' + partsHTML(it.p, kind === "letters") + "</div></div>";
        }).join("");
        return '<div class="mail-to" data-who="' + esc(who.join("|")) + '">' +
          '<div class="to">' + (kind === "letters" ? "致 " : "与 ") + '<b style="--c:' + hue(g.to) + '">' + esc(g.to) + "</b>" + (kind === "notes" ? " 的纸条往来" : "") + "</div>" + items + "</div>";
      }).join("") + "</section>";
  }

  function dayLine(d, n) { return n + " 场戏" + (d.letters && d.letters.length ? " · 心动信" : "") + (d.notes && d.notes.length ? " · 小纸条" : ""); }
  function render(root, book, loadImage, opts) {
    opts = opts || {};
    assignColors(book);
    var nScenes = 0, nLines = 0, nMail = 0, nNotes = 0, nChars = 0, names = {};
    book.days.forEach(function (d) {
      nScenes += d.scenes.length;
      d.scenes.forEach(function (s) { nLines += (s.lines || []).length; (s.lines || []).forEach(function (l) { nChars += chars(l.p); }); (s.who || []).forEach(function (n) { names[n] = 1; }); });
      (d.letters || []).forEach(function (g) { nMail += g.items.length; });
      (d.notes || []).forEach(function (g) { nNotes += g.items.length; });
    });

    var nav = book.days.map(function (d) {
      return '<a href="#day-' + esc(d.d) + '" data-day="' + esc(d.d) + '" data-t="day-' + esc(d.d) + '"><b>' + esc(d.d) + "</b><small>" + d.scenes.length + " 场</small></a>";
    }).join("");
    var toc = book.days.map(function (d) {
      var rows = d.scenes.map(function (s) {
        return '<a class="toc-row" href="#' + esc(s.id) + '" data-t="' + esc(s.id) + '" data-who="' + esc((s.who || []).join("|")) + '" data-q="' + esc([s.id, s.place, s.type, s.time].concat(s.who || []).join(" ")) + '">' +
          '<span class="no">' + esc(s.id.replace(/^D-?\d+-/, "")) + '</span><span class="pl"><b>' + esc(whoLabel(s)) + "</b><small>" +
          esc(s.place || "") + '</small></span><span class="tm">' + esc(s.type || "") + "<br>" + esc(s.time || "") + "</span></a>";
      }).join("");
      if (d.letters && d.letters.length) rows += '<a class="toc-row mailrow" href="#' + esc(d.d) + '-letters" data-t="' + esc(d.d) + '-letters" data-q="心动信"><span class="no">信</span><span class="pl"><b>心动信</b></span><span class="tm"></span></a>';
      if (d.notes && d.notes.length) rows += '<a class="toc-row mailrow" href="#' + esc(d.d) + '-notes" data-t="' + esc(d.d) + '-notes" data-q="小纸条"><span class="no">笺</span><span class="pl"><b>小纸条</b></span><span class="tm"></span></a>';
      return '<section class="toc-day" data-day="' + esc(d.d) + '"><h4>' + esc(d.d) + "<small>" + d.scenes.length + " 场</small></h4>" + rows + "</section>";
    }).join("");
    var people = Object.keys(names).sort(function (a, b) { return a.localeCompare(b, "zh"); });

    var days = book.days.map(function (d) {
      var idx = d.scenes.map(function (s) {
        return '<li data-who="' + esc((s.who || []).join("|")) + '"><a href="#' + esc(s.id) + '"><span class="no">' + esc(s.id) + "</span>" +
          '<span class="pl">' + esc(whoLabel(s)) + '<small>' + esc(s.place || "") + '</small></span><span class="tm">' + esc(s.time || "") + "</span></a></li>";
      }).join("");
      var mails = (d.letters && d.letters.length ? mailHTML("letters", d.letters, d.d) : "") + (d.notes && d.notes.length ? mailHTML("notes", d.notes, d.d) : "");
      return '<section class="day" id="day-' + esc(d.d) + '"><header class="day-head"><h2>' + esc(d.d) + "</h2>" +
        "<p>" + esc(dayLine(d, d.scenes.length)) + "</p></header>" +
        (idx ? '<details class="idx"><summary>场次索引 <small>' + d.scenes.length + " 场</small></summary><ol>" + idx + "</ol></details>" : "") +
        d.scenes.map(sceneHTML).join("") + mails + "</section>";
    }).join("");

    root.innerHTML =
      '<header class="book-head"><div class="book-inner">' +
      '<div class="book-kicker">' + esc(opts.kicker || "戏录 · ARCHIVE") + "</div>" +
      "<h1>" + esc(book.title) + "</h1>" +
      (book.scope ? '<div class="book-scope">' + esc(book.scope) + "</div>" : "") +
      '<div class="book-stats" id="bstats"><span><b>' + book.days.length + "</b>天</span><span><b>" + nScenes + "</b>场戏</span><span><b>" + nLines + "</b>段</span><span><b>" + fmtN(nChars) + "</b>字</span>" +
      (nMail ? "<span><b>" + nMail + "</b>封心动信</span>" : "") + (nNotes ? "<span><b>" + nNotes + "</b>张纸条</span>" : "") + "</div></div></header>" +
      '<div class="book-tools"><label class="filter"><span>只看</span><select id="who"><option value="">全部角色</option>' +
      people.map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + "</option>"; }).join("") + "</select></label>" +
      '<button type="button" class="theme-btn" id="theme">纸页</button></div>' +
      '<nav class="book-nav" id="bnav" aria-label="目录"><div class="read-progress"><i id="rprog"></i></div><div class="nav-in">' +
      '<div class="nav-top"><div class="nav-row nav-days">' + nav + '</div><button type="button" class="toc-btn" id="tocbtn">☰ 目录</button></div>' +
      '<div class="nav-row nav-scenes" id="nscenes"></div></div></nav>' +
      '<div class="book-layout"><main class="book-main">' + days + "</main></div>" +
      '<button type="button" class="rtop" id="rtop" aria-label="回到顶部"><span class="pawicon"></span></button>' +
      '<div class="toc" id="toc" hidden><div class="toc-panel"><header class="toc-head"><b>全部场次</b>' +
      '<input type="search" id="tocq" placeholder="搜地点、角色或场次" autocomplete="off"><button type="button" class="toc-x" id="tocx" aria-label="关闭">✕</button></header>' +
      '<div class="toc-list" id="toclist">' + toc + "</div></div></div>";

    /* 图片：滚到附近再解密加载 */
    var shown = {};
    function loadFig(fig) {
      var i = +fig.getAttribute("data-i");
      if (shown[i + ":" + fig.dataset.k]) return;
      var meta = (book.images || [])[i] || {};
      var box = fig.querySelector(".pic-box");
      if (meta.w && meta.h) box.style.aspectRatio = meta.w + " / " + meta.h;
      if (meta.missing) { box.classList.add("bad"); box.textContent = "图片已失效"; return; }
      loadImage(i).then(function (url) {
        var img = new Image(); img.alt = "配图"; img.src = url; img.loading = "lazy";
        img.addEventListener("click", function () { zoom(url); });
        box.innerHTML = ""; box.appendChild(img); fig.classList.add("ok");
      }, function () { box.classList.add("bad"); box.textContent = "图片加载失败"; });
    }
    var figs = root.querySelectorAll(".pic");
    figs.forEach(function (f, k) { f.dataset.k = k; var m = (book.images || [])[+f.dataset.i]; if (m && m.w && m.h) f.querySelector(".pic-box").style.aspectRatio = m.w + " / " + m.h; });
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); loadFig(e.target); } });
      }, { rootMargin: "800px 0px" });
      figs.forEach(function (f) { io.observe(f); });
    } else figs.forEach(loadFig);

    /* 看大图 */
    var lb = document.createElement("div");
    lb.className = "lightbox"; lb.innerHTML = "<img alt=''>";
    lb.addEventListener("click", function () { lb.classList.remove("in"); });
    document.body.appendChild(lb);
    function zoom(url) { lb.querySelector("img").src = url; lb.classList.add("on"); requestAnimationFrame(function () { lb.classList.add("in"); }); }
    lb.addEventListener("transitionend", function () { if (!lb.classList.contains("in")) lb.classList.remove("on"); });

    /* 只看某个角色 */
    var sel = root.querySelector("#who");
    sel.addEventListener("change", function () {
      var n = sel.value;
      root.querySelectorAll("[data-who]").forEach(function (el) {
        el.classList.toggle("off", !!n && el.getAttribute("data-who").split("|").indexOf(n) < 0);
      });
      root.querySelectorAll(".mail").forEach(function (m) {
        m.classList.toggle("off", !!n && !m.querySelector(".mail-to:not(.off)"));
      });
      root.querySelectorAll(".day").forEach(function (d) {
        d.classList.toggle("off", !!n && !d.querySelector(".scene:not(.off), .mail:not(.off)"));
      });
    });

    /* 日 / 夜 */
    var tb = root.querySelector("#theme");
    function setTheme(paper) {
      document.body.classList.toggle("paper", paper);
      tb.textContent = paper ? "夜读" : "纸页";
      try { localStorage.setItem("archive-theme", paper ? "paper" : "night"); } catch (e) {}
    }
    var saved = null; try { saved = localStorage.getItem("archive-theme"); } catch (e) {}
    setTheme(saved === "paper");
    tb.addEventListener("click", function () { setTheme(!document.body.classList.contains("paper")); });

    /* ---------- 冻结在上方的 天 + 场次 导航 ---------- */
    var bnav = root.querySelector("#bnav"), nscenes = root.querySelector("#nscenes");
    var dayLinks = root.querySelectorAll(".nav-days a"), curDay = null, curT = null, targets = [];
    function stickH() { var bar = document.querySelector(".bar"); return (bar ? bar.offsetHeight : 0) + bnav.offsetHeight; }
    function setStick() { document.documentElement.style.setProperty("--stick", stickH() + "px"); }
    function collect() {
      targets = Array.prototype.slice.call(root.querySelectorAll(".book-main .scene, .book-main .mail")).filter(function (el) { return !el.classList.contains("off") && !el.closest(".day.off"); });
    }
    function chipsFor(dayId) {
      var d = book.days.filter(function (x) { return x.d === dayId; })[0];
      if (!d) { nscenes.innerHTML = ""; return; }
      var html = d.scenes.filter(function (sc) { var el = document.getElementById(sc.id); return el && !el.classList.contains("off"); }).map(function (sc) {
        return '<a href="#' + esc(sc.id) + '" data-t="' + esc(sc.id) + '" title="' + esc(whoLabel(sc) + " · " + (sc.place || "")) + '"><b>' + esc(sc.id.replace(/^D-?\d+-/, "")) + "</b>" + esc(whoLabel(sc, "×")) + "</a>";
      }).join("");
      ["letters", "notes"].forEach(function (k) {
        var el = document.getElementById(d.d + "-" + k);
        if (el && !el.classList.contains("off")) html += '<a class="mailchip" href="#' + d.d + "-" + k + '" data-t="' + d.d + "-" + k + '"><b>' + (k === "letters" ? "信" : "笺") + "</b>" + (k === "letters" ? "心动信" : "小纸条") + "</a>";
      });
      nscenes.innerHTML = html;
    }
    function center(row, el) {
      if (!el) return;
      var l = el.offsetLeft - row.clientWidth / 2 + el.offsetWidth / 2;
      row.scrollTo({ left: Math.max(0, l), behavior: "smooth" });
    }
    var rprog = root.querySelector("#rprog"), rtop = root.querySelector("#rtop");
    rtop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
    function update() {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      rprog.style.transform = "scaleX(" + (h > 0 ? Math.min(1, window.pageYOffset / h) : 0) + ")";
      rtop.classList.toggle("show", window.pageYOffset > 900);
      var line = stickH() + 24, cur = null;
      for (var i = 0; i < targets.length; i++) { if (targets[i].getBoundingClientRect().top <= line) cur = targets[i]; else break; }
      if (!cur) cur = targets[0];
      if (!cur) return;
      var day = cur.closest(".day").id.replace(/^day-/, "");
      if (day !== curDay) {
        curDay = day; chipsFor(day);
        dayLinks.forEach(function (a) { a.classList.toggle("on", a.dataset.day === day); });
        center(root.querySelector(".nav-days"), root.querySelector('.nav-days a[data-day="' + day + '"]'));
        curT = null;
      }
      if (cur.id !== curT) {
        curT = cur.id;
        var chip = null;
        nscenes.querySelectorAll("a").forEach(function (a) { var on = a.dataset.t === cur.id; a.classList.toggle("on", on); if (on) chip = a; });
        center(nscenes, chip);
      }
    }
    var ticking = false;
    window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; update(); }); } }, { passive: true });
    window.addEventListener("resize", setStick);
    function jump(id) {
      var el = document.getElementById(id);
      if (!el) return;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - stickH() - 12, behavior: "instant" });
      if (history.replaceState) history.replaceState(null, "", "#" + id);
    }
    root.addEventListener("click", function (e) {
      var a = e.target.closest("a[data-t]");
      if (!a || !root.contains(a)) return;
      e.preventDefault();
      if (a.classList.contains("toc-row")) closeToc();
      jump(a.dataset.t);
    });

    /* 全部场次 */
    var tocEl = root.querySelector("#toc"), tocq = root.querySelector("#tocq");
    function openToc() {
      tocEl.hidden = false; document.body.classList.add("toc-open");
      root.querySelectorAll(".toc-row").forEach(function (r) { r.classList.toggle("on", r.dataset.t === curT); });
      var on = root.querySelector(".toc-row.on");
      if (on) on.scrollIntoView({ block: "center" });
    }
    function closeToc() { tocEl.hidden = true; document.body.classList.remove("toc-open"); }
    root.querySelector("#tocbtn").addEventListener("click", openToc);
    root.querySelector("#tocx").addEventListener("click", closeToc);
    tocEl.addEventListener("click", function (e) { if (e.target === tocEl) closeToc(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeToc(); });
    tocq.addEventListener("input", function () {
      var q = tocq.value.trim().toLowerCase();
      root.querySelectorAll(".toc-row").forEach(function (r) {
        var off = r.classList.contains("who-off");
        r.classList.toggle("q-off", !!q && r.dataset.q.toLowerCase().indexOf(q) < 0);
      });
      root.querySelectorAll(".toc-day").forEach(function (d) { d.classList.toggle("q-off", !d.querySelector(".toc-row:not(.q-off):not(.off)")); });
    });

    /* 角色筛选后，统计和导航跟着更新 */
    var bstats = root.querySelector("#bstats"), allStats = bstats.innerHTML;
    function countFor(n) {
      var t = { scenes: 0, lines: 0, chars: 0, mail: 0, notes: 0, days: {} };
      book.days.forEach(function (d) {
        var c = 0;
        d.scenes.forEach(function (sc) {
          if ((sc.who || []).indexOf(n) < 0) return;
          c++; t.scenes++;
          (sc.lines || []).forEach(function (l) { if (l.s === n) { t.lines++; t.chars += chars(l.p); } });
        });
        (d.letters || []).forEach(function (g) { g.items.forEach(function (it) { if (g.to === n || it.from === n) t.mail++; }); });
        (d.notes || []).forEach(function (g) { g.items.forEach(function (it) { var p = pairOf(it.from) || [it.from, g.to]; if (p[0] === n || p[1] === n) t.notes++; }); });
        t.days[d.d] = c;
      });
      return t;
    }
    sel.addEventListener("change", function () {
      var n = sel.value;
      if (!n) {
        bstats.innerHTML = allStats; bstats.classList.remove("solo");
        dayLinks.forEach(function (a) { var d = book.days.filter(function (x) { return x.d === a.dataset.day; })[0]; a.querySelector("small").textContent = d.scenes.length + " 场"; });
        root.querySelectorAll(".toc-day").forEach(function (el) { var d = book.days.filter(function (x) { return x.d === el.dataset.day; })[0]; el.querySelector("h4 small").textContent = d.scenes.length + " 场"; });
        root.querySelectorAll(".day").forEach(function (el) { var d = book.days.filter(function (x) { return "day-" + x.d === el.id; })[0]; el.querySelector(".day-head p").textContent = dayLine(d, d.scenes.length); });
      } else {
        var t = countFor(n);
        bstats.classList.add("solo");
        bstats.innerHTML = '<span class="who-tag"><b style="--c:' + hue(n) + '">' + esc(n) + "</b></span>" +
          "<span><b>" + t.scenes + "</b>场戏</span><span><b>" + t.lines + "</b>段</span><span><b>" + fmtN(t.chars) + "</b>字</span>" +
          (t.mail ? "<span><b>" + t.mail + "</b>封心动信</span>" : "") + (t.notes ? "<span><b>" + t.notes + "</b>张纸条</span>" : "");
        dayLinks.forEach(function (a) { var c = t.days[a.dataset.day] || 0; a.querySelector("small").textContent = c ? c + " 场" : "信笺"; });
        root.querySelectorAll(".toc-day").forEach(function (el) { el.querySelector("h4 small").textContent = (t.days[el.dataset.day] || 0) + " 场"; });
        root.querySelectorAll(".day").forEach(function (el) { var d = book.days.filter(function (x) { return "day-" + x.d === el.id; })[0]; el.querySelector(".day-head p").textContent = n + " · " + dayLine(d, t.days[d.d] || 0); });
      }
      root.querySelectorAll(".toc-row").forEach(function (r) {
        var t = document.getElementById(r.dataset.t);
        r.classList.toggle("off", !!t && (t.classList.contains("off") || !!t.closest(".day.off")));
      });
      dayLinks.forEach(function (a) { var d = document.getElementById("day-" + a.dataset.day); a.classList.toggle("off", !!d && d.classList.contains("off")); });
      collect(); curDay = null; update();
    });

    setStick(); collect(); update();
    setTimeout(setStick, 300);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(setStick);
  }

  g.Reader = { render: render, text: text };
})(window);
