module.exports = {
  apps: [
    {
      name: 'skinwager-staging',
      script: 'ts-node',
      args: './src/server.ts',
      //watch: true,
      restart_delay: 10e3,
    },
  ],
}
