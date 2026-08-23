# Shanghai 3D Diorama Web

スマートフォンブラウザを最優先にした、Three.js製の上海（麻雀ソリティア）です。48牌のEASY、72牌のNORMAL、96牌のHARDを選択できます。

## Development

```sh
npm ci
npm run dev
```

Changes merged into `main` are automatically deployed to GitHub Pages after CI succeeds.

同じ絵柄の取得可能な牌を2枚タップすると、盤面から取り除かれます。取得可能な牌は「上に牌がなく、左または右が空いている」牌です。
各盤面は先に最後まで合法に取り除ける順序を作り、その順序のペアへ絵柄を割り当てるため、必ず完全解が存在します。SHUFFLEも残った盤面に対して同じ方法で再配置します。
3D mahjong solitaire web version

`?seed=example` を付けると同じ解ける初期配置を再現できます。
