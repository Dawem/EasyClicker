# Easy Clicker

A Firefox extension that automatically clicks one or more page elements on a configurable interval. Elements are identified by CSS selector, with optional text matching and URL pattern filtering.

## Features

- **Element Picker** - Click an interactive crosshair to select an element directly from the page; the CSS selector is generated automatically.
- **Multiple Elements** - Add any number of click targets, each with independent settings.
- **URL Pattern Filtering** - Restrict a rule to specific domains or URL patterns using match syntax (e.g. `*://*.example.com/*`).
- **Text Matching** - Narrow down which elements are clicked by requiring they contain specific text.
- **Match Mode** - Choose whether to click the first, last, or all elements matching a selector.
- **Per-Element Interval** - Set a custom click interval per element, or fall back to the global interval.
- **Keyboard Shortcuts** - Start (`Ctrl+Shift+S`) and stop (`Ctrl+Shift+X`) without opening the popup.

## Extension Permissions

| Permission  | Reason                                                 |
| ----------- | ------------------------------------------------------ |
| `storage`   | Persists rules and settings locally                    |
| `activeTab` | Sends messages to and reads the URL of the current tab |
