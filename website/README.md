# Kin website

This static website is independent of the application and can be deployed to any static hosting provider. Its deployment root is this folder; no build or dependencies are required.

To preview, run `python3 -m http.server 8000 --directory website` from the project root and visit `http://localhost:8000`.

When the app URL is ready, set `window.KIN_APP_URL` in `config.js` to its full `https://` URL. Until then, the app buttons say “Coming soon” and do not navigate.
