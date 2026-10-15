/**
 * 移动优选 VLESS 订阅生成器（定制版）
 * 访问：https://你的域名/?token=你的TOKEN
 * 可选：&n=10  （只返回前10个）
 * 使用方法
 * 把上面代码粘贴到 Cloudflare Worker
 * 只改这几项：
 * TOKEN
 * UUID（必须和你实际节点的 UUID 一致）
 * HOST 和 SNI（你的 pages.dev 或自定义域名）
 * 部署后访问：https://你的worker.workers.dev/?token=你的TOKEN
 * 可选参数：
 * &n=8 → 只返回前 8 个节点
 */
const TOKEN = "3pD5LgiPcaj9PkuBVKLnX8wFebm3LCov";                    // ← 必须修改

// ==================== 可配置参数 ====================
const UUID = "30701e6a-4628-4613-84ed-7ca3ed0cadbd";  // 你的 UUID
const HOST = "riyu-node.pages.dev";                   // 你的伪装域名（pages.dev 或自定义域名）
const PATH = "/";                                    // WebSocket 路径（一般是 / 或 /?ed=2048）
const SNI = "riyu-node.pages.dev";                    // SNI（通常和 HOST 一样）
const FP = "chrome";                                 // 指纹
const ALPN = "h3,h2,http/1.1";                       // ALPN

// 常用 Cloudflare 支持的端口（会循环使用）
const PORTS = [443, 2053, 2083, 2087, 2096, 8443];

// 移动优选 IP 源（按优先级）
const IP_SOURCES = [
  "https://cf.090227.xyz/cmcc",
  "https://addressesapi.090227.xyz/cmcc",
  "https://ip.164746.xyz/ipTop10.html"
];

// 兜底 IP（源全部失败时使用）
const FALLBACK_IPS = [
  "104.17.191.136",
  "104.16.251.199",
  "104.17.96.63",
  "104.17.52.83",
  "104.17.152.243",
  "172.64.40.1",
  "104.18.32.1",
  "141.101.65.1"
];
// ==================================================

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // 只校验 TOKEN
    const token = url.searchParams.get("token") || 
                  (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");

    if (token !== TOKEN) {
      return new Response("Forbidden", { status: 403 });
    }

    // 获取 IP 列表
    let ips = await fetchBestIPs();

    // 支持只返回前 N 个
    const n = parseInt(url.searchParams.get("n") || "0");
    if (n > 0) {
      ips = ips.slice(0, Math.min(n, 50));
    }

    // 生成 VLESS 链接
    const links = [];
    ips.forEach((ip, index) => {
      const port = PORTS[index % PORTS.length];
      const remark = `CM-${index + 1}-${ip}`;

      const link = `vless://${UUID}@${ip}:${port}?encryption=none&security=tls&sni=${SNI}&fp=${FP}&type=ws&host=${HOST}&path=${encodeURIComponent(PATH)}&alpn=${encodeURIComponent(ALPN)}#${encodeURIComponent(remark)}`;
      links.push(link);
    });

    // 返回纯文本（客户端直接订阅）
    return new Response(links.join("\n") + "\n", {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, max-age=300",
        "Profile-Update-Interval": "6"
      }
    });
  }
};

// 获取移动优选 IP
async function fetchBestIPs() {
  for (const source of IP_SOURCES) {
    try {
      const res = await fetch(source, {
        headers: { "User-Agent": "Mozilla/5.0" },
        cf: { cacheTtl: 300 }
      });
      if (!res.ok) continue;

      const text = await res.text();
      const ips = (text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [])
        .filter((ip, i, arr) => arr.indexOf(ip) === i) // 去重
        .slice(0, 30);

      if (ips.length > 0) return ips;
    } catch (e) {}
  }
  return FALLBACK_IPS;
}
