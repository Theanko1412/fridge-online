# Use Node.js LTS version as the base image
FROM node:14

# Set working directory for the app
WORKDIR /app

# Copy package.json and package-lock.json for both React and Express
COPY package*.json ./

# Install dependencies for both React and Express
RUN npm install

# Copy the existing build files from the repository
COPY build ./build
COPY server.js .
COPY data.json .
COPY subscriptions.json .

# Expose the port that Express is running on
EXPOSE 3000

# Command to run the Express server
CMD ["node", "server.js"]





# docker build -t fridge-online .