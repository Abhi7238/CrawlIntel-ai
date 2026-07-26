FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
ENV VITE_API_BASE=
RUN npm run build

FROM node:20-alpine AS backend
WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm install

COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist dist-frontend

RUN npm run build

EXPOSE 8000
CMD ["node", "dist/src/main.js"]
