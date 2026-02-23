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
  const prompt = `あなたは世界最高のAIプロンプトエンジニアです。
ビジネスパーソンが日々の業務で即座に使える実用的なプロンプトを1つ紹介してください。

## 必須制約（絶対厳守）:
- 全体の文字数を「130文字以内」に絶対におさめてください。
- 日本語で作成してください。

## 出力フォーマット（厳守）:
【毎朝のAI仕事術】
タイトル: (名前)
活用シーン: (役立つ場面)
プロンプト例:
(プロンプトの内容)
ポイント: (コツを一言)

#Gemini #AI活用`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();
    
    // Xの140文字制限（日本語の場合）を超えないかチェック（安全装置）
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
