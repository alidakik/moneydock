# MoneyDock

MoneyDock is a private, offline-first personal finance tracker built as a static Progressive Web App. It is designed for personal use on an iPhone without needing an Apple Developer Program membership.

## Features

- Enter your current money during first setup.
- Add tickets for expenses, income, and transfers.
- Define custom expense and income categories.
- Add monthly budgets to expense categories.
- Manage multiple accounts such as Cash, Bank, and Wallet.
- Home dashboard with current balance, monthly income/spending/net, daily spending pace, projected monthly spend, and saving-rate estimate.
- Graphs for spending by category, balance trend, income vs spending, and budget progress.
- Recurring weekly or monthly tickets.
- Search and filter tickets by month, type, category, and notes.
- Export JSON backups, import JSON backups, and export CSV.
- Works offline after the first load when served from a web host.

## How to run on your computer

No build step is required.

Option 1: open `index.html` directly in a browser for quick testing.

Option 2: run a tiny local web server:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## How to use it on iPhone

For the best iPhone experience, host these files on HTTPS using GitHub Pages, Netlify, Vercel, Cloudflare Pages, or your own server.

Then on your iPhone:

1. Open the hosted URL in Safari.
2. Tap Share.
3. Tap Add to Home Screen.
4. Turn on Open as Web App.
5. Tap Add.

The app icon will appear on your Home Screen.

## Deployment options

### GitHub Pages

1. Create a new GitHub repository, for example `moneydock`.
2. Upload all files from this folder.
3. Go to repository Settings → Pages.
4. Set the source to your main branch and root folder.
5. Open the GitHub Pages URL from Safari on your iPhone.

### Netlify or Vercel

Drag this folder into Netlify Drop, or import it as a static project in Vercel. No build command is needed.

## Data and privacy

MoneyDock stores data locally in your browser using `localStorage`. There is no backend server in this starter project. Export JSON backups regularly, especially before clearing Safari data, changing phones, or changing hosting.

Important: changing the app currency changes display only. It does not convert existing amounts.

## Suggested next upgrades

- iCloud/Dropbox sync using a tiny backend.
- Passphrase-based encrypted backups.
- Receipt photo attachments.
- More currencies and multi-currency accounts.
- Budget notifications.
- Import from bank CSV files.
