# 大量 seed 品質検証レポート

実施日: 2026-08-12 / 対象 seed: **1〜10,000（各難易度・各ラウンド）** / 合計 90,000 deal

## 方法と再現手順

```sh
npm ci
SEED_COUNT=10000 BENCHMARK_OUTPUT=docs/benchmark-data.json npm run validate:seeds
npm test
npm run test:e2e
npm run build
```

乱数は seed ごとに `LCG(1664525, 1013904223)` を初期化する。生の集計、代表 seed、実行時間は
[`benchmark-data.json`](./benchmark-data.json) に保存した。`clear` はランダムな選択の成功率ではなく、生成時の
解答証明をルールどおり再生して最後まで除去できた割合である。旧方式には証明がないため、FREE TILE の先頭ペアを
選ぶ決定的 greedy player で比較した。`nodes` は各状態で行った合法手探索（最終方式では証明の再生ステップ）であり、
無制限の全組合せ探索ノードではない。

## Phase 1: ベースライン（random-deal）

| 難易度 | seeds | clear | 初期詰み | 途中詰み | 循環 | 平均削除pair | 平均手数 | 平均/最大node | SHUFFLE救済後 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| EASY | 10,000 | 0.04% | 16.79% | 83.17% | 0% | 1.9908 | 1.9908 | 2.9904 / 18 | 100% |
| NORMAL | 10,000 | 0.01% | 29.32% | 70.67% | 29.32% | 1.4684 | 2.1037 | 3.1036 / 28 | 49.03% |
| HARD | 10,000 | 0.04% | 31.93% | 68.03% | 31.36% | 3.8031 | 5.6467 | 6.6463 / 44 | 0.04%（SHUFFLE 0回） |

牌面を単純 shuffle する方式は、盤面形状に対応する除去順を保証せず、裏向き牌も独立配置していたことが主因だった。
SHUFFLE は EASY/NORMAL の救済にはなる（reverse-generated NORMAL は 77.39% まで回復）が、初期品質を保証せず、
HARD にはそもそも残数がない。

## Phase 2: 失敗分類と代表 seed

| 分類 | 観測 | 代表 seed（難易度） |
|---|---:|---|
| 初期状態で実質詰み / 表向き一致なし | EASY 1,679 | 4, 5, 8, 13, 16, 18, 20, 25, 37, 41 (EASY) |
| 裏向き牌をめくれても除去なし | HARD 57 | 44, 634, 699, 942, 970, 1030, 1206, 1340, 1895, 1995 (HARD) |
| めくる→戻るだけの循環 | HARD 3,136 | 8, 9, 11, 19, 21, 24, 25, 32, 33, 38 (HARD) |
| 特定順でしか進めず greedy が途中詰み | EASY 8,317 | 1, 2, 3, 6, 7, 9, 10, 11, 12, 14 (EASY) |
| 盤面生成上の偏り | 上記に包含 | random-deal の配置と面の非連動として確認 |
| solver/deadlock の誤判定 | 0 | 該当 seed なし（存在しない seed は捏造しない） |

`initialPairless` は EASY 1,679 / NORMAL 5,787 / HARD 6,943。ただし裏向き牌から正規の除去へ到達する場合もあるため、
単独では詰みと数えず、「最終的に1組を除去できるか」で分類した。

## Phase 3〜5: 2ラウンドの改善

### 改善 1 — reverse-generated

盤面形状から合法な除去順を先に作り、その各組へ同じ面を割り当てた。EASY は 100% になった一方、裏向き牌を
除去証明と独立に置くと NORMAL は 42.60%、HARD は 1.56% に留まった。これにより第2原因が「解ける牌面」と
「1枚だけ表にできる裏向きルール」の不整合だと切り分けられた。

### 改善 2 — certified-hidden（現行）

除去証明の同じペアの両端を同時に裏向きにしないよう候補を構成し、証明自体を deal とともに生成する方式にした。
結果は全難易度で **10,000 / 10,000 clear**。NORMAL は平均 22 pair + 6 reveal = 28手、HARD は
30 pair + 14 reveal = 44手で、裏向き率による難易度差も維持した。

| ラウンド | EASY clear / 初期 / 途中 / 循環 | NORMAL clear / 初期 / 途中 / 循環 | HARD clear / 初期 / 途中 / 循環 |
|---|---|---|---|
| baseline | 0.04 / 16.79 / 83.17 / 0% | 0.01 / 29.32 / 70.67 / 29.32% | 0.04 / 31.93 / 68.03 / 31.36% |
| reverse | 100 / 0 / 0 / 0% | 42.60 / 0.47 / 56.93 / 0.47% | 1.56 / 11.34 / 87.10 / 11.34% |
| certified | **100 / 0 / 0 / 0%** | **100 / 0 / 0 / 0%** | **100 / 0 / 0 / 0%** |

## スマートフォン回帰

Playwright で 360×800、390×844、393×873、412×915 と EASY/NORMAL/HARD の直積（12開始画面）を確認する。
canvas、HUD、HINT/SHUFFLE/RESTART、難易度 picker が viewport 内に収まること、牌数、NORMAL/HARD の裏向き牌を
programmatic assertion にし、各組合せの screenshot も `screenshots/`（git 管理外）へ出力する。既存テストは
大きい牌（投影 60px 超）、FREE TILE の tap、1枚だけ表向き、RESTART、難易度遷移、NO MORE MOVES も検証する。

## 残課題・推奨

- 証明どおりなら必ず解けるが、プレイヤーが別順を選んだ場合まで「全ての手順が解ける」保証ではない。将来は証明から
  逸脱した局面の bounded solver を HINT に利用するとよい。
- 本ベンチの node は再現性と 30,000 seed/ラウンドを現実的な時間で検証するための証明再生コストである。完全探索の
  分岐数が必要なら CI とは別の長時間ジョブにし、node limit 到達を独立分類すべきである。
- 10,000 seed/難易度で失敗 0 の上限は「絶対に失敗しない」という統計証明ではない。generator の構造的な証明と
  property test の双方を継続する。

## Progress solvability validation (Issue #35)

`npm run validate:progress` replays certified reachable states from EASY, NORMAL,
and HARD deals and compares the UI solver classification with the deal's independent
removal certificate. On 2026-08-13, 10,002 states produced **0 mismatches** and
**0 UNKNOWN results**. Solver wall time was p50 **0.184 ms**, p95 **2.714 ms**,
p99 **24.251 ms**, and maximum **138.440 ms**. Production search runs in a Web
Worker, so these costs do not block rendering or touch input. Measurements vary by
host and are intended as a regression baseline rather than a device guarantee.
