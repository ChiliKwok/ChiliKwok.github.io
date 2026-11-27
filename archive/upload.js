/* 戏录馆 · 上传工具（全部在浏览器里完成）
   1. 读取骰子「导出戏录」生成的 Word，拆成 天 / 场次 / 对白 / 心动信 / 小纸条 / 图片
   2. 图片压成 WebP（动图保留原样）
   3. 用密码加密
   4. 通过 GitHub 接口直接提交到 ChiliKwok/ChiliKwok.github.io，或下载存档包手动上传 */
(function () {
  var REPO = "ChiliKwok/ChiliKwok.github.io", BRANCH = "main";
  var W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  var R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  var $ = function (x) { return document.getElementById(x); };
  var state = { book: null, media: null };

  /* ================= 1. 解析 Word ================= */
  function attr(el, name) { return el ? (el.getAttributeNS(W, name) || el.getAttribute("w:" + name)) : null; }
  function first(el, name) { return el.getElementsByTagNameNS(W, name)[0] || null; }

  function readPara(p, rels) {
    var sz = 0, bold = false, ind = 0, parts = [], txt = "";
    var indEl = first(p, "ind");
    if (indEl) ind = +(attr(indEl, "left") || attr(indEl, "start") || 0);
    var runs = p.getElementsByTagNameNS(W, "r");
    for (var i = 0; i < runs.length; i++) {
      var r = runs[i], rPr = first(r, "rPr");
      var hasText = false;
      for (var c = r.firstChild; c; c = c.nextSibling) {
        if (c.namespaceURI === W && c.localName === "t") { parts.push(c.textContent); txt += c.textContent; hasText = hasText || !!c.textContent.trim(); }
        else if (c.namespaceURI === W && (c.localName === "br" || c.localName === "cr")) parts.push("\n");
        else if (c.namespaceURI === W && c.localName === "tab") parts.push(" ");
        else if (c.localName === "drawing" || c.localName === "pict" || c.localName === "object") {
          var blip = c.getElementsByTagName("*"), rid = null;
          for (var k = 0; k < blip.length; k++) {
            var e = blip[k];
            rid = e.getAttributeNS(R, "embed") || e.getAttributeNS(R, "id") || rid;
            if (rid) break;
          }
          if (rid && rels[rid]) parts.push({ media: rels[rid] });
        }
      }
      if (rPr && hasText) {
        var s = first(rPr, "sz"); if (s) sz = Math.max(sz, +attr(s, "val"));
        var b = first(rPr, "b"); if (b && !/^(0|false)$/.test(attr(b, "val") || "")) bold = true;
      }
    }
    // 合并相邻文字
    var merged = [];
    parts.forEach(function (x) {
      if (typeof x === "string" && typeof merged[merged.length - 1] === "string") merged[merged.length - 1] += x;
      else merged.push(x);
    });
    return { sz: sz, bold: bold, ind: ind, parts: merged, text: txt.trim(), hasImg: merged.some(function (x) { return typeof x !== "string"; }) };
  }

  function parseKey(raw) {
    var t = raw.trim().split(/\s+/), o = { raw: raw.trim() };
    if (t.length >= 5 && /^D-?\d+$/i.test(t[0]) && /\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/.test(t[3])) {
      o.type = t[1]; o.who = t[2].split("x"); o.time = t[3]; o.place = t.slice(4).join(" ");
    }
    return o;
  }

  async function parseDocx(file, log) {
    var zip = await JSZip.loadAsync(file);
    var docXml = await zip.file("word/document.xml").async("string");
    var relXml = await zip.file("word/_rels/document.xml.rels").async("string");
    var rels = {};
    new DOMParser().parseFromString(relXml, "application/xml").querySelectorAll("Relationship").forEach(function (r) {
      var t = r.getAttribute("Target") || "";
      if (/image/.test(r.getAttribute("Type") || "")) rels[r.getAttribute("Id")] = t.replace(/^\/?(word\/)?/, "word/");
    });
    var doc = new DOMParser().parseFromString(docXml, "application/xml");
    var body = first(doc, "body"), paras = [];
    for (var n = body.firstChild; n; n = n.nextSibling) if (n.localName === "p") paras.push(n);
    log("段落 " + paras.length + " 个，正在识别结构……");

    var book = { v: 1, title: "", scope: "", days: [], images: [] };
    var media = [], mediaIdx = {}, dayMap = {}, day = null, scene = null, group = null, item = null, mode = "start";
    var warn = { broken: 0, unknown: 0 };

    function img(path) {
      if (!(path in mediaIdx)) { mediaIdx[path] = media.length; media.push(path); }
      return { i: mediaIdx[path] };
    }
    function conv(parts) {
      return parts.map(function (x) { return typeof x === "string" ? x : img(x.media); });
    }
    function getDay(name) {
      if (!dayMap[name]) { dayMap[name] = { d: name, scenes: [], letters: [], notes: [] }; book.days.push(dayMap[name]); }
      return dayMap[name];
    }
    function add(target, parts, sep) {
      if (target.p.length && sep) target.p.push("\n");
      conv(parts).forEach(function (x) { target.p.push(x); });
    }

    paras.forEach(function (p) {
      var a = readPara(p, rels), t = a.text;
      if (!t && !a.hasImg) return;
      if (/图片失效/.test(t)) warn.broken++;
      if (a.sz >= 42 && !book.title) { book.title = t.replace(/\s*戏录\s*$/, ""); return; }
      if (a.sz >= 38 && /^D-?\d+$/i.test(t)) { day = getDay(t.toUpperCase()); mode = "day"; scene = null; return; }
      if (a.sz >= 26 && a.bold) {
        if (/^D-?\d+$/i.test(t)) { mode = "index"; return; }
        var m = t.match(/^(D-?\d+)\s*(心动信|小纸条|礼物)$/i);
        if (m) {
          day = getDay(m[1].toUpperCase()); scene = null; group = null; item = null;
          mode = m[2] === "心动信" ? "letters" : "notes";
          return;
        }
        if (day) {
          var k = parseKey(t);
          scene = { id: "", raw: k.raw, type: k.type, who: k.who, time: k.time, place: k.place || k.raw, info: [], lines: [] };
          day.scenes.push(scene); mode = "info"; return;
        }
      }
      if (mode === "index" || mode === "start" || mode === "day") return;
      if (mode === "info") {
        if (t === "-") { mode = "body"; return; }
        var kv = t.match(/^([^：:]{1,8})[：:]\s*(.*)$/);
        scene.info.push(kv ? [kv[1], kv[2]] : ["", t]);
        return;
      }
      if (mode === "body") {
        if (t === "-" && !scene.lines.length) return;
        var last = scene.lines[scene.lines.length - 1];
        if (a.bold && !a.ind && !a.hasImg && /[：:]$/.test(t) && t.length <= 24) {
          scene.lines.push({ s: t.replace(/[：:]$/, ""), p: [], wait: true }); return;
        }
        if (last && last.wait) { add(last, a.parts); last.wait = false; return; }
        scene.lines.push({ s: null, p: conv(a.parts) }); return;
      }
      if (mode === "letters" || mode === "notes") {
        var list = mode === "letters" ? day.letters : day.notes;
        if (a.bold && !a.ind && !a.hasImg) { group = { to: t, items: [] }; list.push(group); item = null; return; }
        if (a.bold && a.ind && !a.hasImg && group) {
          item = { from: t.replace(/^from\s+/i, "").replace(/[:：]\s*$/, ""), p: [] }; group.items.push(item); return;
        }
        if (item) { add(item, a.parts, true); return; }
        warn.unknown++;
      }
    });

    // 整理：场次编号、参与者（优先用邀请人 / 被邀请人）、去掉空白
    book.days = book.days.filter(function (d) { return d.scenes.length || d.letters.length || d.notes.length; });
    book.days.forEach(function (d) {
      d.scenes.forEach(function (s, i) {
        s.id = d.d + "-" + String(i + 1).padStart(2, "0");
        var inv = s.info.filter(function (kv) { return kv[0] === "邀请人"; })[0];
        var guests = s.info.filter(function (kv) { return kv[0] === "被邀请人"; })[0];
        if (inv) s.who = [inv[1].trim()].concat(guests ? guests[1].split(/[、,，]/).map(function (x) { return x.trim(); }).filter(Boolean) : []);
        if (!s.who) s.who = [];
        s.lines.forEach(function (l) { delete l.wait; l.p = tidy(l.p); });
        s.lines = s.lines.filter(function (l) { return l.p.length; });
      });
      d.letters.forEach(function (g) { g.items.forEach(function (it) { it.p = tidy(it.p); }); });
      d.notes.forEach(function (g) { g.items.forEach(function (it) { it.p = tidy(it.p); }); });
    });
    var nums = book.days.map(function (d) { return d.d; });
    book.scope = nums.length > 1 ? nums[0] + "–" + nums[nums.length - 1] : (nums[0] || "");
    if (!book.title) book.title = file.name.replace(/\.docx$/i, "").replace(/_.*$/, "");

    var blobs = await Promise.all(media.map(function (path) {
      var f = zip.file(path);
      return f ? f.async("blob").then(function (b) { return { path: path, blob: b }; }) : Promise.resolve({ path: path, blob: null });
    }));
    return { book: book, media: blobs, warn: warn };
  }
  function tidy(parts) {
    var out = [];
    parts.forEach(function (x) {
      if (typeof x === "string") {
        if (typeof out[out.length - 1] === "string") out[out.length - 1] += x; else out.push(x);
      } else out.push(x);
    });
    return out.map(function (x) { return typeof x === "string" ? x.replace(/\n{2,}/g, "\n") : x; })
      .filter(function (x) { return typeof x !== "string" || x.trim(); });
  }

  /* ================= 2. 压缩图片 ================= */
  function mimeOf(path, blob) {
    var ext = (path.split(".").pop() || "").toLowerCase();
    return { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", bmp: "image/bmp" }[ext] || blob.type || "";
  }
  async function shrink(path, blob) {
    var type = mimeOf(path, blob);
    if (!/^image\/(jpeg|png|gif|webp|bmp)$/.test(type)) return { missing: true };
    var bmp;
    try { bmp = await createImageBitmap(blob); } catch (e) { return { bytes: new Uint8Array(await blob.arrayBuffer()), type: type }; }
    var w = bmp.width, h = bmp.height;
    if (type === "image/gif") { bmp.close && bmp.close(); return { bytes: new Uint8Array(await blob.arrayBuffer()), type: type, w: w, h: h }; }
    var scale = Math.min(1, 1280 / w), cw = Math.round(w * scale), ch = Math.round(h * scale);
    var cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
    var ctx = cv.getContext("2d"); ctx.drawImage(bmp, 0, 0, cw, ch); bmp.close && bmp.close();
    var out = await new Promise(function (ok) { cv.toBlob(ok, "image/webp", 0.82); });
    if (!out || out.type !== "image/webp") {
      ctx.globalCompositeOperation = "destination-over"; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cw, ch);
      out = await new Promise(function (ok) { cv.toBlob(ok, "image/jpeg", 0.85); });
    }
    if (out.size >= blob.size && scale === 1) return { bytes: new Uint8Array(await blob.arrayBuffer()), type: type, w: w, h: h };
    return { bytes: new Uint8Array(await out.arrayBuffer()), type: out.type, w: cw, h: ch };
  }

  /* ================= 3. GitHub ================= */
  function token() { return ($("tok").value || "").trim(); }
  async function gh(path, opt) {
    opt = opt || {};
    var res = await fetch("https://api.github.com/repos/" + REPO + path, {
      method: opt.method || "GET",
      headers: { Authorization: "Bearer " + token(), Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      body: opt.body ? JSON.stringify(opt.body) : undefined
    });
    if (opt.allow404 && res.status === 404) return null;
    if (!res.ok) {
      var msg = ""; try { msg = (await res.json()).message; } catch (e) {}
      throw new Error("GitHub " + res.status + (msg ? "：" + msg : ""));
    }
    return res.status === 204 ? null : res.json();
  }
  async function pool(items, n, fn) {
    var i = 0, out = new Array(items.length);
    async function worker() { while (i < items.length) { var k = i++; out[k] = await fn(items[k], k); } }
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
    return out;
  }
  function utf8b64(str) { return Vault.b64(new TextEncoder().encode(str)); }
  function b64utf8(b) { return new TextDecoder().decode(Vault.unb64(b.replace(/\s/g, ""))); }

  /* ================= 4. 生成存档 ================= */
  async function buildFiles(id, password, note, log, bar) {
    var book = JSON.parse(JSON.stringify(state.book));
    var files = [];
    var k = await Vault.createKey(password);
    log("正在压缩并加密 " + state.media.length + " 张图片……");
    var done = 0, before = 0, after = 0;
    book.images = await pool(state.media, 3, async function (m, i) {
      var meta;
      if (!m.blob) meta = { missing: true };
      else {
        before += m.blob.size;
        var r = await shrink(m.path, m.blob);
        if (r.missing) meta = { missing: true };
        else {
          after += r.bytes.length;
          files.push({ path: "img/" + i + ".bin", bytes: await Vault.seal(k.key, r.bytes) });
          meta = { type: r.type }; if (r.w) { meta.w = r.w; meta.h = r.h; }
        }
      }
      bar(++done / Math.max(1, state.media.length) * 0.6);
      return meta;
    });
    log("图片 " + (before / 1048576).toFixed(1) + "MB → " + (after / 1048576).toFixed(1) + "MB");
    files.push({ path: "book.bin", bytes: await Vault.sealJSON(k.key, book) });
    var rev = Date.now();
    k.meta.rev = rev;
    files.push({ path: "meta.json", bytes: new TextEncoder().encode(JSON.stringify(k.meta)) });
    var st = stats(book);
    var entry = { id: id, title: $("title").value.trim() || book.title, scope: book.scope, note: note || undefined,
      days: book.days.length, scenes: st.scenes, mail: st.mail, notes: st.notes, images: st.images, updated: (function (d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })(new Date()) };
    return { files: files, entry: entry };
  }
  function stats(book) {
    var s = { scenes: 0, lines: 0, mail: 0, notes: 0, images: (book.images || []).filter(function (x) { return !x.missing; }).length };
    book.days.forEach(function (d) {
      s.scenes += d.scenes.length;
      d.scenes.forEach(function (x) { s.lines += x.lines.length; });
      d.letters.forEach(function (g) { s.mail += g.items.length; });
      d.notes.forEach(function (g) { s.notes += g.items.length; });
    });
    return s;
  }
  function mergeIndex(list, entry) {
    list = (list || []).filter(function (x) { return x.id !== entry.id; });
    list.push(entry);
    return JSON.stringify(list, null, 2) + "\n";
  }

  async function publish(id, built, log, bar) {
    log("检查 GitHub 权限……");
    var repo = await gh("");
    if (repo.permissions && !repo.permissions.push) throw new Error("这个令牌没有写入权限");
    var ref = await gh("/git/ref/heads/" + BRANCH);
    var head = await gh("/git/commits/" + ref.object.sha);
    var cur = await gh("/contents/archive/index.json?ref=" + BRANCH, { allow404: true });
    var list = cur ? JSON.parse(b64utf8(cur.content)) : [];
    var prefix = "archive/data/" + id + "/";
    var tree = await gh("/git/trees/" + head.tree.sha + "?recursive=1");
    var old = tree.tree.filter(function (x) { return x.type === "blob" && x.path.indexOf(prefix) === 0; }).map(function (x) { return x.path; });

    var all = built.files.map(function (f) { return { path: prefix + f.path, bytes: f.bytes }; });
    all.push({ path: "archive/index.json", bytes: new TextEncoder().encode(mergeIndex(list, built.entry)) });
    log("上传 " + all.length + " 个文件……");
    var done = 0;
    var entries = await pool(all, 4, async function (f) {
      var blob = await gh("/git/blobs", { method: "POST", body: { content: Vault.b64(f.bytes), encoding: "base64" } });
      bar(0.6 + (++done / all.length) * 0.35);
      return { path: f.path, mode: "100644", type: "blob", sha: blob.sha };
    });
    var keep = {}; entries.forEach(function (e) { keep[e.path] = 1; });
    old.forEach(function (p) { if (!keep[p]) entries.push({ path: p, mode: "100644", type: "blob", sha: null }); });
    log("提交到网站……");
    var nt = await gh("/git/trees", { method: "POST", body: { base_tree: head.tree.sha, tree: entries } });
    var nc = await gh("/git/commits", { method: "POST", body: { message: "戏录馆：收录「" + built.entry.title + "」", tree: nt.sha, parents: [ref.object.sha] } });
    await gh("/git/refs/heads/" + BRANCH, { method: "PATCH", body: { sha: nc.sha } });
    bar(1);
  }

  async function download(id, built, log) {
    log("打包中……");
    var list = [];
    try { list = await fetch("index.json?t=" + Date.now()).then(function (r) { return r.json(); }); } catch (e) {}
    var zip = new JSZip(), root = zip.folder("archive");
    built.files.forEach(function (f) { root.file("data/" + id + "/" + f.path, f.bytes); });
    root.file("index.json", mergeIndex(list, built.entry));
    var blob = await zip.generateAsync({ type: "blob" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "戏录_" + id + ".zip"; a.click();
  }

  /* ================= 界面 ================= */
  function logTo(el) { return function (m) { el.textContent = m; }; }
  var log = logTo($("log"));
  function bar(x) { $("bar").style.width = Math.round(x * 100) + "%"; }

  try { var t = localStorage.getItem("gh-token"); if (t) { $("tok").value = t; $("remember").checked = true; } } catch (e) {}
  $("tok").addEventListener("change", function () {
    try { if ($("remember").checked) localStorage.setItem("gh-token", token()); } catch (e) {}
  });
  $("remember").addEventListener("change", function () {
    try { if ($("remember").checked) localStorage.setItem("gh-token", token()); else localStorage.removeItem("gh-token"); } catch (e) {}
  });

  function pinyinish(s) {
    var d = new Date();
    return "xilu-" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
  }

  var drop = $("drop");
  ["dragenter", "dragover"].forEach(function (e) { drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.add("over"); }); });
  ["dragleave", "drop"].forEach(function (e) { drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.remove("over"); }); });
  drop.addEventListener("drop", function (ev) { var f = ev.dataTransfer.files[0]; if (f) take(f); });
  $("file").addEventListener("change", function () { if (this.files[0]) take(this.files[0]); });

  async function take(file) {
    if (!/\.docx$/i.test(file.name)) { $("parse-msg").textContent = "请选择骰子导出的 .docx 文件"; return; }
    $("parse-msg").textContent = "正在读取「" + file.name + "」……";
    $("step2").hidden = true;
    try {
      var r = await parseDocx(file, function (m) { $("parse-msg").textContent = m; });
      state.book = r.book; state.media = r.media;
      var st = stats(r.book);
      $("parse-msg").textContent = "读取完成：" + file.name;
      $("title").value = r.book.title;
      if (!$("vid").value) $("vid").value = pinyinish(r.book.title);
      $("summary").innerHTML =
        "<div><b>" + r.book.days.length + "</b>天<small>" + r.book.scope + "</small></div>" +
        "<div><b>" + st.scenes + "</b>场戏</div><div><b>" + st.lines + "</b>句</div>" +
        "<div><b>" + st.mail + "</b>封心动信</div><div><b>" + st.notes + "</b>张纸条</div><div><b>" + r.media.length + "</b>张图</div>" +
        (r.warn.broken ? '<p class="warn">原文里有 ' + r.warn.broken + " 处「图片失效」，会照原样显示。</p>" : "") +
        (st.scenes ? "" : '<p class="warn">没有识别出场次。这份文档可能不是骰子「导出戏录」生成的。</p>');
      $("step2").hidden = false;
      $("preview").innerHTML = ""; $("preview-wrap").hidden = true;
    } catch (e) {
      console.error(e);
      $("parse-msg").textContent = "读取失败：" + (e.message || e);
    }
  }

  $("show").addEventListener("click", function () {
    var urls = {};
    $("preview-wrap").hidden = false;
    Reader.render($("preview"), state.book, function (i) {
      if (!urls[i]) {
        var m = state.media[i];
        urls[i] = m && m.blob ? Promise.resolve(URL.createObjectURL(m.blob)) : Promise.reject();
      }
      return urls[i];
    }, { kicker: "预览 · " + state.book.scope });
    $("preview-wrap").scrollIntoView({ behavior: "smooth" });
  });
  $("hide").addEventListener("click", function () { $("preview-wrap").hidden = true; $("step2").scrollIntoView(); });

  async function go(kind) {
    var id = $("vid").value.trim().toLowerCase(), pw = $("pw1").value, pw2 = $("pw2").value;
    var msg = $("go-msg");
    if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(id)) { msg.textContent = "编号只能用小写字母、数字和短横线，例如 jiguang-2026"; return; }
    if (pw.length < 6) { msg.textContent = "密码至少 6 位，建议 8 位以上"; return; }
    if (pw !== pw2) { msg.textContent = "两次输入的密码不一样"; return; }
    if (kind === "push" && !token()) { msg.textContent = "请先在上方填入 GitHub 令牌，或改用「下载存档包」"; return; }
    msg.textContent = ""; $("push").disabled = $("zip").disabled = true;
    $("progress").hidden = false; bar(0);
    try {
      var built = await buildFiles(id, pw, $("note").value.trim(), log, bar);
      if (kind === "push") {
        await publish(id, built, log, bar);
        log("✓ 已收录。网站一般 1–2 分钟后更新：");
        $("done").innerHTML = '<a class="btn" target="_blank" href="read.html?id=' + id + '">打开这一卷</a> <a class="btn ghost" target="_blank" href="./">戏录馆</a>';
      } else {
        await download(id, built, log); bar(1);
        log("✓ 已下载。把压缩包解开后，把里面的 archive 文件夹拖到 GitHub 上传页即可。");
      }
    } catch (e) {
      console.error(e); log("✗ 出错了：" + (e.message || e));
    }
    $("push").disabled = $("zip").disabled = false;
  }
  $("push").addEventListener("click", function () { go("push"); });
  $("zip").addEventListener("click", function () { go("zip"); });

  // 供本地测试
  window.__archive = { parseDocx: parseDocx, buildFiles: buildFiles, state: state, stats: stats };
})();
