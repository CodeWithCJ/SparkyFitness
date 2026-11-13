<p align="center">
  <a href="../../README.md">English</a> ·
  <a href="README_zh-CN.md">简体中文</a> ·
  <a href="README_zh-TW.md">繁體中文</a> ·
  <b>日本語</b> ·
  <a href="README_ko.md">한국어</a> ·
  <a href="README_hi.md">हिन्दी</a> ·
  <a href="README_th.md">ไทย</a> ·
  <a href="README_fr.md">Français</a> ·
  <a href="README_de.md">Deutsch</a> ·
  <a href="README_es.md">Español</a> ·
  <a href="README_it.md">Italiano</a> ·
  <a href="README_ru.md">Русский</a> ·
  <a href="README_pt-BR.md">Português (Brasil)</a> ·
  <a href="README_nl.md">Nederlands</a> ·
  <a href="README_pl.md">Polski</a> ·
  <a href="README_ar.md">العربية</a> ·
  <a href="README_fa.md">فارسی</a> ·
  <a href="README_tr.md">Türkçe</a> ·
  <a href="README_vi.md">Tiếng Việt</a> ·
  <a href="README_id.md">Bahasa Indonesia</a>
</p>

# SparkyFitness

MyFitnessPal、Flo、Hevy、Shotsy などに代わる、セルフホスト型でプライバシー重視の選択肢です。栄養、運動、身体測定値、健康データを記録しながら、データを完全に自分の管理下に置けます。
<img width="5120" height="2880" alt="画像" src="https://github.com/user-attachments/assets/d8b09f48-cb4d-41a6-b678-ac93e551f257" />


SparkyFitness は、次の要素で構成されるセルフホスト型のフィットネス記録プラットフォームです。

- バックエンドサーバー（API + データストレージ）
- Web ベースのフロントエンド
- iOS および Android 向けのネイティブモバイルアプリ

サードパーティのサービスに頼ることなく、あなたが管理するインフラ上で健康データを保存・管理します。

## 主な機能

- 栄養、運動、水分補給、睡眠、断食、気分、身体測定の記録
- 目標設定と毎日のチェックイン
- インタラクティブなグラフと長期レポート
- 複数のユーザープロフィールと家族アクセス
- ライトテーマとダークテーマ
- OIDC、TOTP、Passkey、MFA など

## SparkyFitness と他アプリの比較

**SparkyFitness はソース公開（source-available）であり、オープンソースではありません** —— [ライセンス](../../LICENSE)は非商用で、商用利用には許可が必要です。

ほとんどのアプリは一つのことしかできません。優れた栄養管理アプリ一つで年間 40～100 ドルかかります。SparkyFitness がカバーする範囲をすべて揃えるには、1 人あたり 3～4 つのサブスクリプションが必要で、それでもそれらを横断する単一のレポートは得られません。SparkyFitness なら一つのアプリで、無料で、家族全員が使えます。

