export default () => ({
  app: {
    port: parseInt(process.env.PORT ?? '3000', 10),
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,

    accessExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN,

    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN,
  },
});
