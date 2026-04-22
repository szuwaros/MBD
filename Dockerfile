# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build backend
FROM node:20-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package.json ./
RUN npm install
COPY backend/ ./
RUN npm run build

# Stage 3: Production
FROM node:20-alpine
WORKDIR /app

# Install build tools needed for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Install production dependencies for backend
COPY backend/package.json ./backend/
RUN cd backend && npm install --production

# Remove build tools to keep image smaller
RUN apk del python3 make g++

# Install Tesseract OCR with Polish language data + ImageMagick for auto-orient
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-pol imagemagick

# Copy built backend
COPY --from=backend-build /app/backend/dist ./backend/dist

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Create data directory
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/budget.db

EXPOSE 3000

CMD ["node", "backend/dist/index.js"]
