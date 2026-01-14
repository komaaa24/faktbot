module.exports = {
    apps: [
        {
            name: 'latifalar-bot',
            script: 'dist/main.js',
            node_args: ['-r', 'dotenv/config'],
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '500M',
            env: {
                NODE_ENV: 'production'
            }
        }
    ]
};
