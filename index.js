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
  contrarian: `【逆張り型】180-240字
- 1行目: 「○○は間違い」「○○より○○」など常識をひっくり返す一言（15字以内・断言）
- 2〜3行: なぜそう言えるか、自分の経験・見聞きした事例ベースで書く
- 最終行: 読者に問いを投げて終わる
文体: 話し言葉寄り。「〜なんだよね」「〜だと思う」「〜じゃない？」OK`,

  list: `【リスト型】220-300字
- 1行目: 「○○の3つの理由」「○○でやめた5つのこと」など体験ベースのタイトル（15字以内）
- ①②③形式で3〜4項目。各項目は具体的な行動・数字を入れる
- 締め: 自分の感想か、読者へのシンプルな問いかけ
文体: 箇条書きだが堅くならないように。絵文字は最後の1個だけ可`,

  insight: `【気づき型】160-220字
- 1行目: 「○○って実は〜」「○○を使って気づいた」など自分の発見ベースの一言（15字以内）
- 2〜3行: 具体的な状況・数字・before/afterで説明
- 締め: 「同じ経験ある人いる？」など共感を引く一言
文体: 体験談・日記っぽいトーン。「〜してみたら」「〜だった」`,

  question: `【問いかけ型】120-180字
- 1行目: 読んだ人がドキッとする問い（15字以内）
- 2〜3行: 自分なりの考えや見聞きしたことを添える
- 締め: 「あなたはどっち派？」など返信しやすい終わり方
文体: 軽い。断定より「〜かも」「〜気がする」でOK`,

  story: `【事例型】200-280字
- 1行目: 結果から始める（「○○が○○になった」など、数字入りだと◎）（15字以内）
- 2〜3行: 状況・課題・試したこと・結果の流れで書く
- 締め: 読者がすぐ真似できる1ポイント
文体: 「知人の話」「聞いた話」「自分でやってみた」形式。人間のエピソードとして書く`,
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

  const prompt = `あなたはAIを仕事で使い始めて2年、Xで日々思ったことをつぶやいているビジネスパーソンです。
フォロワーに向けて、今日気づいたこと・聞いた話をシェアします。

テーマ:「${theme}」
フォーマット指示:
${FORMAT_PROMPTS[format]}

【絶対に守るルール】
- AIを主語にしない。「自分が試した」「知人から聞いた」「最近気づいた」が主語
- 「激増」「飛躍的」「圧倒的」「最大化」「確立」「独占」「劇的」「爆上げ」禁止
- 「今すぐ〜せよ」「ライバルに差をつけろ」のような煽り表現禁止
- 絵文字は文章の最後に1個だけ（なくてもよい）
- ハッシュタグは1〜2個、文末に
- テンプレ感のある出だし禁止（「〜の時代です」「〜が重要です」禁止）
- 投稿文のみ出力（説明・前置き不要）`;

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

  const prompt = `あなたはAIを仕事でよく使うビジネスパーソンで、「これ使ったら思ったより良かった」プロンプトをXでたまにシェアしています。

カテゴリ:「${category}」

【フォーマット】全体150〜220字
・1行目（フック）: 「これ昨日使ったら〜だった」「ずっと手作業してたのに〜」など、使った感想・驚きから入る（15字以内）
・2行目: プロンプトの用途を1行でざっくり説明
・3〜5行目: 実際に使えるプロンプト本文（「」で囲む）
  - 変数は[○○]で示すが、多用しない（1〜2個まで）
  - シンプルで短く。箇条書き形式は避ける
・最終行: ハッシュタグ1個（#AI活用 のみ）

【絶対に守るルール】
- 「秒で完了」「爆速」「劇的」「完璧」などの大げさな表現禁止
- 説明過多にしない。プロンプトを紹介するだけでOK
- 絵文字は1個以内
- 投稿文のみ出力`;

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
    try {
      log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
    } catch {
      log = [];
    }
  }
  log.push({
    id: tweetId,
    date: new Date().toISOString(),
    postType,
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
  if (missing.length > 0) {
    console.error("Missing env vars:", missing.join(", "));
    process.exit(1);
  }

  console.log("=== X Auto Post Starting ===");
  const postType = getPostType();
  console.log(`Post type: ${postType} (UTC hour: ${new Date().getUTCHours()})`);

  let content, format, theme;

  if (postType === "insight") {
    format = FORMATS_BY_DAY[new Date().getDay()];
    theme = INSIGHT_THEMES[Math.floor(Math.random() * INSIGHT_THEMES.length)];
    console.log(`Format: ${format} | Theme: ${theme}`);
    content = await generateInsightPost(format, theme);
  } else {
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

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
