# Usage:
# - Build image: docker compose build
# - Run tests: docker compose run --rm npm test
# - Open shell: docker compose run --rm app bash

FROM node:24-bookworm-slim

RUN apt-get update && \
	apt-get install -y --no-install-recommends \
	python3 \
	make \
	g++ \
	pkg-config \
	git \
	ca-certificates && \
	rm -rf /var/lib/apt/lists/*

WORKDIR /home/ubuntu/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
