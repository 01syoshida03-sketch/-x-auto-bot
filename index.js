import { GoogleGenerativeAI } from "@google/generative-ai";
import { TwitterApi } from "twitter-api-v2";
import dotenv from "dotenv";

dotenv.config();

// 環境変数のチェック
const requiredEnv = ["GEMINI_API_KEY", "X_API_KEY", "X_API_KEY_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"];
const missingEnv = requiredEnv.filter(env => !process.env[env]);
if (missingEnv.length > 0) {
  console.error(`Missing environment variables: ${missingEnv.join(", ")}`);
  process.exit(1);
}

// Geminiの設定 (モデル名を極めて標準的なものに設定)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

async function generateBusinessPrompt() {
  const prompt = `ビジネスで使えるAIプロンプトを1つ、240文字以内の日本語でお知らせ。
フォーマット：
【毎朝のAI仕事術】
タイトル：
活用シーン：
プロンプト例：
ポイント：
#Gemini #AI活用 #生産性向上`;

  try {
    // 確実に動作させるため、シンプルな生成を試みる
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
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
    await xClient.readWrite.v2.tweet(text);
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
    await postToX(content);
  } catch (error) {
    console.error("Process failed:", error);
    process.exit(1);
  }
}

main();


