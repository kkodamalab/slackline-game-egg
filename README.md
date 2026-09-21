# 🥚 たまごを落とすな！ — Keep the Egg!

**PC = Host / ゲーム画面、スマホ = スラックラインに固定する傾きController** の2端末ゲームです。スマホにゲームを表示する方式ではありません。30秒間、台の上の卵を守って星を集めます。

## UCMゲームから再利用したもの

`kkodamalab/ucm-demo-game` の main `a1b1de47c30cc5e15d8e3af44b3d7049883525c9` を調査しました。現行の `dist/app.js` のPeerBus、QR用URL、Player送信処理を基にしています。

- PeerJS **1.5.5** / WebRTC DataChannel。UCMと同じデフォルトPeerServer、`reliable:false`、`metadata: { role, sessionId }`。
- QRCode.js **1.0.0**、Room ID=HostのPeer ID、`?room=...&player=A`。
- `input` / `feedback` / `input-config` メッセージ形式、sequence/clientTimestamp、約30Hz（34ms）の入力送信。
- 接続クラスをUCMの画面状態から分離して抽出し、再接続・切断検出・旧接続ガードを追加。
- UCMの旧 `server.js` にSocket.IOは残っていますが、現行画面はPeerJSを使っているため、別の通信方式は追加していません。

**UCM側のファイルは変更していません。** 共有npmパッケージとして公開済みという意味ではなく、出典を記録したモジュール抽出です。詳細は [THIRD_PARTY.md](THIRD_PARTY.md)。

## 起動と配信

GitHub Pagesの設定・公開先URL・スマホ実機確認は [PAGES_DEPLOYMENT.md](PAGES_DEPLOYMENT.md) を参照してください。公開元は `feat/pc-host-controller` のリポジトリ直下です。

Node.js 20以降。外部パッケージのインストールやビルドは不要です。UCMと同じバージョンのPeerJS/QRCode.jsを `vendor/` に同梱しています。

```sh
node server.mjs
# または npm start
```

PCの開発画面は http://localhost:4173 。終了は Ctrl+C。PCテストはこれだけで動きます。

**スマホ接続には、スマホから開けるHTTPS URLが必要です。** `localhost` はそれぞれの端末自身を指すため、PCのlocalhostをQRにしてもスマホからは開けません。LAN上の平文HTTPもスマホのセンサー権限には不適切です。

`index.html`, `styles.css`, `src/`, `vendor/` を同じHTTPS静的ホスティングに配置し、PCでそのURLを開いてください。このアプリのシグナリングはUCMと同じPeerServerなので、自前のSocket.IOサーバーは不要です。サブディレクトリ配信にも対応します。

PCだけlocalhostで動かす場合は「接続設定・つなぎ直し」で、**同じ版の卵ゲームを配信したHTTPS URL** を指定できます。ローカルの変更が公開URLへ自動反映されることはありません。localhostのまま表示されるQRには「同じPCの接続テスト専用」と明示します。

PeerServerへのインターネット接続、およびWebRTC通信を許可するネットワークが必要です。学校等のネットワークや対称NATでは接続できない場合があります。UCMと同じ方式の範囲で実装しており、新たなTURNサービスは追加していません。

## 2端末で遊ぶ

1. PCでHTTPSのゲームURLを開く。入力は「スマホのかたむき」。自動的に1つの大きなQRコードを表示。
2. スマホでQRを読み、Controller専用画面を開く。
3. スマホで「センサーをON」。iPhoneで許可を求められたら許可。
4. スマホをラインにしっかり固定し、基準姿勢でスマホの「まんなかにする」。
5. PC側の「● スマホ接続中」「✓ センサーON」「✓ まんなか設定済み」を確認。
6. PCで難易度を選び「あそぶ！」。QRと設定は隠れ、ゲームに集中できます。
7. スマホ／ラインの右を下げるとPCの台が右下がりになり、卵が右へ転がります。
8. 30秒で結果。「もういっかい」で同じスマホ接続を維持して再プレイ。

