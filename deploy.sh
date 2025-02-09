
#!/bin/bash -e

# Use latest node LTS to build the app.
docker run --rm \
  -v "$PWD":/app \
  -w /app \
  node:22 bash -c "npm install && npm run build"
