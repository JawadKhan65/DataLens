function readConfig(env = process.env) {
  const port = Number(env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a whole number between 1 and 65535.');
  }

  const isProduction = env.NODE_ENV === 'production';
  if (isProduction && (!env.JWT_SECRET || env.JWT_SECRET.length < 32)) {
    throw new Error('Set JWT_SECRET to at least 32 characters before starting DataLens in production.');
  }
  if (isProduction && !env.MONGODB_URI) {
    throw new Error('Set MONGODB_URI before starting DataLens in production.');
  }

  return {
    port,
    mongodbUri: env.MONGODB_URI || '',
    isProduction,
  };
}

module.exports = readConfig;
