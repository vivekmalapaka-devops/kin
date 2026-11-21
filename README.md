# Kin

A private family blood-test tracker. The Next.js and React application uses Supabase Auth, Postgres, a private Storage bucket, and a separate local PDF extraction worker.

## Run locally

Install Node.js, Python 3, Poppler (`pdftotext`), and the Python requirements in `backend/requirements.txt`. Run `npm install` and configure the ignored `.env` file using `.env.example`. Stop any older server, then run `npm start` and open `http://127.0.0.1:3000`. This starts both Next.js and the Python worker. Stop them with Ctrl+C. The previous static frontend remains available through `npm run legacy:start` on port 8787 while the migration is verified.

Run automated checks with `npm test` and the Next.js production build check with `npm run web:build`. The servers bind to localhost for development and are not ready for public deployment. Use a browser's mobile viewport tools to check the responsive layout.

Family admins can invite a new account from Family access. Set `KIN_APP_URL` in `.env` to the app's public origin (for example, `https://app.example.com`) and add `https://app.example.com/accept-invite` to Supabase Auth's redirect allow list. The local default is `http://127.0.0.1:3000`; that address only works on the same device. Supabase's default email service only sends to project team addresses, so configure custom SMTP to invite other recipients. Invitations expire after seven days and can be cancelled in Family access. Existing confirmed accounts can still be linked separately.

Confirmed reports appear on the overview and history screens. For a simple finite lab range, the outer 5% of its width at either end is marked amber as an app-defined near-limit warning; values outside the range remain red. Explicit lab-labelled borderline categories are also amber. Other lab categories use their printed labels, and unclear or overlapping ranges are not classified. Single-sided limits and category tables do not get an app-defined proximity zone because they lack a single finite range. Color is a reading aid, not a diagnosis or an urgency scale. Light OCR is used for pages without directly extracted candidates. The application can miss or misread results, so compare every page and value with the original and add any missing rows. Full browser-to-Supabase end-to-end verification remains unfinished.
