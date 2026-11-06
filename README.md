# DataLens

DataLens is a beginner-friendly MERN application for uploading CSV files and getting a quick exploratory data analysis report.

## First deliverable

The app includes account registration and login, user-scoped dataset management, CSV summaries, saved reports, and interactive EDA visualizations.

## Run locally

1. Install Node.js and MongoDB.
2. In the project root, run `npm install` and `npm install --prefix client` and `npm install --prefix server`.
3. Copy `server/.env.example` to `server/.env` and set `MONGODB_URI` and a private `JWT_SECRET`. For deployments, set `CLIENT_ORIGIN` to the frontend origin and `CLIENT_API_ORIGIN` to the API origin. Copy `client/.env.example` to `client/.env.local` to configure the API URL.
4. Start MongoDB locally (or provide a hosted connection string) and run `npm run dev` from the project root. The client runs at http://localhost:5173 and the API at http://localhost:5000.

The API analyzes CSV uploads up to 10 MB and saves their summaries and first 200 rows to MongoDB. Each CSV needs a header row with unique, non-empty column names; individual records are limited to 1 MB. A column is treated as numeric when at least 80% of its non-empty values parse as numbers. If MongoDB is unavailable, an upload can be analyzed but will not be saved.
