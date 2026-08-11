# Shanghai 3D Diorama Web

スマートフォンブラウザを最優先にした、Three.js製の72牌・4層上海（麻雀ソリティア）です。

## Development

```sh
npm ci
npm run dev
```

同じ絵柄の取得可能な牌を2枚タップすると、盤面から取り除かれます。取得可能な牌は「上に牌がなく、左または右が空いている」牌です。
3D mahjong solitaire web version

`?seed=example` を付けると同じ解ける初期配置を再現できます。
