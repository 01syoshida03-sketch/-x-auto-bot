# X 自動投稿システム 設定ガイド

このシステムを動作させるには、GitHub リポジトリの Secret に以下の環境変数を設定する必要があります。

## 1. X (Twitter) API の設定
[X Developer Portal](https://developer.twitter.com/en/portal/dashboard) でプロジェクトを作成し、以下の情報を取得してください。

- `X_API_KEY`: API Key
- `X_API_KEY_SECRET`: API Key Secret
- `X_ACCESS_TOKEN`: Access Token
- `X_ACCESS_TOKEN_SECRET`: Access Token Secret

> [!IMPORTANT]
> **User authentication settings** で、権限を **「Read and Write」** に設定し、Type of App を **「Web App, Automated, or Bot」** に設定する必要があります。

## 2. Gemini API の設定
[Google AI Studio](https://aistudio.google.com/app/apikey) で API キーを取得してください。

- `GEMINI_API_KEY`: Gemini API Key

## 3. GitHub Secrets への設定方法
1. GitHub リポジトリのページを開く
2. **Settings** > **Secrets and variables** > **Actions** に移動
3. **New repository secret** をクリックして、上記の 5 つのキーと値を登録する

## 4. 動作確認
GitHub リポジトリの **Actions** タブから `Daily X Post` ワークフローを選択し、**Run workflow** をクリックすることで手動でテスト投稿が可能です。
