This directory is the static output root of the Vercel project.

Keeping it empty (this file is the only entry) is deliberate: when Vercel finds a public/
directory it serves the static files from here and from nowhere else, so the source files of
the API - src/, api/, package.json - can never be downloaded from the deployed domain.
Every request that does not match a file in here falls through to the rewrite in
vercel.json and reaches the Express application in api/index.js.
