# GitHub Pages公開手順

## 公開構成

- Repository: `kkodamalab/slackline-game-egg`
- Source: **Deploy from a branch**
- Branch: **feat/pc-host-controller**
- Folder: **/ (root)**
- 公開先URL（Pages有効化・ビルド成功後）: https://kkodamalab.github.io/slackline-game-egg/

Vite等のビルドはありません。`.nojekyll` により静的ファイルをそのまま配信します。`index.html`のCSS/JS、モジュール内import、同梱ライブラリは相対パスのため、`/slackline-game-egg/` 配下で動作します。PCとスマホは同一のindex.htmlを使い、`?room=...&player=A`の有無で画面を切り替えます。

PCで公開URLを開くと `location.origin + location.pathname` を接続先のベースURLとし、PeerJSが発行するRoom IDを付加します。localhostへの固定参照はありません。例（Room IDは毎回変わります）:

```text
https://kkodamalab.github.io/slackline-game-egg/?room=example-room-id&player=A
```

例のRoom IDでは接続できません。稼働中のPC画面に生成されたQRを使用してください。

## 設定画面

https://github.com/kkodamalab/slackline-game-egg/settings/pages

1. **Settings → Pages → Build and deployment** を開く。
2. **Source: Deploy from a branch** を選ぶ。
3. **Branch: feat/pc-host-controller**、**/ (root)** を選んで **Save**。
4. ビルド完了後、**Visit site**で上記公開URLを開く。
5. **Enforce HTTPS**が表示される場合は有効にする。

2026-09-21の初回API設定時には、非公開リポジトリに対し `Your current plan does not support GitHub Pages for this repository` (HTTP 422) が返りました。対応は次のどちらかです。リポジトリの公開範囲や有料契約は自動変更しません。

- Privateを維持: アカウントの **Settings → Billing and licensing → Plans and usage** 等のプラン管理画面から、GitHub ProなどPrivate Pages対応プランへアップグレード。その後、上記Pages画面で設定。
- Publicにする: リポジトリの **Settings → General → Danger Zone → Change repository visibility → Change to public**。ソースコード・commit履歴も公開されることを確認して実行。その後、上記Pages画面で設定。

GitHub公式: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## 実機確認

1. PCで公開URLを開き、「スマホのかたむき」を選ぶ。
2. QRが1つ表示されること、接続URLが `https://kkodamalab.github.io/slackline-game-egg/` で始まることを確認。
3. スマホのカメラでQRを読み、Controller画面を開く。
4. 「センサーをON」。iPhone Safariで許可を求められたら許可。
5. スマホをラインに固定し、基準位置で「まんなかにする」。
6. PCの「スマホ接続中・センサーON・まんなか設定済み」と「あそぶ！」の有効化を確認。
7. PCで開始し、右／左に傾けると台・卵が同じ方向へ動くことを確認。
8. 30秒終了、星、落下復帰、再プレイを確認。
9. スマホをバックグラウンドにするとPCが一時停止し、復帰後に手動で再開できることを確認。

両端末のインターネット接続とWebRTCが必要です。PCページを再読み込みするとRoomが変わるため、QRを読み直します。スマホのセンサー許可はHTTPSから、ユーザーが「センサーをON」を押した時点で要求されます。
