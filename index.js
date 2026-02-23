import { GoogleGenerativeAI } from "@google/generative-ai";
import { TwitterApi } from "twitter-api-v2";
import dotenv from "dotenv";

dotenv.config();

// 設定のチェック
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

// Geminiの設定
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Xの設定
const xClient = new TwitterApi({
    appKey: process.env.X_API_KEY,
    appSecret: process.env.X_API_KEY_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
});

async function generateBusinessPrompt() {
    const prompt = `
あなたは世界最高のAIプロンプトエンジニアです。
ビジネスパーソンが日々の業務（メール作成、資料作成、分析、アイデア出しなど）で即座に使える、実用的で高品質な「Gemini（またはChatGPT）用のプロンプト」を1つ紹介してください。

## 出力フォーマット（厳守）:
【毎朝のAI仕事術】
タイトル: (プロンプトの簡潔な名前)
活用シーン: (どのような時に役立つか)

プロンプト例:
\`\`\`
(ここに具体的なプロンプトの内容)
\`\`\`

ポイント: (使いこなしのコツを1行で)

#Gemini #AI活用 #生産性向上 #ChatGPT

## 制約:
- 全体で280文字（Xの制限）以内に収まるように工夫してください。
- 丁寧すぎず、簡潔で読みやすい日本語にしてください。
`;

    try {
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

        // Xの文字数制限（日本語は約140文字程度だが、英数字混じりのため調整が必要）
        // Geminiが頑張って調整してくれるはずだが、念のため。
        await postToX(content);
    } catch (error) {
        console.error("Process failed:", error);
        process.exit(1);
    }
}

main();

