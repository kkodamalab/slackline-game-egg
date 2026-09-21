# 🥚 たまごを落とすな！ — Keep the Egg!

スマートフォンをスラックライン等に固定し、左右の傾きを台と卵の動きへ反映する、3〜6歳向けのVisual Biofeedback（VBF）ミニゲーム。30秒間で星を集めます。卵が落ちても1.4秒後に中央へ戻り、続けられます。

## 起動

Node.js 20以降を使用します。外部パッケージ・ビルド・CDN・画像ダウンロードは不要です。

```sh
git clone https://github.com/kkodamalab/slackline-game-egg.git
cd slackline-game-egg
node server.mjs
```

PCでは http://localhost:4173 を開きます。`npm start` / `npm test` も利用可能です。終了は Ctrl+C。静的ホスティングにも、そのまま `index.html`, `styles.css`, `src/` を配置できます。

## スマホで遊ぶ

1. HTTPSで配信したページをSafari / Chromeで開く。PCのLANアドレスのHTTP配信ではセンサーが使えないことがあります。開発サーバーはHTTPのみなので、実機テストにはHTTPSのホスティングまたはHTTPSリバースプロキシが必要です。
2. スマートフォンが落ちないよう、しっかり固定する。
3. 「① センサーをつかう」をタップ。iOSで許可ダイアログが出たら許可する。許可要求はクリック内で直接行います。
4. 基準にしたい姿勢で「② まんなかにする」をタップ。
5. 難易度を選び「あそぶ！」。右に傾けると台の右端が下がり、卵が右へ転がります。
6. 30秒で「できた！」。「もういっかい」で準備画面へ戻り、中心を再設定して遊べます。

拒否・非対応・無受信の場合は案内を表示します。ブラウザーのセンサー許可設定を確認し、必要に応じて再読み込みしてください。画面の回転時は一時停止し、中心を設定し直します。タブを離れたとき、センサーが2.5秒以上途切れたとき、描画が0.5秒以上停止したときも一時停止します。試行時間・統計には一時停止中を含みません。対応ブラウザーではゲーム中にWake Lockを要求し、休止・終了で解放します。利用できない場合もゲームは続行できます。

## PC Test Mode

「あそびかた」で「PCテスト（キー・スライダー）」を選択し、「まんなかにする」→「あそぶ！」。

- ← / → : 1回で2度ずつ変更（長押しも可）
- Space : 模擬入力を絶対角0度に戻す
- スライダー : −30〜+30度
- 0以外で中心設定した場合、その角度がゲームの水平。Spaceは中心設定を解除しません。

## 構成

```text
index.html                 準備・ゲーム・結果画面
styles.css                 縦横画面対応のUI、CSS製の卵
src/config.js              時間、平滑化、難易度設定
src/input.js               DeviceOrientation / 共通VBF入力・正規化
src/game.js                DOM非依存の物理・得点・研究統計・CSV
src/app.js                 画面遷移、固定時間ステップ、休止、Wake Lock、保存
server.mjs                 外部依存なしの開発サーバー
test/game.test.js          入力・物理・統計の自動テスト
.github/workflows/test.yml GitHub Actionsのテスト
```

新規プロジェクトとして作成。既存コードの変更はありません。

## 入力と物理

`Sensor → VBFInput → { rawAngle, relativeAngle, gameAngle, normalizedTilt } → EggGame → DOM描画`。

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
- 最新1試行のみlocalStorageの `keep-the-egg:last-trial` へ保存（metadata / summary / samples）。次の完了試行で置換。外部送信しません。結果画面のCSVは現在の試行のみ対象で、保存済み試行の再表示UIはありません。必要な試行は各終了時にダウンロードしてください。
- 計測データは生のセンサー3軸値ではありません。EMAはセンサーイベント頻度に依存するため、研究用途では端末と取得条件を統一してください。

## テスト

```sh
node --test
```

方向変換（縦/横/逆向き）、null入力、中心設定、平滑化、角度ラップ、物理方向、難易度差、水平復帰、星、落下復帰、30秒終了、再試行初期値、時間重み統計、CSVを検証します。

実機で確認すること:

- iPhone Safari / Android ChromeのHTTPSで許可→受信→中心設定。
- 縦・横それぞれで、物理的に右端を下げたとき画面の台の右端も下がること。
- 固定姿勢で0点、左右傾斜、中心への復帰、過敏さのない操作感。
- 回転後の中心設定、タブ復帰、許可拒否、センサー停止時の一時停止。
- 30秒・星・落下後の復帰・再プレイ、Wake Lockと画面のスリープ。
- 小型端末、横画面、Safariのツールバー表示時のレイアウト。

実機のセンサー方向・固定具の振動・幼児の操作感は自動テストで保証できません。端末を固定した実環境で調整してください。

## 拡張

MediaPipeは別アダプターから身体軸角度をVBFInputへ渡すことでゲームを再利用できます。別ゲームは同じread()契約を受け取る独立したロジックにします。2人モードは入力・ゲーム状態をプレイヤーごとに持ち、対戦/協力の得点規則と描画を上位層に追加します。同期・通信・カメラ許可はゲーム物理に埋め込みません。

## API参考

- [DeviceOrientationEvent](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent)
- [iOS等のrequestPermission](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static)
- [Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)
