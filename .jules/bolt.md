## 2024-07-26 - Deck.gl getColor Accessor Optimization
**Learning:** Supplying a constant array to Deck.gl's `getColor` accessor instead of a function that returns a constant array is a measurable performance optimization. The renderer can take a faster path when it knows the color is uniform for all features, reducing JavaScript overhead.
**Action:** When implementing Deck.gl layers, if a color is constant for all features in the layer, provide the color as a static array to the `getColor` prop instead of a function accessor. This should be the default approach unless colors are data-driven.
