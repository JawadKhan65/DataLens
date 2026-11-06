# DataLens

DataLens is a beginner-friendly MERN application for uploading CSV files and getting a quick exploratory data analysis report.

## First deliverable

This initial slice includes a React dashboard, CSV upload and preview, a Node/Express API, basic dataset summary statistics, and MongoDB persistence for saved reports. Authentication and interactive charts can be added as follow-up slices.

## Run locally

1. Install Node.js and MongoDB.
2. In the project root, run `npm install` and `npm install --prefix client` and `npm install --prefix server`.
3. Copy `server/.env.example` to `server/.env` and set `MONGODB_URI` if you want database persistence.
4. Start MongoDB locally (or provide a hosted connection string) and run `npm run dev` from the project root. The client runs at http://localhost:5173 and the API at http://localhost:5000.

The API analyzes CSV uploads and saves their summaries and row previews to MongoDB. If MongoDB is unavailable, an upload can be analyzed but will not be saved.