<sub>米国の定価、2026 年 8 月 14 日時点。[費用の詳細な内訳 →](https://codewithcj.github.io/SparkyFitness/features/comparison)</sub>

| | **SparkyFitness** | wger | MyFitnessPal | Cronometer | Hevy | Zero | Flo | Garmin Connect | Google Health |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| セルフホストで、データは自分のもの | ⭐ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| サブスクなし、広告なし | ✅ | ✅ | ❌ | 🟡 | 🟡 | ❌ | ❌ | ✅ | 🟡 |
| 栄養、筋トレ、睡眠、断食、月経周期、服薬を一か所で\* | ⭐ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| 全履歴と任意の期間のレポート | ✅ 無料 | 🟡 | 💰 | 💰 | 💰 | 💰 | 💰 | ✅ | 💰 |
| ウェアラブル・健康プラットフォームとの同期 | ✅ 8 以上のサービス | ❌ | ✅ | ⭐ | ✅ | 🟡 | 🟡 | 🟡 | ✅ |
| きめ細かな権限付きの家族共有 | ⭐ 7 種類の権限 | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| CSV インポートと無料のデータエクスポート | ✅ | 🟡 | 💰 | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ❌ |
| MCP サーバー + 好きな LLM を利用可能 | ⭐ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

⭐ 特に優れている &nbsp;•&nbsp; ✅ 対応 &nbsp;•&nbsp; 🟡 一部対応 &nbsp;•&nbsp; 💰 有料プランのみ &nbsp;•&nbsp; ❌ 非対応

<sub>\* 睡眠ステージ、HRV、血糖値は、お使いのウォッチ、スマートフォン、測定器からインポートされます。SparkyFitness 自体が測定するのではなく、それらを保存・分析・グラフ化します。</sub>

> **この表は比較される側のプロジェクト自身が作成したものです。その前提でお読みください。** 2026 年 8 月 14 日に公式ドキュメント、リポジトリ、ストア掲載情報と照合しましたが、一部はすでに古くなっている可能性があります。誤りや他のプロジェクトにとって不公平なセルがあれば、[issue を作成](https://github.com/CodeWithCJ/SparkyFitness/issues)してください —— SparkyFitness の評価が*下がる*ような訂正も同じく歓迎します。

**[完全な比較を見る →](https://codewithcj.github.io/SparkyFitness/features/comparison)** —— セルフホスト、栄養、専門特化、デバイスエコシステムの各カテゴリにわたる 17 のアプリと、それぞれが私たちより優れている点を紹介しています。

## 健康・デバイス連携

SparkyFitness は、複数の健康・フィットネスプラットフォームからデータを同期できます。

- **Apple Health** (iOS)
- **Google Health Connect** (Android)
- **Google Health API** 
- **Fitbit**
- **Garmin Connect**
- **Withings**
- **Polar Flow** 
- **Oura**
- **Hevy**
- **OpenFoodFacts**
- **USDA**
- **Fatsecret**
- **Nutritionix**
- **Mealie**
- **Tandoor**
- **Strava**（一部のみテスト済み）
- **COROS**
- **Norish**
- **Yazio**（非公式 API を使用）
- **Swiss Food Database**
- **Canadian Nutrient File (Health Canada)**
- **Swedish Food Agency (Livsmedelsverket)**
- **Free Exercise DB** (Github)
- **Wger**

連携機能により、歩数、ワークアウト、睡眠などのアクティビティデータや、体重や身体測定値などの健康指標が、あなたの SparkyFitness サーバーへ自動的に同期されます。

## オプションの AI 機能（ベータ版）

SparkyAI は、データの記録や進捗の確認ができる対話型インターフェースを提供します。

- チャットで食事、運動、身体データ、歩数を記録
- 食事の画像をアップロードして自動で食事を記録
- 会話履歴を保持し、続けて質問が可能

注意: AI 機能は現在ベータ版です。

## インストール

SparkyFitness を動かす方法は次の 2 つから選べます。

### 1. セルフホスト

Docker Compose を使えば、数分で SparkyFitness サーバーを起動できます。

```bash
# 1. 新しいフォルダを作成
mkdir sparkyfitness && cd sparkyfitness

# 2. docker-compose.yml をダウンロード
curl -L -o docker-compose.yml https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/docker-compose.prod.yml

# 3. .env の設定を用意（いずれか一つを選択）:
# オプション A（推奨）: ブラウザ上でワンクリックで安全なキー入りのカスタム .env を生成:
# 👉 https://codewithcj.github.io/SparkyFitness/install/env-generator

# オプション B: 最小テンプレート —— 値は 5 つだけで、それ以外は
# docker-compose が既に適用するデフォルト値を使用。ほとんどのセルフホスト環境ではこれで十分です。
curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.simple.example

# オプション C: 完全なリファレンス —— サポートされるすべての変数を、デフォルト値付きで
# コメントアウトした状態で収録。SSO、SMTP、外部データベース、リバースプロキシを使う場合はここから。
# curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.example

# 4. プレースホルダーを置き換える（オプション A を使った場合は不要 —— ジェネレーターが
# 既に入力済みです）。そのままにしておくとサーバーは起動を拒否し、
# そうでなければデータベースが公開済みのパスワードで初期化されてしまいます。
#   SPARKY_FITNESS_DB_PASSWORD        任意の強力なパスワード
#   SPARKY_FITNESS_API_ENCRYPTION_KEY openssl rand -hex 32     （16 進数 64 文字）
#   BETTER_AUTH_SECRET                openssl rand -base64 32  （44 文字）
#   SPARKY_FITNESS_FRONTEND_URL       アプリを開く際の URL

# 5. アプリを起動
docker compose pull && docker compose up -d

# http://localhost:3004 でアプリにアクセス
```

_注意: 設定オプションの全容、リバースプロキシ、その他のインストール方法については、[ドキュメントサイト](https://codewithcj.github.io/SparkyFitness/)をご覧ください。_

### 2. クラウド（技術に詳しくない方向け）

技術に詳しくなく、自分のサーバーで SparkyFitness を動かしたくない場合は、次のいずれかのプロバイダーを使ってクラウド上にホスト型インスタンスをデプロイできます。

<a href="https://www.pikapods.com/pods?run=sparkyfitness">
  <img src="https://www.pikapods.com/static/run-button.svg" height="70" width="150" alt="PikaPods で実行">
</a>
<br>
<a href="https://zenith.hosting/host/sparkyfitness?ref=gh">
  <img src="https://cdn.zenith.hosting/buttons/deploy-with-zenith.svg" height="70" width="150" alt="Zenith でデプロイ">
</a>


> **注意:** これらは独立したサードパーティのサービスです。各プロバイダーが提供する機能を確認し、ご自身のニーズに最も合うものを選んでください。
 

## 🎥 動画チュートリアル

[![動画を見る](https://img.youtube.com/vi/B13IiL2DeQc/maxresdefault.jpg)](https://www.youtube.com/watch?v=B13IiL2DeQc)

SparkyFitness（セルフホスト型フィットネストラッカー）のインストール方法を紹介する 2 分間のクイックチュートリアルです。

## ドキュメント

完全なインストールガイド、設定オプション、開発者向けドキュメントについては、[ドキュメントサイト](https://codewithcj.github.io/SparkyFitness/)をご覧ください。

### クイックリンク

- **[インストールガイド](https://codewithcj.github.io/SparkyFitness/install/docker-compose)** - デプロイと設定
- **[インタラクティブ .env ジェネレーター](https://codewithcj.github.io/SparkyFitness/install/env-generator)** - クライアントサイドで動く `.env` 設定ビルダー
- **[機能の概要](https://codewithcj.github.io/SparkyFitness/features)** - すべての機能のドキュメント
- **[開発ワークフロー](https://codewithcj.github.io/SparkyFitness/developer/getting-started)** - 開発者ガイドとコントリビューションの手順
- **[iOS アプリ情報](https://github.com/CodeWithCJ/SparkyFitness/wiki/Apple-Health-Integration)** と **[Android アプリ情報](https://github.com/CodeWithCJ/SparkyFitness/wiki/Android-Mobile-App)**

### お困りですか？

- Github の issues/discussion に投稿してください。
- より早い回答や他のコミュニティメンバーからのサポートが必要なら、**[Discord に参加](https://discord.gg/vcnMT5cPEA)**してください

## スター履歴

<a href="https://www.star-history.com/?repos=CodeWithCJ%2FSparkyFitness&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&theme=dark&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <img alt="スター履歴グラフ" src="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
 </picture>
</a>

## 翻訳


**[Weblate での翻訳](https://weblate.sparkyfitness.com/engage/sparkyfitness)**

<a href="http://weblate.sparkyfitness.com/engage/sparkyfitness/"><img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/svg-badge.svg" alt="翻訳状況"></a>



<a href="https://weblate.sparkyfitness.com/engage/sparkyfitness">
<img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/multi-auto.svg" alt="翻訳状況" />
</a>

## リポジトリのアクティビティ

![リポジトリのアクティビティ](https://repobeats.axiom.co/api/embed/828203d3070ff56c8873c727b6873b684c4ed399.svg "Repobeats 分析画像")

## コントリビューター

<a href="https://github.com/CodeWithCJ/SparkyFitness/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=CodeWithCJ/SparkyFitness" width="100%" alt="SparkyFitness のコントリビューター"/>
</a>

## ⚠️ 既知の問題 / ベータ機能 ⚠️

SparkyFitness は活発に開発中です。
リリース間で互換性のない変更が発生する可能性があります。

- コンテナの自動更新は推奨されません
- アップグレード前には必ずリリースノートを確認してください

以下の機能は現在ベータ版で、十分にテストされていない可能性があります。バグや未完成の機能があることをご承知おきください。

- AI チャットボット
- 家族・友人アクセス
- API ドキュメント

*これは英語版 README の翻訳です。内容に相違がある場合は、[英語版](../../README.md)が正となります。*