スマホ側の回転で中心設定は無効になり、PCは一時停止します。Controllerのセンサー停止・バックグラウンド化・通信停止（2.5秒無受信）でもPCは一時停止し、星や時間を勝手に進めません。再接続後も自動再開せず、PCで「つづける」を押します。両端末は対応環境でWake Lockを利用します。

一時的な切断時は自動再接続します。「PCにつなぎ直す」でも再試行できます。PCページ自体を再読み込み／ルームを作り直した場合は新しいQRを読み直してください。開いているControllerを別スマホで置き換える際も、古いControllerを閉じて新しいQRを使用してください。

## PC Test Mode

「あそびかた」→「PCテスト」でスマホ接続・QRを使用せず遊べます。

- ← / →: 1回で2度ずつ変更。スライダー: ±30度。
- Space: 模擬入力の絶対角を0度へ。
- 「まんなかにする（PCテスト）」→「あそぶ！」。
- モード切替時に古いスマホ接続は破棄し、センサー側のデータを混ぜません。

開発者がDataChannel経路も実ブラウザーで試す場合のみ、Controller接続URLへ `&controllerTest=1` を追加できます。模擬センサースライダーと明示的な警告が表示され、Hostも「模擬入力」と表示・記録します。通常のQRにはこのパラメーターを含めません。

## データフロー／ファイル構成

| 段階 | ファイル | 処理 |
| --- | --- | --- |
| PC Host | `src/bootstrap.js`, `src/app.js` | Controller用URLを判定。Hostのルーム作成、準備条件、開始・休止・描画 |
| QR | `src/qr-connection.js` | UCM形式の接続URLと1つの240px QR |
| Smartphone Controller | `src/controller.js` | センサーON、中心設定、ゲージ、34ms送信、状態表示 |
| Tilt / Permission | `src/input.js` | ユーザー操作で許可、縦横角度変換、baselineとEMA |
| DataChannel | `src/peer-bus.js` | UCMから抽出したPeerBus、双方向送受信、再接続 |
| 正規化・受信 | `src/remote-input.js` | パケット作成、順序・型・鮮度検証、開始条件 |
| Egg Game | `src/game.js`, `src/config.js` | 物理・得点・30秒・統計。通信には依存しない |
| 画面 | `index.html`, `styles.css` | PC用画面とスマホ用画面を排他的に表示 |
| 開発用配信 | `server.mjs` | 静的ファイルのみ。センサーデータを中継・保存しない |
| テスト | `test/game.test.js`, `test/connection.test.js` | 物理、入力、許可、プロトコル、接続ライフサイクル |

送信項目: `type`, `protocol`, `playerId`, `inputType`, `sessionId`, `sequenceNumber`, `clientTimestamp`, `timestamp`, `rawAngle`, `relativeAngle`, `filteredAngle`, `baselineAngle`, `sensorOn`, `calibrated`, `calibrationId`, `sampleAgeMs`。UCM互換の `rawValue` / `normalizedValue` も含みます。timestampはスマホ時刻、受信の生存判定はPCの単調増加時計を使います。時計同期による遅延測定ではありません。順序逆転・重複パケットは破棄し、Controllerの送信バッファが膨らむ場合は最新入力の送信を優先します。

## 入力と物理

`スマホ DeviceOrientation → VBFInput → relativeAngle → PeerBus DataChannel → PC RemoteTiltInput → EggGame → DOM描画`。

センサー権限・中心設定・EMAはスマホだけで実行します。PCは受信したrelativeAngleを再平滑化・再中心設定せず使用します。

画面角度0°はgamma、90°は−beta、180°は−gamma、270°はbetaを使用。`rawAngle`はこの画面座標変換後の未平滑化角度です。EMA（alpha=0.24）で軽く平滑化し、中心ボタンを押した瞬間のraw値をbaselineとして保存し、フィルタもその値へリセットします。relativeAngleは平滑化値とbaselineの差（±180°でラップ）。ゲーム用だけ±30°に制限し、normalizedTiltは±1に正規化します。研究統計は制限前のrelativeAngleを使います。端末を表向きに固定し、基準近傍での運動を想定しています。裏返しやEuler角特異点を横切る大回転への対応はMVPの対象外です。

