/* 戏录馆 · 管理员校对
   在阅读页里直接改错别字：点「校对」→ 文字变成可编辑 → 「保存并发布」会用同一把密钥重新加密，
   通过 GitHub 令牌只更新这一卷的 book.bin 和 meta.json。图片不动，密码不变。 */
(function () {
  var REPO = "ChiliKwok/ChiliKwok.github.io", BRANCH = "main";
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var token = function () { try { return localStorage.getItem("gh-token") || ""; } catch (e) { return ""; } };

  function partsOf(book, path) {
    var a = path.split("."), d = book.days[+a[1]];
    if (a[0] === "s") return d.scenes[+a[2]].lines[+a[3]].p;
    var g = (a[0] === "l" ? d.letters : d.notes)[+a[2]];
    return g.items[+a[3]].p;
  }

  async function gh(path, opt) {
    opt = opt || {};
    var r = await fetch("https://api.github.com/repos/" + REPO + path, {
      method: opt.method || "GET",
      headers: { Authorization: "Bearer " + token(), Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      body: opt.body ? JSON.stringify(opt.body) : undefined
    });
    if (!r.ok) { var m = ""; try { m = (await r.json()).message; } catch (e) {} throw new Error("GitHub " + r.status + (m ? "：" + m : "")); }
    return r.json();
  }
  async function commit(files, message) {
    var ref = await gh("/git/ref/heads/" + BRANCH);
    var head = await gh("/git/commits/" + ref.object.sha);
    var tree = [];
    for (var i = 0; i < files.length; i++) {
      var b = await gh("/git/blobs", { method: "POST", body: { content: Vault.b64(files[i].bytes), encoding: "base64" } });
      tree.push({ path: files[i].path, mode: "100644", type: "blob", sha: b.sha });
    }
    var t = await gh("/git/trees", { method: "POST", body: { base_tree: head.tree.sha, tree: tree } });
    var c = await gh("/git/commits", { method: "POST", body: { message: message, tree: t.sha, parents: [ref.object.sha] } });
    await gh("/git/refs/heads/" + BRANCH, { method: "PATCH", body: { sha: c.sha } });
  }

  function askToken() {
    return new Promise(function (ok) {
      var w = document.createElement("div");
      w.className = "proof-modal";
      w.innerHTML = '<div class="proof-card glass"><b>管理员校对</b><p>校对后要把改好的内容发布到网站，需要和「收录戏录」页同一个 GitHub 令牌。只需填一次，令牌只保存在这台设备上。</p>' +
        '<label class="field"><span>GitHub 令牌</span><input type="password" placeholder="github_pat_…" autocomplete="off"></label>' +
        '<div class="proof-acts"><button type="button" class="btn ghost" data-a="no">取消</button><button type="button" class="btn" data-a="ok">确定</button></div></div>';
      document.body.appendChild(w);
      var inp = w.querySelector("input"); setTimeout(function () { inp.focus(); }, 30);
      w.addEventListener("click", function (e) {
        var a = e.target.dataset && e.target.dataset.a; if (!a) return;
        var v = inp.value.trim(); w.remove();
        if (a === "ok" && v) { try { localStorage.setItem("gh-token", v); } catch (er) {} ok(true); } else ok(false);
      });
    });
  }

  function setup(vol) {
    var tools = document.querySelector(".book-tools");
    if (!tools || tools.querySelector(".proof-btn")) return;
    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "theme-btn proof-btn"; btn.textContent = "✎ 校对";
    tools.insertBefore(btn, tools.querySelector("#theme"));
    // 只在这台设备存过管理员令牌时显示「校对」；普通读者看不到。页脚「管理员校对」可以首次开启
    btn.hidden = !token();
    var link = document.getElementById("proofLink");
    if (link) link.addEventListener("click", function (ev) { ev.preventDefault(); window.scrollTo(0, 0); btn.hidden = false; btn.click(); });

    var bar = document.createElement("div");
    bar.className = "proof-bar"; bar.hidden = true;
    bar.innerHTML = '<span class="pb-t">校对中 · 直接点文字修改</span><span class="pb-n" id="pbN"></span><button type="button" class="btn ghost" id="pbCancel">取消</button><button type="button" class="btn" id="pbSave">保存并发布</button>';
    document.body.appendChild(bar);

    var editing = false, orig = {};
    function count() {
      var n = 0;
      document.querySelectorAll(".ed").forEach(function (e) { if (e.innerText.replace(/\r/g, "") !== orig[e.dataset.id]) { n++; e.classList.add("changed"); } else e.classList.remove("changed"); });
      document.getElementById("pbN").textContent = n ? "已改 " + n + " 处" : "";
      return n;
    }
    function enter() {
      editing = true; orig = {}; var uid = 0;
      document.body.classList.add("proofing"); bar.hidden = false;
      document.querySelectorAll("#book [data-p]").forEach(function (el) {
        var tx = el.querySelector(".tx"); if (!tx) return;
        var figs = Array.prototype.slice.call(tx.querySelectorAll(".pic"));
        var parts = partsOf(vol.book, el.dataset.p), fi = 0;
        var box = document.createElement("div"); box.className = "tx ed-box";
        parts.forEach(function (p, k) {
          if (typeof p === "string") {
            var d = document.createElement("div");
            d.className = "ed"; d.contentEditable = "true"; d.spellcheck = false;
            d.dataset.k = k; d.dataset.id = ++uid; d.textContent = p.replace(/^\n+|\n+$/g, "");
            box.appendChild(d);
          } else if (figs[fi]) box.appendChild(figs[fi++]);
        });
        tx.replaceWith(box);
      });
      // 放进页面之后再记原文：innerText 要按实际排版算，否则没改的也会被当成改过
      document.querySelectorAll(".ed").forEach(function (e) { orig[e.dataset.id] = e.innerText.replace(/\r/g, ""); });
    }
    function leave() {
      editing = false;
      document.body.classList.remove("proofing"); bar.hidden = true;
      document.querySelectorAll("#book [data-p]").forEach(function (el) {
        var box = el.querySelector(".ed-box"); if (!box) return;
        var tx = document.createElement("div"); tx.className = "tx";
        var parts = partsOf(vol.book, el.dataset.p), letter = el.dataset.p[0] === "l";
        var figs = Array.prototype.slice.call(box.querySelectorAll(".pic")), fi = 0;
        parts.forEach(function (p) {
          if (typeof p === "string") { var t = document.createElement("div"); t.innerHTML = Reader.partsHTML([p], letter); while (t.firstChild) tx.appendChild(t.firstChild); }
          else if (figs[fi]) tx.appendChild(figs[fi++]);
        });
        box.replaceWith(tx);
      });
    }
    document.addEventListener("input", function (e) { if (editing && e.target.classList && e.target.classList.contains("ed")) count(); });

    btn.addEventListener("click", async function () {
      if (editing) return;
      if (!token() && !(await askToken())) { btn.hidden = !token(); return; }
      enter();
    });
    document.getElementById("pbCancel").addEventListener("click", function () {
      if (count() && !confirm("放弃这次校对的修改？")) return;
      leave();
    });
    document.getElementById("pbSave").addEventListener("click", async function () {
      var n = count(); if (!n) { leave(); return; }
      var save = this; save.disabled = true; save.textContent = "加密发布中……";
      // 把改动写回书里
      var touched = [];
      document.querySelectorAll(".ed.changed").forEach(function (e) {
        var path = e.closest("[data-p]").dataset.p, parts = partsOf(vol.book, path), k = +e.dataset.k;
        touched.push([parts, k, parts[k]]);
        parts[k] = e.innerText.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n");
      });
      try {
        var meta = JSON.parse(JSON.stringify(vol.meta)); meta.rev = Date.now();
        var base = "archive/data/" + vol.id + "/";
        await commit([
          { path: base + "book.bin", bytes: await Vault.sealJSON(vol.key, vol.book) },
          { path: base + "meta.json", bytes: new TextEncoder().encode(JSON.stringify(meta)) }
        ], "戏录馆：校对「" + vol.book.title + "」" + n + " 处");
        vol.meta.rev = meta.rev;
        leave();
        toast("已发布 " + n + " 处修改，网站一两分钟后更新喵");
      } catch (err) {
        touched.forEach(function (t) { t[0][t[1]] = t[2]; });   // 发布失败：撤回内存里的改动，保留编辑框里的文字
        toast("发布失败：" + err.message + (/40[13]/.test(err.message) ? "（检查令牌是否有 Contents 读写权限）" : ""));
        if (/401/.test(err.message)) { try { localStorage.removeItem("gh-token"); } catch (e) {} }
      }
      save.disabled = false; save.textContent = "保存并发布";
    });
    window.addEventListener("beforeunload", function (e) { if (editing && count()) { e.preventDefault(); e.returnValue = ""; } });
  }

  var tt;
  function toast(m) {
    var t = document.querySelector(".proof-toast");
    if (!t) { t = document.createElement("div"); t.className = "proof-toast"; document.body.appendChild(t); }
    t.textContent = m; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove("show"); }, 3200);
  }

  window.ArchiveEdit = { setup: setup };
})();
