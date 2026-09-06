/* ==========================================================================
   Dompet A&A — Service Worker

   Tugasnya cuma dua: menyimpan cangkang aplikasi supaya bisa dibuka saat
   luring, dan menampilkan pengingat harian bila browser mendukung Periodic
   Background Sync.

   Yang TIDAK dilakukan berkas ini:
   - tidak pernah menyentuh localStorage (Service Worker memang tidak bisa,
     dan itu bagus: seluruh data keuangan tetap utuh saat versi diperbarui);
   - tidak menyimpan permintaan POST/PUT atau apa pun selain GET;
   - tidak mengirim data ke mana pun.

   Satu-satunya yang dibaca dari IndexedDB adalah catatan sangat kecil berisi
   sakelar pengingat, jam pengingat, dan TANGGAL pengeluaran terakhir. Tidak
   ada nominal, kategori, atau catatan pengguna di dalamnya.
   ========================================================================== */

const VERSION    = "v1";
const SHELL      = "dompet50jt-shell-" + VERSION;
const FONTS      = "dompet50jt-fonts-" + VERSION;
const KEEP       = [SHELL, FONTS];

const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

/* Alamat yang dicoba disimpan saat pemasangan. Sengaja satu per satu:
   kalau salah satu tidak ada (misalnya berkas HTML-nya diberi nama lain),
   sisanya tetap tersimpan. */
const PRECACHE = [
  "./",
  "./index.html",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

/* ------------------------------------------------------------- lifecycle */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL).then(cache =>
      Promise.all(PRECACHE.map(url =>
        cache.add(new Request(url, {cache: "reload"})).catch(() => null)
      ))
    )
    // Sengaja TIDAK memanggil skipWaiting() di sini. Versi baru menunggu
    // sampai pengguna menekan "Muat ulang" di Pengaturan, supaya tab yang
    // sedang dipakai tidak berganti versi di tengah pengisian formulir.
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.indexOf("dompet50jt-") === 0 && KEEP.indexOf(k) === -1)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  const d = event.data || {};
  if(d.type === "SKIP_WAITING") self.skipWaiting();
});

/* ---------------------------------------------------------------- fetch */
function isFont(url){ return FONT_HOSTS.indexOf(url.hostname) !== -1; }

/** Simpan salinan baru di belakang layar, tapi jangan menahan respons. */
function refresh(cacheName, request){
  return fetch(request).then(res => {
    if(res && (res.ok || res.type === "opaque")){
      const copy = res.clone();
      caches.open(cacheName).then(c => c.put(request, copy)).catch(() => {});
    }
    return res;
  });
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if(req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch(e){ return; }
  if(url.protocol !== "http:" && url.protocol !== "https:") return;

  // Navigasi: coba jaringan dulu supaya versi terbaru cepat terpakai,
  // jatuh ke cache saat luring.
  if(req.mode === "navigate"){
    event.respondWith(
      refresh(SHELL, req).catch(() =>
        caches.match(req).then(hit =>
          hit || caches.match("./index.html").then(idx =>
            idx || caches.match("./") || new Response(
              "<h1>Dompet A&amp;A</h1><p>Belum ada salinan luring. Buka sekali dalam keadaan daring lebih dulu.</p>",
              {headers:{"Content-Type":"text/html; charset=utf-8"}}
            )
          )
        )
      )
    );
    return;
  }

  // Google Fonts: pakai cache dulu, perbarui diam-diam.
  if(isFont(url)){
    event.respondWith(
      caches.match(req).then(hit => hit || refresh(FONTS, req).catch(() => hit))
    );
    return;
  }

  // Aset satu asal: cache dulu, perbarui di belakang layar.
  if(url.origin === self.location.origin){
    event.respondWith(
      caches.match(req).then(hit => {
        const net = refresh(SHELL, req).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  // Sisanya diteruskan apa adanya, tidak disimpan.
});

/* ------------------------------------------------- notifikasi & pengingat */
self.addEventListener("notificationclick", event => {
  const route = (event.notification.data && event.notification.data.route) || "dashboard";
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({type:"window", includeUncontrolled:true}).then(list => {
      for(const c of list){
        if("focus" in c){
          c.postMessage({type:"NOTIF_CLICK", route: route});
          return c.focus();
        }
      }
      if(self.clients.openWindow) return self.clients.openWindow("./#/" + route);
      return null;
    })
  );
});

/* IndexedDB minimalis — hanya satu catatan, hanya dibaca/ditulis di sini. */
function idb(){
  return new Promise((res, rej) => {
    const rq = indexedDB.open("dompet50jt", 1);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if(!db.objectStoreNames.contains("pwa")) db.createObjectStore("pwa");
    };
    rq.onsuccess = () => res(rq.result);
    rq.onerror   = () => rej(rq.error);
  });
}

function readDaily(){
  return idb().then(db => new Promise((res, rej) => {
    const tx = db.transaction("pwa", "readonly");
    const rq = tx.objectStore("pwa").get("daily");
    rq.onsuccess = () => { res(rq.result || null); db.close(); };
    rq.onerror   = () => { rej(rq.error); db.close(); };
  }));
}

function writeDaily(val){
  return idb().then(db => new Promise((res, rej) => {
    const tx = db.transaction("pwa", "readwrite");
    tx.objectStore("pwa").put(val, "daily");
    tx.oncomplete = () => { res(true); db.close(); };
    tx.onerror    = () => { rej(tx.error); db.close(); };
  }));
}

function todayISO(){
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

/**
 * Pengingat harian saat aplikasi tertutup.
 * Hanya berjalan kalau browser benar-benar memanggil periodicsync — di luar
 * itu pengingat tetap muncul saat aplikasi dibuka. Tidak ada janji palsu.
 */
function dailyCheck(){
  return readDaily().then(rec => {
    if(!rec || !rec.enabled) return null;

    const today = todayISO();
    if(rec.lastFired === today) return null;                 // sudah dikirim hari ini
    if(rec.lastExpenseDate === today) return null;           // sudah ada catatan hari ini
    if(new Date().getHours() < (rec.hour || 20)) return null; // belum waktunya

    return self.registration.showNotification(rec.title || "Dompet A&A", {
      body: rec.body || "Catat pengeluaran hari ini.",
      tag: "dompet-daily-" + today,
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      lang: "id",
      data: {route: "transaksi"}
    }).then(() => writeDaily(Object.assign({}, rec, {lastFired: today})));
  }).catch(() => null);
}

self.addEventListener("periodicsync", event => {
  if(event.tag === "dompet-daily") event.waitUntil(dailyCheck());
});

self.addEventListener("sync", event => {
  if(event.tag === "dompet-daily") event.waitUntil(dailyCheck());
});
