# 公開ページの旧UI / QR表示 調査記録

調査日: 2026-09-22（JST）

## 原因の証拠

GitHub Pages Build APIで次の2つの成功した公開履歴を確認しました（時刻はUTC）。

| 公開開始時刻 | commit | UI |
| --- | --- | --- |
| 2026-09-21 22:49:44 | `9a0549e26e20bcb41e5265ca0745d6ea13cbe56b` | PC自身のセンサーを使用する旧UI |
| 2026-09-21 22:50:26 | `0efd8d2e2cbe08b0ac1f11389d87c2ca26c78b78` | QR付きPC Host / Controller分離版 |

旧commitの `index.html` に、報告された「① センサーをつかう」「② まんなかにする」が存在します。したがって、公開先で少なくとも一度旧版が実際に配信されたことは確定しています。ユーザーが旧HTMLを取得した正確な時刻やキャッシュ経路までは特定できないため、ブラウザーキャッシュだけが原因とは断定しません。

今回の調査時点ではPages sourceは `feat/pc-host-controller`、`/`、HTTPS有効、最新buildは `0efd8d2` でした。公開HTML、bootstrap、app、qr-connection、PeerJSの内容をローカルと比較して一致しました（app.jsの改行CRLF/LF差は正規化）。実ブラウザーでも「スマホをつなぐ」・QR・Room IDを確認し、起動エラーはありませんでした。最新版の条件分岐がQR領域を隠している問題は再現していません。

## 対応

- HTMLに配信版識別 `20260922-host-controller` を追加。
- CSS、bootstrap、Host/Controllerのentry module URLに同じ版識別を追加し、旧JSとの混在を防止。
- `scripts/verify-pages.mjs` を追加。実公開URLのHTMLと全アセット・内部importをチェックアウトと比較する公開後の検証コマンド。
- UCM由来のQR/Room/DataChannel方式と、PCの開始3条件は維持。

```sh
node --test
node scripts/verify-pages.mjs
```

リリース変更時には、index.htmlとsrc/bootstrap.jsの版識別を同時に更新してください。

## 公開E2Eの手順

1. PCで `https://kkodamalab.github.io/slackline-game-egg/` を開く。
2. QRが1つ見え、Controllerのリンクが同じHTTPSサブディレクトリを使い、roomとplayer=Aを含むことを確認。
3. リンクを別タブで開き、Controllerだけが表示され、Hostがスマホ接続中になることを確認。
4. 開発検証時のみController URLに `&controllerTest=1` を追加し、明示された模擬入力をONにする。
5. 中心設定前はPCの開始ボタン無効、中心設定後に有効になることを確認。
6. PCで開始し、模擬スライダーの右端／左端により台の角度が正／負、卵が対応方向へ動くことを確認。
7. Controllerを閉じるとPCが一時停止することを確認。

通常のQRにはcontrollerTestパラメーターを付けません。実機では「センサーをON」からDeviceOrientationの許可を行います。模擬入力での公開E2Eは、実機センサーやSafariの許可ダイアログの検証を代替しません。
