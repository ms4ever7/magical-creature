# Use official Node.js image as the base
FROM node:22-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package.json and yarn.lock
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy all source files
COPY . .

# Build TypeScript if needed (optional, if you use tsx to run directly, skip this)
RUN yarn tsc

# Command to run your scheduler script (assuming it's the entry point)
CMD ["node", "cron-job.js"]
