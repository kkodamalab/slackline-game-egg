# PC Host / Smartphone Controller 修正報告

確認日: 2026-09-21

## GitHub / Gitの状態

- Repository: https://github.com/kkodamalab/slackline-game-egg （非公開）
- 作業開始時のbranch: `main`
- 修正用ローカルbranch: `feat/pc-host-controller`
- 作業開始時の `git status --short --branch`: `## main...origin/main`、変更なし。
- 開始時にGitHub APIで確認したmain: `9a0549e26e20bcb41e5265ca0745d6ea13cbe56b`。ローカルHEADと一致。
- 今回はbranchを作成し、作業ツリー内で修正。**今回の変更は未commit・未push。GitHub側の修正版公開やデプロイも未実施。**

`git log -5 --oneline`（全履歴が2件のため2件のみ）:

```text
9a0549e Polish mobile title and reset scroll on screen transitions
8032af3 Implement Keep the Egg tilt biofeedback game
```

`git remote -v`:

```text
origin https://github.com/kkodamalab/slackline-game-egg.git (fetch)
origin https://github.com/kkodamalab/slackline-game-egg.git (push)
```

`git status`相当の変更一覧:

| 状態 | ファイル |
| --- | --- |
| 変更 | README.md, index.html, server.mjs, src/app.js, styles.css |
| 新規 | src/bootstrap.js, src/controller.js, src/peer-bus.js, src/qr-connection.js, src/remote-input.js |
| 新規 | test/connection.test.js, THIRD_PARTY.md, IMPLEMENTATION_STATUS.md |
| 新規 | vendor/peerjs-1.5.5.min.js, vendor/peerjs-LICENSE, vendor/qrcode-1.0.0.min.js, vendor/qrcode-LICENSE |

## UCM調査と再利用

`kkodamalab/ucm-demo-game` の `a1b1de47c30cc5e15d8e3af44b3d7049883525c9` を読み取りました。現行HTML→`enhancedPlayerSafe`→`PeerBus`を追跡し、旧Socket.IO中継とは区別しました。既存PeerJS接続クラスとRoom/Player URL・QR生成方式をモジュールとして抽出。UCMリポジトリは一切変更していません。

実行時にUCMからコードを取得するのではなく、出典付きで抽出したローカルモジュールを使用します。今後UCMにも共有パッケージとして導入する際は、別途UCM側の回帰テストを行う構造です。

## データフロー

1. PC: `bootstrap.js` → `app.js` がHostとして `PeerBus` を作成。
2. `peer-bus.js` がUCMと同じPeerJSのIDをRoom IDとして受け取る。
3. `qr-connection.js` が `?room=...&player=A` のURLと1つのQRを生成。
4. スマホ: `bootstrap.js` がController画面だけを表示し、`controller.js` を起動。
5. `controller.js` → `input.js` がユーザー操作でDeviceOrientationを許可し、中心設定・EMA・relativeAngleを計算。
6. `remote-input.js` の `tiltPacket` → `peer-bus.js` のDataChannelへ約30Hz送信。
7. PC: `app.js` の `onInput` → `RemoteTiltInput.receive` が順序・型・鮮度・準備状態を確認。
8. `app.js` の固定ステップ → `game.js` の `EggGame.step` → 台・卵を描画。

## 検証

- `node --test`: **23件成功、失敗0件**。
- 既存の物理・得点・落下復帰・30秒・CSVテストを維持。
- 新規: 準備3条件、データ型・順序・鮮度、不正パケット、バックグラウンド時のセンサー停止、QR URL、PeerBus再接続、古い接続の無効化、バッファ上限、権限要求、タイマーのブラウザー互換性。
- ブラウザー: 実際のPeerJSルーム生成、QR URLから別Controllerタブを起動、**実WebRTC DataChannel**で通信。
- センサーON前・中心設定前はPCの開始ボタン無効、設定後は有効。
- Controllerの開発用模擬傾きにより、PCの台と卵が右／左へ動くことを確認。
- 切断時の一時停止、再接続後の手動再開、30秒完了、星・落下回数・remote-test記録を確認。

ブラウザー通信確認では `controllerTest=1` の模擬入力を使っています。**実スマホの物理センサー・QRのカメラ読取・Safariの権限ダイアログ・実機Wake Lockは未検証です。** テストのDataChannel接続はモックではありませんが、Node側の接続ライフサイクル試験は決定的なPeerJSテストダブルを使用します。

## 利用開始時の残件

スマホで利用するには同じ版のゲームをHTTPS配信してください。localhostのQRは別端末から開けません。PCの接続設定欄にスマホから開けるHTTPS URLを指定できます。これはURLの形式確認であり、配信先に今回のコードが存在することの保証ではありません。

今回の修正版をGitHubへ反映・HTTPS公開する操作は、この報告時点では実施していません。
