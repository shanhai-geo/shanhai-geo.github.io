FROM node:18-alpine
WORKDIR /app
COPY api/ ./api/
EXPOSE 9000
ENV PORT=9000
ENV DATA_REGION=cn-docker
CMD ["node", "api/server.js"]
