---
name: heroui-native-estate-empire
description: >-
  Guides HeroUI Native component usage, providers, and Uniwind/Tailwind styling in
  Estate Empire (Expo React Native). Use when adding or editing UI with heroui-native,
  Card, Button, HeroUINativeProvider, global.css theme tokens, or when the user mentions
  Hero UI, HeroUI Native, or native component layout with className.
---

# HeroUI Native (Estate Empire)

## Stack

- **Expo** + **React Native**
- **Uniwind** + Tailwind v4 — `className` on views (see `metro.config.js`, `global.css`)
- **HeroUI Native** (`heroui-native`) for `Button`, `Card`, provider

## Provider

Wrap the tree once inside `GestureHandlerRootView` / `SafeAreaProvider` as in `App.tsx`:

```tsx
import { HeroUINativeProvider } from 'heroui-native';

<HeroUINativeProvider>{/* app */}</HeroUINativeProvider>
```

## Global styles

`global.css` must include:

- `@import 'heroui-native/styles';`
- `@source './node_modules/heroui-native/lib';` (Tailwind source scan for library classes)
- Theme tokens under `@layer theme` / `@variant dark` (e.g. `--accent`) — keep aligned with app palette.

Entry imports `./global.css` from `App.tsx`.

## Components used in this repo

| Import | Typical usage |
|--------|----------------|
| `Card` | `variant="secondary"`, `className` for border/background; children: `Card.Body`, `Card.Title`, `Card.Description`, `Card.Header`, `Card.Footer` |
| `Button` | `size`, `className`; label via **`Button.Label`**; use **`isDisabled`** (not `disabled`) |

Match existing screens: `LoginScreen`, `HomeScreen`, `MarketScreen`, `ProfileScreen`, `PremiumStoreScreen`.

## Layout & polish

- Combine HeroUI with **React Native** primitives (`Text`, `View`, `ScrollView`) where HeroUI does not cover.
- Respect **safe areas** (`useSafeAreaInsets`) on full screens and tab bars (see `App.tsx` tab bar).
- Prefer **existing** `className` tokens (`bg-background`, `text-foreground`, `border-accent/40`, etc.) for visual consistency.

## References

- Package: `heroui-native` (see `package.json` version).
- Do not remove `HeroUINativeProvider` or `global.css` HeroUI imports without replacing styling strategy.
