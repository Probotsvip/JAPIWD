import ytDownload from './ytdownload';
const ADMIN_KEY = "oggy";
const DAILY_LIMIT = 10000000;  // <-- Change your daily limit here

export default {
  async fetch(request, env, ctx) {
    const { pathname, searchParams } = new URL(request.url);

    // Home Page
    if (pathname === "/" || pathname === "/index.html") {
      return new Response(INDEX_HTML, {
        headers: { "Content-Type": "text/html; charset=UTF-8" },
      });
    }

    // Generate API Key
    if (pathname === "/generate-key") {
      const random = Math.random().toString(36).substring(2, 6).toUpperCase();
      const key = `Notty_Boy-${random}`;
      const today = new Date().toISOString().split("T")[0];

      const headers = request.headers;
      const ua = headers.get("user-agent") || "";
      const ip = (headers.get("cf-connecting-ip") || "?").split(",")[0];

      let country = "?", region = "?", city = "?", isp = "?";
      try {
        const geoRes = await fetch(`https://ipwhois.app/json/${ip}`);
        const geoData = await geoRes.json();

        if (geoData.success !== false) {
          country = geoData.country || "?";
          region = geoData.region || "?";
          city = geoData.city || "?";
          isp = geoData.isp || "?";
        } else {
          console.warn("Geo lookup failed:", geoData.message);
        }
      } catch (e) {
        console.warn("Geo fetch failed", e);
      }

      const device = /android/i.test(ua) ? "Android"
        : /iphone|ipad/i.test(ua) ? "iOS"
        : "Desktop";

      const browser = /brave/i.test(ua) ? "Brave"
        : /chrome/i.test(ua) ? "Chrome"
        : /safari/i.test(ua) ? "Safari"
        : "Other";

      const info = { ip, country, region, city, isp, device, browser };
      await env.YTDOWN_KEYS.put(key, JSON.stringify({ requests: 0, date: today, info }));

      return Response.json({ apikey: key });
    }

    // Admin Panel
    if (pathname === "/Notty_Boy") {
      const admin = searchParams.get("admin");
      if (admin !== ADMIN_KEY) return new Response("Unauthorized", { status: 403 });

      const list = await env.YTDOWN_KEYS.list();
      const rows = [];

      for (const key of list.keys) {
        const data = await env.YTDOWN_KEYS.get(key.name);
        if (!data) continue;
        const parsed = JSON.parse(data);
        rows.push({ key: key.name, requests: parsed.requests || 0, info: parsed.info || {} });
      }

      return new Response(ADMIN_HTML(rows), {
        headers: { "Content-Type": "text/html; charset=UTF-8" },
      });
    }

    // Delete Key
    if (pathname === "/delete-key") {
      const admin = searchParams.get("admin");
      const delKey = searchParams.get("key");
      if (admin !== ADMIN_KEY) return new Response("Unauthorized", { status: 403 });

      if (delKey) {
        await env.YTDOWN_KEYS.delete(delKey);
        return Response.json({ deleted: delKey });
      }
      return Response.json({ error: "Missing key" });
    }

    // Check Usage
    if (pathname === "/check-usage") {
      const apikey = searchParams.get("apikey");
      if (!apikey) return Response.json({ error: "Missing API key" }, { status: 403 });

      const stored = await env.YTDOWN_KEYS.get(apikey);
      if (!stored) return Response.json({ error: "Invalid API key" }, { status: 403 });

      const data = JSON.parse(stored);
      const today = new Date().toISOString().split("T")[0];

      if (data.date !== today) {
        data.requests = 0;
        data.date = today;
        await env.YTDOWN_KEYS.put(apikey, JSON.stringify(data));
      }

      return Response.json({ used: data.requests, remaining: DAILY_LIMIT - data.requests });
    }

    if (pathname === "/youtube") {
      const url = searchParams.get("url");
      const apikey = searchParams.get("apikey");
      if (!apikey) return Response.json({ error: "Missing API key" }, { status: 403 });
      if (!url) return Response.json({ error: "Missing URL parameter" }, { status: 400 });

      const stored = await env.YTDOWN_KEYS.get(apikey);
      if (!stored) return Response.json({ error: "Invalid API key" }, { status: 403 });

      const data = JSON.parse(stored);
      const today = new Date().toISOString().split("T")[0];
      if (data.date !== today) {
        data.requests = 0;
        data.date = today;
      }
      if (data.requests >= DAILY_LIMIT) {
        return Response.json({ error: `Daily limit reached (${DAILY_LIMIT} requests)` }, { status: 429 });
      }

      const ytResponse = await ytDownload(request);
      const result = await ytResponse.json();

      if (result?.status === "success") {
        data.requests += 1;
        await env.YTDOWN_KEYS.put(apikey, JSON.stringify(data));
        result.used = data.requests;
        result.remaining = DAILY_LIMIT - data.requests;
      }

      return new Response(JSON.stringify(result, null, 2), {
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }

    // Fallback 404 for unknown paths
    return new Response("404 Not Found", { status: 404 });
  }
};

// Admin Panel HTML View
function ADMIN_HTML(keys) {
  const rows = keys.map(({ key, requests, info }) => {
    return `
    <div class="row">
      <div class="header"><b>🔑 ${key}</b> — ${requests}/${DAILY_LIMIT}</div>
      <div>🌍 ${info.country || "?"} | 🏙️ ${info.city || "?"}, ${info.region || "?"}</div>
      <div>📱 ${info.device || "?"} | 🌐 ${info.browser || "?"}</div>
      <div>🏢 ISP: ${info.isp || "?"}</div>
      <div>📡 IP: ${info.ip || "?"}</div>
      <button class="del" onclick="confirmDelete('${key}')">🗑️ Delete</button>
    </div>`;
  }).join("");

  return `<!DOCTYPE html>
  <html><head><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>JerryCoder Admin</title>
  <style>
    body { font-family: sans-serif; background: #f5f5f5; margin: 0; padding: 1rem; }
    .row { background: white; border-radius: 8px; padding: 1rem; margin: 1rem 0; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
    .header { font-size: 1rem; margin-bottom: 0.5rem; }
    button.del { margin-top: 0.5rem; padding: 6px 10px; border: none; border-radius: 4px; background: #e74c3c; color: white; cursor: pointer; }
  </style>
  <script>
    function confirmDelete(key) {
      if (confirm('Delete ' + key + '?')) {
        fetch('/delete-key?admin=${ADMIN_KEY}&key=' + key).then(() => location.reload());
      }
    }
  </script>
  </head><body>
    <h2>🔐 Notty_Boy Admin Panel</h2>
    ${rows || "<p>No API keys found.</p>"}
  </body></html>`;
}

// Landing Page
const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <!-- Prevent zoom and scaling on mobile -->
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Notty_Boy</title>
  <link rel="icon" href="https://jerryapi.vercel.app/o8CCbg.jpg" type="image/jpeg">
  <style>
    body {
      background: #000;
      color: #fff;
      font-family: sans-serif;
      padding: 20px;
      margin: 0;
      overflow-x: hidden;
    }
    .box {
      background: #111;
      padding: 20px;
      border-radius: 10px;
      margin-top: 20px;
    }
    .btn {
      background: #fff;
      color: #000;
      padding: 10px 20px;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-weight: bold;
    }
    input, textarea {
      width: 100%;
      padding: 10px;
      margin-top: 10px;
      border-radius: 5px;
      border: none;
    }
    .footer {
      margin-top: 40px;
      text-align: center;
      color: #aaa;
    }
    .footer img {
      height: 24px;
      vertical-align: middle;
      margin-right: 8px;
    }
    .link-icon {
      display: inline-flex;
      align-items: center;
      margin: 0 10px;
    }
    code {
      display: block;
      background: #222;
      padding: 8px;
      border-radius: 6px;
      color: #0f0;
      word-break: break-all;
      overflow-wrap: break-word;
      font-family: monospace;
    }
  </style>
</head>
<body>
<h1>Notty_Boy YouTube API</h1>
<p>Generate your API key & check usage (${DAILY_LIMIT} req/day)</p>

<!-- API Key Section -->
<div class="box">
  <h2>Your API Key</h2>
  <div id="key-output" style="font-weight:bold;"></div>
  <button class="btn" id="generate-key-btn">Generate API Key</button>
</div>

<!-- Usage Section -->
<div class="box" id="usage-box" style="display:none;">
  <h2>Usage</h2>
  <div id="usage-info">Loading...</div>
  <button class="btn" onclick="checkUsage()">Refresh</button>
</div>

<!-- API Demo Section -->
<div class="box">
  <h2>API Usage Example</h2>
  <p>After generating your API key, use it like this:</p>
  <code>
    https://Notty_Boy/youtube?url=https://youtube.com/shorts/9OzwU9zzcYE&apikey=YOUR_API_KEY
  </code>
</div>

<!-- About Section -->
<div class="box">
  <h2>About JerryCoder</h2>
  <p>Notty_Boy is a developer focused on building powerful yet simple APIs. This YouTube API allows users to fetch downloadable video/audio links using only a YouTube Shorts or video URL.</p>
</div>

<!-- Features Section -->
<div class="box">
  <h2>Features</h2>
  <ul>
    <li>🔑 <strong>API Key System</strong> – Free ${DAILY_LIMIT} requests per day per user</li>
    <li>📥 <strong>MP3 & MP4 Download Links</strong> – Extracts high-quality media links</li>
    <li>🎞️ <strong>Metadata</strong> – Includes title, thumbnail, and duration in the response</li>
    <li>🧪 <strong>Simple GET API</strong> – Just pass <code>url</code> and <code>apikey</code></li>
    <li>✅ <strong>JSON Response</strong> – Structured, easy-to-parse output</li>
  </ul>
</div>

<!-- Footer -->
<div class="footer">
  <div class="link-icon">
    <img src="https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg" alt="Telegram">
    <a href="https://t.me/oggy_workshop" target="_blank" style="color:#aaa;">@oggy_workshop</a>
  </div>
  <div class="link-icon">
    <img src="https://cdn-icons-png.flaticon.com/512/25/25231.png" alt="GitHub">
    <a href="https://github.com/jerryformrussian" target="_blank" style="color:#aaa;">@jerryformrussian</a>
  </div>
</div>

<script>
const KEY_STORAGE = "Notty_Boy-api-key";
const keyOutput = document.getElementById("key-output");
const usageInfo = document.getElementById("usage-info");
const usageBox = document.getElementById("usage-box");
const keyBtn = document.getElementById("generate-key-btn");

function resetUI() {
  localStorage.removeItem(KEY_STORAGE);
  keyOutput.textContent = "";
  usageBox.style.display = "none";
  keyBtn.style.display = "inline-block";
}

async function checkUsage() {
  const key = localStorage.getItem(KEY_STORAGE);
  if (!key) return resetUI();
  const res = await fetch("/check-usage?apikey=" + key);
  const data = await res.json();
  if (data.used !== undefined) {
    usageInfo.textContent = \`Used: \${data.used} / ${DAILY_LIMIT}\`;
  } else {
    usageInfo.textContent = data.error;
    if (data.error?.includes("Invalid")) resetUI();
  }
}

const storedKey = localStorage.getItem(KEY_STORAGE);
if (storedKey) {
  keyOutput.textContent = storedKey;
  keyBtn.style.display = "none";
  usageBox.style.display = "block";
  checkUsage();
}

keyBtn.addEventListener("click", async () => {
  const res = await fetch("/generate-key");
  const data = await res.json();
  if (data.apikey) {
    localStorage.setItem(KEY_STORAGE, data.apikey);
    keyOutput.textContent = data.apikey;
    keyBtn.style.display = "none";
    usageBox.style.display = "block";
    checkUsage();
  }
});
</script>
</body>
</html>`;