物理は秒単位、1/120秒の固定ステップ。`v += (gravity × sin(angle) − centering × position) × dt`、`v *= exp(−damping × dt)`、最大速度を制限して `position += v × dt`。中心へ戻すばね項は±10度以内で徐々に有効になるため、水平へ戻すことで卵を救えます。左右端を±1とします。

| 設定 | かんたん | ふつう | むずかしい |
| --- | ---: | ---: | ---: |
| 安全ゾーン半幅 | 0.52 | 0.36 | 0.23 |
| gravity | 1.8 | 2.8 | 4.0 |
| damping /秒 | 2.8 | 2.2 | 1.8 |
| centering | 1.3 | 1.0 | 0.8 |
| 最大速度 /秒 | 0.55 | 0.8 | 1.1 |

安全ゾーンに連続2秒いるごとに星1個（30秒で最大15個）。ゾーンを外れると連続時間をリセットしますが、獲得した星は減りません。

## 研究用データ

結果画面の「おとなの方へ · 研究用データ」を開くと集計・CSV出力を利用できます。子どものゲーム画面には角度や統計を表示しません。

- 約10Hz記録: timestamp（試行内秒）, rawAngle, relativeAngle, eggPosition, eggVelocity, isSafeZone, difficulty。
- 集計: trialDuration, meanAngle, SDAngle（母標準偏差）, RMSE_from_zero, maxAbsAngle, safeZoneTime, safeZonePercentage, numberOfEggDrops, stars。
- mean / SD / RMSE は物理ステップごとの時間重み付き計算。落下復帰待ちも試行時間に含み、安全ゾーン時間には含みません。
- 集計CSVには開始日時、入力モード、baseline、フィルタ、難易度パラメータ、途中の再中心設定履歴を含めます。
- 最新1試行のみlocalStorageの `keep-the-egg:last-trial` へ保存（metadata / summary / samples）。次の完了試行で置換。試行記録はサーバーに保存しません。スマホからPCへのリアルタイム入力はWebRTC DataChannelで送信します。結果画面のCSVは現在の試行のみ対象で、保存済み試行の再表示UIはありません。必要な試行は各終了時にダウンロードしてください。
- 計測データは生のセンサー3軸値ではありません。EMAはセンサーイベント頻度に依存するため、研究用途では端末と取得条件を統一してください。

## テスト

```sh
node --test
```

方向変換（縦/横/逆向き）、null入力、中心設定、平滑化、角度ラップ、物理方向、難易度差、水平復帰、星、落下復帰、30秒終了、再試行初期値、時間重み統計、CSVを検証します。

実機で確認すること（PC HostとスマホControllerを別端末で使用）:

- iPhone Safari / Android ChromeのHTTPSで許可→受信→中心設定。
- 縦・横それぞれで、物理的に右端を下げたとき画面の台の右端も下がること。
- 固定姿勢で0点、左右傾斜、中心への復帰、過敏さのない操作感。
- 回転後の中心設定、タブ復帰、許可拒否、センサー停止時の一時停止。
- 30秒・星・落下後の復帰・再プレイ、Wake Lockと画面のスリープ。
- 小型端末、横画面、Safariのツールバー表示時のレイアウト。

実機のセンサー方向・固定具の振動・幼児の操作感は自動テストで保証できません。端末を固定した実環境で調整してください。

## 拡張

MediaPipeはController側の別アダプターから身体軸角度を同じパケットへ変換して送信することでゲームを再利用できます。別ゲームは同じread()契約を受け取る独立したロジックにします。2人モードは入力・ゲーム状態をプレイヤーごとに持ち、対戦/協力の得点規則と描画を上位層に追加します。同期・通信・カメラ許可はゲーム物理に埋め込みません。

## API参考

- [DeviceOrientationEvent](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent)
- [iOS等のrequestPermission](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static)
- [Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)
