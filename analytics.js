import { TwitterApi } from "twitter-api-v2";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

async function fetchAndUpdateMetrics(log, xClient) {
  const pendingIds = log.filter((p) => p.id && p.impressions === null).map((p) => p.id);
  if (pendingIds.length === 0) { console.log("No new tweets to fetch metrics for."); return log; }

  console.log(`Fetching metrics for ${pendingIds.length} tweets...`);
  for (let i = 0; i < pendingIds.length; i += 100) {
    const batch = pendingIds.slice(i, i + 100);
    try {
      const result = await xClient.v2.tweets(batch, { "tweet.fields": ["public_metrics", "created_at"] });
      for (const tweet of result.data || []) {
        const entry = log.find((p) => p.id === tweet.id);
        if (entry && tweet.public_metrics) {
          entry.impressions = tweet.public_metrics.impression_count ?? 0;
          entry.likes = tweet.public_metrics.like_count ?? 0;
          entry.retweets = tweet.public_metrics.retweet_count ?? 0;
          entry.replies = tweet.public_metrics.reply_count ?? 0;
        }
      }
    } catch (err) { console.error(`Batch error:`, err.message); }
  }
  return log;
}

function generateReport(log) {
  const analyzed = log.filter((p) => p.impressions !== null);
  if (analyzed.length === 0) return "まだ分析できるデータがありません。投稿を続けてください！";

  const recent = analyzed.slice(-30);
  const totalImp = recent.reduce((s, p) => s + (p.impressions || 0), 0);
  const totalLikes = recent.reduce((s, p) => s + (p.likes || 0), 0);
  const totalRT = recent.reduce((s, p) => s + (p.retweets || 0), 0);
  const avgImp = Math.round(totalImp / recent.length);
  const engRate = totalImp > 0 ? (((totalLikes + totalRT) / totalImp) * 100).toFixed(2) : "0.00";

  const byFormat = {};
  for (const p of recent) {
    if (!byFormat[p.format]) byFormat[p.format] = [];
    byFormat[p.format].push(p.impressions || 0);
  }
  const fmtRank = Object.entries(byFormat)
    .map(([fmt, vals]) => ({ fmt, avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length), n: vals.length }))
    .sort((a, b) => b.avg - a.avg);

  const byTheme = {};
  for (const p of recent) {
    if (!byTheme[p.theme]) byTheme[p.theme] = [];
    byTheme[p.theme].push(p.impressions || 0);
  }
  const themeRank = Object.entries(byTheme)
    .map(([theme, vals]) => ({ theme, avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length), n: vals.length }))
    .sort((a, b) => b.avg - a.avg).slice(0, 3);

  const sorted = [...recent].sort((a, b) => (b.impressions || 0) - (a.impressions || 0));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 X 週次パフォーマンスレポート
${new Date().toLocaleDateString("ja-JP")}  対象: 直近${recent.length}件
━━━━━━━━━━━━━━━━━━━━━━━━━━━

【全体サマリー】
総インプレッション : ${totalImp.toLocaleString()}
総いいね           : ${totalLikes.toLocaleString()}
総RT               : ${totalRT.toLocaleString()}
平均インプレッション: ${avgImp.toLocaleString()}
エンゲージメント率  : ${engRate}%

【フォーマット別 (平均インプレッション)】
${fmtRank.map((f, i) => `${i + 1}位 ${f.fmt}: ${f.avg.toLocaleString()} (${f.n}件)`).join("\n")}

【テーマ別 TOP3】
${themeRank.map((t, i) => `${i + 1}位: ${t.theme}\n    → 平均 ${t.avg.toLocaleString()} インプ`).join("\n")}

【🏆 ベスト投稿】
${new Date(best.date).toLocaleDateString("ja-JP")} [${best.format}]
インプレ: ${(best.impressions || 0).toLocaleString()} / いいね: ${best.likes} / RT: ${best.retweets}
${best.text.substring(0, 60)}...

【来週の推奨アクション】
✅ 最多フォーマット「${fmtRank[0]?.fmt}」を継続
⚠️ 最低「${fmtRank[fmtRank.length - 1]?.fmt}」は内容を見直す
━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `.trim();
}

async function main() {
  const requiredEnv = ["X_API_KEY","X_API_KEY_SECRET","X_ACCESS_TOKEN","X_ACCESS_TOKEN_SECRET"];
  const missing = requiredEnv.filter((e) => !process.env[e]);
  if (missing.length > 0) { console.error("Missing env vars:", missing.join(", ")); process.exit(1); }

  const logPath = path.join(process.cwd(), "post_log.json");
  if (!fs.existsSync(logPath)) { console.log("post_log.json not found. Run index.js first."); return; }

  let log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
  const xClient = new TwitterApi({
    appKey: process.env.X_API_KEY, appSecret: process.env.X_API_KEY_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN, accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
  });

  log = await fetchAndUpdateMetrics(log, xClient);
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));

  const report = generateReport(log);
  console.log(report);

  const mdContent = `# X Analytics Report\n\n更新日時: ${new Date().toISOString()}\n\n\`\`\`\n${report}\n\`\`\`\n`;
  fs.writeFileSync(path.join(process.cwd(), "analytics_report.md"), mdContent);
  console.log("\nReport saved to analytics_report.md");
}

main().catch((e) => { console.error("Analytics failed:", e); process.exit(1); });
