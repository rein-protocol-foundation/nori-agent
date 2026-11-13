# Daily receipt design and icons

The SVG receipt adapter in `scripts/daily-agent-receipt.mjs` follows the compact
cream-paper, black-ink layout of Magpie community Day Card 0.3.2, pinned to
[80d3a00ee3794bd721709e5e7babfc7771509f85](https://github.com/magpie-community/plugins/tree/80d3a00ee3794bd721709e5e7babfc7771509f85/packages/day-card):
`page/app.js` (`slip`, paper geometry, dashed rules, nested cost rows) and
`page/view.js` (receipt labels, bottom token summary). See `DAY-CARD-LICENSE.txt`.
The upstream card credits nowdex.app for its design inspiration; that credit is
retained in the receipt. This is a Day Card-derived SVG adapter, not execution
of the stock Canvas plugin or its `usage:day`/`magpie.image` bridge. No upstream
font, photo, Amp logo, browser runtime or bridge code is bundled.

The six icon files are copied unchanged from Magpie
[95e7c6bcc07629897f6703c31eaef477fcee4a13](https://github.com/yetone/magpie/tree/95e7c6bcc07629897f6703c31eaef477fcee4a13/internal/gui/assets/icons).
Magpie's `docs/reference.md` attributes those brand icons to
[LobeHub Icons](https://github.com/lobehub/lobe-icons). Both projects use MIT:
see `MAGPIE-LICENSE.txt` and `LOBE-ICONS-LICENSE.txt`. Brand marks remain their
owners' trademarks. The adapter renders the bundled vectors in receipt ink,
following Day Card's monochrome treatment. It uses provider identity for the
outer logo and model-name family for the nested maker logo; unknown brands use
a generic dot. Logo selection performs no price or provider-authority inference.

All costs come from Magpie's native `cost`/`priced` usage response. No catalog,
exchange-rate conversion, subscription charges or fallback rates are implemented
here. Only providers and models with requests in the selected local day appear.
