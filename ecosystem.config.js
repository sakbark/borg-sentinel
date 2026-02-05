module.exports = {
  apps: [{
    name: 'borg-sentinel',
    script: 'index.js',
    env: {
      NODE_ENV: 'production'
    },
    max_memory_restart: '150M',
    restart_delay: 5000,
    max_restarts: 10
  }]
};
