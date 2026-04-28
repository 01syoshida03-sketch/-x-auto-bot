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
// Gemini API リトライユーティリティ
// 503/429/500などの一時的エラー時に最大3回リトライ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function withRetry(fn, maxRetries = 3, baseDelay = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = err.status === 503 || err.status === 429 || err.status === 500;
      if (!isRetryable || attempt === maxRetries) throw err;
      const delay = baseDelay * attempt;
      console.log(`Gemini API error (${err.status}). Retry ${attempt}/${maxRetries - 1} in ${delay / 1000}s...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 【昼投稿】曜日ごとのフォーマット配分
// 分析結果: question(avg36imp) > list(22.5) > story(17.8)
// → questionを週3回、list/storyを各2回に最適化
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const FORMATS_BY_DAY = [
  "question", // 日（avg 36imp・最強）
  "list",     // 月（avg 22.5imp）
  "story",    // 火（avg 17.8imp）
  "question", // 水（avg 36imp・最強）
  "story",    // 木（avg 17.8imp）
  "list",     // 金（avg 22.5imp）
  "question", // 土（avg 36imp・最強）
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 【昼投稿】テーマプール
// 方針: 転職・副業・キャリアの3軸に完全絞り込み
// 根拠: 転職テーマが最高インプ64imp、上位投稿もこのカテゴリに集中
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const INSIGHT_THEMES = [
  // ── 転職軸 ──
  "転職活動にAIを使うと何が変わるか",
  "面接準備にAIを使うと何が変わるか",
  "転職市場でAIを使いこなす人が有利になる理由",
  "人材会社勤務が感じるAI転職の変化",
  "転職の自己PRをAIで言語化してみた話",
  // ── 副業軸 ──
  "副業・フリーランスがAIで単価を上げる方法",
  "副業で収入を上げるためにAIを使った話",
  "副業案件をAIで獲得した話",
  "フリーランスへの転向でAIが役立った話",
  // ── キャリア軸 ──
  "AI時代に求められるキャリアの作り方",
  "AIで自分の市場価値を把握する方法",
  "キャリアチェンジにAIを活用した体験談",
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テーマ別ハッシュタグマッピング
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const THEME_HASHTAGS = {
  "転職活動にAIを使うと何が変わるか": "#転職 #AI活用",
  "面接準備にAIを使うと何が変わるか": "#転職 #面接対策",
  "転職市場でAIを使いこなす人が有利になる理由": "#転職 #AI転職",
  "人材会社勤務が感じるAI転職の変化": "#転職 #人材業界",
  "転職の自己PRをAIで言語化してみた話": "#転職 #自己PR",
  "副業・フリーランスがAIで単価を上げる方法": "#副業 #AI活用",
  "副業で収入を上げるためにAIを使った話": "#副業 #フリーランス",
  "副業案件をAIで獲得した話": "#副業 #AI活用",
  "フリーランスへの転向でAIが役立った話": "#フリーランス #副業",
  "AI時代に求められるキャリアの作り方": "#キャリア #AI活用",
  "AIで自分の市場価値を把握する方法": "#キャリア #転職",
  "キャリアチェンジにAIを活用した体験談": "#キャリア #転職",
};

const FORMAT_PROMPTS = {
  question: `【問いかけ型】120-180字
- 1行目: 読んだ人がドキッとする問い（15字以内）
- 2〜3行: 自分なりの考えや見聞きしたことを添える
- 締め: 「あなたはどっち派？」「みんなどうしてる？」など返信しやすい終わり方
文体: 軽い。断定より「〜かも」「〜気がする」でOK`,

  list: `【リスト型】220-300字
- 1行目: 「○○の3つの理由」「○○でやめた5つのこと」など体験ベースのタイトル（15字以内）
- ①②③形式で3〜4項目。各項目は具体的な行動・数字を入れる
- 締め: 自分の感想か、読者へのシンプルな問いかけ
文体: 箇条書きだが堅くならないように。絵文字は最後の1個だけ可`,

  story: `【事例型】200-280字
- 1行目: 結果から始める（「○○が○○になった」など、数字入りだと◎）（15字以内）
- 2〜3行: 状況・課題・試したこと・結果の流れで書く
- 締め: 読者がすぐ真似できる1ポイント
文体: 「知人の話」「聞いた話」「自分でやってみた」形式。人間のエピソードとして書く`,

  contrarian: `【逆張り型】180-240字
- 1行目: 「○○は間違い」「○○より○○」など常識をひっくり返す一言（15字以内・断言）
- 2〜3行: なぜそう言えるか、自分の経験・見聞きした事例ベースで書く
- 最終行: 読者に問いを投げて終わる
文体: 話し言葉寄り。「〜なんだよね」「〜だと思う」「〜じゃない？」OK`,

  insight: `【気づき型】160-220字
- 1行目: 「○○って実は〜」「○○を使って気づいた」など自分の発見ベースの一言（15字以内）
- 2〜3行: 具体的な状況・数字・before/afterで説明
- 締め: 「同じ経験ある人いる？」など共感を引く一言
文体: 体験談・日記っぽいトーン。「〜してみたら」「〜だった」`,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 【夜投稿】プロンプトカテゴリ
// 方針: 転職・副業・キャリア軸のプロンプトに集中
// 根拠: いいね4/5がprompt型、エンゲージメントが最も高い
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PROMPT_CATEGORIES = [
  "転職の自己PR・職務経歴書作成",      // 転職軸（最重要）
  "面接対策・想定質問への回答準備",    // 転職軸
  "転職の志望動機を言語化する",        // 転職軸
  "副業案件の提案・営業メール作成",    // 副業軸
  "フリーランス向け見積もり・契約文書",// 副業軸
  "副業ポートフォリオのまとめ方",      // 副業軸
  "キャリアプランの壁打ち・言語化",    // キャリア軸
  "年収交渉・給与アップの交渉文",      // キャリア軸
  "スキルの棚卸しと市場価値の整理",    // キャリア軸
  "副業・転職に使えるSNS発信文章",    // 転職/副業軸
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 昼投稿：インサイト系コンテンツ生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function generateInsightPost(format, theme) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const hashtags = THEME_HASHTAGS[theme] || "#転職 #AI活用";

  const prompt = `あなたはAIを仕事で使い始めて2年、人材会社に勤めながら副業でAIコンサルもやっているビジネスパーソンです。
Xで日々思ったことをつぶやいています。フォロワーに向けて、今日気づいたこと・聞いた話をシェアします。

テーマ:「${theme}」

フォーマット指示:
${FORMAT_PROMPTS[format]}

【絶対に守るルール】
- AIを主語にしない。「自分が試した」「知人から聞いた」「最近気づいた」が主語
- 「激増」「飛躍的」「圧倒的」「最大化」「確立」「独占」「劇的」「爆上げ」禁止
- 「今すぐ〜せよ」「ライバルに差をつけろ」のような煽り表現禁止
- 絵文字は文章の最後に1個だけ（なくてもよい）
- ハッシュタグは文末に、このタグを使うこと: ${hashtags}
- テンプレ感のある出だし禁止（「〜の時代です」「〜が重要です」禁止）
- 投稿文のみ出力（説明・前置き不要）`;

  const result = await withRetry(() =>
    model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.92 },
    })
  );

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

  const result = await withRetry(() =>
    model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.95 },
    })
  );

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
  const requiredEnv = ["GEMINI_API_KEY", "X_API_KEY", "X_API_KEY_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"];
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
