# Use the official Playwright image which includes all browser dependencies
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies (ignoring scripts to prevent binary downloads)
RUN npm ci --ignore-scripts

# Rebuild sqlite3 from source against the container's glibc version
RUN npm rebuild sqlite3 --build-from-source

# Run any other postinstall scripts
RUN npm rebuild

# Copy the rest of the application code
COPY . .

# Build the TypeScript code
RUN npm run build

# Expose the port the app runs on
EXPOSE 3000

# Start the application using the compiled JavaScript
CMD ["npm", "run", "serve"]
