# Use the official lightweight Node.js 20 image built on Alpine Linux
FROM node:20-alpine

# Set the application directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker layer caching
COPY package*json ./

# Install exact dependencies matching the lockfile, bypassing user-install scripts for speed
RUN npm ci

# Copy the rest of the application files into the working directory
COPY . .

# Compile TypeScript / build assets inside the container (if build script exists)
RUN npm run build --if-present

# Document that the container intends to listen on port 3000 at runtime
EXPOSE 3000

# Define the default command to start the application execution
CMD ["npm", "start"]