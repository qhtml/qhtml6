# QHTML6 WYSIWYG Builder Component Pack

**Author:** Manus AI  
**Date:** May 14, 2026

This pack contains ten reusable `q-component` definitions intended for a drag-and-drop WYSIWYG QHTML builder. The components follow the qhtml6 conventions shown in the project README: component definitions use `q-component <type> { ... }`, reusable fields are declared with `q-property`, projected content uses named `slot { ... }` placeholders, and component state is referenced with `this.component.<property>` inside runtime interpolation.[^1]

> The components are designed as editable building blocks rather than as a complete design system. A builder can expose each `q-property` in a side panel, while named slots can become drop zones for nested content.

| # | Component | Main Builder Use | Key Properties | Drop Zones |
|---:|---|---|---|---|
| 1 | `q-builder-section` | Generic page section wrapper with heading content. | `eyebrow`, `title`, `subtitle`, `maxWidth`, `padding` | `content` |
| 2 | `q-hero-block` | Landing-page hero with CTA buttons and media area. | `eyebrow`, `headline`, `subheadline`, `primaryText`, `secondaryText`, `primaryHref`, `secondaryHref` | `actions`, `media` |
| 3 | `q-two-column-layout` | Flexible two-column layout container. | `maxWidth`, `gap`, `leftWidth`, `rightWidth` | `left`, `right` |
| 4 | `q-sidebar-layout` | Documentation, blog, account, or dashboard layout with sidebar. | `maxWidth`, `sidebarWidth`, `gap`, `sticky` | `sidebar`, `main` |
| 5 | `q-html-block` | Raw HTML/embed block for advanced users. | `label`, `markup` | None |
| 6 | `q-card-grid` | Grid wrapper for cards, tiles, products, or features. | `title`, `columns`, `gap` | `cards` |
| 7 | `q-feature-card` | Individual feature/service card. | `icon`, `title`, `body`, `href`, `linkText` | `extra` |
| 8 | `q-image-text-block` | Split image-and-copy editorial block. | `eyebrow`, `title`, `body`, `imageSrc`, `imageAlt` | `media`, `content` |
| 9 | `q-cta-band` | Conversion-focused call-to-action band. | `title`, `body`, `buttonText`, `buttonHref` | `actions` |
| 10 | `q-form-block` | Form container with editable intro and projected fields. | `title`, `body`, `submitText`, `action`, `method` | `fields` |

## Usage Example

The library is saved in `qhtml_builder_components.qhtml`. You can import it into a page and then instantiate components like regular QHTML component instances.

```qhtml
<q-html>
  q-import { qhtml_builder_components.qhtml }

  q-hero-block {
    eyebrow: "No-code layout kit"
    headline: "Compose production pages visually."
    subheadline: "Use qhtml6 components as drag-and-drop primitives with editable properties and drop-zone slots."
    primaryText: "Open builder"
    secondaryText: "View docs"
    media {
      div {
        style { padding: 32px; }
        h3 { text { Builder preview area } }
      }
    }
  }

  q-card-grid {
    title: "Reusable page blocks"
    columns: "3"
    cards {
      q-feature-card { icon: "01" title: "Hero" body: "Start pages with an editable hero block." }
      q-feature-card { icon: "02" title: "Layout" body: "Drop content into columns and sidebars." }
      q-feature-card { icon: "03" title: "HTML" body: "Add raw embeds when needed." }
    }
  }
</q-html>
```

## Implementation Notes

The component names intentionally use a `q-` prefix so they are easy to distinguish from native HTML tags and builder-only metadata. Each component keeps its DOM structure simple and semantic, which should make it easier for a builder to serialize, diff, reorder, and hydrate the underlying QDOM. Most content customization is exposed through `q-property`, while complex nested content is handled through named `slot` placeholders.

The `q-html-block` component injects a projected HTML fragment with an `html { ... }` block. In a production WYSIWYG editor, this property should be sanitized or restricted if untrusted users can edit it.

## References

[^1]: qhtml/qhtml6, “QHTML.js v6.9.0 README,” GitHub, accessed May 14, 2026. <https://github.com/qhtml/qhtml6>
