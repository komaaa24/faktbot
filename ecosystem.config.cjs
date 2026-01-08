module.exports = {
    apps: [
        {
            name: 'sevgi-sherlar-bot',
            script: 'dist/main.js',
            cwd: '/home/kamoliddin/Desktop/anikdod',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '500M',
            env: {
                NODE_ENV: 'production'
            }
        },
        {
            name: 'sevgi-payment-gateway',
            script: 'dist/gateway.js',
            cwd: '/home/kamoliddin/Desktop/anikdod',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '300M',
            env: {
                NODE_ENV: 'production'
            }
        }
    ]
};
