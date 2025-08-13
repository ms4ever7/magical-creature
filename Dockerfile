# Use official Node.js image as the base
FROM node:22-alpine

# Install Supercronic
ADD https://github.com/aptible/supercronic/releases/download/v0.1.14/supercronic-linux-amd64 /usr/local/bin/supercronic
RUN chmod +x /usr/local/bin/supercronic

# Set working directory inside the container
WORKDIR /app

# Copy package.json and yarn.lock
COPY package.json yarn.lock ./

# Install dependencies (including tsx)
RUN yarn install --frozen-lockfile

# Copy all source files
COPY . .

# Copy crontab file
COPY crontab /etc/crontab

# Run Supercronic
ENTRYPOINT ["/usr/local/bin/supercronic", "/etc/crontab"]
