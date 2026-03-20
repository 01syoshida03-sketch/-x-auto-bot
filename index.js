import { GoogleGenerativeAI } from "@google/generative-ai";
import { TwitterApi } from "twitter-api-v2";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 投稿タイプの判定
// 12:00 JST (UTC 3時) → インサイト系投稿
// 20:00 JST (UTC 11時) → ビジネスプロンプト紹介投稿
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function getPostType() {
  const utcHour = new Date().getUTCHours();
  // UTC 9-13時 → 昼枠 (JST 18-22時分も含む余裕を持たせる)
  if (utcHour >= 2 && utcHour <= 5) return "insight";
  return "prompt";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 【昼投稿】曜日ごとのフォーマットローテーション
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const FORMATS_BY_DAY = [
  "insight",     // 日
  "contrarian",  // 月
  "list",        // 火
  "question",    // 水
  "story",       // 木
  "contrarian",  // 金
  "insight",     // 土
];

const INSIGHT_THEMES = [
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 【夜投稿】プロンプトカテゴリ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const PROMPT_CATEGORIES = [
  "メール・文章作成",
  "会議・議事録の効率化",
  "営業・提案資料の作成",
  "採用・面接準備",
  "データ分析・レポート要約",
  "アイデア出し・企画立案",
  "顧客対応・CS業務",
  "SNS・マーケティング文章",
  "業務フローの見直し",
  "学習・情報収集の効率化",
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 昼投稿：インサイト系コンテンツ生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function generateInsightPost(format, theme) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `あなたは日本のXでフォロワー1万人超のAIビジネス活用専門家です。

本日のテーマ:「${theme}」

${FORMAT_PROMPTS[format]}

絶対ルール:
- 1行目は15字以内。スクロールを止めるほど強烈な一言。
- 断定口調（〜だ、〜した、〜できる）で書く
- テンプレ感のある出だし禁止
- 絵文字は1-2個まで
- ハッシュタグは最大2個、文末に

投稿文のみ出力（説明・前置き不要）。`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.92 },
  });

  let text = result.response.text().trim();
  text = text.replace(/```[\s\S]*?```/g, "").trim();
  return text;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 夜投稿：ビジネスプロンプト紹介コンテンツ生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function generatePromptPost(category) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `あなたは日本のXで「すぐ使えるAIプロンプト」を紹介するアカウントの中の人です。
毎日1つ、ビジネスで本当に役立つプロンプトを紹介しています。

本日のカテゴリ:「${category}」

【フォーマット】全体150〜250字
・1行目（フック）: 「このプロンプト、仕事が変わる」など興味を引く一言（15字以内、断言調）
・2行目: プロンプトの用途を1行で説明
・3〜6行目: 実際にコピペして使えるプロンプト本文（「」や【】で囲む）
  - 変数は[○○]の形で示す
  - 短くシンプルで汎用性が高いもの
  - 日本のビジネスシーンで明日から使えるレベル
・最終行: ハッシュタグ1〜2個（#AI活用 #プロンプト のどちらか）

絶対ルール:
- プロンプト本文は短く実用的に（長すぎない）
- 「〜してください」系の単純な指示ではなく、出力形式や条件を少し加えたもの
- 絵文字は1個まで
- 投稿文のみ出力（前置き・説明不要）`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.95 },
  });

  let text = result.response.text().trim();
  text = text.replace(/```[\s\S]*?```/g, "").trim();
  return text;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Xへ投稿
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 投稿ログ保存
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function savePostLog(tweetId, postType, format, theme, text) {
  const logPath = path.join(process.cwd(), "post_log.json");
  let log = [];
  if (fs.existsSync(logPath)) {
    try { log = JSON.parse(fs.readFileSync(logPath, "utf-8")); } catch { log = []; }
  }
  log.push({
    id: tweetId,
    date: new Date().toISOString(),
    postType,  // "insight" or "prompt"
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メイン処理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function main() {
  const requiredEnv = ["GEMINI_API_KEY","X_API_KEY","X_API_KEY_SECRET","X_ACCESS_TOKEN","X_ACCESS_TOKEN_SECRET"];
  const missing = requiredEnv.filter((e) => !process.env[e]);
  if (missing.length > 0) { console.error("Missing env vars:", missing.join(", ")); process.exit(1); }

  console.log("=== X Auto Post Starting ===");

  const postType = getPostType();
  console.log(`Post type: ${postType} (UTC hour: ${new Date().getUTCHours()})`);

  let content, format, theme;

  if (postType === "insight") {
    // 昼投稿：インサイト系
    format = FORMATS_BY_DAY[new Date().getDay()];
    theme = INSIGHT_THEMES[Math.floor(Math.random() * INSIGHT_THEMES.length)];
    console.log(`Format: ${format} | Theme: ${theme}`);
    content = await generateInsightPost(format, theme);
  } else {
    // 夜投稿：プロンプト紹介
    format = "prompt";
    theme = PROMPT_CATEGORIES[Math.floor(Math.random() * PROMPT_CATEGORIES.length)];
    console.log(`Category: ${theme}`);
    content = await generatePromptPost(theme);
  }

  console.log("\n--- Generated ---\n" + content);
  console.log("\nChars:", content.length);

  const tweetId = await postToX(content);
  console.log("\n✅ Posted! ID:", tweetId);
  savePostLog(tweetId, postType, format, theme, content);
}

main().catch((e) => { console.error("Failed:", e); process.exit(1); });
