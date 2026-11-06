# DataLens

DataLens is a beginner-friendly MERN application for uploading CSV files and getting a quick exploratory data analysis report.

## First deliverable

This initial slice includes a React dashboard, CSV upload and preview, a Node/Express API, basic dataset summary statistics, and MongoDB-ready project structure. Authentication, persistent report storage, and interactive charts can be added as follow-up slices.

## Run locally

1. Install Node.js and MongoDB.
2. In the project root, run `npm install` and `npm install --prefix client` and `npm install --prefix server`.
3. Copy `server/.env.example` to `server/.env` and set `MONGODB_URI` if you want database persistence.
4. Run `npm run dev` from the project root. The client runs at http://localhost:5173 and the API at http://localhost:5000.

The API can analyze a CSV upload in memory; MongoDB configuration is included for the next persistence slice.
