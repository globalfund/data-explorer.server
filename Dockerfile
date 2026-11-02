FROM node:22.23.4-alpine

# For development add /bin/bash. git installs the rb-core packages from GitHub.
RUN apk update && apk add --no-cache bash git

# Set up the server directory
WORKDIR /app
COPY . /app

# Install yarn dependencies
RUN yarn install --network-timeout 100000
RUN yarn build

# Install yarn dependencies
RUN yarn global add pm2
RUN yarn install
RUN yarn build

# APP LOG DIRECTORY FROM pm2.config.js
RUN mkdir -p /home/zim/app-logs/the-data-explorer-api

# Run `yarn docker` to build, migrate and run the server with pm2.
CMD ["yarn", "docker"]
