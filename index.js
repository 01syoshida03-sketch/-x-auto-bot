import { GoogleGenerativeAI } from "@google/generative-ai";
import { TwitterApi } from "twitter-api-v2";
import dotenv from "dotenv";

dotenv.config();

// 環境変数のチェック
const requiredEnv = [
  "GEMINI_API_KEY",
  "X_API_KEY",
  "X_API_KEY_SECRET",
  "X_ACCESS_TOKEN",
  "X_ACCESS_TOKEN_SECRET"
];

const missingEnv = requiredEnv.filter(env => !process.env[env]);
if (missingEnv.length > 0) {
  console.error(`Missing environment variables: ${missingEnv.join(", ")}`);
  process.exit(1);
}

// Geminiの設定 (最新の 2.5 Flash モデルを使用)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

async function generateBusinessPrompt() {
  // 高度で専門的な実務テーマ（文字数制限がないため、より深いインサイトを要求可能）
  const businessThemes = [
    "正社員採用におけるスカウト文面の高度なパーソナライズと返信率向上",
    "カスタマーサクセスにおける解約（チャーン）兆候の早期発見と対策提案",
    "属人化している営業・CSの業務プロセスを分解しDX化・自動化する",
    "顧客の潜在ニーズを深掘りする商談前の仮説構築",
    "採用要件のすり合わせと、ターゲットとなるペルソナ像の明確化",
    "BtoB SaaSのオンボーディング期間におけるつまずきポイントの予測とフォロー"
  ];
  const todayTheme = businessThemes[Math.floor(Math.random() * businessThemes.length)];

  // X Premium向けの長文・高品質プロンプトの指示
  const prompt = `あなたは斬新な切り口と深い業務理解を持つ、世界最高のAIプロンプトエンジニアです。
本日のテーマ「${todayTheme}」に沿って、X（Twitter）のタイムラインでプロフェッショナルの目を引く、実践的で高品質なプロンプトを1つ提案してください。

## 必須制約:
- 凡庸な提案（例：ただの文章作成、単純な要約）は絶対に避けること。
- その業務の「本質的な課題」を解決するような、変数を複数使った高度なプロンプトを設計すること。
- 文字数は400文字〜800文字程度で、読みやすく構造化すること。

## 出力フォーマット（厳守）:
🔥今日のAIハック: (目を引くタイトル)

【解決できる課題】
(このプロンプトがどんなビジネス課題を解決するか、簡潔に)

【コピペ用プロンプト】
以下の[変数]を埋めて、〇〇を出力してください。
目的: [具体的な目的]
ターゲット: [ターゲット属性]
現状の課題: [課題の詳細]
---
(ここに、GeminiやChatGPTにそのままコピペして使える、条件分岐や出力形式を指定した高品質なプロンプト本文を記載)

【使い方のコツ】
(変数の埋め方のコツや、期待される出力結果のイメージを解説)
`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8, // 専門性と独創性のバランスを取る
      }
    });
    
    const response = await result.response;
    let text = response.text().trim();
    
    // Markdownのコードブロック記号（```）が混ざった場合は削除して綺麗にする
    text = text.replace(/```/g, "");

    // ハッシュタグを最後に付与
    const hashtags = "\n\n#AI活用 #プロンプトエンジニアリング #業務効率化 #DX";
    return text + hashtags;

  } catch (error) {
    console.error("Gemini generation error:", error);
    throw error;
  }
}

async function postToX(text) {
  try {
    const xClient = new TwitterApi({
      appKey: process.env.X_API_KEY,
      appSecret: process.env.X_API_KEY_SECRET,
      accessToken: process.env.X_ACCESS_TOKEN,
      accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
    });
    
    const rwClient = xClient.readWrite;
    
    // X Premiumアカウントであれば、自動的に長文ポストとして処理されます
    await rwClient.v2.tweet(text);
    console.log("Successfully posted to X!");
  } catch (error) {
    console.error("X posting error:", error);
    throw error;
  }
}

async function main() {
  console.log("Starting daily post process...");
  try {
    const content = await generateBusinessPrompt();
    console.log("Generated Content:\n", content);
    console.log("Character count:", content.length);
    
    await postToX(content);
  } catch (error) {
    console.error("Process failed:", error);
    process.exit(1);
  }
}

main();
