/* 戏录馆 · 加解密
   密码 → PBKDF2-SHA256 → AES-GCM-256。每个文件 = 12 字节 IV + 密文。
   网站上只存密文；没有密码读不出任何内容。 */
(function (g) {
  var enc = new TextEncoder(), dec = new TextDecoder();

  function b64(buf) {
    var s = "", a = new Uint8Array(buf);
    for (var i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(str) {
    var s = atob(str), a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }

  async function deriveKey(password, salt, iter) {
    var base = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: iter, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  async function seal(key, bytes) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, bytes));
    var out = new Uint8Array(12 + ct.length);
    out.set(iv); out.set(ct, 12);
    return out;
  }
  async function open(key, bytes) {
    var a = new Uint8Array(bytes);
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: a.subarray(0, 12) }, key, a.subarray(12)));
  }

  /* 新建一套密钥（上传时用） */
  async function createKey(password) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iter = 250000;
    var key = await deriveKey(password, salt, iter);
    return { key: key, meta: { v: 1, kdf: "PBKDF2-SHA256", iter: iter, salt: b64(salt), cipher: "AES-GCM-256" } };
  }
  /* 用存档的 meta 和密码解出密钥（阅读时用） */
  async function keyFromMeta(password, meta) {
    return deriveKey(password, unb64(meta.salt), meta.iter);
  }

  g.Vault = {
    b64: b64, unb64: unb64, seal: seal, open: open, createKey: createKey, keyFromMeta: keyFromMeta,
    sealJSON: function (key, obj) { return seal(key, enc.encode(JSON.stringify(obj))); },
    openJSON: async function (key, bytes) { return JSON.parse(dec.decode(await open(key, bytes))); }
  };
})(window);
