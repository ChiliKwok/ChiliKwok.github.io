/* 挂线墙 / 饼墙 共用：连接 Supabase、管理员登录、弹窗、提示、实时更新
   游客不用登录，只有管理员需要登录才能修改。 */
(function (g) {
  var URL_ = "https://dpogdfwodrlxnpydtxdq.supabase.co";
  var KEY = "sb_publishable_AZRobonmKtST2yqeKRJxPw_1Dx3QyTQ";   // 公开密钥：本来就放在网页里，只能读和投喂
  var sb = supabase.createClient(URL_, KEY, { auth: { persistSession: true, storageKey: "xintiao-admin" } });

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }
  function $(s, r) { return (r || document).querySelector(s); }

  /* ---------- 提示 ---------- */
  var toastEl, toastT;
  function toast(msg, bad) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "w-toast"; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.toggle("bad", !!bad); toastEl.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove("show"); }, 2200);
  }

  /* ---------- 弹窗表单 ---------- */
  // fields: [{ k, label, type: text|textarea|select|file|tags, value, options, placeholder, hint }]
  function form(title, fields, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var wrap = document.createElement("div");
      wrap.className = "w-modal";
      wrap.innerHTML = '<form class="w-dialog glass"><header><b>' + esc(title) + '</b><button type="button" class="w-x" aria-label="关闭">✕</button></header><div class="w-body">' +
        fields.map(function (f) {
          var v = f.value == null ? "" : f.value, inp;
          if (f.type === "textarea") inp = '<textarea name="' + f.k + '" rows="' + (f.rows || 4) + '" placeholder="' + esc(f.placeholder || "") + '">' + esc(v) + "</textarea>";
          else if (f.type === "select") inp = '<select name="' + f.k + '">' + f.options.map(function (o) {
            return '<option value="' + esc(o[0]) + '"' + (o[0] === v ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>";
          else if (f.type === "file") inp = '<input type="file" name="' + f.k + '" accept="image/*">';
          else inp = '<input name="' + f.k + '" value="' + esc(v) + '" placeholder="' + esc(f.placeholder || "") + '"' + (f.type === "password" ? ' type="password"' : f.type === "email" ? ' type="email" autocomplete="username"' : f.type === "date" ? ' type="date"' : "") + ">";
          if (f.type === "date") inp = '<div class="date-row">' + inp + '<button type="button" class="date-clear" data-clear="' + f.k + '">清空</button></div>';
          return '<label class="field"><span>' + esc(f.label) + "</span>" + inp + (f.hint ? '<small class="hint">' + esc(f.hint) + "</small>" : "") + "</label>";
        }).join("") + '</div><footer>' + (opts.danger ? '<button type="button" class="btn ghost w-danger">' + esc(opts.danger) + "</button>" : "") +
        '<span class="sp"></span><button type="button" class="btn ghost w-cancel">取消</button><button type="submit" class="btn">' + esc(opts.ok || "保存") + "</button></footer></form>";
      document.body.appendChild(wrap);
      document.body.classList.add("w-lock");
      var f = wrap.querySelector("form");
      setTimeout(function () { var first = f.querySelector("input,textarea,select"); if (first) first.focus(); }, 30);
      function close(val) { wrap.remove(); document.body.classList.remove("w-lock"); resolve(val); }
      wrap.querySelector(".w-x").onclick = function () { close(null); };
      wrap.querySelector(".w-cancel").onclick = function () { if (!dirty || confirm("还没保存，确定关闭吗？")) close(null); };
      // 只有在窗口外按下并松开才算「点外面关闭」，并且改过内容要先确认，避免日期弹层等误触把窗口关掉
      var downOut = false, dirty = false;
      f.addEventListener("input", function () { dirty = true; });
      f.addEventListener("change", function () { dirty = true; });
      wrap.addEventListener("mousedown", function (e) { downOut = e.target === wrap; });
      wrap.addEventListener("click", function (e) {
        if (e.target !== wrap || !downOut) return;
        if (dirty && !confirm("还没保存，确定关闭吗？")) return;
        close(null);
      });
      wrap.querySelectorAll("[data-clear]").forEach(function (b) {
        b.addEventListener("click", function (e) { e.preventDefault(); f.elements[b.dataset.clear].value = ""; });
      });
      var d = wrap.querySelector(".w-danger");
      if (d) d.onclick = function () { close({ __danger: true }); };
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var out = {};
        fields.forEach(function (fl) {
          var el = f.elements[fl.k];
          out[fl.k] = fl.type === "file" ? (el.files && el.files[0]) || null : el.value.trim();
        });
        close(out);
      });
    });
  }
  function confirmBox(msg) {
    return form("确认", [], { ok: "确定" }).then(function (r) { return !!r; }).catch(function () { return false; });
  }

  /* ---------- 管理员 ---------- */
  var admin = false, listeners = [];
  function onAdmin(fn) { listeners.push(fn); fn(admin); }
  async function checkAdmin() {
    var s = (await sb.auth.getSession()).data.session;
    var ok = false;
    if (s) {
      var r = await sb.from("admins").select("user_id").eq("user_id", s.user.id).maybeSingle();
      ok = !!(r.data);
    }
    if (ok !== admin) { admin = ok; document.body.classList.toggle("is-admin", ok); listeners.forEach(function (fn) { fn(ok); }); }
    renderLoginBtn(s, ok);
    return ok;
  }
  function renderLoginBtn(session, ok) {
    var b = $("#adminBtn");
    if (!b) return;
    b.textContent = ok ? "管理中 · 退出" : session ? "非管理员 · 退出" : "管理登录";
    b.classList.toggle("on", ok);
  }
  async function loginFlow() {
    var s = (await sb.auth.getSession()).data.session;
    if (s) { await sb.auth.signOut(); toast("已退出管理"); return checkAdmin(); }
    var r = await form("管理员登录", [
      { k: "email", label: "邮箱", type: "email" },
      { k: "pw", label: "密码", type: "password" }
    ], { ok: "登录" });
    if (!r) return;
    var res = await sb.auth.signInWithPassword({ email: r.email, password: r.pw });
    if (res.error) { toast("登录失败：邮箱或密码不对", true); return; }
    var ok = await checkAdmin();
    toast(ok ? "欢迎回来，管理员" : "这个账号还不是管理员", !ok);
  }
  sb.auth.onAuthStateChange(function () { checkAdmin(); });

  /* ---------- 封面压缩上传 ---------- */
  async function uploadCover(file, prefix) {
    var bmp = await createImageBitmap(file);
    var scale = Math.min(1, 1600 / bmp.width), w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    cv.getContext("2d").drawImage(bmp, 0, 0, w, h);
    var blob = await new Promise(function (ok) { cv.toBlob(ok, "image/webp", 0.85); });
    var type = blob && blob.type === "image/webp" ? "image/webp" : "image/jpeg";
    if (type === "image/jpeg") blob = await new Promise(function (ok) { cv.toBlob(ok, "image/jpeg", 0.88); });
    var path = prefix + "-" + Date.now() + (type === "image/webp" ? ".webp" : ".jpg");
    var up = await sb.storage.from("covers").upload(path, blob, { contentType: type, upsert: false });
    if (up.error) throw up.error;
    return sb.storage.from("covers").getPublicUrl(path).data.publicUrl;
  }

  /* ---------- 实时 ---------- */
  function live(tables, fn) {
    var t, ch = sb.channel("wall-" + tables.join("-"));
    tables.forEach(function (tb) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: tb }, function (p) {
        clearTimeout(t); t = setTimeout(function () { fn(p); }, 250);
      });
    });
    ch.subscribe();
    return ch;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var b = $("#adminBtn");
    if (b) b.addEventListener("click", loginFlow);
    checkAdmin();
  });

  g.Wall = { sb: sb, esc: esc, $: $, toast: toast, form: form, onAdmin: onAdmin, isAdmin: function () { return admin; }, uploadCover: uploadCover, live: live, checkAdmin: checkAdmin };
})(window);
