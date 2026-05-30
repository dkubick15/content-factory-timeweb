module.exports = {
  apps: [
    {
      name: "content-factory-backend",
      script: "server.js",
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
