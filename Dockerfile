# Use official Node.js image as the base
FROM node:22-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package.json and yarn.lock
COPY package.json yarn.lock ./

# Install dependencies (including tsx if needed)
RUN yarn install --frozen-lockfile

# Copy all source files
COPY . .

# Run your compiled JS cron job script
CMD ["node", "cron-job.js"]
