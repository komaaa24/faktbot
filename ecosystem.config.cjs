module.exports = {
    apps: [
        {
            name: 'biznes-goyalar-bot',
            cwd: __dirname,
            script: 'dist/main.js',
            node_args: ['-r', 'dotenv/config'],
            exec_mode: 'fork',
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
