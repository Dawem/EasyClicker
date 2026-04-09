# Easy Clicker

Firefox: https://addons.mozilla.org/en-CA/firefox/addon/easy-clicker/

Chrome: https://chromewebstore.google.com/detail/easy-clicker/edmpihaieopokiphjakadgdofgfpejof?authuser=0&hl=en-US

A browser extension that automatically clicks one or more page elements on a configurable interval. Elements are identified by CSS selector, with optional text matching and URL pattern filtering.

<img width="342" height="284" alt="Screenshot 2026-04-03 182442" src="https://github.com/user-attachments/assets/54051f14-e6e0-4c27-af42-284eb8232a2b" />
<img width="342" height="466" alt="Screenshot 2026-04-03 182450" src="https://github.com/user-attachments/assets/34bdc0ef-ac0d-424f-8088-d7f6a7fec28e" /></br>

## Element Picker

<img width="669" height="607" alt="image" src="https://github.com/user-attachments/assets/2cff4cda-0013-4417-9ad9-513eaa6cebfb" />

### How to use Element Picker

1. Click the Element picker button <img width="112" height="29" alt="image" src="https://github.com/user-attachments/assets/dfb84976-e20f-44e7-852e-674005adc7b2" />

2. The popup will close
3. Clickable items will be highlighted in orange on the page
4. Hover an element on page. It will be bordered in red and a popup displaying the element information and inner text if available
5. Click it to save selector
6. The popup will reopen
7. Modify any settings
8. Click "Add Element" to save

## Features

- **Element Picker** - Click an interactive crosshair to select an element directly from the page; the CSS selector is generated automatically.
- **Multiple Elements** - Add any number of click targets, each with independent settings.
- **URL Pattern Filtering** - Restrict a rule to specific domains or URL patterns using match syntax (e.g. `*://*.example.com/*`).
- **Text Matching** - Narrow down which elements are clicked by requiring they contain specific text.
- **Match Mode** - Choose whether to click the first, last, or all elements matching a selector.
- **Per-Element Interval** - Set a custom click interval per element, or fall back to the global interval.
- **Keyboard Shortcuts** - Start (`Alt+Shift+Z`) and stop (`Alt+Shift+X`) without opening the popup.

## Extension Permissions

| Permission  | Reason                                                 |
| ----------- | ------------------------------------------------------ |
| `storage`   | Persists rules and settings locally                    |
| `activeTab` | Sends messages to and reads the URL of the current tab |

## Building the Extension

This project includes a Python build script that generates both Chrome (`.crx`) and Firefox (`.xpi`) extensions.
It automatically handles manifest differences between the browsers.

### Requirements

- Python 3.x

### Build Steps

1. Open a terminal or command prompt in the project root directory.
2. Run the build script:
   ```bash
   python build.py
   ```
3. The compiled extensions will be placed in the `dist` folder:
   - `dist/easy-clicker.xpi` (Firefox)
   - `dist/easy-clicker.crx` (Chrome / Edge)

This also generates folders in the dist folder with the source code specifically for each browser. These can be loaded as unpacked extensions in the respective browsers for development purposes.
