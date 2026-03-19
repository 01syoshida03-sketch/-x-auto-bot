import { GoogleGenerativeAI } from "@google/generative-ai";
import { TwitterApi } from "twitter-api-v2";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

// 曜日ごとのフォーマットローテーション
const FORMATS_BY_DAY = [
  "insight",     // 日
  "contrarian",  // 月
  "list",        // 火
  "question",    // 水
  "story",       // 木
  "contrarian",  // 金
  "insight",     // 土
];

// テーマプール
const THEMES = [
  "AI採用ツールの本当の落とし穴",
  "カスタマーサクセスをAIで自動化する現実",
  "スタートアップ営業プロセスのDX最前線",
  "中小企業がAIで生産性を上げた実例",
  "副業・フリーランスがAIで単価を上げる方法",
  "転職活動にAIを使うと何が変わるか",
  "BtoB SaaSのチャーンをAIで予防する",
  "採用スカウトの返信率を3倍にする秘訣",
  "ChatGPT/Geminiを仕事で使いこなす人の習慣",
  "日本企業のAI導入が遅い本当の理由",
];

const FORMAT_PROMPTS = {
  contrarian: `【逆張り型】180-260字
1行目: 常識を否定する断言(15字以内)
2-3行: 根拠を具体的に
最終行: 読者への気づきか問い
ハッシュタグ: 1-2個のみ`,
  list: `【リスト型】220-320字
1行目: 数字入りタイトル(15字以内)
①②③形式で3-5項目
締め: 1行で要点
ハッシュタグ: 1-2個のみ`,
  insight: `【インサイト型】160-240字
1行目: 意外な事実を断言(15字以内)
2-3行: 具体例を交えて説明
締め: 読者が「確かに」と思える一言
ハッシュタグ: 1-2個のみ`,
  question: `【問いかけ型】120-200字
1行目: ドキッとする問い(15字以内)
2-3行: 視点・ヒント提示
締め: リプを促す一言
ハッシュタグ: 1個のみ`,
  story: `【事例型】200-300字
1行目: 驚きの変化から始める(15字以内)
2-3行: 状況・課題・解決策
締め: 読者がすぐ真似できる1ポイント
ハッシュタグ: 1-2個のみ`,
};

async function generatePost(format, theme) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `あなたは日本のXでフォロワー1万人超のAIビジネス活用専門家です。
リアルな業務経験に基づいた「刺さる」投稿で知られています。

本日のテーマ:「${theme}」

${FORMAT_PROMPTS[format]}

絶対ルール:
- 1行目は15字以内。スクロールを止めるほど強烈な一言。
- 断定口調（〜だ、〜した、〜できる）で書く
- テンプレ感のある出だし（「今日は〜ご紹介します」等）は禁止
- 絵文字は1-2個まで
- ハッシュタグは最大2個、文末に付ける

投稿文のみ出力（説明・前置き不要）。`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.92 },
  });

  let text = result.response.text().trim();
  text = text.replace(/```[\s\S]*?```/g, "").trim();
  return text;
}

async function postToX(text) {
  const xClient = new TwitterApi({
    appKey: process.env.X_API_KEY,
    appSecret: process.env.X_API_KEY_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
  });
  const { data } = await xClient.readWrite.v2.tweet(text);
  return data.id;
}

function savePostLog(tweetId, format, theme, text) {
  const logPath = path.join(process.cwd(), "post_log.json");
  let log = [];
  if (fs.existsSync(logPath)) {
    try { log = JSON.parse(fs.readFileSync(logPath, "utf-8")); } catch { log = []; }
  }
  log.push({
    id: tweetId,
    date: new Date().toISOString(),
    format,
    theme,
    text,
    impressions: null,
    likes: null,
    retweets: null,
    replies: null,
  });
  if (log.length > 90) log = log.slice(-90);
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  console.log(`Post log saved. Total: ${log.length}`);
}

async function main() {
  const requiredEnv = ["GEMINI_API_KEY","X_API_KEY","X_API_KEY_SECRET","X_ACCESS_TOKEN","X_ACCESS_TOKEN_SECRET"];
  const missing = requiredEnv.filter((e) => !process.env[e]);
  if (missing.length > 0) { console.error("Missing env vars:", missing.join(", ")); process.exit(1); }

  console.log("=== X Auto Post Starting ===");
  const format = FORMATS_BY_DAY[new Date().getDay()];
  const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
  console.log(`Format: ${format} | Theme: ${theme}`);

  const content = await generatePost(format, theme);
  console.log("\n--- Generated ---\n" + content);
  console.log("\nChars:", content.length);

  const tweetId = await postToX(content);
  console.log("\n✅ Posted! ID:", tweetId);
  savePostLog(tweetId, format, theme, content);
}

main().catch((e) => { console.error("Failed:", e); process.exit(1); });
