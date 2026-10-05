export default {
  roots: ['<rootDir>/tests'],
  transform: {
    "^.+\\.js$": "babel-jest",  // Use Babel to transform JS files
  },
  testEnvironment: "node",  // Use Node environment for testing
  setupFiles: ['<rootDir>/jest.setup.js'],  // Run setup file before tests
};
