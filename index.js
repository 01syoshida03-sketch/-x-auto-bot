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
  // ① 出力のマンネリ化を防ぐための「日替わりテーマ」
  const businessThemes = [
    "営業リスト作成とターゲット企業分析",
    "カスタマーサクセスにおける解約防止策",
    "採用活動における魅力的な求人票の作成",
    "社内のDX推進とペーパーレス化",
    "業界トレンドとM&A事例の要約",
    "新入社員や未経験者への業務メンタリング",
    "顧客の潜在ニーズを引き出すヒアリング"
  ];
  const todayTheme = businessThemes[Math.floor(Math.random() * businessThemes.length)];

  // ② AIへの指示をより厳格に、クリエイティブにする
  const prompt = `あなたは斬新な切り口を持つ世界最高のAIプロンプトエンジニアです。
本日のテーマ「${todayTheme}」に沿って、ビジネスパーソンがハッと驚くような質の高いプロンプトを1つ提案してください。

## 必須制約（絶対厳守）:
- 全体の文字数を「130文字以内」に絶対におさめてください。（超過はエラーになります）
- 「メール作成」や「単純な要約」などのありきたりな提案は禁止します。
- プロンプト例には、[ターゲット企業]や[顧客の課題]のような[括弧]を使って汎用性を持たせてください。

## 出力フォーマット（厳守）:
【毎朝のAI仕事術】
タイトル: (目を引くタイトル)
活用: (どう役立つか)
プロンプト:
(プロンプト本文)
コツ: (一言)
#Gemini #AI`;

  try {
    // ③ 創造性のパラメーター（temperature）を調整して呼び出す
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8, // 0.0(保守的) 〜 2.0(創造的)。少し高めに設定。
      }
    });
    
    const response = await result.response;
    let text = response.text();
    
    // Xの140文字制限を超えないかチェック（安全装置）
    if (text.length > 140) {
      console.warn("Generated text is too long, truncating...");
      text = text.substring(0, 137) + "...";
    }
    
    return text;
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
