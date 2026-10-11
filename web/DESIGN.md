# RiskScope Design System Tokens

Calm, precise institutional terminal design system.
Dark theme only. Optimized for financial density, high contrast, zero chart junk, and optical stability.

---

## 1. Color Palette

### 1.1 Neutral Scale (Monochrome Dark Slate)
One consistent neutral scale across canvas, surfaces, borders, and typography. No purple or tinted blue undertones.

| Token | Hex | Role | Contrast Ratio |
|---|---|---|---|
| `neutral-950` | `#0A0B0D` | Canvas / root background | Baseline |
| `neutral-900` | `#111317` | Card and panel surface background | 1.1:1 vs 950 |
| `neutral-850` | `#171A1F` | Elevated surface (modals, dropdowns, popovers) | 1.3:1 vs 950 |
| `neutral-800` | `#20232B` | Surface hover / subtle container background | 1.6:1 vs 950 |
| `neutral-700` | `#2D313B` | Structural border (subtle) | 2.1:1 vs 950 |
| `neutral-600` | `#3E4351` | Focused border / active state border | 3.1:1 vs 950 |
| `neutral-500` | `#5A6072` | Icon neutral / placeholder text | 4.6:1 vs 950 |
| `neutral-400` | `#8B93A7` | Muted labels, secondary descriptions | 6.8:1 vs 950 |
| `neutral-300` | `#B4BAC8` | Body text secondary, table column headers | 9.7:1 vs 950 |
| `neutral-100` | `#E6E9F0` | Primary headings, prominent body | 14.5:1 vs 950 |
| `neutral-50` | `#F8FAFC` | High-contrast numbers and values | 17.2:1 vs 950 |

---

### 1.2 Accent Color (Institutional Cobalt)
ONE dedicated accent color used exclusively for primary actions, active tabs, and primary selection states.

| Token | Hex | Role |
|---|---|---|
| `accent-subtle` | `rgba(37, 99, 235, 0.12)` | Active tab / row selection tint |
| `accent-border` | `rgba(59, 130, 246, 0.40)` | Active tab / input focus border |
| `accent-primary` | `#2563EB` | Primary button background |
| `accent-hover` | `#1D4ED8` | Primary button hover |
| `accent-text` | `#60A5FA` | Active icon / link text |

---

### 1.3 Risk State Colors
Never shown by color alone. Every risk state indicator is always accompanied by an explicit text label and symbol/icon.
Colors strictly pass WCAG AA (>4.5:1) on `#111317` and `#0A0B0D`.

| State | Background Tint | Border | Foreground Text | Icon | Text Label Required |
|---|---|---|---|---|---|
| **Low Risk** | `rgba(16, 185, 129, 0.10)` | `rgba(16, 185, 129, 0.35)` | `#34D399` | `ShieldCheck` | Yes: `"Low Risk"` |
| **Medium Risk** | `rgba(245, 158, 11, 0.10)` | `rgba(245, 158, 11, 0.35)` | `#FBBF24` | `AlertTriangle` | Yes: `"Medium Risk"` |
| **High Risk** | `rgba(239, 68, 68, 0.10)` | `rgba(239, 68, 68, 0.35)` | `#F87171` | `ShieldAlert` | Yes: `"High Risk"` |

---

## 2. Typography

### 2.1 Font Families
- **Interface Sans**: `Inter`, `-apple-system`, `BlinkMacSystemFont`, `"Segoe UI"`, `Roboto`, `sans-serif`
- **Tabular Figures & Metrics**: `"JetBrains Mono"`, `"SF Mono"`, `Menlo`, `monospace` with `font-variant-numeric: tabular-nums`

### 2.2 Type Scale
| Token | Size | Line Height | Weight | Tracking | Usage |
|---|---|---|---|---|---|
| `text-2xs` | 10px | 14px | 500 / 600 | +0.02em | Badges, micro labels, exchange tags |
| `text-xs` | 12px | 16px | 400 / 500 | +0.01em | Table headers, secondary labels, helper copy |
| `text-sm` | 13px | 18px | 400 / 500 | 0 | Body, table cell values, input text, buttons |
| `text-base` | 15px | 22px | 500 / 600 | -0.01em | Section titles, prominent body text |
| `text-lg` | 18px | 24px | 600 | -0.015em | Panel headings, modal titles |
| `text-xl` | 22px | 28px | 700 | -0.02em | MetricCard hero numbers |
| `text-2xl` | 26px | 32px | 700 | -0.025em | Page headers |

All numbers MUST render with `tabular-nums` to eliminate layout jitter.

---

## 3. Spacing Scale (4px Strict Grid)

| Token | Pixels | Usage |
|---|---|---|
| `space-1` | 4px | Micro gap between icon and text |
| `space-2` | 8px | Button inline padding, compact list gap |
| `space-3` | 12px | Card internal padding (compact), input padding |
| `space-4` | 16px | Standard card padding, grid gap |
| `space-5` | 20px | Section gap, container padding |
| `space-6` | 24px | Page section separation |
| `space-8` | 32px | Major landmark separation |

---

## 4. Concentric Radius Scale

Outer radius = Inner radius + Padding.
Never use mismatched radii on nested containers.

| Surface | Padding | Outer Radius | Inner Element Radius |
|---|---|---|---|
| **Modal / Dialog** | 20px | `rounded-xl` (12px) | Inner buttons: `rounded-md` (6px) |
| **Card / Panel** | 16px | `rounded-lg` (8px) | Inner buttons / controls: `rounded-md` (6px) |
| **Input / Button / Tab** | 8px-12px | `rounded-md` (6px) | Inner badge: `rounded` (4px) |
| **Badge / Tag** | 4px-8px | `rounded` (4px) | Flat |

---

## 5. Shadow Scale (Layered Transparent)

Borders provide structural definition; shadows provide pure optical elevation.
No saturated neon glows or colored halos.

```css
--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.40);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.45), 0 2px 4px -2px rgba(0, 0, 0, 0.40);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.55), 0 4px 6px -4px rgba(0, 0, 0, 0.45);
```

---

## 6. Motion & Interactive States

- **Hit Areas**: Minimum 40px × 40px for all interactive controls (buttons, tabs, inputs, icon toggles).
- **Transitions**: Never use `transition: all`. Target exact properties: `transition-colors`, `transition-transform`, `transition-opacity`.
- **Duration**: `120ms` for hover / press; `180ms` for panel entry / accordion.
- **Scale on Press**: `active:scale-[0.96] transition-transform duration-100 ease-out` on buttons.
- **Focus Rings**: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-950`.
- **Reduced Motion**: Respect `@media (prefers-reduced-motion: reduce)` by disabling all transforms and transitions.
